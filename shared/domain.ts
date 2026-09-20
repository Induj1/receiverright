import type { InvoiceLine, LineResult, ReceivingCase, Reconciliation } from './types';

/** Packaged goods only: every receiving count is a whole physical unit. */
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const packedUnits = new Set(['carton', 'cartons', 'pack', 'packs', 'box', 'boxes', 'case', 'cases', 'dozen', 'dozens']);
const singleUnits = new Set(['unit', 'units', 'piece', 'pieces', 'pc', 'pcs', 'each', 'bottle', 'bottles', 'packet', 'packets', 'nos']);

export function requiresPackSize(unit: string): boolean {
  return packedUnits.has(String(unit ?? '').trim().toLowerCase());
}

/** Validate the editable payload without requiring an incomplete draft to be ready. */
export function validateCaseInput(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['Case input must be an object.'];
  const data = input as Record<string, unknown>;
  const issues: string[] = [];
  const textLimits: Record<string, number> = { supplier: 200, supplierEmail: 254, shopName: 200, invoiceNumber: 120, invoiceDate: 40 };
  for (const [field, maximum] of Object.entries(textLimits)) {
    if (field in data && (typeof data[field] !== 'string' || (data[field] as string).length > maximum)) issues.push(`${field} must be text of at most ${maximum} characters.`);
  }
  if ('revision' in data && (!whole(data.revision) || data.revision < 1)) issues.push('Revision must be a positive whole number.');
  if (!('lines' in data)) return issues;
  if (!Array.isArray(data.lines)) return [...issues, 'Lines must be an array.'];
  if (data.lines.length > 200) issues.push('A case supports up to 200 invoice lines.');
  const ids = new Set<string>();
  data.lines.forEach((raw, index) => {
    const prefix = `Line ${index + 1}: `;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push(`${prefix}must be an object.`); return; }
    const line = raw as Record<string, unknown>;
    if (!present(line.id) || line.id.length > 100) issues.push(`${prefix}needs an ID of 1–100 characters.`);
    else if (ids.has(line.id)) issues.push(`${prefix}duplicates another line ID.`);
    else ids.add(line.id);
    for (const [field, maximum] of Object.entries({ description: 300, sku: 100, billedUnit: 40, note: 2000 })) {
      if (typeof line[field] !== 'string' || (line[field] as string).length > maximum) issues.push(`${prefix}${field} must be text of at most ${maximum} characters.`);
    }
    for (const field of ['billedQty', 'damagedQty', 'wrongQty']) {
      if (!whole(line[field])) issues.push(`${prefix}${field} must be a nonnegative whole number.`);
    }
    if (line.receivedQty !== null && !whole(line.receivedQty)) issues.push(`${prefix}receivedQty must be a nonnegative whole number or null.`);
    if (line.packSize !== null && (!whole(line.packSize) || line.packSize === 0)) issues.push(`${prefix}packSize must be a positive whole number or null.`);
    if (line.unitPriceMinor !== null && !whole(line.unitPriceMinor)) issues.push(`${prefix}unitPriceMinor must be a nonnegative integer in paise or null.`);
    if (typeof line.confirmed !== 'boolean') issues.push(`${prefix}confirmed must be true or false.`);
    if (whole(line.receivedQty) && whole(line.damagedQty) && whole(line.wrongQty) && line.damagedQty + line.wrongQty > line.receivedQty) issues.push(`${prefix}damaged and wrong items cannot exceed the physical received count.`);
    if (line.source !== undefined) {
      const source = line.source as Record<string, unknown>;
      if (!source || typeof source !== 'object' || !whole(source.page) || source.page < 1 ||
        !['left', 'top', 'width', 'height'].every(key => typeof source[key] === 'number' && Number.isFinite(source[key]) && (source[key] as number) >= 0 && (source[key] as number) <= 1) ||
        typeof source.confidence !== 'number' || !Number.isFinite(source.confidence) || source.confidence < 0 || source.confidence > 100) {
        issues.push(`${prefix}source location is invalid.`);
      }
    }
  });
  return issues;
}

/** Half-up rounding happens once per line, after conversion from billed packs. */
function priceDiscrepancy(units: number, price: number, packSize: number): number | null {
  const numerator = BigInt(units) * BigInt(price);
  const denominator = BigInt(packSize);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}

