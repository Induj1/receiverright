/**
 * Explicit, bounded live smoke test. Creates two synthetic cases in a fresh
 * workspace, makes at most one Textract and one summary request, sends no email,
 * and never logs access tokens, review URLs, or PINs.
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
const report={startedAt:new Date().toISOString(),deploymentOrigin:base.origin,checks:[],providers:{},passed:false};
let previous=0;
async function pace() { const wait=450-(Date.now()-previous); if(wait>0) await new Promise(resolve=>setTimeout(resolve,wait)); previous=Date.now(); }
async function call(endpoint,{token,body,method=body===undefined ? 'GET' : 'POST',expected=200,raw=false}={}) {
  await pace();
  const response=await fetch(new URL(endpoint,base),{method,headers:{...(token ? {Authorization:`Bearer ${token}`} : {}),...(body!==undefined ? {'Content-Type':'application/json'} : {})},...(body!==undefined ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(60_000)});
  const content=raw ? await response.arrayBuffer() : await response.json().catch(()=>({error:'Response was not JSON.'}));
  if(response.status!==expected) {const error=new Error(`HTTP ${response.status}; ${raw ? 'file response failed' : content.error ?? 'unexpected response'}`);error.status=response.status;throw error;}
  return content;
}
function passed(name,details={}) {report.checks.push({name,status:'passed',...details});console.log(`PASS ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);}
async function providerCheck(name,work) {
  try {report.providers[name]={status:'passed',...await work()};console.log(`PASS provider ${name} ${JSON.stringify(report.providers[name])}`);}
  catch(error) {report.providers[name]={status:'unavailable',httpStatus:error.status ?? null,error:error.message};console.log(`UNAVAILABLE provider ${name}: ${error.message}`);}
}

try {
  const health=await call('/api/health');report.health=health;passed('health',health);
  const session=await call('/api/sessions',{body:{name:'Synthetic deployment verification'},expected:201});
  const receiver=session.token;
  const initial=await call('/api/cases/sample',{token:receiver,body:{},expected:201});
  assert.equal(initial.isDemo,true);passed('isolated synthetic workspace');
  const record=await call(`/api/cases/${initial.id}`,{token:receiver,method:'PUT',body:{revision:initial.revision,lines:initial.lines.map(line=>({...line,confirmed:true,packSize:line.billedUnit==='carton' ? 12 : 1}))}});
  const ready=await call(`/api/cases/${record.id}/ready`,{token:receiver,body:{revision:record.revision}});assert.equal(ready.status,'ready');passed('confirmed pack conversion');
  const link=await call(`/api/cases/${record.id}/share`,{token:receiver,body:{revision:record.revision},expected:201});
  const review=await call(`/api/shares/${link.shareId}/open`,{body:{pin:link.pin}});
  const responded=await call(`/api/shares/${link.shareId}/respond`,{token:review.token,body:{revision:record.revision,name:'Synthetic supplier reviewer',responses:record.lines.slice(0,2).map(line=>({lineId:line.id,decision:'acknowledged',note:'Synthetic functional verification, not a commercial agreement.'}))}});assert.equal(responded.status,'responded');passed('supplier review and response');
  const closed=await call(`/api/cases/${record.id}/close`,{token:receiver,body:{revision:record.revision}});assert.equal(closed.status,'closed');passed('acknowledged closure');
  const jsonExport=await call(`/api/cases/${record.id}/export?format=json`,{token:receiver});assert.equal(jsonExport.reconciliation.totalDiscrepancyMinor,28000);
  const csvExport=await call(`/api/cases/${record.id}/export?format=csv`,{token:receiver,raw:true});assert.ok(csvExport.byteLength>100);passed('JSON and CSV exports',{expectedSyntheticDiscrepancyMinor:28000});

  const invoice=await readFile(path.join(root,'public','sample-invoice.png'));
  const uploadCase=await call('/api/cases',{token:receiver,body:{supplier:'Synthetic AWS validation supplier',shopName:'Synthetic verification only',invoiceNumber:'SYNTHETIC-AWS-TEST'},expected:201});
  const prepared=await call('/api/uploads',{token:receiver,body:{caseId:uploadCase.id,fileName:'synthetic-sample-invoice.png',mimeType:'image/png',kind:'invoice',size:invoice.length},expected:201});
  await pace();
  const uploaded=await fetch(new URL(prepared.uploadUrl,base),{method:prepared.method,headers:prepared.headers,body:invoice,signal:AbortSignal.timeout(60_000)});
  if(!uploaded.ok) throw new Error(`Private invoice upload failed: HTTP ${uploaded.status}.`);
  const evidence=await call(`/api/uploads/${prepared.uploadId}/complete`,{token:receiver,body:{},expected:201});
  const fetched=Buffer.from(await call(evidence.url,{token:receiver,raw:true}));assert.deepEqual(fetched,invoice);passed('private invoice upload and authorized read',{bytes:invoice.length});
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
  report.passed=true;
} catch(error) {
  report.error={message:error.message,httpStatus:error.status ?? null};console.error(`FAIL ${error.message}`);process.exitCode=1;
} finally {
  report.completedAt=new Date().toISOString();
  await mkdir(path.join(root,'.artifacts'),{recursive:true});
  await writeFile(path.join(root,'.artifacts','deployed-smoke.json'),JSON.stringify(report,null,2));
  console.log('Non-secret verification report saved to .artifacts/deployed-smoke.json');
}
