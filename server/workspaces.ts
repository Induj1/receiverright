import {randomBytes} from 'node:crypto';
import type {Request,Response,NextFunction,Express} from 'express';
import {z} from 'zod';
import {Conflict,type Store,type Stored} from './store.js';
import {digest} from './providers.js';

export interface ReceiverSession {workspaceId:string;name:string;expiresAt:number;}
interface Workspace {name:string;recoveryHash?:string;recoveryUpdatedAt?:string;}
interface RecoveryLookup {workspaceId:string;}
export class WorkspaceError extends Error {constructor(readonly status:number,message:string,readonly code?:string){super(message);}}
const seconds=()=>Math.floor(Date.now()/1000);
const lifetime=7*24*3600;
const accessToken=()=>randomBytes(32).toString('base64url');
const responseSession=(token:string,session:ReceiverSession)=>({token,name:session.name,workspaceId:session.workspaceId,isDemo:false,expiresAt:new Date(session.expiresAt*1000).toISOString()});
const empty=z.object({}).strict();

export async function newSession(store:Store,workspaceId:string,name:string) {
  const access=accessToken();const session={workspaceId,name,expiresAt:seconds()+lifetime};
  await store.put('SESSION',digest(access),session,null,session.expiresAt);
  return responseSession(access,session);
}

export function workspaceRoutes(app:Express,store:Store,receiver:(req:Request,res:Response,next:NextFunction)=>Promise<void>) {
  const current=(res:Response)=>res.locals.receiver as ReceiverSession;
  const readWorkspace=(res:Response)=>store.get<Workspace>('WORKSPACE_META',current(res).workspaceId);
  // Persistent, per-source window survives cold starts. No raw IP or submitted
  // code is saved. High-entropy codes are verified via lookup and current pointer.
  const attempt=async(req:Request)=>{
    const bucket=Math.floor(seconds()/(15*60));
    const key=digest(`recovery:${req.ip ?? 'unknown'}:${bucket}`);
    for(let retry=0;retry<8;retry++) {
      const stored=await store.get<{count:number}>('RECOVERY_ATTEMPTS',key);
      if((stored?.value.count ?? 0)>=12) throw new WorkspaceError(429,'Too many recovery attempts. Wait 15 minutes before trying again.','RECOVERY_RATE_LIMIT');
      try {await store.put('RECOVERY_ATTEMPTS',key,{count:(stored?.value.count ?? 0)+1},stored?.version ?? null,(bucket+2)*15*60);return;}
      catch(error){if(!(error instanceof Conflict)) throw error;}
    }
    throw new WorkspaceError(429,'Recovery is busy. Please try again shortly.','RECOVERY_RATE_LIMIT');
  };
  app.get('/api/workspace',receiver,async(_req,res)=>{
    const workspace=await readWorkspace(res);
    res.json({recoveryEnabled:!!workspace?.value.recoveryHash,recoveryUpdatedAt:workspace?.value.recoveryUpdatedAt,sessionExpiresAt:new Date(current(res).expiresAt*1000).toISOString()});
  });
  app.post('/api/workspace/recovery',receiver,async(req,res)=>{
    empty.parse(req.body);const workspace=await readWorkspace(res);
    const recoveryCode=`RR-${accessToken()}`;const recoveryHash=digest(recoveryCode);const createdAt=new Date().toISOString();
    await store.transact([
      {pk:'RECOVERY',sk:recoveryHash,value:{workspaceId:current(res).workspaceId},expected:null},
      {pk:'WORKSPACE_META',sk:current(res).workspaceId,value:{name:current(res).name,recoveryHash,recoveryUpdatedAt:createdAt},expected:workspace?.version ?? null}
    ]);
    res.json({recoveryCode,createdAt,notice:'Save this code somewhere private outside this browser. It grants full workspace access. This replaces any previous recovery code; existing signed-in sessions remain valid until they expire. The code cannot be displayed again.'});
  });
  app.post('/api/sessions/recover',async(req,res)=>{
    await attempt(req);
    const {recoveryCode}=z.object({recoveryCode:z.string().trim().min(1).max(100)}).strict().parse(req.body);
    const hash=digest(recoveryCode);const lookup=await store.get<RecoveryLookup>('RECOVERY',hash);
    const workspace=lookup ? await store.get<Workspace>('WORKSPACE_META',lookup.value.workspaceId) : undefined;
    if(!lookup || !workspace || workspace.value.recoveryHash!==hash) throw new WorkspaceError(401,'This recovery code is invalid or has been replaced. Check the saved code.','INVALID_RECOVERY');
    const access=accessToken();const session:ReceiverSession={workspaceId:lookup.value.workspaceId,name:workspace.value.name,expiresAt:seconds()+lifetime};
    await store.transact([{pk:'SESSION',sk:digest(access),value:session,expected:null,expiresAt:session.expiresAt}],[{pk:workspace.pk,sk:workspace.sk,expected:workspace.version}]);
    res.json(responseSession(access,session));
  });
  app.post('/api/sessions/renew',receiver,async(req,res)=>{
    empty.parse(req.body);const stored=res.locals.receiverStored as Stored<ReceiverSession>;
    const session={...stored.value,expiresAt:seconds()+lifetime};
    await store.put(stored.pk,stored.sk,session,stored.version,session.expiresAt);
    res.json(responseSession((req.headers.authorization ?? '').slice(7),session));
  });
}
