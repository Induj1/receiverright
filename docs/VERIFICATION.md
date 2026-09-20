# Verification record

Verified on **20 September 2026**. This record distinguishes automated software checks and live integration checks from browser visual QA and customer validation.

## Automated checks

- **33 tests passed:** 24 domain tests and 9 API tests.
- Domain coverage includes whole-unit counts, missing versus zero observations, pack conversion, paise rounding, impossible allocations, excess with defects, and monetary overflow.
- API coverage includes receiver/supplier lifecycle, workspace and evidence scope, stale revisions, upload handling, PIN lockout, provider-call budgets and persistence.

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

The machine-readable test output is stored locally as `.artifacts/deployed-smoke.json`, outside the public source tree. No authentication tokens or private customer documents are included in this report.

## Interpretation and remaining work

- The invoice and receiving observations are synthetic. The test verifies this fixture and integration, not general OCR accuracy, financial recovery, or real-shop impact.
- The prefilled sample fixture and a separately uploaded PNG extraction are different paths. The sample does not pretend to be a fresh model result.
- Visual browser QA is tracked separately and was still in progress when this record was written. Automated/live API success does not establish visual or accessibility quality.
- No real customer pilot has been completed. No measured savings, user-adoption result, or competition outcome is claimed.
- CloudFront was not used in the final deployment. Initial account restrictions shaped the API Gateway/Lambda hosting decision. Textract access succeeded after the account upgrade; optional Bedrock remains disabled.