export function reconcileLine(line: InvoiceLine): LineResult {
  const issues = validateCaseInput({ lines: [line] }).map(issue => issue.replace(/^Line 1: /, ''));
  if (!present(line.description)) issues.push('Add an item description.');
  if (!present(line.billedUnit)) issues.push('Choose the billed unit.');
  if (!line.confirmed) issues.push('Confirm the invoice and receiving counts.');

  const packed = requiresPackSize(line.billedUnit);
  if (present(line.billedUnit) && !packed && !singleUnits.has(line.billedUnit.trim().toLowerCase())) issues.push('Choose unit/piece or a supported pack unit. Weighed goods are outside this workflow.');
  const packSize = packed ? (whole(line.packSize) && line.packSize > 0 ? line.packSize : null) : 1;
  if (packed && packSize === null) issues.push('Confirm how many individual units are in each billed pack.');
  // A non-pack unit always means one physical unit. A stale pack size cannot silently alter its price.
  if (!packed && line.packSize !== null && line.packSize !== 1) issues.push('Use a pack/carton unit before setting a pack size above one.');
  let expectedUnits: number | null = whole(line.billedQty) && packSize !== null ? line.billedQty * packSize : null;
  if (expectedUnits !== null && !Number.isSafeInteger(expectedUnits)) { expectedUnits = null; issues.push('The expected unit count is too large.'); }
  const received = whole(line.receivedQty) ? line.receivedQty : null;
  if (received === null) issues.push('Enter the total physical count received.');
  const damaged = whole(line.damagedQty) ? line.damagedQty : 0;
  const wrong = whole(line.wrongQty) ? line.wrongQty : 0;
  const countsValid = received !== null && whole(line.damagedQty) && whole(line.wrongQty) && damaged + wrong <= received;
  const acceptedUnits = countsValid ? received - damaged - wrong : null;
  const shortage = expectedUnits !== null && received !== null ? Math.max(expectedUnits - received, 0) : 0;
  const excess = expectedUnits !== null && received !== null ? Math.max(received - expectedUnits, 0) : 0;
  const discrepancyUnits = countsValid ? shortage + damaged + wrong : 0;
  const price = whole(line.unitPriceMinor) ? line.unitPriceMinor : null;
  if (price === null) issues.push('Enter the item price per billed unit.');
  if (excess > 0 && damaged + wrong > 0) issues.push('Overdelivery with damaged or wrong items needs separate allocation before sharing.');
  let discrepancyMinor: number | null = countsValid && expectedUnits !== null && packSize !== null && price !== null
    ? priceDiscrepancy(discrepancyUnits, price, packSize) : null;
  if (countsValid && expectedUnits !== null && price !== null && discrepancyMinor === null) issues.push('The discrepancy value is too large.');
  // No monetary claim is inferred when surplus units and rejected units overlap.
  if (excess > 0 && damaged + wrong > 0) discrepancyMinor = null;
  return { lineId: line.id, expectedUnits, acceptedUnits, shortage, damaged, wrong, excess, discrepancyUnits, discrepancyMinor, issues: [...new Set(issues)], ready: issues.length === 0 };
}

export function reconcileCase(record: ReceivingCase): Reconciliation {
  const lines = record.lines.map(reconcileLine);
  const issues: string[] = [];
  if (!present(record.supplier)) issues.push('Add the supplier name.');
  if (lines.length === 0) issues.push('Add at least one invoice line.');
  const duplicateIds = new Set<string>();
  for (const line of lines) {
    if (duplicateIds.has(line.lineId)) issues.push('Every invoice line must have a unique ID.');
    duplicateIds.add(line.lineId);
    if (!line.ready) issues.push(`${record.lines.find(item => item.id === line.lineId)?.description || 'Untitled item'}: ${line.issues.join(' ')}`);
  }
  let totalDiscrepancyMinor = lines.reduce((sum, line) => sum + (line.discrepancyMinor ?? 0), 0);
  let totalDiscrepancyUnits = lines.reduce((sum, line) => sum + line.discrepancyUnits, 0);
  if (!Number.isSafeInteger(totalDiscrepancyMinor)) { totalDiscrepancyMinor = 0; issues.push('The total discrepancy value is too large.'); }
  if (!Number.isSafeInteger(totalDiscrepancyUnits)) { totalDiscrepancyUnits = 0; issues.push('The total discrepancy count is too large.'); }
  return { lines, totalDiscrepancyMinor, totalDiscrepancyUnits, hasUnpricedDiscrepancies: lines.some(line => line.discrepancyUnits > 0 && line.discrepancyMinor === null), ready: issues.length === 0, issues };
}
