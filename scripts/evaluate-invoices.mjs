/** Bounded synthetic evaluation through the deployed application: five OCR calls. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

const base=new URL(process.argv[2]||'https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com');
if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))throw new Error('Use HTTPS or localhost.');
const corpus=JSON.parse(await readFile('public/evaluation/expected.json','utf8'));
if(corpus.cases.length>6)throw new Error('This evaluation is limited to six provider calls per run.');
let last=0;
const requests=[];
async function call(route,{token,body,method=body===undefined?'GET':'POST'}={}){
  const pause=500-(Date.now()-last);if(pause>0)await new Promise(resolve=>setTimeout(resolve,pause));last=Date.now();
  const start=performance.now();
  const response=await fetch(new URL(route,base),{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60_000)});
  const data=await response.json();
  const elapsedMs=Math.round(performance.now()-start);
  requests.push({method,route:route.replace(/\/cases\/[^/]+/,'/cases/:caseId').replace(/\/uploads\/[^/]+/,'/uploads/:uploadId'),status:response.status,elapsedMs});
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${data.error||'request failed'}`);
  return {data,elapsedMs};
}
const normalize=text=>String(text??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const report={startedAt:new Date().toISOString(),origin:base.origin,kind:'Measured live application extraction on generated synthetic invoices',limitations:corpus.limitations,alignment:'Printed row order. Missing rows fail all expected fields; extra rows are separately counted. Descriptions/supplier/invoice identifiers compare case-insensitive alphanumeric text. Numeric and unit fields compare exact values.',cases:[],requests};
const session=(await call('/api/sessions',{body:{name:'Synthetic invoice evaluation'}})).data;
for(const fixture of corpus.cases){
  const item={id:fixture.id,variant:fixture.variant,fixture:`public/evaluation/${fixture.image}`,expectedLineCount:fixture.lines.length,status:'pending'};
  report.cases.push(item);
  try{
    const record=(await call('/api/cases',{token:session.token,body:{supplier:'Synthetic evaluation',invoiceNumber:fixture.invoiceNumber,shopName:'Generated documents only'}})).data;
    const image=await readFile(path.join('public/evaluation',fixture.image));
    const prepared=(await call('/api/uploads',{token:session.token,body:{caseId:record.id,fileName:fixture.image,mimeType:'image/png',kind:'invoice',size:image.length}})).data;
    const uploaded=await fetch(new URL(prepared.uploadUrl,base),{method:prepared.method,headers:prepared.headers,body:image,signal:AbortSignal.timeout(60_000)});
    if(!uploaded.ok)throw new Error(`S3 upload HTTP ${uploaded.status}`);
    const evidence=(await call(`/api/uploads/${prepared.uploadId}/complete`,{token:session.token,body:{}})).data;
    const extracted=await call(`/api/cases/${record.id}/extract`,{token:session.token,body:{evidenceId:evidence.id}});
    const result=extracted.data;
    const comparisons=fixture.lines.map((expected,index)=>{
      const actual=result.lines[index];
      return {row:index+1,expected,actual:actual?{description:actual.description,billedQty:actual.billedQty,billedUnit:actual.billedUnit,unitPriceMinor:actual.unitPriceMinor,note:actual.note}:null,matches:{description:!!actual&&normalize(expected.description)===normalize(actual.description),billedQty:!!actual&&expected.billedQty===actual.billedQty,billedUnit:!!actual&&expected.billedUnit===actual.billedUnit,unitPriceMinor:!!actual&&expected.unitPriceMinor===actual.unitPriceMinor}};
    });
    Object.assign(item,{status:'completed',provider:result.provider,extractionElapsedMs:extracted.elapsedMs,actualLineCount:result.lines.length,extraRows:Math.max(0,result.lines.length-fixture.lines.length),missingRows:Math.max(0,fixture.lines.length-result.lines.length),supplierMatch:normalize(result.supplier)===normalize(fixture.supplier),invoiceNumberMatch:normalize(result.invoiceNumber)===normalize(fixture.invoiceNumber),warnings:result.warnings,comparisons,receivingCountsRemainUnknown:result.lines.every(line=>line.receivedQty===null&&line.packSize===null&&line.confirmed===false)});
    console.log(`${fixture.id}: ${result.lines.length} rows, ${extracted.elapsedMs} ms, ${comparisons.reduce((sum,row)=>sum+Object.values(row.matches).filter(Boolean).length,0)}/${fixture.lines.length*4} exact row fields`);
  }catch(error){Object.assign(item,{status:'failed',error:error.message});console.log(`${fixture.id}: FAILED ${error.message}`);}
}
const fields=['description','billedQty','billedUnit','unitPriceMinor'];
const expectedRows=corpus.cases.reduce((sum,item)=>sum+item.lines.length,0);
report.summary={invoices:report.cases.length,completed:report.cases.filter(item=>item.status==='completed').length,expectedRows,fields:Object.fromEntries(fields.map(field=>[field,{matched:report.cases.reduce((sum,item)=>sum+(item.comparisons?.filter(row=>row.matches[field]).length??0),0),total:expectedRows}])),extraRows:report.cases.reduce((sum,item)=>sum+(item.extraRows??0),0),unknownSourceQuantityPreserved:report.cases.flatMap(item=>item.comparisons??[]).filter(row=>row.expected.billedQty===null).every(row=>row.actual?.billedQty===null),physicalCountsNeverInferred:report.cases.filter(item=>item.status==='completed').every(item=>item.receivingCountsRemainUnknown),extractionElapsedMs:report.cases.filter(item=>item.status==='completed').map(item=>item.extractionElapsedMs)};
report.completedAt=new Date().toISOString();
const omittedQuantities=corpus.cases.reduce((sum,item)=>sum+item.lines.filter(line=>line.billedQty===null).length,0);
const preservedOmissions=report.cases.flatMap(item=>item.comparisons??[]).filter(row=>row.expected.billedQty===null&&row.actual?.billedQty===null).length;
report.summary.unknownSourceQuantityPreserved=preservedOmissions===omittedQuantities;
report.summary.unknownSourceQuantityCoverage={preserved:preservedOmissions,total:omittedQuantities};
if(report.summary.completed===0)report.summary.physicalCountsNeverInferred=false;
await mkdir('docs/evidence',{recursive:true});
await writeFile('docs/evidence/invoice-evaluation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(report.summary.completed!==report.summary.invoices)process.exitCode=2;
