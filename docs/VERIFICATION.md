# Verification record

Verified on **20 September 2026**. This record distinguishes automated software checks and live integration checks from browser visual QA and customer validation.

## Automated checks

- **33 tests passed:** 24 domain tests and 9 API tests.
- Domain coverage includes whole-unit counts, missing versus zero observations, pack conversion, paise rounding, impossible allocations, excess with defects, and monetary overflow.
- API coverage includes receiver/supplier lifecycle, workspace and evidence scope, stale revisions, upload handling, PIN lockout, provider-call budgets and persistence.
- The production frontend and Lambda bundle built successfully. [GitHub Actions](https://github.com/Induj1/receiverright/actions/runs/35510711786) passed for application commit `e1e4fd1`.

## Live AWS smoke test

Endpoint: https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com

The deployed API smoke test passed with DynamoDB storage, Textract extraction, and template summaries. It verified:

1. An isolated receiver workspace and synthetic sample record.
2. Confirmation of all lines and the 12-unit carton conversion.
3. Supplier access with a separate PIN, acknowledgement of both affected lines, and receiver closure.
4. JSON and CSV exports reflecting **28,000 paise / INR 280** of calculated item value.
5. A private S3 upload and authorized download of the same **246,251-byte** synthetic invoice PNG, byte for byte. Attached evidence refers to a checked object version.
6. A real Textract request through the deployed Lambda API returning **three line items**, supplier and invoice-number fields, and one review warning.
7. A deterministic template summary. Bedrock model authorization remains unavailable; successful Bedrock inference is not claimed.

The sanitized [machine-readable test output](deployed-smoke.json) is included in the repository. No authentication tokens or private customer documents are included in this report.

## Browser workflow and visual checks

The live deployment was exercised through the browser with synthetic records:

1. An unresolved carton conversion blocked sharing. Confirming 12 units per carton and all three lines allowed the record to be saved and shared.
2. A separate supplier tab unlocked the review with its PIN, acknowledged both affected lines, and submitted the response. The receiver refreshed, saw those responses, and closed the record. Closed controls were read-only and activity entries displayed item descriptions.
3. A new record uploaded the synthetic invoice PNG to S3, displayed its private preview, requested real Textract extraction, and applied three reviewed suggestions. Physical receiving counts remained unfilled after extraction.
4. Desktop screens were inspected at a 1280 × 720 viewport. A 390-pixel mobile frame had equal content and scroll widths (375 pixels after its scrollbar), with no horizontal overflow in the inspected overview.
5. In local browser QA, changing a count and navigating through Overview opened the unsaved-changes dialog. Choosing Keep editing preserved the draft.

The captured [overview](screenshots/overview.png), [extraction dialog](screenshots/textract.png), and [supplier review](screenshots/supplier.png) show the actual deployed interface. Browser checks are targeted functional and visual checks, not an exhaustive accessibility audit or broad device-compatibility certification.

## Interpretation and remaining work

- The invoice and receiving observations are synthetic. The test verifies this fixture and integration, not general OCR accuracy, financial recovery, or real-shop impact.
- The prefilled sample fixture and a separately uploaded PNG extraction are different paths. The sample does not pretend to be a fresh model result.
- The browser checks above passed. No formal accessibility audit or real-device usability study has been completed.
- No real customer pilot has been completed. No measured savings, user-adoption result, or competition outcome is claimed.
- CloudFront was not used in the final deployment. Initial account restrictions shaped the API Gateway/Lambda hosting decision. Textract access succeeded after the account upgrade; optional Bedrock remains disabled.
