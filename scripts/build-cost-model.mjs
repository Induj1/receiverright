/** A reproducible, explicitly assumed workload; no billing or usage claims. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const products=JSON.parse((await readFile('docs/evidence/aws-price-products.json','utf8')).replace(/^\uFEFF/,'')).flat();
function price(usage,{positive=false,service}={}){
  const product=products.find(p=>p.product.attributes.usagetype===usage&&(!service||p.serviceCode===service));
  if(!product)throw new Error(`Missing price product ${usage}`);
  const dimensions=Object.values(product.terms.OnDemand).flatMap(term=>Object.values(term.priceDimensions));
  const dimension=dimensions.filter(d=>!positive || Number(d.pricePerUnit.USD)>0).sort((a,b)=>Number(a.beginRange)-Number(b.beginRange))[0];
  return {service:product.serviceCode,usageType:usage,usdPerUnit:Number(dimension.pricePerUnit.USD),unit:dimension.unit,sku:product.product.sku,rateCode:dimension.rateCode,description:dimension.description,publicationDate:product.publicationDate};
}
const rates={
  textract:price('APS3-SyncExpensePagesProcessed'),
  lambdaDuration:price('APS3-Lambda-GB-Second-ARM'),
  lambdaRequest:price('APS3-Request'),
  httpApi:price('APS3-ApiGatewayHttpRequest'),
  dynamoWrite:price('APS3-WriteRequestUnits'),
  dynamoRead:price('APS3-ReadRequestUnits'),
  dynamoStorage:price('APS3-TimedStorage-ByteHrs',{positive:true,service:'AmazonDynamoDB'}),
  s3Storage:price('APS3-TimedStorage-ByteHrs',{service:'AmazonS3'})
};
const assumptions={invoices:1000,pagesPerInvoice:1,httpRequestsPerInvoice:30,lambdaInvocationsPerInvoice:30,lambdaGBSecondsPerInvoice:6,dynamoWriteUnitsPerInvoice:200,dynamoReadUnitsPerInvoice:100,s3GBMonthsPerInvoice:0.002,dynamoGBMonthsPerInvoice:0.0001};
const perInvoice={textract:rates.textract.usdPerUnit,api:30*rates.httpApi.usdPerUnit,lambdaRequests:30*rates.lambdaRequest.usdPerUnit,lambdaCompute:6*rates.lambdaDuration.usdPerUnit,dynamoWrite:200*rates.dynamoWrite.usdPerUnit,dynamoRead:100*rates.dynamoRead.usdPerUnit,s3Storage:0.002*rates.s3Storage.usdPerUnit,dynamoStorage:0.0001*rates.dynamoStorage.usdPerUnit};
const subtotal=Object.values(perInvoice).reduce((a,b)=>a+b,0);
const report={retrievedAt:new Date().toISOString(),region:'ap-south-1',currency:'USD',source:'AWS Price List Query API, OnDemand rates',classification:'Modeled core-service subtotal using explicit assumptions; not measured cost or full account bill',rates,assumptions,perInvoice,subtotalPerInvoice:subtotal,subtotalFor1000:subtotal*1000,excludes:['S3 request charges','CloudWatch ingestion/storage','internet data transfer','deployment artifact storage','operator/support costs','taxes'],ignoresDiscounts:['free tiers','promotional credits','negotiated discounts'],notes:['DynamoDB write units include an assumed allowance for transaction overhead and snapshots; actual units depend on item sizes.','All assumed objects are retained for one month; continuing retention accumulates costs.','Lambda GB-seconds are assumed: 512 MiB multiplied by 12 aggregate execution seconds across 30 invocations.','Actual workload counts and provider latency are reported separately by the live verification/evaluation scripts.']};
await mkdir('docs/evidence',{recursive:true});
await writeFile('docs/evidence/aws-cost-model.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({subtotalPerInvoice:subtotal,subtotalFor1000:subtotal*1000,rates},null,2));
