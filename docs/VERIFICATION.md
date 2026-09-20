# Verification record

Verified on **20 September 2026**. Software tests, live integrations, targeted browser checks, synthetic OCR evaluation, and customer validation are different evidence. This record keeps them separate.

## Automated software checks

- **102 tests passed:** 27 domain, 58 extraction-parser, 9 API, and 8 workspace/history tests.
- Domain tests cover missing versus zero values, whole-unit counts, unknown units, pack conversion, final-line paise rounding, impossible allocations, excess with defects, and overflow.
- Parser tests use fabricated provider responses. They cover numeric ambiguity, explicit/unknown units, conflicting fields, confidence handling, dates, multiple invoices, foreign currency, missing descriptions, and the 100-row limit. They are not OCR accuracy tests.
- API tests cover the receiver/supplier lifecycle, workspace/evidence scope, stale revisions, PIN lockout, upload handling, provider quotas, and persistence.
- Workspace/history tests cover recovery, renewal, code replacement, recovery attempt limits, legacy baseline migration, transactional saved states, retained supplier responses, and access to historical evidence.
- TypeScript, the production frontend build, and the Lambda bundle passed. The [GitHub Actions workflow](https://github.com/Induj1/receiverright/actions) runs install, tests, both builds, and production dependency audit on pushes.

Reproduce locally with `npm ci`, `npm test`, `npm run build`, and `npm run build:lambda`. Local tests use local storage and controlled provider doubles; live AWS checks are separate below.

## Live AWS workflow

[Deployed endpoint](https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com). The extended smoke run started at **12:58 UTC** on 20 September 2026 and passed with DynamoDB storage, Textract extraction, and template summaries.

It verified:

1. A saved recovery code restores the same workspace; renewal preserves access.
2. An isolated synthetic record, confirmed invoice lines, and the 12-unit carton conversion.
3. A separate supplier PIN, acknowledgement of both affected lines, and receiver closure.
4. Historical quantities and supplier acknowledgements remain available after a later edit.
5. JSON and CSV exports contain **28,000 paise / INR 280** of calculated item value.
6. A private S3 upload and authorized, byte-for-byte download of the **246,251-byte** synthetic invoice PNG.
7. Historical evidence remains privately downloadable after a later edit, using its checked object version.
8. A real Textract request returns three lines from the original synthetic fixture, with warnings and supplier/invoice-number fields.
9. A deterministic template summary.

The sanitized [machine-readable run](deployed-smoke.json) contains 37 requests. The 35 core requests had client-observed p50 **97.9 ms**, p95 **391.8 ms**, and maximum **2,697.2 ms**. These are observations from one sequential functional run, including client/network overhead, not a load test, latency guarantee, or SLA. No authentication tokens or private customer documents are included.

## Five-image live extraction evaluation

Five generated invoice PNGs were uploaded through the deployed application and processed by real Textract. All five API calls completed. Source images, expected fields, matching rules, request times, failures, and limitations are public in the [evaluation report](INVOICE-EVALUATION.md) and [raw results](evidence/invoice-evaluation.json).

| Scored field | Matches under the declared printed-row-order comparison |
| --- | ---: |
| Item description | 11 / 13 |
| Billed quantity | 11 / 13 |
| Billed unit | 10 / 13 |
| Unit price in paise | 11 / 13 |

The provider returned **12 of 13 printed rows**. The clean piece, mixed carton, and simulated-scan fixtures matched all four fields on each returned row. The incomplete fixture omitted the blank-quantity milk-powder row entirely; the remaining row then shifts under the strict ordering comparison. That is a missing-row failure, not evidence that the parser replaced an unknown quantity with a number. Two billed units in the Indian-price fixture remained unknown. Invoice identifiers also needed review.

Extraction request times were **1.704-2.011 seconds** from this client. Physical receiving counts stayed unfilled and all suggestions remained unconfirmed. The extraction dialog now warns explicitly that entire rows may be omitted and must be compared with the original invoice.

This tiny generated set does not establish accuracy for real invoices, handwriting, other languages, photographs, crumpled paper, or other vendors. No customer document or real receiving observation was used.

## Browser workflow and visual checks

The deployed browser workflow was previously exercised with synthetic records:

1. An unresolved carton conversion blocked sharing. Confirming 12 units per carton and all three lines allowed saving and sharing.
2. A separate supplier tab unlocked the review, acknowledged both affected lines, and submitted a response. The receiver refreshed and closed the record; closed controls were read-only.
3. A new record uploaded the synthetic PNG, displayed its private preview, performed real Textract extraction, and applied suggestions. Physical receiving counts remained unfilled.
4. Desktop screens were inspected at 1280 x 720. A 390-pixel mobile frame showed no horizontal overflow in the inspected overview.
5. A local unsaved-changes check preserved the draft after navigation was cancelled.

The [overview](screenshots/overview.png), [extraction dialog](screenshots/textract.png), and [supplier review](screenshots/supplier.png) show the deployed interface captured during those checks. The new recovery/history changes have passed local automated tests and live API verification; their additional browser walkthrough is being finalized. Do not interpret targeted checks as a formal accessibility audit or broad device certification.

## Claims this evidence does not support

- No completed real-shop/supplier trial, measured time saving, financial recovery, or adoption result. The [user trial protocol](USER-TRIAL.md) remains a protocol until observations are collected.
- No independently verified supplier identity or legally certified immutable archive.
- No working Bedrock inference or deployed CloudFront distribution; the app uses template summaries and API Gateway/Lambda hosting.
- No complete AWS bill or spending cap. The [cost model](OPERATING-COST.md) is a core-service subtotal under explicit workload assumptions and exclusions.
- No completed contribution assigned to a teammate without evidence. The [team learning worksheet](TEAM-LEARNING.md) records actual individual work when supplied.
