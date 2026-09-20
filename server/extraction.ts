import { randomUUID } from 'node:crypto';
import type { AnalyzeExpenseResponse, ExpenseField } from '@aws-sdk/client-textract';
import type { ExtractionResult, InvoiceLine, SourceBox } from '../shared/types.js';
import { MAX_INVOICE_LINES } from '../shared/domain.js';

export class ExtractionProblem extends Error {
  constructor(message: string, readonly code = 'EXTRACTION_REVIEW_REQUIRED') { super(message); }
}

// A conservative suggestion threshold, not a measured probability of correctness.
// Every returned line still requires the receiver's explicit confirmation.
export const MIN_NUMERIC_CONFIDENCE = 90;
const unitNames: Record<string, string> = {
  unit: 'unit', units: 'unit', piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  each: 'piece', ea: 'piece', no: 'piece', nos: 'piece', bottle: 'bottle', bottles: 'bottle',
  packet: 'packet', packets: 'packet', carton: 'carton', cartons: 'carton', ctn: 'carton',
  ctns: 'carton', pack: 'pack', packs: 'pack', box: 'box', boxes: 'box',
  case: 'case', cases: 'case', dozen: 'dozen', dozens: 'dozen', doz: 'dozen',
};
const normalizeUnit = (value: string): string => unitNames[value.trim().toLowerCase().replace(/\.$/, '')] ?? 'unknown';
const text = (field: ExpenseField | undefined): string => field?.ValueDetection?.Text?.trim() ?? '';
const confident = (field: ExpenseField | undefined): boolean => {
  const value = field?.ValueDetection?.Confidence;
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_NUMERIC_CONFIDENCE && value <= 100;
};

// Accept plain, western-grouped or Indian-grouped whole digits. A comma is never
// interpreted as a decimal mark, and malformed grouping is never stripped away.
function ungroupDigits(value: string): string | null {
  if (/^\d+$/.test(value) || /^\d{1,3}(?:,\d{3})+$/.test(value) || /^\d{1,2}(?:,\d{2})*,\d{3}$/.test(value)) return value.replace(/,/g, '');
  return null;
}

/** No multiplication, negative counts, decimal counts, or mixed units are inferred. */
export function parseQuantity(value: string): { quantity: number | null; unit: string } {
  const match = /^\s*([\d,]+)(?:\.0{1,2})?(?:\s*([A-Za-z]+\.?))?\s*$/.exec(value);
  if (!match) return { quantity: null, unit: 'unknown' };
  const digits = ungroupDigits(match[1]);
  const quantity = digits === null ? NaN : Number(digits);
  return {
    quantity: Number.isSafeInteger(quantity) && quantity <= 1_000_000 ? quantity : null,
    unit: match[2] ? normalizeUnit(match[2]) : 'unknown',
  };
}

/** Parse INR to integer paise without turning OCR punctuation into another value. */
export function parsePriceMinor(value: string): number | null {
  const stripped = value.trim().replace(/^(?:INR|Rs\.?|₹)\s*/i, '').trim();
  const match = /^([\d,]+)(?:\.(\d{1,2}))?$/.exec(stripped);
  if (!match) return null;
  const digits = ungroupDigits(match[1]);
  if (digits === null) return null;
  const amount = BigInt(digits) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return amount <= 100_000_000_000n ? Number(amount) : null;
}

