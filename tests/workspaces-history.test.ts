import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp} from '../server/app.js';
import {Conflict,FileStore} from '../server/store.js';
import {digest,Providers} from '../server/providers.js';
import {makeSampleCase} from '../shared/fixtures.js';
import type {ReceivingCase,Session} from '../shared/types.js';
import type {ReceiverSession} from '../server/workspaces.js';

describe('recoverable workspaces and retained receiving history',()=>{
  let directory:string;let store:FileStore;let app:ReturnType<typeof createApp>;let session:Session;
  beforeEach(async()=>{
    directory=await mkdtemp(path.join(os.tmpdir(),'receiverright-history-'));
    store=new FileStore(directory);app=createApp({store,providers:new Providers(directory),serveStatic:false});
    session=(await request(app).post('/api/sessions').send({name:'History receiver'}).expect(201)).body;
  });
  afterEach(async()=>{vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});});
  const auth=()=>({Authorization:`Bearer ${session.token}`});
  const sample=async():Promise<ReceivingCase>=>(await request(app).post('/api/cases/sample').set(auth()).send({}).expect(201)).body;
  const generate=async()=>(await request(app).post('/api/workspace/recovery').set(auth()).send({}).expect(200)).body;

  it('restores the same workspace in a fresh browser after expiry and a server restart',async()=>{
    const record=await sample();
    expect((await request(app).get('/api/workspace').set(auth()).expect(200)).body.recoveryEnabled).toBe(false);
    const recovery=await generate();
    expect(recovery.recoveryCode).toMatch(/^RR-[A-Za-z0-9_-]{43}$/);
    const persisted=await readFile(path.join(directory,'records.json'),'utf8');
    expect(persisted).not.toContain(recovery.recoveryCode);expect(persisted).not.toContain(session.token);
    const future=Date.now()+8*24*3600*1000;vi.spyOn(Date,'now').mockReturnValue(future);
    const restarted=createApp({store:new FileStore(directory),providers:new Providers(directory),serveStatic:false});
    await request(restarted).get(`/api/cases/${record.id}`).set(auth()).expect(401);
    const restored=await request(restarted).post('/api/sessions/recover').send({recoveryCode:recovery.recoveryCode}).expect(200);
    expect(restored.body.workspaceId).toBe(session.workspaceId);expect(restored.body.token).not.toBe(session.token);
    expect(restored.body.name).toBe('History receiver');
    expect(Date.parse(restored.body.expiresAt)).toBeGreaterThan(future);
    expect((await request(restarted).get(`/api/cases/${record.id}`).set('Authorization',`Bearer ${restored.body.token}`).expect(200)).body.id).toBe(record.id);
  });

  it('rotates recovery codes without unexpectedly signing out existing sessions',async()=>{
    const old=await generate();const next=await generate();
    await request(app).post('/api/sessions/recover').send({recoveryCode:old.recoveryCode}).expect(401);
    await request(app).post('/api/sessions/recover').send({recoveryCode:'incorrect saved code'}).expect(401);
    const restored=await request(app).post('/api/sessions/recover').send({recoveryCode:next.recoveryCode}).expect(200);
    expect(restored.body.workspaceId).toBe(session.workspaceId);
    expect((await request(app).get('/api/workspace').set(auth()).expect(200)).body).toMatchObject({recoveryEnabled:true,recoveryUpdatedAt:next.createdAt});
    await request(app).post('/api/workspace/recovery').send({}).expect(401);
  });

  it('renews an active session for another seven days and rejects renewal after expiry',async()=>{
    const original=await store.get<ReceiverSession>('SESSION',digest(session.token));
    const later=Date.now()+6*24*3600*1000;const clock=vi.spyOn(Date,'now').mockReturnValue(later);
    const renewed=await request(app).post('/api/sessions/renew').set(auth()).send({}).expect(200);
    expect(renewed.body.token).toBe(session.token);
    expect(Date.parse(renewed.body.expiresAt)).toBeGreaterThan(original!.value.expiresAt*1000);
    clock.mockReturnValue(later+2*24*3600*1000);
    await request(app).get('/api/cases').set(auth()).expect(200);
    clock.mockReturnValue(later+8*24*3600*1000);
    await request(app).post('/api/sessions/renew').set(auth()).send({}).expect(401);
  });

  it('persists bounded recovery attempts across app restarts',async()=>{
    const recovery=await generate();
    for(let index=0;index<12;index++) await request(app).post('/api/sessions/recover').send({recoveryCode:'incorrect saved code'}).expect(401);
    const restarted=createApp({store:new FileStore(directory),providers:new Providers(directory),serveStatic:false});
    const blocked=await request(restarted).post('/api/sessions/recover').send({recoveryCode:recovery.recoveryCode}).expect(429);
    expect(blocked.body.code).toBe('RECOVERY_RATE_LIMIT');
  });

  it('retains complete earlier content and every supplier response even within one revision',async()=>{
    const original=await sample();
    const confirmed=(await request(app).put(`/api/cases/${original.id}`).set(auth()).send({revision:original.revision,lines:original.lines.map(line=>({...line,packSize:line.billedUnit==='carton' ? 12 : 1,confirmed:true}))}).expect(200)).body as ReceivingCase;
    const link=(await request(app).post(`/api/cases/${original.id}/share`).set(auth()).send({revision:confirmed.revision}).expect(201)).body;
    const supplier=(await request(app).post(`/api/shares/${link.shareId}/open`).send({pin:link.pin}).expect(200)).body;
    const response={lineId:confirmed.lines[0].id,decision:'acknowledged',note:'First delivery note'};
    await request(app).post(`/api/shares/${link.shareId}/respond`).set('Authorization',`Bearer ${supplier.token}`).send({revision:confirmed.revision,name:'Supplier reviewer',responses:[response]}).expect(200);
    const priorList=(await request(app).get(`/api/cases/${original.id}/revisions`).set(auth()).expect(200)).body.revisions;
    const responseSnapshotId=priorList[0].snapshotId;
    const prior=(await request(app).get(`/api/cases/${original.id}/revisions/${responseSnapshotId}`).set(auth()).expect(200)).body;
    expect(prior.record.responses[0]).toMatchObject(response);
    await request(app).post(`/api/shares/${link.shareId}/respond`).set('Authorization',`Bearer ${supplier.token}`).send({revision:confirmed.revision,name:'Supplier reviewer',responses:[{...response,decision:'disputed',note:'Corrected response after checking'}]}).expect(200);
    const updated=(await request(app).put(`/api/cases/${original.id}`).set(auth()).send({revision:confirmed.revision,shopName:'Changed receiving desk'}).expect(200)).body;
    expect(updated.responses).toEqual([]);
    const unchanged=(await request(app).get(`/api/cases/${original.id}/revisions/${responseSnapshotId}`).set(auth()).expect(200)).body;
    expect(unchanged).toEqual(prior);
    const list=(await request(app).get(`/api/cases/${original.id}/revisions`).set(auth()).expect(200)).body.revisions;
    expect(list).toHaveLength(6);expect(list.filter((item:{isCurrent:boolean})=>item.isCurrent)).toHaveLength(1);
    expect(list[0]).toMatchObject({revision:3,responseCount:0,isCurrent:true});
    const originalSnapshot=(await request(app).get(`/api/cases/${original.id}/revisions/${list.at(-1).snapshotId}`).set(auth()).expect(200)).body.record;
    expect(originalSnapshot).toEqual(original);
    const other=(await request(app).post('/api/sessions').send({name:'Other workspace'}).expect(201)).body;
    await request(app).get(`/api/cases/${original.id}/revisions`).set('Authorization',`Bearer ${other.token}`).expect(404);
    await request(app).get(`/api/cases/${original.id}/revisions/${responseSnapshotId}`).set('Authorization',`Bearer ${other.token}`).expect(404);
    await request(app).get(`/api/cases/${original.id}/revisions`).set('Authorization',`Bearer ${supplier.token}`).expect(401);
  });

  it('preserves the available legacy state before the first new edit',async()=>{
    const legacy=makeSampleCase();legacy.shopName='Saved before historical snapshots existed';
    await store.put(`WORKSPACE#${session.workspaceId}`,`CASE#${legacy.id}`,legacy,null);
    await request(app).put(`/api/cases/${legacy.id}`).set(auth()).send({revision:legacy.revision,shopName:'Current shop name'}).expect(200);
    const list=(await request(app).get(`/api/cases/${legacy.id}/revisions`).set(auth()).expect(200)).body;
    expect(list.revisions).toHaveLength(2);expect(list.revisions[1]).toMatchObject({legacyBaseline:true,action:'history_started'});
    expect(list.notice).toContain('before history was enabled');
    const detail=(await request(app).get(`/api/cases/${legacy.id}/revisions/${list.revisions[1].snapshotId}`).set(auth()).expect(200)).body;
    expect(detail.record).toEqual(legacy);
  });

  it('retains attached evidence references and authorized downloads after subsequent edits',async()=>{
    const original=await sample();
    const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const prepared=(await request(app).post('/api/uploads').set(auth()).send({caseId:original.id,fileName:'historical-delivery.png',mimeType:'image/png',kind:'photo',lineId:original.lines[0].id,size:bytes.length}).expect(201)).body;
    await request(app).put(prepared.uploadUrl).set(prepared.headers).send(bytes).expect(204);
    const evidence=(await request(app).post(`/api/uploads/${prepared.uploadId}/complete`).set(auth()).send({}).expect(201)).body;
    const list=(await request(app).get(`/api/cases/${original.id}/revisions`).set(auth()).expect(200)).body.revisions;
    expect(list[0]).toMatchObject({action:'evidence_added',evidenceCount:3});
    const snapshotId=list[0].snapshotId;
    const historical=(await request(app).get(`/api/cases/${original.id}/revisions/${snapshotId}`).set(auth()).expect(200)).body.record;
    expect(historical.evidence.at(-1)).toEqual(evidence);
    await request(app).put(`/api/cases/${original.id}`).set(auth()).send({revision:historical.revision,shopName:'Next saved state'}).expect(200);
    expect((await request(app).get(`/api/cases/${original.id}/revisions/${snapshotId}`).set(auth()).expect(200)).body.record).toEqual(historical);
    expect((await request(app).get(evidence.url).set(auth()).expect(200)).body).toEqual(bytes);
    const other=(await request(app).post('/api/sessions').send({name:'Other workspace'}).expect(201)).body;
    await request(app).get(evidence.url).set('Authorization',`Bearer ${other.token}`).expect(401);
  });

  it('commits a live record and its snapshot together or changes neither on conflict',async()=>{
    await store.put('test','live',{value:'original'},null);
    await expect(store.transact([{pk:'test',sk:'new-snapshot',value:{value:'new'},expected:null},{pk:'test',sk:'live',value:{value:'new'},expected:99}])).rejects.toBeInstanceOf(Conflict);
    expect(await store.get('test','new-snapshot')).toBeUndefined();
    expect((await store.get<{value:string}>('test','live'))?.value.value).toBe('original');
    const record=await sample();
    const concurrent=await Promise.all(['First edit','Second edit'].map(shopName=>request(app).put(`/api/cases/${record.id}`).set(auth()).send({revision:record.revision,shopName})));
    expect(concurrent.map(result=>result.status).sort()).toEqual([200,409]);
    const list=(await request(app).get(`/api/cases/${record.id}/revisions`).set(auth()).expect(200)).body.revisions;
    expect(list).toHaveLength(2);
    const latest=(await request(app).get(`/api/cases/${record.id}/revisions/${list[0].snapshotId}`).set(auth()).expect(200)).body.record;
    expect(latest).toEqual((await request(app).get(`/api/cases/${record.id}`).set(auth()).expect(200)).body);
  });
});
