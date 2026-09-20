/**
 * Explicit, bounded live smoke test. Creates two synthetic cases in a fresh
 * workspace, makes at most one Textract and one summary request, sends no email,
 * and never logs access tokens, recovery codes, review URLs, or PINs.
 * Usage: node scripts/smoke-deployed.mjs https://YOUR-DEPLOYMENT
 */
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const input=process.argv[2];
if(!input) throw new Error('Pass the ReceiveRight deployment URL as the first argument.');
const base=new URL(input);
if(!['https:','http:'].includes(base.protocol) || (base.protocol==='http:' && !['localhost','127.0.0.1'].includes(base.hostname))) throw new Error('Use HTTPS, or localhost for development.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const report={startedAt:new Date().toISOString(),deploymentOrigin:base.origin,checks:[],providers:{},requests:[],passed:false};
let previous=0;
async function pace() { const wait=450-(Date.now()-previous); if(wait>0) await new Promise(resolve=>setTimeout(resolve,wait)); previous=Date.now(); }
function routeLabel(endpoint) {
  const url=new URL(endpoint,base);const parts=url.pathname.split('/');
  if(parts[2]==='cases' && parts[3] && parts[3]!=='sample') {parts[3]=':caseId';if(parts[4]==='revisions' && parts[5]) parts[5]=':snapshotId';}
  if(parts[2]==='shares' && parts[3]) parts[3]=':shareId';
  if(parts[2]==='uploads' && parts[3]) parts[3]=':uploadId';
  if(parts[2]==='evidence' && parts[3]) parts[3]=':evidenceId';
  return parts.join('/')+(url.pathname.endsWith('/export') && ['json','csv'].includes(url.searchParams.get('format')) ? `?format=${url.searchParams.get('format')}` : '');
}
function timing(method,route,category,started,httpStatus) {report.requests.push({method,route,category,clientElapsedMs:Math.round((performance.now()-started)*10)/10,httpStatus});}
function latencySummary(requests) {
  const values=requests.map(item=>item.clientElapsedMs).sort((a,b)=>a-b);
  if(!values.length) return {requestCount:0};
  const percentile=value=>values[Math.min(values.length-1,Math.ceil(values.length*value)-1)];
  return {requestCount:values.length,minMs:values[0],p50Ms:percentile(0.5),p95Ms:percentile(0.95),maxMs:values.at(-1),meanMs:Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10};
}
const safeError=error=>error.code==='ERR_ASSERTION' ? 'A functional assertion failed. No private values are included in this report.' : error.message;
async function call(endpoint,{token,body,method=body===undefined ? 'GET' : 'POST',expected=200,raw=false}={}) {
  await pace();
  const started=performance.now();let status=null;
  try {
    const response=await fetch(new URL(endpoint,base),{method,headers:{...(token ? {Authorization:`Bearer ${token}`} : {}),...(body!==undefined ? {'Content-Type':'application/json'} : {})},...(body!==undefined ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(60_000)});status=response.status;
    const content=raw ? await response.arrayBuffer() : await response.json().catch(()=>({error:'Response was not JSON.'}));
    if(response.status!==expected) {const error=new Error(`HTTP ${response.status}; ${raw ? 'file response failed' : content.error ?? 'unexpected response'}`);error.status=response.status;throw error;}
    return content;
  } finally {timing(method,routeLabel(endpoint),/\/(extract|summary)$/.test(new URL(endpoint,base).pathname) ? 'provider' : 'core',started,status);}
}
function passed(name,details={}) {report.checks.push({name,status:'passed',...details});console.log(`PASS ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);}
async function providerCheck(name,work) {
  try {report.providers[name]={status:'passed',...await work()};console.log(`PASS provider ${name} ${JSON.stringify(report.providers[name])}`);}
  catch(error) {report.providers[name]={status:'unavailable',httpStatus:error.status ?? null,error:safeError(error)};console.log(`UNAVAILABLE provider ${name}: ${safeError(error)}`);}
}

try {
  const health=await call('/api/health');report.health=health;passed('health',health);
  const session=await call('/api/sessions',{body:{name:'Synthetic deployment verification'},expected:201});
  const recovery=await call('/api/workspace/recovery',{token:session.token,body:{}});
  assert.match(recovery.recoveryCode,/^RR-[A-Za-z0-9_-]{43}$/);
  const initial=await call('/api/cases/sample',{token:session.token,body:{},expected:201});
  const renewed=await call('/api/sessions/renew',{token:session.token,body:{}});
  assert.equal(renewed.workspaceId,session.workspaceId);assert.equal(renewed.token,session.token);
  const restored=await call('/api/sessions/recover',{body:{recoveryCode:recovery.recoveryCode}});
  assert.equal(restored.workspaceId,session.workspaceId);assert.notEqual(restored.token,session.token);
  const receiver=restored.token;
  const workspace=await call('/api/workspace',{token:receiver});assert.equal(workspace.recoveryEnabled,true);
  const restoredCase=await call(`/api/cases/${initial.id}`,{token:receiver});assert.equal(restoredCase.id,initial.id);
  passed('saved recovery restores the same workspace and renewal preserves access');
  assert.equal(initial.isDemo,true);passed('isolated synthetic workspace');
  let record=await call(`/api/cases/${initial.id}`,{token:receiver,method:'PUT',body:{revision:initial.revision,lines:initial.lines.map(line=>({...line,confirmed:true,packSize:line.billedUnit==='carton' ? 12 : 1}))}});
  const ready=await call(`/api/cases/${record.id}/ready`,{token:receiver,body:{revision:record.revision}});assert.equal(ready.status,'ready');passed('confirmed pack conversion');
  const link=await call(`/api/cases/${record.id}/share`,{token:receiver,body:{revision:record.revision},expected:201});
  const review=await call(`/api/shares/${link.shareId}/open`,{body:{pin:link.pin}});
  const responded=await call(`/api/shares/${link.shareId}/respond`,{token:review.token,body:{revision:record.revision,name:'Synthetic supplier reviewer',responses:record.lines.slice(0,2).map(line=>({lineId:line.id,decision:'acknowledged',note:'Synthetic functional verification, not a commercial agreement.'}))}});assert.equal(responded.status,'responded');passed('supplier review and response');
  const revisions=await call(`/api/cases/${record.id}/revisions`,{token:receiver});
  const acknowledgedSnapshotId=revisions.revisions[0].snapshotId;
  const savedResponse=await call(`/api/cases/${record.id}/revisions/${acknowledgedSnapshotId}`,{token:receiver});
  assert.equal(savedResponse.record.responses.length,2);
  const changed=await call(`/api/cases/${record.id}`,{token:receiver,method:'PUT',body:{revision:record.revision,lines:record.lines.map((line,index)=>index===0 ? {...line,receivedQty:line.receivedQty+1} : line)}});
  assert.deepEqual(changed.responses,[]);
  const historical=await call(`/api/cases/${record.id}/revisions/${acknowledgedSnapshotId}`,{token:receiver});
  assert.deepEqual(historical,savedResponse);assert.notEqual(historical.record.lines[0].receivedQty,changed.lines[0].receivedQty);
  await call(`/api/shares/${link.shareId}`,{token:review.token,expected:409});
  passed('historical quantities and supplier acknowledgements survive a later edit');
  // Restore the original synthetic quantities and obtain a new response before
  // closure. Old acknowledgements must not apply to a changed revision.
  record=await call(`/api/cases/${record.id}`,{token:receiver,method:'PUT',body:{revision:changed.revision,lines:record.lines}});
  const replacement=await call(`/api/cases/${record.id}/share`,{token:receiver,body:{revision:record.revision},expected:201});
  const currentReview=await call(`/api/shares/${replacement.shareId}/open`,{body:{pin:replacement.pin}});
  await call(`/api/shares/${replacement.shareId}/respond`,{token:currentReview.token,body:{revision:record.revision,name:'Synthetic supplier reviewer',responses:record.lines.slice(0,2).map(line=>({lineId:line.id,decision:'acknowledged',note:'Rechecked current synthetic revision.'}))}});
  const closed=await call(`/api/cases/${record.id}/close`,{token:receiver,body:{revision:record.revision}});assert.equal(closed.status,'closed');passed('acknowledged closure');
  const jsonExport=await call(`/api/cases/${record.id}/export?format=json`,{token:receiver});assert.equal(jsonExport.reconciliation.totalDiscrepancyMinor,28000);
  const csvExport=await call(`/api/cases/${record.id}/export?format=csv`,{token:receiver,raw:true});assert.ok(csvExport.byteLength>100);passed('JSON and CSV exports',{expectedSyntheticDiscrepancyMinor:28000});

  const invoice=await readFile(path.join(root,'public','sample-invoice.png'));
  const uploadCase=await call('/api/cases',{token:receiver,body:{supplier:'Synthetic AWS validation supplier',shopName:'Synthetic verification only',invoiceNumber:'SYNTHETIC-AWS-TEST'},expected:201});
  const prepared=await call('/api/uploads',{token:receiver,body:{caseId:uploadCase.id,fileName:'synthetic-sample-invoice.png',mimeType:'image/png',kind:'invoice',size:invoice.length},expected:201});
  await pace();
  const uploadStarted=performance.now();let uploadStatus=null;
  try {
    const uploaded=await fetch(new URL(prepared.uploadUrl,base),{method:prepared.method,headers:prepared.headers,body:invoice,signal:AbortSignal.timeout(60_000)});uploadStatus=uploaded.status;
    if(!uploaded.ok) throw new Error(`Private invoice upload failed: HTTP ${uploaded.status}.`);
  } finally {timing(prepared.method,'private-evidence-upload','core',uploadStarted,uploadStatus);}
  const evidence=await call(`/api/uploads/${prepared.uploadId}/complete`,{token:receiver,body:{},expected:201});
  const fetched=Buffer.from(await call(evidence.url,{token:receiver,raw:true}));assert.deepEqual(fetched,invoice);passed('private invoice upload and authorized read',{bytes:invoice.length});
  const evidenceStates=await call(`/api/cases/${uploadCase.id}/revisions`,{token:receiver});
  const evidenceSnapshot=await call(`/api/cases/${uploadCase.id}/revisions/${evidenceStates.revisions[0].snapshotId}`,{token:receiver});
  assert.ok(evidenceSnapshot.record.evidence.some(item=>item.id===evidence.id));
  await call(`/api/cases/${uploadCase.id}`,{token:receiver,method:'PUT',body:{revision:evidenceSnapshot.record.revision,shopName:'Synthetic later receiving state'}});
  const retained=await call(`/api/cases/${uploadCase.id}/revisions/${evidenceSnapshot.snapshotId}`,{token:receiver});
  assert.deepEqual(retained,evidenceSnapshot);
  const historicalFile=retained.record.evidence.find(item=>item.id===evidence.id);
  assert.deepEqual(Buffer.from(await call(historicalFile.url,{token:receiver,raw:true})),invoice);
  passed('historical evidence remains privately downloadable after a later edit');
  if(health.extraction==='textract') await providerCheck('textract',async()=>{
    const result=await call(`/api/cases/${uploadCase.id}/extract`,{token:receiver,body:{evidenceId:evidence.id}});
    assert.equal(result.provider,'textract');
    return {provider:result.provider,actualExtractedLineCount:result.lines.length,warningCount:result.warnings.length,hasSupplier:!!result.supplier,hasInvoiceNumber:!!result.invoiceNumber};
  });
  else report.providers.textract={status:'not_configured'};
  await providerCheck('summary',async()=>{
    const result=await call(`/api/cases/${record.id}/summary`,{token:receiver,body:{}});assert.ok(result.summary.length>20);
    return {provider:result.provider,characters:result.summary.length};
  });
  report.corePassed=true;
  report.passed=!Object.values(report.providers).some(provider=>provider.status==='unavailable');
  if(!report.passed) process.exitCode=2;
} catch(error) {
  report.error={message:safeError(error),httpStatus:error.status ?? null};console.error(`FAIL ${safeError(error)}`);process.exitCode=1;
} finally {
  report.completedAt=new Date().toISOString();
  report.requestCount=report.requests.length;
  report.coreLatency={...latencySummary(report.requests.filter(item=>item.category==='core')),note:'Single sequential synthetic run from this client. Includes network and response parsing, excludes intentional pacing. This is a functional smoke observation, not a load test or SLA.'};
  await mkdir(path.join(root,'.artifacts'),{recursive:true});
  await writeFile(path.join(root,'.artifacts','deployed-smoke.json'),JSON.stringify(report,null,2));
  console.log('Non-secret verification report saved to .artifacts/deployed-smoke.json');
}