/** HTML date inputs need ISO dates; ambiguous numeric day/month order stays blank. */
export function parseInvoiceDate(value: string): string {
  const normalized = value.trim().replace(/,/g, '').replace(/\s+/g, ' ');
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = (name: string) => monthNames.findIndex(monthName => monthName === name.toLowerCase() || monthName.slice(0, 3) === name.toLowerCase()) + 1;
  const dayFirst = /^(\d{1,2})[- ]([A-Za-z]+)[- ](\d{4})$/.exec(normalized);
  const monthFirst = /^([A-Za-z]+)[- ](\d{1,2})[- ](\d{4})$/.exec(normalized);
  if (iso) [year, month, day] = iso.slice(1).map(Number);
  else if (dayFirst) { day = Number(dayFirst[1]); month = monthIndex(dayFirst[2]); year = Number(dayFirst[3]); }
  else if (monthFirst) { month = monthIndex(monthFirst[1]); day = Number(monthFirst[2]); year = Number(monthFirst[3]); }
  else return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sourceBox(field: ExpenseField | undefined): SourceBox | undefined {
  const box = field?.ValueDetection?.Geometry?.BoundingBox;
  const confidence = field?.ValueDetection?.Confidence;
  const values = [box?.Left, box?.Top, box?.Width, box?.Height];
  if (!box || !values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
    || typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) return undefined;
  const page = field?.PageNumber ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 1000) return undefined;
  return { left: box.Left!, top: box.Top!, width: box.Width!, height: box.Height!, page, confidence };
}

