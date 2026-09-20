# First Commit submission draft

This file maps to the event's submission form. **TODO / MOCK fields are placeholders, not real identities, links, contributions, or completed publishing.** Replace them before submission. The user authorized keeping the other teammates' details mocked for now. This file does not submit the form.

## Team details

| Form field | Team leader | Second member | Third member | Fourth member |
| --- | --- | --- | --- | --- |
| Name for internal reference | **Induj Gupta** | **MOCK_MEMBER_2 — replace** | **MOCK_MEMBER_3 — replace** | **MOCK_MEMBER_4 — replace** |
| WeMakeDevs username | **TODO: copy Induj's actual username from wemakedevs.org/home** | TODO: actual username | TODO: actual username | TODO: actual username |
| GitHub | https://github.com/Induj1 | TODO: actual GitHub URL | TODO: actual GitHub URL | TODO: actual GitHub URL |
| LinkedIn | https://linkedin.com/in/induj-gupta-35382752 | TODO: actual LinkedIn URL | TODO: actual LinkedIn URL | TODO: actual LinkedIn URL |
| Public resume | TODO: actual publicly accessible resume URL | TODO: actual publicly accessible resume URL | TODO: actual publicly accessible resume URL | TODO: actual publicly accessible resume URL |

Resume URLs are needed for consideration for Amazon Fast Track Interviews. Do not publish a fabricated resume or a placeholder URL.

## Project title

**ReceiveRight — Every delivery accounted for**

## Track

**Ship it** — when the AWS deployment has been verified. The implemented architecture uses AWS cloud services. Do not claim a separate AWS open-source track integration that was not built.

## GitHub link to project

https://github.com/Induj1/receiverright

## Deployed link to project

https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com

The AWS stack is provisioned; final receiver/supplier smoke verification is in progress. Current runtime uses manual invoice entry and deterministic template summaries because Textract and Bedrock access remain blocked.

## YouTube video demo link

**TODO: public or unlisted YouTube video URL.** The video must be at most three minutes. A 2:45 script is included in [DEMO-SCRIPT.md](DEMO-SCRIPT.md).

## What does your project do?

ReceiveRight helps small shops document delivery shortages, damaged items, and wrong items while goods are being received. Instead of leaving the invoice, counts, photographs, and supplier replies scattered across paper and messages, it keeps them together in one receiving record.

The receiver uploads an invoice or enters its items, checks any extracted suggestions against the source, and confirms the physical counts. Pack/carton conversions must be resolved before sharing. Deterministic code calculates item-value discrepancies without double-counting damaged or wrong units as missing. The supplier opens a PIN-protected link to inspect the same revision and acknowledge or dispute each affected line. The receiver can then export the record or close it once all discrepancy lines are acknowledged.

Our synthetic demonstration shows a ₹200 shortage and ₹80 of damaged items, with an ambiguous carton conversion deliberately blocked until confirmed. The app does not claim that photographs prove hidden quantities, or that acknowledgement means money was recovered. It currently supports whole packaged units and excludes tax, discounts, and payment settlement. Real-shop impact has not yet been validated.

## How did you use AWS in your project?

**Use this answer after verifying the deployed services; remove any service that is not actually deployed or exercised.**

Amazon API Gateway HTTP API provides the public HTTPS entry point, and AWS Lambda serves the React application and TypeScript/Express API. Amazon DynamoDB stores receiving cases, workspace sessions, supplier links, and responses. Conditional writes preserve revision consistency and reject stale concurrent updates.

A separate private, versioned Amazon S3 bucket stores invoice and delivery evidence. Uploads use short-lived signed URLs, and attached evidence is tied to a checked S3 object version. We implemented an Amazon Textract AnalyzeExpense adapter for editable invoice suggestions and source locations, but an actual service call returned `SubscriptionRequiredException`. The current deployment disables extraction and supports manual invoice entry; we do not claim a successful live Textract result. The application calculates money in integer paise and requires explicit confirmation of pack conversions and counts.

An optional Amazon Bedrock Converse adapter can draft neutral case-summary wording from the computed record. The current deployment leaves Bedrock disabled because account access was unavailable, and explicitly uses a deterministic template. CloudFront was attempted but not used after an account-verification restriction; API Gateway/Lambda provides the working hosting alternative. The interface identifies the configured providers. All included demonstration data is labeled synthetic, and the sample is not presented as a Textract result.

