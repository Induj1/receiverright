import { describe, expect, it } from 'vitest';
import type { AnalyzeExpenseResponse, ExpenseField, LineItemFields } from '@aws-sdk/client-textract';
import { ExtractionProblem, parseExpenseResult, parseInvoiceDate, parsePriceMinor, parseQuantity } from '../server/extraction';
import { reconcileLine, validateCaseInput } from '../shared/domain';

// Fabricated provider responses exercise the parser. They are NOT an OCR accuracy benchmark.
const field = (type: string, value: string, confidence = 99): ExpenseField => ({ Type: { Text: type }, ValueDetection: { Text: value, Confidence: confidence } });
const row = (...fields: ExpenseField[]): LineItemFields => ({ LineItemExpenseFields: fields });
const invoice = (...rows: LineItemFields[]): AnalyzeExpenseResponse => ({ ExpenseDocuments: [{ LineItemGroups: [{ LineItems: rows }] }] });
const item = (...extra: ExpenseField[]) => row(field('ITEM', 'Clear Spring water 1 L'), ...extra);

describe('conservative invoice field parsing', () => {
  it.each([
    ['12', 12, 'unknown'], ['0', 0, 'unknown'], ['12 pcs', 12, 'piece'], ['12pcs', 12, 'piece'], ['2 cartons', 2, 'carton'],
    ['1,000 bottles', 1000, 'bottle'], ['1,00,000', 100000, 'unknown'], ['12 kg', 12, 'unknown'], ['12.00 pcs', 12, 'piece'],
    ['12x500', null, 'unknown'], ['12 × 500 ml', null, 'unknown'], ['1.5', null, 'unknown'],
    ['1,5', null, 'unknown'], ['-1', null, 'unknown'], ['1e3', null, 'unknown'], ['', null, 'unknown'],
    ['12 bottles / carton', null, 'unknown'], ['1000001', null, 'unknown'],
  ])('parses quantity %j without inventing a unit or combining numbers', (value, quantity, unit) => {
    expect(parseQuantity(value as string)).toEqual({ quantity, unit });
  });

  it.each([
    ['0', 0], ['0.10', 10], ['Rs. 1,234.50', 123450], ['₹1,23,456.75', 12345675], ['INR 12.5', 1250],
    ['1,5', null], ['12,34', null], ['1.234,50', null], ['12.345', null], ['USD 15.00', null],
    ['₹12 x 2', null], ['100/12', null], ['-5', null], ['1000000001', null], ['', null],
  ])('parses INR %j exactly to paise', (value, expected) => {
    expect(parsePriceMinor(value as string)).toBe(expected);
  });

  it.each([
    ['2026-09-20', '2026-09-20'], ['20 Sep 2026', '2026-09-20'], ['September 20, 2026', '2026-09-20'],
    ['09/10/2026', ''], ['31 Feb 2026', ''], ['2026-13-01', ''], ['2026-00-01', ''], ['20 Sep 26', ''], ['', ''],
  ])('normalizes unambiguous invoice date %j and rejects ambiguous dates', (value, expected) => {
    expect(parseInvoiceDate(value)).toBe(expected);
  });

  it('preserves missing quantity, price, and unit as unknown draft values', () => {
    const result = parseExpenseResult(invoice(item()));
    expect(result.lines[0]).toMatchObject({ billedQty: null, billedUnit: 'unknown', unitPriceMinor: null, receivedQty: null, confirmed: false });
    expect(validateCaseInput({ lines: result.lines })).toEqual([]);
    expect(reconcileLine(result.lines[0])).toMatchObject({ expectedUnits: null, discrepancyMinor: null, ready: false });
    expect(result.warnings.join(' ')).toContain('Billed quantity was not recognized');
  });

  it('keeps a genuine zero distinct from a missing value', () => {
    const result = parseExpenseResult(invoice(item(field('QUANTITY', '0 pcs'), field('UNIT_PRICE', '0.00'))));
    expect(result.lines[0]).toMatchObject({ billedQty: 0, billedUnit: 'piece', unitPriceMinor: 0, receivedQty: null, confirmed: false });
  });

  it('recognizes an explicit carton unit but never invents its pack size', () => {
    const result = parseExpenseResult(invoice(item(field('QUANTITY', '2 cartons'), field('UNIT_PRICE', 'Rs. 1,200.00'))));
    expect(result.lines[0]).toMatchObject({ billedQty: 2, billedUnit: 'carton', packSize: null, unitPriceMinor: 120000 });
    expect(reconcileLine({ ...result.lines[0], confirmed: true, receivedQty: 20 }).ready).toBe(false);
  });

  it('uses only explicit unit fields and never reads pack size from a product name', () => {
    const unitField = { ...field('OTHER', 'pcs'), LabelDetection: { Text: 'UOM' } };
    const result = parseExpenseResult(invoice(row(field('ITEM', 'Tea 12 x 100 g'), field('QUANTITY', '2'), unitField)));
    expect(result.lines[0]).toMatchObject({ billedQty: 2, billedUnit: 'piece', packSize: null });
    const absentUnit = parseExpenseResult(invoice(row(field('ITEM', 'Tea 12 x 100 g'), field('QUANTITY', '2'))));
    expect(absentUnit.lines[0].billedUnit).toBe('unknown');
  });

  it('does not choose between conflicting units', () => {
    const result = parseExpenseResult(invoice(item(field('QUANTITY', '2 pcs'), field('UNIT_OF_MEASURE', 'cartons'))));
    expect(result.lines[0].billedUnit).toBe('unknown');
    expect(result.warnings.join(' ')).toContain('Conflicting billed units');
  });

  it('does not choose silently between duplicated quantity or price fields', () => {
    const result = parseExpenseResult(invoice(item(field('QUANTITY', '12 pcs'), field('QUANTITY', '10 pcs'), field('UNIT_PRICE', '100'), field('UNIT_PRICE', '90'))));
    expect(result.lines[0]).toMatchObject({ billedQty: null, unitPriceMinor: null });
    expect(result.warnings.join(' ')).toContain('Conflicting billed quantities');
    expect(result.warnings.join(' ')).toContain('Conflicting unit prices');
  });

  it('does not ignore an unsupported explicit unit when another field looks supported', () => {
    const result = parseExpenseResult(invoice(item(field('QUANTITY', '12 pcs'), field('UNIT_OF_MEASURE', 'kg'))));
    expect(result.lines[0].billedUnit).toBe('unknown');
    expect(result.warnings.join(' ')).toContain('weighed goods');
  });

  it('leaves uncertain numeric fields blank and flags their source for review', () => {
    const result = parseExpenseResult(invoice(item(field('QUANTITY', '12 pcs', 65), field('UNIT_PRICE', '100.00', 89))));
    expect(result.lines[0]).toMatchObject({ billedQty: null, billedUnit: 'unknown', unitPriceMinor: null });
    expect(result.warnings.join(' ')).toContain('uncertain or ambiguous');
  });

  it('does not use an extended line total in place of a missing unit price', () => {
    const result = parseExpenseResult(invoice(item(field('QUANTITY', '12 pcs'), field('PRICE', '1,200.00'))));
    expect(result.lines[0].unitPriceMinor).toBeNull();
    expect(result.warnings.join(' ')).toContain('line total is not a unit price');
  });

  it('retains rows that lack descriptions instead of silently losing them', () => {
    const result = parseExpenseResult(invoice(row(field('QUANTITY', '12 pcs')), row()));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].description).toBe('');
    expect(result.warnings.join(' ')).toContain('description was not recognized');
  });

  it('accepts exactly 100 rows and rejects 101 instead of truncating', () => {
    expect(parseExpenseResult(invoice(...Array.from({ length: 100 }, () => item()))).lines).toHaveLength(100);
    expect(() => parseExpenseResult(invoice(...Array.from({ length: 101 }, () => item())))).toThrow(/101 item rows/);
  });

  it('rejects multiple invoices rather than using only the first document', () => {
    const result = invoice(item());
    result.ExpenseDocuments!.push({ LineItemGroups: [{ LineItems: [item()] }] });
    try { parseExpenseResult(result); throw new Error('Expected failure'); }
    catch (error) { expect(error).toBeInstanceOf(ExtractionProblem); expect(error).toMatchObject({ code: 'MULTIPLE_INVOICES' }); }
  });

  it('retains all line groups belonging to one invoice', () => {
    const result = invoice(item());
    result.ExpenseDocuments![0].LineItemGroups!.push({ LineItems: [item()] });
    expect(parseExpenseResult(result).lines).toHaveLength(2);
  });

  it('rejects detected foreign currency without pretending to convert it to INR', () => {
    const price = { ...field('UNIT_PRICE', '10.00'), Currency: { Code: 'USD', Confidence: 99 } };
    expect(() => parseExpenseResult(invoice(item(price)))).toThrow(/INR only/);
  });

  it('does not invent successful extraction for an empty provider response', () => {
    const result = parseExpenseResult({});
    expect(result.lines).toEqual([]);
    expect(result.warnings.join(' ')).toContain('No item rows were recognized');
  });

  it('maps source coordinates to the original page for human inspection', () => {
    const sourceField: ExpenseField = { ...field('ITEM', 'Tea'), PageNumber: 2 };
    sourceField.ValueDetection!.Geometry = { BoundingBox: { Left: 0.1, Top: 0.3, Width: 0.6, Height: 0.04 } };
    expect(parseExpenseResult(invoice(row(sourceField))).lines[0].source).toEqual({ left: 0.1, top: 0.3, width: 0.6, height: 0.04, page: 2, confidence: 99 });
  });
});