/** Convert Textract candidates into incomplete drafts, never receiving observations. */
export function parseExpenseResult(result: AnalyzeExpenseResponse): ExtractionResult {
  const documents = result.ExpenseDocuments ?? [];
  if (documents.length > 1) throw new ExtractionProblem(`Textract found ${documents.length} invoices or receipts in this file. Upload one invoice per receiving record so rows and suppliers cannot be mixed. No lines were applied.`, 'MULTIPLE_INVOICES');
  const document = documents[0];
  const rows = document?.LineItemGroups?.flatMap(group => group.LineItems ?? []) ?? [];
  if (rows.length > MAX_INVOICE_LINES) throw new ExtractionProblem(`Textract found ${rows.length} item rows; a record supports ${MAX_INVOICE_LINES}. Split this invoice into clearly labeled receiving records. No lines were dropped or applied.`, 'TOO_MANY_INVOICE_LINES');
  const allFields = [...(document?.SummaryFields ?? []), ...rows.flatMap(row => row.LineItemExpenseFields ?? [])];
  const currencies = new Set(allFields.map(field => field.Currency?.Code).filter((code): code is string => !!code && code !== 'INR'));
  if (currencies.size) throw new ExtractionProblem(`Textract detected ${[...currencies].join(', ')} currency. This workflow prices packaged goods in INR only. Verify the source invoice before entering any INR values manually. No currency conversion was performed.`, 'UNSUPPORTED_CURRENCY');
  const warnings = [
    'Review every extracted field against the invoice. All rows are unconfirmed; receiving counts and pack sizes are never inferred.',
    'OCR can omit entire invoice rows. Compare this list with the original and add missing items before confirming the delivery.',
    'Prices are suggestions in INR per billed unit. Verify currency, taxes, discounts, and whether the printed price is per pack or per piece.',
  ];
  const summary = (name: string, maximum: number) => {
    const value = text(document?.SummaryFields?.find(field => field.Type?.Text === name));
    if (value.length > maximum) warnings.push(`${name} was shortened to ${maximum} characters; compare it with the original invoice.`);
    return value.slice(0, maximum);
  };
  const lines: InvoiceLine[] = rows.map((row, index) => {
    const fields = row.LineItemExpenseFields ?? [];
    const field = (name: string) => fields.find(candidate => candidate.Type?.Text === name);
    const notes: string[] = [];
    const itemField = field('ITEM') ?? field('EXPENSE_ROW');
    const description = text(itemField);
    if (!description) notes.push('Item description was not recognized.');
    if (!field('ITEM') && description) notes.push('Description uses the entire detected row; edit it to the item name.');
    if (description.length > 300) notes.push('Description was shortened; compare with the source invoice.');
    const quantityFields = fields.filter(candidate => candidate.Type?.Text === 'QUANTITY');
    const quantityField = quantityFields[0];
    const quantityCandidate = parseQuantity(text(quantityField));
    const distinctQuantities = new Set(quantityFields.map(candidate => parseQuantity(text(candidate)).quantity));
    const conflictingQuantities = distinctQuantities.size > 1;
    const billedQty = !conflictingQuantities && confident(quantityField) ? quantityCandidate.quantity : null;
    if (conflictingQuantities) notes.push('Conflicting billed quantities were detected; enter the invoice quantity.');
    if (billedQty === null) notes.push(text(quantityField) ? 'Billed quantity is uncertain or ambiguous; enter it from the invoice.' : 'Billed quantity was not recognized.');
    const unitFields = fields.filter(candidate => ['UNIT', 'UNIT_OF_MEASURE', 'UOM'].includes(candidate.Type?.Text ?? '')
      || /^(?:uom|unit|units|unit of measure)$/i.test(candidate.LabelDetection?.Text?.trim() ?? ''));
    const detectedUnits = [...unitFields.filter(confident).map(candidate => normalizeUnit(text(candidate))),
      ...quantityFields.filter(confident).map(candidate => parseQuantity(text(candidate)).unit)].filter(unit => unit !== 'unknown');
    const distinctUnits = new Set(detectedUnits);
    const conflictingUnits = distinctUnits.size > 1;
    const unsupportedUnit = unitFields.some(candidate => confident(candidate) && text(candidate) && normalizeUnit(text(candidate)) === 'unknown')
      || quantityFields.some(candidate => confident(candidate) && /[A-Za-z]/.test(text(candidate)) && parseQuantity(text(candidate)).unit === 'unknown');
    const billedUnit = conflictingUnits || unsupportedUnit ? 'unknown' : detectedUnits[0] ?? 'unknown';
    if (billedUnit === 'unknown') notes.push(conflictingUnits ? 'Conflicting billed units were detected; choose the correct unit.' : unsupportedUnit ? 'An unsupported billed unit was detected. This workflow supports packaged counts, not weighed goods.' : 'Billed unit was not recognized; choose piece, pack, or carton from the invoice.');
    const priceFields = fields.filter(candidate => candidate.Type?.Text === 'UNIT_PRICE');
    const priceField = priceFields[0];
    const conflictingPrices = new Set(priceFields.map(candidate => parsePriceMinor(text(candidate)))).size > 1;
    const unitPriceMinor = !conflictingPrices && confident(priceField) ? parsePriceMinor(text(priceField)) : null;
    if (conflictingPrices) notes.push('Conflicting unit prices were detected; enter the price per billed unit.');
    if (unitPriceMinor === null) notes.push(text(priceField) ? 'Unit price is uncertain or ambiguous; enter the INR price per billed unit.' : 'Unit price was not recognized; a line total is not a unit price.');
    if (itemField?.ValueDetection?.Confidence !== undefined && !confident(itemField)) notes.push('Description has low OCR confidence.');
    if (notes.length) warnings.push(`Row ${index + 1}: ${notes.join(' ')}`);
    const source = sourceBox(itemField);
    return {
      id: randomUUID(), description: description.slice(0, 300), sku: text(field('PRODUCT_CODE')).slice(0, 100),
      billedQty, billedUnit, packSize: null, receivedQty: null, damagedQty: 0, wrongQty: 0,
      // Receiving notes belong to the person recording the delivery. Machine
      // warnings stay in ExtractionResult.warnings, never in a supplier-facing
      // observation that could become stale after the suggestion is corrected.
      unitPriceMinor, confirmed: false, note: '', ...(source ? { source } : {}),
    };
  });
  if (!lines.length) warnings.push('No item rows were recognized. Add the lines manually; an empty extraction does not mean the invoice has no items.');
  const rawDate = summary('INVOICE_RECEIPT_DATE', 40);
  const invoiceDate = parseInvoiceDate(rawDate);
  if (rawDate && !invoiceDate) warnings.push('Invoice date could not be interpreted unambiguously. Enter it from the source invoice.');
  return { lines, supplier: summary('VENDOR_NAME', 200), invoiceNumber: summary('INVOICE_RECEIPT_ID', 100), invoiceDate, provider: 'textract', warnings };
}
