import express, {type Request, type Response, type NextFunction} from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {randomBytes, randomInt, randomUUID, timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {z, ZodError} from 'zod';
import type {ReceivingCase, Evidence, AuditEvent, Session, ShareResult, SupplierResponse} from '../shared/types.js';
import {reconcileCase, validateCaseInput} from '../shared/domain.js';
import {makeSampleCase} from '../shared/fixtures.js';
import {Conflict, defaultStore, type Store, type Stored} from './store.js';
import {digest, Providers, UploadProblem, type UploadRecord, type EvidenceRecord} from './providers.js';

class HttpError extends Error { constructor(readonly status:number,message:string,readonly code?:string,readonly details?:unknown) { super(message); } }
interface ReceiverSession {workspaceId:string; name:string; expiresAt:number;}
interface Share {caseId:string; workspaceId:string; revision:number; pinHash:string; expiresAt:number; attempts:number; lockedUntil?:number;}
interface SupplierSession {shareHash:string; caseId:string; workspaceId:string; revision:number; expiresAt:number;}
const now = () => new Date().toISOString();
const seconds = () => Math.floor(Date.now()/1000);
const token = () => randomBytes(32).toString('base64url');
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const amount = z.number().finite().min(0).max(1_000_000);
const box = z.object({left:z.number().min(0).max(1),top:z.number().min(0).max(1),width:z.number().min(0).max(1),height:z.number().min(0).max(1),page:z.number().int().min(1).max(1000),confidence:z.number().min(0).max(100)}).strict();
const lineSchema = z.object({id,description:z.string().max(300),sku:z.string().max(100),billedQty:amount,billedUnit:z.string().min(1).max(30),packSize:amount.positive().nullable(),receivedQty:amount.nullable(),damagedQty:amount,wrongQty:amount,unitPriceMinor:z.number().int().min(0).max(100_000_000_000).nullable(),confirmed:z.boolean(),note:z.string().max(500),source:box.optional()}).strict();
const editable = {supplier:z.string().max(200),supplierEmail:z.string().max(254).refine(v=>!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),'Enter a valid email address.'),shopName:z.string().max(200),invoiceNumber:z.string().max(100),invoiceDate:z.string().max(40),lines:z.array(lineSchema).max(100)};
const createSchema = z.object(editable).partial().strict();
const updateSchema = z.object({...editable,revision:z.number().int().min(1)}).partial({supplier:true,supplierEmail:true,shopName:true,invoiceNumber:true,invoiceDate:true,lines:true}).strict();
const revisionSchema = z.object({revision:z.number().int().min(1)}).strict();
const empty = z.object({}).strict();
const equalHash = (value:string,expected:string) => { const actual = Buffer.from(digest(value)); const stored = Buffer.from(expected); return actual.length === stored.length && timingSafeEqual(actual,stored); };
const caseKey = (workspaceId:string) => `WORKSPACE#${workspaceId}`;
const caseSk = (caseId:string) => `CASE#${caseId}`;
const history = (record:ReceivingCase, actor:string, action:string, detail:string) => { const event:AuditEvent = {id:randomUUID(),at:now(),actor,action,detail,revision:record.revision}; record.history = [...record.history,event].slice(-200); };
const safeFilename = (name:string) => name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,150);
const bearer = (req:Request) => { const match = /^Bearer ([A-Za-z0-9_-]{30,100})$/.exec(req.headers.authorization ?? ''); if (!match) throw new HttpError(401,'A valid session is required.','UNAUTHORIZED'); return match[1]; };
const parameter = (req:Request,name:string) => id.parse(req.params[name]);