## Blog links

| Author | AWS Builder Center blog link |
| --- | --- |
| Induj Gupta | TODO: actual published Builder Center article URL, or leave blank |
| Second member | TODO: actual published article URL, or leave blank |
| Third member | TODO: actual published article URL, or leave blank |
| Fourth member | TODO: actual published article URL, or leave blank |

## Team leader's contributions

**Factual draft:** Induj Gupta selected the problem direction, set the delivery-reconciliation scope, and directed the AI-assisted project implementation and submission preparation. OpenAI Codex substantially assisted with the frontend, backend, reconciliation logic, automated tests, documentation, and code review. Add Induj's personally completed testing, deployment, field-validation, presentation, or coding work after it has actually been done.

Do not replace this with a claim that Induj manually wrote every part of the implementation. Record human review and verification work specifically.

## Second team member's contributions

**MOCK / TODO:** No individual deliverables have been confirmed. Replace with this teammate's actual completed work; otherwise leave the optional field blank.

## Third team member's contributions

**MOCK / TODO:** No individual deliverables have been confirmed. Replace with this teammate's actual completed work; otherwise leave the optional field blank.

## Fourth team member's contributions

**MOCK / TODO:** No individual deliverables have been confirmed. Replace with this teammate's actual completed work; otherwise leave the optional field blank.

## Help us evaluate you: your feedback on the AWS services you used

**Draft based on implementation work; revise with any additional observed deployment experience.**

Our deployment encountered an account-verification restriction when creating CloudFront infrastructure. Bedrock account verification was pending, and an actual Textract call returned `SubscriptionRequiredException`. Clearer account-readiness and service-activation checks before a builder starts deployment would help, especially during a time-limited event. We adapted by serving the app through API Gateway/Lambda, retaining manual invoice entry and deterministic summaries. We are not claiming successful live CloudFront, Bedrock, or Textract usage.

Preserving the exact evidence a supplier reviewed also required care. With S3, we combined browser CORS, signed upload requests, file-size/type checks, object versioning, and version-specific downloads. A single end-to-end example covering that complete browser-to-review workflow would make the integration easier.

DynamoDB conditional writes are useful, but business revision numbers and storage concurrency versions solve different problems. Our receiving record can change its review status without changing its invoice-content revision, so we keep those concepts separate. More examples showing revision-bound review links and conditional updates together would help application builders.

Textract supplies suggested invoice fields, but the application still needs a review interface for missing quantities, ambiguous units, and pack sizes. We would value more packaged-goods invoice examples explaining how to present uncertainty and unit conversions to the person reviewing extraction.

## What did you like about the AWS services you used?

**Use after deployment verification; keep the answer aligned with services actually exercised.**

DynamoDB's conditional writes give the API a clear way to reject stale changes instead of silently overwriting another saved record. S3 version IDs let us preserve the exact evidence snapshot attached to a receiving revision, while signed URLs keep the evidence bucket private. Textract's documented invoice-oriented response and source geometry informed our side-by-side review adapter, although account activation prevented us from verifying extraction live.

Lambda and API Gateway fit this application's short request/response workflow and let us serve both the mobile interface and API from one HTTPS entry point when our original CloudFront plan was blocked. We also liked being able to keep AI optional: the evidence workflow and deterministic calculations remain usable when extraction or generated summaries are unavailable.

## AI-assistance disclosure

This project used substantial OpenAI Codex assistance for implementation, tests, interface work, documentation, and review. The application also contains an optional Amazon Bedrock summary feature. Coding assistance and runtime AI are separate and are disclosed separately. The team must review the generated work and describe only verification and contributions that actually occurred.

## Final checks before copying into the event form

- Replace all missing team identities and public resume URLs; remove mock labels from any submitted field.
- Add the actual public GitHub, verified deployment, and public/unlisted YouTube links.
- Verify the video duration and show real AWS execution rather than attributing the synthetic sample to AWS.
- Match the AWS answer to the services that were actually deployed and exercised. Delete the optional Bedrock use claim if it was never enabled.
- Update contribution statements with completed human work. Keep AI-assistance disclosure.
- Leave optional blog/resume/member fields blank when no real link or contribution is available; do not submit placeholder URLs.
- Do not add customer adoption, accuracy, savings, or award guarantees without evidence.
