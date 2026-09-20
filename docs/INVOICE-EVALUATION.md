# Live invoice extraction evaluation

On 20 September 2026, five generated invoices were uploaded through the deployed application to private S3 and processed by its Textract endpoint. All five calls completed. This is a small synthetic evaluation, not a customer pilot or a representative accuracy benchmark.

The [ground truth and five PNGs](../public/evaluation/expected.json), [generator](../scripts/generate-evaluation-corpus.py), [evaluation script](../scripts/evaluate-invoices.mjs), and [unfiltered results](evidence/invoice-evaluation.json) make the check inspectable. Running the evaluation creates five synthetic records and makes five paid-provider requests; it does not send messages or contact suppliers.

## What happened

| Generated document | Expected / returned rows | Result |
| --- | --- | --- |
| Clean invoice, separate piece-unit column | 3 / 3 | 12 of 12 compared row fields matched |
| Carton/box quantities written with suffix units | 3 / 3 | 12 of 12 compared row fields matched |
| Deliberately missing quantity and unit cells | 2 / 1 | Textract omitted the milk-powder row; the paper-cups row was returned |
| Indian currency grouping and paise | 2 / 2 | Quantities and prices matched; both units remained unknown for human review |
| Generated low-contrast, rotated, lightly blurred scan | 3 / 3 | 12 of 12 compared row fields matched |

**12 of 13 printed rows were returned.** The missing row is a genuine failure of this observed extraction path. The application cannot recover an omitted row from a result that contains no such candidate; the receiver must compare against the original document and add it. A field-confidence threshold cannot guarantee row completeness.

The evaluator uses printed row order, deliberately without repairing alignment after a missing row. Under that strict method, descriptions, billed quantities, and prices each matched 11/13 expected fields; units matched 10/13. The missing first row shifts the returned paper-cups row in the third fixture and penalizes both row positions. These are exact comparisons for this corpus, not general accuracy percentages.

Extraction endpoint elapsed times were **1.704–2.011 seconds**, measured from this client through response parsing. This includes network and application work, and excludes the separate upload. Five sequential observations are not a latency guarantee or load test. Supplier/invoice identifier matches and warnings are retained in the raw report, including mismatches.

## What the application does with uncertainty

- Missing, ambiguous, conflicting, or low-confidence numeric fields remain blank. Unknown billed units remain explicit and block confirmation-ready calculations.
- Numeric confidence of 90 is a conservative configured threshold, not a measured probability of correctness.
- Receiving counts and pack sizes remained absent in every returned extraction. No line was automatically confirmed.
- Multiple-invoice results, detected unsupported currency, and more than 100 extracted rows are rejected with a clear explanation; no first-invoice selection or silent row truncation is performed. Currency rejection depends on Textract supplying currency metadata; missing metadata cannot establish that the source currency is INR, so the receiver must verify it.
- Review warnings tell the receiver to compare against the original, including checking for whole missing rows. The original document remains available beside editable lines.

The separate parser unit tests use controlled Textract-shaped responses to verify these rules. They do not measure Textract's recognition quality. In the live missing-quantity fixture the entire source row disappeared, so that observation cannot prove preservation of its unknown quantity; the report keeps that failure visible.

## Limits and next evidence

These are five generated English documents using deliberately varied layouts. There are no real shop photographs, crumpled paper, handwriting, multilingual invoices, user correction-time measurements, or supplier adoption results. A [documented user trial](USER-TRIAL.md) is the next evidence needed. Publish its actual results, including failure and assistance, before claiming practical time savings or financial impact.
