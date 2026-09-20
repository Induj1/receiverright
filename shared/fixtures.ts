import type { InvoiceLine, ReceivingCase } from './types';

const uniqueId = (): string => globalThis.crypto.randomUUID();

export function makeBlankLine(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return { id: uniqueId(), description: '', sku: '', billedQty: 0, billedUnit: 'unit', packSize: 1, receivedQty: null, damagedQty: 0, wrongQty: 0, unitPriceMinor: null, confirmed: false, note: '', ...overrides };
}

/** Synthetic data only. The sample deliberately stops at an unresolved pack conversion. */
export function makeSampleCase(_workspace?: string): ReceivingCase {
  const id = uniqueId();
  const now = new Date().toISOString();
  const bottles = makeBlankLine({ description: 'Clear Spring water · 1 L', sku: 'BTL100', billedQty: 12, receivedQty: 10, unitPriceMinor: 10000, source: { left: 0.07, top: 0.363, width: 0.86, height: 0.065, page: 1, confidence: 100 }, note: 'Synthetic example: two bottles were not delivered.' });
  const biscuits = makeBlankLine({ description: 'Golden oat biscuits · 150 g', sku: 'BIS040', billedQty: 24, receivedQty: 24, damagedQty: 2, unitPriceMinor: 4000, source: { left: 0.07, top: 0.428, width: 0.86, height: 0.065, page: 1, confidence: 100 }, note: 'Synthetic example: two crushed packets are included in the 24 received.' });
  const tea = makeBlankLine({ description: 'Everyday tea · 100 g', sku: 'TEA120', billedQty: 1, billedUnit: 'carton', packSize: null, receivedQty: 12, unitPriceMinor: 120000, source: { left: 0.07, top: 0.493, width: 0.86, height: 0.065, page: 1, confidence: 100 }, note: 'Counted 12 individual packets. Confirm that this carton contains 12 packets.' });
  return {
    id, caseNumber: `RR-${id.slice(0, 6).toUpperCase()}`, invoiceNumber: 'DEMO-2026-042', supplier: 'Lakeview Distributors', supplierEmail: '', shopName: 'Corner Basket', invoiceDate: '2026-09-20', status: 'draft', revision: 1, createdAt: now, updatedAt: now, currency: 'INR', lines: [bottles, biscuits, tea],
    evidence: [
      { id: uniqueId(), fileName: 'sample-invoice.svg', mimeType: 'image/svg+xml', kind: 'invoice', url: '/sample-invoice.svg', createdAt: now },
      { id: uniqueId(), fileName: 'sample-delivery.svg', mimeType: 'image/svg+xml', kind: 'photo', lineId: biscuits.id, url: '/sample-delivery.svg', createdAt: now },
    ],
    history: [{ id: uniqueId(), at: now, actor: 'ReceiveRight demo', action: 'sample_created', detail: 'Created clearly labeled synthetic invoice and receiving observations. No AWS extraction or customer pilot is represented.', revision: 1 }],
    responses: [], isDemo: true, extractionProvider: 'sample',
  };
}
