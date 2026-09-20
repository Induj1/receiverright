# First Commit submission draft

This file maps to the event's submission form. **TODO fields must be completed or left blank where optional before submission.** Team roster supplied by Induj: **Bro code**, four members. The supplied roster lists Harshita Nagesh as leader; the final leader selection awaits confirmation. This file does not submit the form.

## Team details

| Form field | Team leader | Second member | Third member | Fourth member |
| --- | --- | --- | --- | --- |
| Name for internal reference | **Harshita Nagesh** | **Rayyan Shaikh** | **Induj Gupta** | **Laavanya Gupta** |
| WeMakeDevs username | hashh | theclazer | **indujgupta** (confirmed by Induj) | laavanya_gupta |
| GitHub | **TODO: Harshita's GitHub URL — required leader field** | TODO: actual GitHub URL | https://github.com/Induj1 | TODO: actual GitHub URL |
| LinkedIn | **TODO: Harshita's LinkedIn URL — required leader field** | TODO: actual LinkedIn URL | https://linkedin.com/in/induj-gupta-35382752 | TODO: actual LinkedIn URL |
| Public resume | TODO: actual publicly accessible resume URL | TODO: actual publicly accessible resume URL | [Induj's resume](https://drive.google.com/file/d/1cpC_WRSW6VHzSTqkjatfut-t2u2n2jg8/view?usp=sharing) | TODO: actual publicly accessible resume URL |

Resume URLs are needed for consideration for Amazon Fast Track Interviews. Do not publish a fabricated resume or a placeholder URL.

Induj's resume opened successfully in the signed-out Google Drive viewer on 20 September 2026. The roster showed `@induj`, but Induj explicitly confirmed `indujgupta` as the actual WeMakeDevs username. Other usernames are transcribed from the supplied roster. Profile links must belong to the person in that column; Induj's profiles must not be submitted as Harshita's.

## Project title

**ReceiveRight — One delivery. One shared record.**

## Track

**Ship it** — the AWS deployment has been verified. The implemented architecture uses AWS cloud services. No separate AWS open-source track integration is claimed.

## GitHub link to project

https://github.com/Induj1/receiverright

## Deployed link to project

https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com

The deployed receiver/supplier lifecycle, private S3 evidence and real Textract extraction passed the live API smoke test. Summaries use deterministic templates; the optional Bedrock adapter remains disabled because model authorization is unavailable.

## YouTube video demo link

**TODO: public or unlisted YouTube video URL.** The finished local video is `output/video/ReceiveRight-Demo.mp4` (2:45.08, 1080p), with captions in `ReceiveRight-Demo.srt`. It is a narrated walkthrough of actual application screenshots, labeled synthetic demo. It has not been uploaded. [Ready-to-paste title and description](VIDEO-PUBLISHING.md) and a [live recording script](DEMO-SCRIPT.md) are included.

## What does your project do?

ReceiveRight gives small shops and their suppliers one shared record of a delivery discrepancy: what was billed, what physically arrived, what evidence was attached, and what each side acknowledged. It replaces the need to reconstruct that context from an invoice, loose photographs, and separate messages.

The receiver uploads an invoice, reviews editable Textract suggestions, and counts the delivery. Unknown quantities and units remain unresolved; pack sizes require human confirmation. Deterministic code calculates item-value discrepancies without double-counting damage as shortage. A supplier opens a PIN-protected review and acknowledges or disputes each affected line against that saved revision. Later edits invalidate the invitation, while saved versions retain earlier quantities, evidence references, and responses. Closure requires every affected line to be acknowledged. A saved recovery code restores workspace access after changing devices.

The recorded synthetic example reconciles a ₹200 shortage and ₹80 of damage. We verified 103 software tests and the deployed receiver/supplier workflow. In a separate five-image synthetic evaluation, real Textract returned 12 of 13 printed rows; that omission led to an explicit source-comparison warning. This is not a real-shop accuracy or impact claim. The current scope is whole packaged units, item value excluding tax/discounts, and recorded agreement—not payment settlement or verified supplier identity.

## How did you use AWS in your project?

For Ship it, Amazon API Gateway HTTP API provides the public HTTPS entry point and AWS Lambda serves the React/TypeScript interface and Express API. Amazon DynamoDB stores cases, sessions, recovery-code hashes, supplier links, and responses. Conditional writes reject stale changes; transactions save the current record and its historical snapshot together. We separate the invoice-content revision from storage concurrency so supplier responses stay bound to the content actually reviewed.

A private, versioned Amazon S3 bucket stores invoice and delivery evidence. Short-lived signed URLs and checked object versions preserve access to the evidence attached to an earlier saved state. Amazon Textract AnalyzeExpense suggests invoice fields and source locations; it does not infer physical counts or pack sizes. We exercised five synthetic invoices through the deployed integration and published its missing-row and unknown-unit failures. Money calculations use integer paise and require confirmed receiving details.

The deployed provider indicators show DynamoDB, Textract, and deterministic template summaries. Bedrock is an optional adapter in the source, but remains disabled; it is not counted as an exercised service. CloudFront is not deployed. A reproducible Mumbai pricing model estimates a $10.35 core-service subtotal for 1,000 one-page invoices under stated workload assumptions, excluding logs, transfer, S3 requests, and other costs. No AWS open-source track integration is claimed.

## Blog links

| Author | AWS Builder Center blog link |
| --- | --- |
| Harshita Nagesh | Leave blank unless actually published |
| Rayyan Shaikh | Leave blank unless actually published |
| Induj Gupta | TODO: actual published Builder Center article URL, or leave blank |
| Laavanya Gupta | Leave blank unless actually published |

## Team leader's contributions

**Harshita Nagesh — TODO:** Confirm her actual completed contribution. The roster identifies her as leader; that alone does not establish coding, testing, or field-validation work.

## Second team member's contributions

**Rayyan Shaikh — TODO:** No individual deliverables have been confirmed. Add actual completed work; otherwise leave the optional field blank.

## Third team member's contributions

**Induj Gupta:** Selected the problem direction, set the delivery-reconciliation scope, directed the AI-assisted implementation and submission preparation, completed AWS account sign-in and setup, and supplied team/profile details. OpenAI Codex substantially assisted with implementation, tests, deployment, browser verification, documentation, and review. Add further personally completed testing, field-validation, presentation, or coding work only after it occurs.

## Fourth team member's contributions

**Laavanya Gupta — TODO:** No individual deliverables have been confirmed. Add actual completed work; otherwise leave the optional field blank.

## Help us evaluate you: your feedback on the AWS services you used

Our initial deployment encountered account/service gates: CloudFront creation was restricted, and Textract returned `SubscriptionRequiredException`. After the account upgrade, Textract succeeded, including through the deployed application. Bedrock model authorization still returned an operation-not-allowed error, so it remains disabled. Clearer account-readiness and service-activation checks before deployment would help during time-limited events. We retained API Gateway/Lambda hosting, manual-entry fallback and deterministic summaries.

Preserving the exact evidence a supplier reviewed also required care. With S3, we combined browser CORS, signed upload requests, file-size/type checks, object versioning, and version-specific downloads. A single end-to-end example covering that complete browser-to-review workflow would make the integration easier.

DynamoDB conditional writes are useful, but business revision numbers and storage concurrency versions solve different problems. Our receiving record can change its review status without changing its invoice-content revision, so we keep those concepts separate. More examples showing revision-bound review links and conditional updates together would help application builders.

Textract omitted an entire blank-quantity row in one of five synthetic fixtures and left two billed units unknown in another. Confidence on returned fields cannot flag a row that never arrived. More packaged-goods examples and guidance on detecting incomplete line-item coverage would help; we now require comparison with the original and keep physical counts separate.

## What did you like about the AWS services you used?

DynamoDB conditional writes reject stale changes, while transactions let us retain a historical state alongside each current-record update. Our deployed checks recovered the same workspace and retrieved earlier supplier responses and evidence after later edits. S3 version IDs and short-lived URLs made that private evidence workflow practical: the live check downloaded the same 246,251-byte synthetic invoice that was uploaded. Textract's structured fields and source locations fit an editable review interface, while its observed gaps remain visible to the user.

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
