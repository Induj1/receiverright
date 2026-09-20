import { describe, expect, it } from 'vitest';
import { reconcileCase, reconcileLine, validateCaseInput } from '../shared/domain';
import { makeBlankLine, makeSampleCase } from '../shared/fixtures';

const line = (changes: Parameters<typeof makeBlankLine>[0] = {}) => makeBlankLine({ description: 'Water bottle', billedQty: 12, receivedQty: 10, unitPriceMinor: 10000, confirmed: true, ...changes });

describe('receiving reconciliation', () => {
  it('records a physical shortage without counting missing units as damaged a second time', () => {
    const result = reconcileLine(line({ damagedQty: 2, wrongQty: 1 }));
    expect(result).toMatchObject({ expectedUnits: 12, acceptedUnits: 7, shortage: 2, damaged: 2, wrong: 1, discrepancyUnits: 5, discrepancyMinor: 50000, ready: true });
  });

  it('requires pack confirmation before converting a carton invoice into piece counts or money', () => {
    const unresolved = line({ billedUnit: 'carton', billedQty: 1, receivedQty: 10, packSize: null, unitPriceMinor: 120000 });
    expect(reconcileLine(unresolved)).toMatchObject({ expectedUnits: null, discrepancyMinor: null, ready: false });
    expect(reconcileLine({ ...unresolved, packSize: 12 })).toMatchObject({ expectedUnits: 12, shortage: 2, discrepancyMinor: 20000, ready: true });
  });

  it('rounds only the final line value, including exact half-paise values', () => {
    expect(reconcileLine(line({ billedUnit: 'pack', billedQty: 1, receivedQty: 0, packSize: 3, unitPriceMinor: 100 }))).toMatchObject({ discrepancyUnits: 3, discrepancyMinor: 100 });
    expect(reconcileLine(line({ billedUnit: 'pack', billedQty: 1, receivedQty: 1, packSize: 2, unitPriceMinor: 101 }))).toMatchObject({ discrepancyMinor: 51 });
  });

  it('accepts a zero price and a genuinely zero received count', () => {
    expect(reconcileLine(line({ receivedQty: 0, unitPriceMinor: 0 }))).toMatchObject({ shortage: 12, discrepancyMinor: 0, ready: true });
  });

  it('keeps a missing observation distinct from an observation of zero', () => {
    expect(reconcileLine(line({ receivedQty: null }))).toMatchObject({ acceptedUnits: null, discrepancyMinor: null, ready: false });
    expect(reconcileLine(line({ receivedQty: 0 }))).toMatchObject({ shortage: 12, discrepancyMinor: 120000, ready: true });
  });

  it('rejects overlapping damage/wrong allocations larger than the physical delivery', () => {
    const result = reconcileLine(line({ receivedQty: 2, damagedQty: 2, wrongQty: 1 }));
    expect(result.ready).toBe(false);
    expect(result.acceptedUnits).toBeNull();
    expect(result.discrepancyMinor).toBeNull();
  });

  it('tracks harmless overdelivery separately and refuses to price ambiguous rejected surplus', () => {
    expect(reconcileLine(line({ receivedQty: 14 }))).toMatchObject({ excess: 2, discrepancyUnits: 0, discrepancyMinor: 0, ready: true });
    expect(reconcileLine(line({ receivedQty: 14, damagedQty: 2 }))).toMatchObject({ excess: 2, acceptedUnits: 12, discrepancyMinor: null, ready: false });
  });

  it.each([NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('blocks malformed physical counts (%s)', bad => {
    expect(reconcileLine(line({ receivedQty: bad })).ready).toBe(false);
    expect(reconcileLine(line({ billedQty: bad })).ready).toBe(false);
    expect(validateCaseInput({ lines: [line({ damagedQty: bad })] }).length).toBeGreaterThan(0);
  });

  it.each([NaN, Infinity, -1, 10.5])('rejects invalid paise (%s)', bad => {
    const result = reconcileLine(line({ unitPriceMinor: bad }));
    expect(result.ready).toBe(false);
    expect(result.discrepancyMinor).toBeNull();
  });

  it('refuses unsafe monetary totals instead of returning a silently rounded large claim', () => {
    const result = reconcileLine(line({ billedQty: 2, receivedQty: 0, unitPriceMinor: Number.MAX_SAFE_INTEGER }));
    expect(result.ready).toBe(false);
    expect(result.discrepancyMinor).toBeNull();
  });

  it('does not silently interpret an unknown unit as a carton with a stale pack value', () => {
    expect(reconcileLine(line({ billedUnit: 'unit', packSize: 12 })).ready).toBe(false);
    expect(reconcileLine(line({ billedUnit: 'kg' })).ready).toBe(false);
  });

  it('allows a missing billed quantity in a draft without pricing it as zero', () => {
    const draft = line({ billedQty: null });
    expect(validateCaseInput({ lines: [draft] })).toEqual([]);
    expect(reconcileLine(draft)).toMatchObject({ expectedUnits: null, discrepancyMinor: null, ready: false });
    expect(reconcileLine(draft).issues.join(' ')).toContain('billed quantity');
  });

  it('does not calculate an amount from a missing unit even when a quantity and price exist', () => {
    expect(reconcileLine(line({ billedUnit: 'unknown' }))).toMatchObject({ expectedUnits: null, discrepancyMinor: null, ready: false });
  });

  it('enforces the same 100-line maximum as the API and extraction parser', () => {
    expect(validateCaseInput({ lines: Array.from({ length: 100 }, () => line()) })).toEqual([]);
    expect(validateCaseInput({ lines: Array.from({ length: 101 }, () => line()) }).join(' ')).toContain('100 invoice lines');
  });
});

describe('case workflow', () => {
  it('provides a synthetic fixture with an honest unresolved state and correct final total', () => {
    const record = makeSampleCase();
    const before = reconcileCase(record);
    expect(record.isDemo).toBe(true);
    expect(record.extractionProvider).toBe('sample');
    expect(before).toMatchObject({ ready: false, totalDiscrepancyMinor: 28000 });
    record.lines = record.lines.map(item => ({ ...item, confirmed: true, packSize: item.billedUnit === 'carton' ? 12 : 1 }));
    expect(reconcileCase(record)).toMatchObject({ ready: true, totalDiscrepancyMinor: 28000, totalDiscrepancyUnits: 4, hasUnpricedDiscrepancies: false });
  });

  it('does not mutate the record while calculating', () => {
    const record = makeSampleCase();
    const snapshot = structuredClone(record);
    reconcileCase(record);
    expect(record).toEqual(snapshot);
  });

  it('blocks empty or duplicated lines and unconfirmed invoice data', () => {
    const record = makeSampleCase();
    expect(reconcileCase({ ...record, lines: [] }).ready).toBe(false);
    const item = line();
    expect(reconcileCase({ ...record, lines: [item, { ...item }] }).ready).toBe(false);
    expect(reconcileCase({ ...record, lines: [line({ confirmed: false })] }).ready).toBe(false);
  });

  it('distinguishes unknown price from a known zero-value discrepancy', () => {
    const record = makeSampleCase();
    expect(reconcileCase({ ...record, lines: [line({ unitPriceMinor: null })] })).toMatchObject({ hasUnpricedDiscrepancies: true, ready: false });
    expect(reconcileCase({ ...record, lines: [line({ unitPriceMinor: 0 })] })).toMatchObject({ hasUnpricedDiscrepancies: false, ready: true, totalDiscrepancyMinor: 0 });
  });

  it('allows incomplete drafts but rejects malformed or duplicate request data', () => {
    expect(validateCaseInput({ supplier: '', lines: [makeBlankLine()] })).toEqual([]);
    expect(validateCaseInput({ lines: [null] }).length).toBeGreaterThan(0);
    expect(validateCaseInput({ lines: 'not an array' }).length).toBeGreaterThan(0);
    const item = line();
    expect(validateCaseInput({ lines: [item, item] }).join(' ')).toContain('duplicates');
    expect(validateCaseInput({ supplier: 4 }).length).toBeGreaterThan(0);
    expect(validateCaseInput(null).length).toBeGreaterThan(0);
  });
});