export function createApp(options:{store?:Store;providers?:Providers;serveStatic?:boolean} = {}) {
  const store = options.store ?? defaultStore();
  const providers = options.providers ?? new Providers();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : false);
  app.use(helmet({contentSecurityPolicy:{directives:{'connect-src':["'self'",'https://*.amazonaws.com'],'img-src':["'self'",'data:','blob:','https://*.amazonaws.com'],'frame-src':["'self'",'blob:'] }},referrerPolicy:{policy:'no-referrer'}}));
  app.use('/api',(_req,res,next)=> {res.set('Cache-Control','no-store');next();});
  app.use('/api',rateLimit({windowMs:60_000,limit:240,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many requests. Please wait a minute.'}}));
  app.use(express.json({limit:'512kb'}));

  const receiver = async (req:Request,res:Response,next:NextFunction) => {
    try { const stored = await store.get<ReceiverSession>('SESSION',digest(bearer(req))); if (!stored || stored.value.expiresAt<=seconds()) throw new HttpError(401,'Your workspace session expired. Start a new workspace.','UNAUTHORIZED'); res.locals.receiver = stored.value; next(); } catch(error) { next(error); }
  };
  const getCase = async (workspaceId:string,caseId:string) => { const record = await store.get<ReceivingCase>(caseKey(workspaceId),caseSk(caseId)); if (!record) throw new HttpError(404,'Receiving case not found.'); return record; };
  const checkRevision = (stored:Stored<ReceivingCase>,revision:number) => { if(stored.value.revision!==revision) throw new HttpError(409,'This receiving record changed. Refresh before continuing.','REVISION_CONFLICT'); };
  const checkEditable = (record:ReceivingCase) => { if(record.status==='closed') throw new HttpError(409,'This case is closed and can no longer be edited.'); };
  const putCase = async (stored:Stored<ReceivingCase>) => { stored.value.updatedAt=now(); await store.put(stored.pk,stored.sk,stored.value,stored.version); return stored.value; };
  const getShare = async (hash:string) => { const share = await store.get<Share>('SHARE',hash); if (!share || share.value.expiresAt<=seconds()) throw new HttpError(410,'This review link has expired or is unavailable.'); const record = await getCase(share.value.workspaceId,share.value.caseId); if(record.value.revision!==share.value.revision) throw new HttpError(409,'The receiver updated this case. Ask for a new review link.','STALE_SHARE'); return {share,record}; };
  const supplier = async (req:Request) => { const session = await store.get<SupplierSession>('SUPPLIER_SESSION',digest(bearer(req))); if(!session || session.value.expiresAt<=seconds()) throw new HttpError(401,'Unlock the review link with its PIN again.'); const {share,record} = await getShare(session.value.shareHash); if(share.value.revision!==session.value.revision) throw new HttpError(409,'This review session is no longer current.','STALE_SHARE'); return {session:session.value,share,record}; };
  const caseForRequest = (req:Request,res:Response) => getCase((res.locals.receiver as ReceiverSession).workspaceId,parameter(req,'id'));
  const actor = (res:Response) => (res.locals.receiver as ReceiverSession).name || 'Receiver';
  const consumeAiQuota = async () => {
    const limit = Number(process.env.MAX_DAILY_AI_CALLS ?? 50);
    const day = new Date().toISOString().slice(0,10);
    for(let attempt=0;attempt<8;attempt++) {
      const current=await store.get<{count:number}>('AI_USAGE',day);
      if(!Number.isFinite(limit) || limit<=0 || (current?.value.count ?? 0)>=limit) throw new HttpError(429,'The daily AWS AI budget has been reached. Manual entry and deterministic item calculations remain available.','AI_BUDGET_REACHED');
      try { await store.put('AI_USAGE',day,{count:(current?.value.count ?? 0)+1},current?.version ?? null,seconds()+3*24*3600); return; }
      catch(error) {if(!(error instanceof Conflict)) throw error;}
    }
    throw new HttpError(429,'The AI provider is busy. Please retry shortly.');
  };

  app.get('/api/health',(_req,res)=>res.json({status:'ok',storage:store.kind,extraction:providers.bucket ? 'textract' : 'manual',summaries:providers.model ? 'bedrock' : 'template',version:'1.0.0',...(process.env.AWS_REGION ? {region:process.env.AWS_REGION} : {})}));
  app.post('/api/sessions',rateLimit({windowMs:60_000,limit:12,standardHeaders:false,legacyHeaders:false,message:{error:'Please wait before creating another workspace.'}}),async(req,res)=>{
    const body = z.object({name:z.string().trim().max(80).optional()}).strict().parse(req.body);
    const access = token(); const workspaceId = randomUUID(); const expiresAt=seconds()+7*24*3600; const name=body.name || 'Receiver';
    await store.put('SESSION',digest(access),{workspaceId,name,expiresAt},null,expiresAt);
    const session:Session = {token:access,name,workspaceId,isDemo:false}; res.status(201).json(session);
  });
  app.use('/api/cases',receiver);
  app.get('/api/cases',async(_req,res)=>{ const all = await store.list<ReceivingCase>(caseKey(res.locals.receiver.workspaceId)); res.json({cases:all.filter(r=>r.sk.startsWith('CASE#')).map(r=>r.value).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}); });
  const limitCases = async (res:Response) => { if ((await store.list(caseKey(res.locals.receiver.workspaceId))).length>=25) throw new HttpError(429,'This workspace has reached its 25-case limit.'); };
  app.post('/api/cases',async(req,res)=>{
    const body=createSchema.parse(req.body); await limitCases(res);
    const caseId=randomUUID(); const timestamp=now();
    const record:ReceivingCase = {id:caseId,caseNumber:`RR-${caseId.slice(0,8).toUpperCase()}`,supplier:'',supplierEmail:'',shopName:'',invoiceNumber:'',invoiceDate:'',status:'draft',revision:1,createdAt:timestamp,updatedAt:timestamp,currency:'INR',lines:[],evidence:[],history:[],responses:[],isDemo:false,extractionProvider:'manual',...body};
    const issues=validateCaseInput(record); if(issues.length) throw new HttpError(422,'Some receiving details are invalid.','INVALID_CASE',issues);
    history(record,actor(res),'created','Created an empty receiving record.');
    await store.put(caseKey(res.locals.receiver.workspaceId),caseSk(record.id),record,null); res.status(201).json(record);
  });
  app.post('/api/cases/sample',async(req,res)=>{
    empty.parse(req.body); await limitCases(res); const record=makeSampleCase();
    await store.put(caseKey(res.locals.receiver.workspaceId),caseSk(record.id),record,null); res.status(201).json(record);
  });
  app.get('/api/cases/:id',async(req,res)=>res.json((await caseForRequest(req,res)).value));
  app.put('/api/cases/:id',async(req,res)=>{
    const {revision,...patch}=updateSchema.parse(req.body); const stored=await caseForRequest(req,res); checkRevision(stored,revision); checkEditable(stored.value);
    const candidate={...stored.value,...patch}; const issues=validateCaseInput(candidate); if(issues.length) throw new HttpError(422,'Some receiving details are invalid.','INVALID_CASE',issues);
    stored.value=candidate; stored.value.revision+=1; stored.value.status='draft'; stored.value.responses=[]; delete stored.value.summary;
    history(stored.value,actor(res),'updated','Updated receiving details. Previous review links and responses no longer apply.'); res.json(await putCase(stored));
  });
  app.post('/api/cases/:id/ready',async(req,res)=>{
    const {revision}=revisionSchema.parse(req.body); const stored=await caseForRequest(req,res); checkRevision(stored,revision); checkEditable(stored.value);
    const result=reconcileCase(stored.value); if(!result.ready) throw new HttpError(422,'Confirm every line and resolve missing information before sharing.','NOT_READY',result.issues);
    if(stored.value.status!=='draft') return res.json(stored.value);
    stored.value.status='ready'; history(stored.value,actor(res),'ready','Receiver confirmed the quantities and item-value calculation.'); res.json(await putCase(stored));
  });
  app.post('/api/cases/:id/share',async(req,res)=>{
    const {revision}=revisionSchema.parse(req.body); const stored=await caseForRequest(req,res); checkRevision(stored,revision); checkEditable(stored.value);
    if(!reconcileCase(stored.value).ready) throw new HttpError(422,'Complete receiver verification before sharing.','NOT_READY');
    const shareId=token(); const pin=String(randomInt(0,1_000_000)).padStart(6,'0'); const expiresAt=seconds()+48*3600;
    stored.value.status='shared'; history(stored.value,actor(res),'shared','Created a PIN-protected supplier review link, valid for 48 hours.'); await putCase(stored);
    await store.put<Share>('SHARE',digest(shareId),{caseId:stored.value.id,workspaceId:res.locals.receiver.workspaceId,revision,pinHash:digest(`${shareId}:${pin}`),expiresAt,attempts:0},null,expiresAt);
    const result:ShareResult={shareId,pin,url:`/review/${shareId}`,expiresAt:new Date(expiresAt*1000).toISOString(),revision}; res.status(201).json(result);
  });
  app.post('/api/cases/:id/close',async(req,res)=>{
    const {revision}=revisionSchema.parse(req.body); const stored=await caseForRequest(req,res); checkRevision(stored,revision);
    if(stored.value.status==='closed') return res.json(stored.value);
    const result=reconcileCase(stored.value); const affected=result.lines.filter(l=>l.discrepancyUnits>0);
    if(!result.ready || affected.some(l=>!stored.value.responses.some(r=>r.lineId===l.lineId && r.revision===revision && r.decision==='acknowledged'))) throw new HttpError(422,'Every discrepancy must be acknowledged before closing.','NOT_ACKNOWLEDGED');
    stored.value.status='closed'; history(stored.value,actor(res),'closed','Closed as acknowledged. This does not record payment or money recovered.'); res.json(await putCase(stored));
  });
  app.post('/api/cases/:id/summary',async(req,res)=>{ empty.parse(req.body); const stored=await caseForRequest(req,res); if(providers.model) await consumeAiQuota(); try { res.json(await providers.summary(stored.value)); } catch {throw new HttpError(502,'The summary provider is unavailable. Your verified receiving record is unchanged.','SUMMARY_UNAVAILABLE');} });

  app.post('/api/uploads',receiver,async(req,res)=>{
    const body=z.object({caseId:id,fileName:z.string().min(1).max(150),mimeType:z.enum(['image/jpeg','image/png','application/pdf']),kind:z.enum(['invoice','photo']),lineId:id.optional(),size:z.number().int().min(8).max(5*1024*1024)}).strict().parse(req.body);
    if(body.kind==='photo' && body.mimeType==='application/pdf') throw new HttpError(422,'Delivery photographs must be PNG or JPEG images.');
    const stored=await getCase(res.locals.receiver.workspaceId,body.caseId); checkEditable(stored.value);
    if(stored.value.evidence.length>=10) throw new HttpError(422,'A case supports up to 10 evidence files.');
    if(body.lineId && !stored.value.lines.some(l=>l.id===body.lineId)) throw new HttpError(422,'The selected item is not part of this case.');
    const uploadId=randomUUID(); const uploadToken=token(); const expiresAt=seconds()+15*60;
    const upload:UploadRecord={...body,fileName:safeFilename(body.fileName),id:uploadId,workspaceId:res.locals.receiver.workspaceId,key:`${res.locals.receiver.workspaceId}/${body.caseId}/${uploadId}`,tokenHash:digest(uploadToken),expiresAt,completed:false};
    await store.put('UPLOAD',uploadId,upload,null,expiresAt); res.status(201).json({uploadId,...await providers.uploadUrl(upload,uploadToken)});
  });
  app.put('/api/uploads/:id/bytes',express.raw({type:['image/jpeg','image/png','application/pdf'],limit:'5mb'}),async(req,res)=>{
    const record=await store.get<UploadRecord>('UPLOAD',parameter(req,'id')); const provided=z.string().max(100).parse(req.query.token);
    if(!record || record.value.completed || record.value.expiresAt<=seconds() || !equalHash(provided,record.value.tokenHash)) throw new HttpError(403,'This upload authorization is invalid or expired.');
    if(req.headers['content-type']!==record.value.mimeType || !Buffer.isBuffer(req.body)) throw new HttpError(415,'Use the provided upload content type.');
    await providers.writeLocal(record.value,req.body); res.status(204).end();
  });
  app.post('/api/uploads/:id/complete',receiver,async(req,res)=>{
    empty.parse(req.body); const upload=await store.get<UploadRecord>('UPLOAD',parameter(req,'id'));
    if(!upload || upload.value.workspaceId!==res.locals.receiver.workspaceId) throw new HttpError(404,'Upload not found.');
    const stored=await getCase(res.locals.receiver.workspaceId,upload.value.caseId);
    const existing=stored.value.evidence.find(e=>e.id===upload.value.id); if(existing) return res.json(existing);
    checkEditable(stored.value);
    if(upload.value.expiresAt<=seconds()) throw new HttpError(410,'The upload expired. Select the file again.');
    if(stored.value.evidence.length>=10) throw new HttpError(422,'A case supports up to 10 evidence files.');
    if(upload.value.lineId && !stored.value.lines.some(l=>l.id===upload.value.lineId)) throw new HttpError(409,'The linked item was removed. Upload the file again for a current item.');
    let verified:{key:string;versionId?:string};
    try {verified=await providers.verifyUpload(upload.value);} catch(error) {if(error instanceof UploadProblem) throw error; throw new HttpError(422,'The upload is incomplete. Upload the file before confirming.');}
    const evidence:Evidence={id:upload.value.id,fileName:upload.value.fileName,mimeType:upload.value.mimeType,kind:upload.value.kind,...(upload.value.lineId ? {lineId:upload.value.lineId} : {}),url:`/api/evidence/${upload.value.id}`,createdAt:now()};
    const evidenceRecord:EvidenceRecord={evidence,caseId:stored.value.id,workspaceId:res.locals.receiver.workspaceId,...verified,size:upload.value.size};
    const prior=await store.get<EvidenceRecord>('EVIDENCE',evidence.id); if(!prior) await store.put('EVIDENCE',evidence.id,evidenceRecord,null);
    stored.value.evidence.push(evidence); stored.value.revision+=1; stored.value.status='draft'; stored.value.responses=[]; delete stored.value.summary;
    history(stored.value,actor(res),'evidence_added',`Attached ${evidence.kind}: ${evidence.fileName}. Previous review links no longer apply.`); await putCase(stored);
    upload.value.completed=true; upload.value.evidenceId=evidence.id; await store.put(upload.pk,upload.sk,upload.value,upload.version,upload.value.expiresAt); res.status(201).json(evidence);
  });
  app.get('/api/evidence/:id',async(req,res)=>{
    const access=bearer(req); const evidence=await store.get<EvidenceRecord>('EVIDENCE',parameter(req,'id')); if(!evidence) throw new HttpError(404,'Evidence not found.');
    const receiverSession=await store.get<ReceiverSession>('SESSION',digest(access));
    let record:Stored<ReceivingCase>;
    if(receiverSession && receiverSession.value.expiresAt>seconds() && receiverSession.value.workspaceId===evidence.value.workspaceId) record=await getCase(receiverSession.value.workspaceId,evidence.value.caseId);
    else {const approved=await supplier(req); if(approved.session.workspaceId!==evidence.value.workspaceId || approved.session.caseId!==evidence.value.caseId) throw new HttpError(404,'Evidence not found.'); record=approved.record;}
    if(!record.value.evidence.some(e=>e.id===evidence.value.evidence.id)) throw new HttpError(404,'Evidence not found.');
    const file=await providers.download(evidence.value);
    if(file.url) return res.redirect(302,file.url);
    res.type(evidence.value.evidence.mimeType); res.set('Content-Disposition',`inline; filename="${safeFilename(evidence.value.evidence.fileName).replace(/"/g,'_')}"`); res.send(file.bytes);
  });
  app.post('/api/cases/:id/extract',async(req,res)=>{
    const {evidenceId}=z.object({evidenceId:id}).strict().parse(req.body); const stored=await caseForRequest(req,res); checkEditable(stored.value);
    if(!providers.bucket) throw new HttpError(503,'AWS Textract is not configured. Manual invoice entry is available.','TEXTRACT_UNAVAILABLE');
    const evidence=await store.get<EvidenceRecord>('EVIDENCE',evidenceId);
    if(!evidence || evidence.value.caseId!==stored.value.id || evidence.value.workspaceId!==res.locals.receiver.workspaceId || !stored.value.evidence.some(e=>e.id===evidenceId)) throw new HttpError(404,'Invoice evidence not found.');
    if(evidence.value.evidence.kind!=='invoice') throw new HttpError(422,'Select an invoice document for extraction.');
    await consumeAiQuota();
    try {const result=await providers.extract(evidence.value); history(stored.value,actor(res),'extracted','AWS Textract returned candidate invoice fields. Human review and save are required.'); stored.value.extractionProvider='textract'; await putCase(stored); res.json(result);}
    catch(error) { if(error instanceof Conflict) throw error; throw new HttpError(502,'Textract could not read this invoice. Try a clear single-page JPEG, PNG, or supported PDF, or enter it manually.','EXTRACTION_FAILED'); }
  });

  app.post('/api/shares/:shareId/open',async(req,res)=>{
    const shareId=parameter(req,'shareId'); const {pin}=z.object({pin:z.string().regex(/^\d{6}$/)}).strict().parse(req.body);
    const hash=digest(shareId); const share=await store.get<Share>('SHARE',hash);
    if(!share || share.value.expiresAt<=seconds()) throw new HttpError(403,'The review link or PIN is invalid or expired.');
    if((share.value.lockedUntil ?? 0)>seconds()) throw new HttpError(429,'Too many incorrect PINs. Try again in 15 minutes.','PIN_LOCKED');
    if(share.value.lockedUntil) {share.value.attempts=0; delete share.value.lockedUntil;}
    if(!equalHash(`${shareId}:${pin}`,share.value.pinHash)) {
      share.value.attempts += 1;
      if(share.value.attempts>=5) share.value.lockedUntil=seconds()+15*60;
      await store.put(share.pk,share.sk,share.value,share.version,share.value.expiresAt);
      throw new HttpError(403,'The review link or PIN is invalid or expired.');
    }
    const {record}=await getShare(hash);
    share.value.attempts=0; delete share.value.lockedUntil; await store.put(share.pk,share.sk,share.value,share.version,share.value.expiresAt);
    const access=token(); const expiresAt=Math.min(seconds()+2*3600,share.value.expiresAt);
    await store.put<SupplierSession>('SUPPLIER_SESSION',digest(access),{shareHash:hash,caseId:record.value.id,workspaceId:share.value.workspaceId,revision:share.value.revision,expiresAt},null,expiresAt);
    res.json({token:access,case:record.value});
  });
  app.get('/api/shares/:shareId',async(req,res)=>{const approved=await supplier(req); if(approved.session.shareHash!==digest(parameter(req,'shareId'))) throw new HttpError(403,'This supplier session belongs to another review link.');res.json({case:approved.record.value});});
  app.post('/api/shares/:shareId/respond',async(req,res)=>{
    const body=z.object({revision:z.number().int().min(1),name:z.string().trim().min(1).max(80),responses:z.array(z.object({lineId:id,decision:z.enum(['acknowledged','disputed']),note:z.string().max(500)}).strict()).min(1).max(100)}).strict().parse(req.body);
    const approved=await supplier(req); if(approved.session.shareHash!==digest(parameter(req,'shareId'))) throw new HttpError(403,'This supplier session belongs to another review link.');
    const stored=approved.record; checkRevision(stored,body.revision); checkEditable(stored.value);
    const affected=new Set(reconcileCase(stored.value).lines.filter(l=>l.discrepancyUnits>0).map(l=>l.lineId));
    if(new Set(body.responses.map(r=>r.lineId)).size!==body.responses.length || body.responses.some(r=>!affected.has(r.lineId))) throw new HttpError(422,'Respond only once per current discrepancy line.');
    if(body.responses.some(r=>r.decision==='disputed' && !r.note.trim())) throw new HttpError(422,'Add a reason for each disputed line.');
    const responses:SupplierResponse[]=body.responses.map(r=>({...r,at:now(),actor:body.name,revision:body.revision}));
    const changed=new Set(responses.map(r=>r.lineId)); stored.value.responses=[...stored.value.responses.filter(r=>!changed.has(r.lineId)),...responses]; stored.value.status='responded';
    history(stored.value,`${body.name} (supplier, self-reported name)`,'supplier_responded',responses.map(r=>`${r.lineId}: ${r.decision}${r.note ? ` — ${r.note}` : ''}`).join('; ').slice(0,1500)); res.json(await putCase(stored));
  });
  app.get('/api/cases/:id/export',async(req,res)=>{
    const format=z.enum(['json','csv']).parse(req.query.format ?? 'json'); const record=(await caseForRequest(req,res)).value;
    res.attachment(`${record.caseNumber}.${format}`);
    if(format==='json') {res.type('application/json');return res.send(JSON.stringify({case:record,reconciliation:reconcileCase(record),notice:'Receiver-reported observations. Supplier names are self-reported. Item values exclude tax and discounts; acknowledgement is not money recovered.'},null,2));}
    const escape=(value:unknown) => {const raw=String(value ?? ''); const safe=/^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g,'""')}"`;};
    const computed=reconcileCase(record); const rows=[['Item','SKU','Billed quantity','Billed unit','Pack size','Received units','Damaged units','Wrong units','Shortage units','Excess units','Discrepancy INR','Confirmed','Supplier decision'],...record.lines.map(l=>{const result=computed.lines.find(r=>r.lineId===l.id)!;return [l.description,l.sku,l.billedQty,l.billedUnit,l.packSize,l.receivedQty,l.damagedQty,l.wrongQty,result.shortage,result.excess,result.discrepancyMinor===null ? '' : (result.discrepancyMinor/100).toFixed(2),l.confirmed,record.responses.find(r=>r.lineId===l.id)?.decision ?? ''];})];
    res.type('text/csv');res.send('\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n'));
  });

  app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
  if(options.serveStatic !== false) {
    const directory=path.resolve('dist'); app.use(express.static(directory,{index:false,maxAge:'1h'}));
    app.get('/{*path}',(_req,res,next)=>res.sendFile(path.join(directory,'index.html'),error=>error ? next(error) : undefined));
  }
  app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(error instanceof ZodError) return res.status(400).json({error:'Check the supplied fields.',code:'INVALID_INPUT',details:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
    if(error instanceof HttpError) return res.status(error.status).json({error:error.message,code:error.code,details:error.details});
    if(error instanceof Conflict) return res.status(409).json({error:error.message,code:'REVISION_CONFLICT'});
    if(error instanceof UploadProblem) return res.status(422).json({error:error.message,code:'INVALID_UPLOAD'});
    const parserError=error as {status?:number;type?:string};
    if(parserError.type==='entity.too.large') return res.status(413).json({error:'This request is too large.'});
    if(parserError.type==='entity.parse.failed') return res.status(400).json({error:'Request body must be valid JSON.'});
    console.error('ReceiveRight request failed:', error instanceof Error ? error.name : 'UnknownError');
    return res.status(500).json({error:'The operation could not be completed. Please retry. No successful change is being claimed.'});
  });
  return app;
}
