export type CaseStatus = 'draft' | 'ready' | 'shared' | 'responded' | 'closed';
export type Provider = 'sample' | 'manual' | 'textract';
export interface SourceBox { left:number; top:number; width:number; height:number; page:number; confidence:number; }
export interface InvoiceLine { id:string; description:string; sku:string; billedQty:number; billedUnit:string; packSize:number|null; receivedQty:number|null; damagedQty:number; wrongQty:number; unitPriceMinor:number|null; confirmed:boolean; note:string; source?:SourceBox; }
export interface Evidence { id:string; fileName:string; mimeType:string; kind:'invoice'|'photo'; lineId?:string; url:string; createdAt:string; }
export interface AuditEvent { id:string; at:string; actor:string; action:string; detail:string; revision:number; }
export interface SupplierResponse { lineId:string; decision:'acknowledged'|'disputed'; note:string; at:string; actor:string; revision:number; }
export interface ReceivingCase { id:string; caseNumber:string; invoiceNumber:string; supplier:string; supplierEmail:string; shopName:string; invoiceDate:string; status:CaseStatus; revision:number; createdAt:string; updatedAt:string; currency:'INR'; lines:InvoiceLine[]; evidence:Evidence[]; history:AuditEvent[]; responses:SupplierResponse[]; isDemo:boolean; extractionProvider:Provider; summary?:string; }
export interface LineResult { lineId:string; expectedUnits:number|null; acceptedUnits:number|null; shortage:number; damaged:number; wrong:number; excess:number; discrepancyUnits:number; discrepancyMinor:number|null; issues:string[]; ready:boolean; }
export interface Reconciliation { lines:LineResult[]; totalDiscrepancyMinor:number; hasUnpricedDiscrepancies:boolean; totalDiscrepancyUnits:number; ready:boolean; issues:string[]; }
export interface Session { token:string; name:string; workspaceId:string; isDemo:boolean; }
export interface Health { status:string; storage:'local'|'dynamodb'; extraction:'manual'|'textract'; summaries:'template'|'bedrock'; version:string; region?:string; }
export interface ShareResult { shareId:string; pin:string; url:string; expiresAt:string; revision:number; }
export interface ExtractionResult { lines:InvoiceLine[]; supplier:string; invoiceNumber:string; invoiceDate:string; provider:Provider; warnings:string[]; }
