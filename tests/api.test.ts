import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createApp} from '../server/app.js';
import {FileStore} from '../server/store.js';
import {Providers} from '../server/providers.js';
import type {ReceivingCase} from '../shared/types.js';

describe('receiving API with isolated durable local storage',()=>{
  let directory:string; let app:ReturnType<typeof createApp>; let access:string;
  beforeEach(async()=>{
    directory=await mkdtemp(path.join(os.tmpdir(),'receiverright-api-'));
    app=createApp({store:new FileStore(directory),providers:new Providers(directory),serveStatic:false});
    const result=await request(app).post('/api/sessions').send({name:'Receiver test'}).expect(201);access=result.body.token;
  });
  afterEach(async()=>{await rm(directory,{recursive:true,force:true});});
  const auth = () => ({Authorization:`Bearer ${access}`});
  async function sample():Promise<ReceivingCase> {return (await request(app).post('/api/cases/sample').set(auth()).send({}).expect(201)).body;}
  async function confirmed():Promise<ReceivingCase> {
    const original=await sample();
    const lines=original.lines.map(l=>({...l,confirmed:true,packSize:l.billedUnit==='carton' ? 12 : 1}));
    return (await request(app).put(`/api/cases/${original.id}`).set(auth()).send({revision:original.revision,lines}).expect(200)).body;
  }
  async function share(record:ReceivingCase) {return (await request(app).post(`/api/cases/${record.id}/share`).set(auth()).send({revision:record.revision}).expect(201)).body;}

  it('isolates workspaces and rejects supplied internal fields',async()=>{
    await request(app).post('/api/cases').set(auth()).send({supplier:'Shop supplier',revision:100,status:'closed'}).expect(400);
    const original=await sample();
    const second=await request(app).post('/api/sessions').send({name:'Other receiver'}).expect(201);
    await request(app).get(`/api/cases/${original.id}`).set('Authorization',`Bearer ${second.body.token}`).expect(404);
    expect((await request(app).get('/api/cases').set('Authorization',`Bearer ${second.body.token}`).expect(200)).body.cases).toEqual([]);
    await request(app).get(`/api/cases/${original.id}`).expect(401);
  });
  it('completes receiver verification, supplier decisions and acknowledged closure',async()=>{
    const record=await confirmed();
    await request(app).post(`/api/cases/${record.id}/ready`).set(auth()).send({revision:record.revision}).expect(200);
    const link=await share(record); expect(link.pin).toMatch(/^\d{6}$/);
    const opened=await request(app).post(`/api/shares/${link.shareId}/open`).send({pin:link.pin}).expect(200);
    const supplierAuth={Authorization:`Bearer ${opened.body.token}`};
    await request(app).get(`/api/cases/${record.id}`).set(supplierAuth).expect(401);
    await request(app).post(`/api/cases/${record.id}/close`).set(auth()).send({revision:record.revision}).expect(422);
    const responses=record.lines.slice(0,2).map(l=>({lineId:l.id,decision:'acknowledged',note:'Quantity confirmed on our delivery copy.'}));
    const responded=await request(app).post(`/api/shares/${link.shareId}/respond`).set(supplierAuth).send({revision:record.revision,name:'Supplier test',responses}).expect(200);
    expect(responded.body.status).toBe('responded');
    expect(responded.body.history.at(-1).actor).toContain('self-reported');
    const closed=await request(app).post(`/api/cases/${record.id}/close`).set(auth()).send({revision:record.revision}).expect(200);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.history.at(-1).detail).toContain('does not record payment');
    await request(app).put(`/api/cases/${record.id}`).set(auth()).send({revision:record.revision,shopName:'Edited'}).expect(409);
  });
  it('requires confirmation and rejects stale edit and supplier revisions',async()=>{
    const draft=await sample();
    await request(app).post(`/api/cases/${draft.id}/ready`).set(auth()).send({revision:draft.revision}).expect(422);
    const record=await confirmed(); const link=await share(record);
    const opened=await request(app).post(`/api/shares/${link.shareId}/open`).send({pin:link.pin}).expect(200);
    const updates=await Promise.all(['One','Two'].map(shopName=>request(app).put(`/api/cases/${record.id}`).set(auth()).send({revision:record.revision,shopName})));
    expect(updates.map(r=>r.status).sort()).toEqual([200,409]);
    await request(app).get(`/api/shares/${link.shareId}`).set('Authorization',`Bearer ${opened.body.token}`).expect(409);
    await request(app).post(`/api/shares/${link.shareId}/open`).send({pin:link.pin}).expect(409);
  });
  it('locks a review link after five invalid PIN attempts',async()=>{
    const record=await confirmed();const link=await share(record);const wrong=link.pin==='111111' ? '222222' : '111111';
    for(let i=0;i<5;i++) await request(app).post(`/api/shares/${link.shareId}/open`).send({pin:wrong}).expect(403);
    await request(app).post(`/api/shares/${link.shareId}/open`).send({pin:link.pin}).expect(429);
  });
  it('validates private uploads, attaches them idempotently, and scopes supplier evidence access',async()=>{
    const record=await confirmed(); const oldLink=await share(record);
    // Minimal PNG bytes are sufficient to exercise byte-signature and storage guards, not image recognition.
    const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const prepare=await request(app).post('/api/uploads').set(auth()).send({caseId:record.id,fileName:'delivery.png',mimeType:'image/png',kind:'photo',lineId:record.lines[0].id,size:bytes.length}).expect(201);
    await request(app).put(prepare.body.uploadUrl).set(prepare.body.headers).send(Buffer.from('not-a-png!!!')).expect(422);
    await request(app).put(prepare.body.uploadUrl).set(prepare.body.headers).send(bytes).expect(204);
    const complete=await request(app).post(`/api/uploads/${prepare.body.uploadId}/complete`).set(auth()).send({}).expect(201);
    await request(app).post(`/api/uploads/${prepare.body.uploadId}/complete`).set(auth()).send({}).expect(200);
    await request(app).put(prepare.body.uploadUrl).set(prepare.body.headers).send(bytes).expect(403);
    await request(app).get(complete.body.url).expect(401);
    const downloaded=await request(app).get(complete.body.url).set(auth()).expect(200);expect(downloaded.body).toEqual(bytes);
    await request(app).post(`/api/shares/${oldLink.shareId}/open`).send({pin:oldLink.pin}).expect(409);
    const fresh=(await request(app).get(`/api/cases/${record.id}`).set(auth()).expect(200)).body;
    const link=await share(fresh);const opened=await request(app).post(`/api/shares/${link.shareId}/open`).send({pin:link.pin}).expect(200);
    await request(app).get(complete.body.url).set('Authorization',`Bearer ${opened.body.token}`).expect(200);
    const other=await confirmed();const otherLink=await share(other);const otherOpen=await request(app).post(`/api/shares/${otherLink.shareId}/open`).send({pin:otherLink.pin}).expect(200);
    await request(app).get(complete.body.url).set('Authorization',`Bearer ${otherOpen.body.token}`).expect(404);
  });
  it('reports manual mode honestly and prevents spreadsheet formula injection on export',async()=>{
    const health=await request(app).get('/api/health').expect(200);expect(health.body).toMatchObject({storage:'local',extraction:'manual',summaries:'template'});
    const record=await confirmed();
    await request(app).post(`/api/cases/${record.id}/extract`).set(auth()).send({evidenceId:'sample-invoice'}).expect(503);
    const summary=await request(app).post(`/api/cases/${record.id}/summary`).set(auth()).send({}).expect(200);expect(summary.body.provider).toBe('template');
    record.lines[0].description='=1+1';
    await request(app).put(`/api/cases/${record.id}`).set(auth()).send({revision:record.revision,lines:record.lines}).expect(200);
    const exported=await request(app).get(`/api/cases/${record.id}/export?format=csv`).set(auth()).expect(200);
    expect(exported.text).toContain('"\'=1+1"');
    expect(exported.headers['content-disposition']).toContain('.csv');
  });
  it('preserves sessions and records across app restart',async()=>{
    const record=await sample();
    const restarted=createApp({store:new FileStore(directory),providers:new Providers(directory),serveStatic:false});
    expect((await request(restarted).get(`/api/cases/${record.id}`).set(auth()).expect(200)).body.id).toBe(record.id);
  });
  it('enforces a durable daily provider-call budget across concurrent requests',async()=>{
    class TestSummaryProvider extends Providers {
      override readonly model='test-only-model';
      calls=0;
      override async summary() {this.calls++;return {summary:'Test provider response',provider:'bedrock' as const};}
    }
    const previous=process.env.MAX_DAILY_AI_CALLS;process.env.MAX_DAILY_AI_CALLS='1';
    try {
      const provider=new TestSummaryProvider(directory);
      app=createApp({store:new FileStore(directory),providers:provider,serveStatic:false});
      const record=await sample();
      const results=await Promise.all([0,1].map(()=>request(app).post(`/api/cases/${record.id}/summary`).set(auth()).send({})));
      expect(results.map(result=>result.status).sort()).toEqual([200,429]);expect(provider.calls).toBe(1);
      const restarted=createApp({store:new FileStore(directory),providers:provider,serveStatic:false});
      await request(restarted).post(`/api/cases/${record.id}/summary`).set(auth()).send({}).expect(429);
      expect(provider.calls).toBe(1);
    } finally {if(previous===undefined) delete process.env.MAX_DAILY_AI_CALLS;else process.env.MAX_DAILY_AI_CALLS=previous;}
  });
});
