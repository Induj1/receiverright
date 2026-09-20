# First Commit submission reference

This file maps to the event's submission form. **TODO fields must be completed or left blank where optional.** Team: **Bro code**, four members, led by **Harshita Nagesh**. The user-provided receipt shows **Submitted on 20 September 2026 at 7:28 pm**. This is a corrected reference copy; changes here do not edit the submitted event form.

## Team details

| Form field | Team leader | Second member | Third member | Fourth member |
| --- | --- | --- | --- | --- |
| Name for internal reference | **Harshita Nagesh** | **Induj Gupta** | **Rayyan Shaikh** | **Laavanya Gupta** |
| WeMakeDevs username | **hashh** | induj | theclazer | laavanya_gupta |
| GitHub | https://github.com/hash066 | https://github.com/Induj1 | Not supplied — leave blank | Not supplied — leave blank |
| LinkedIn | https://www.linkedin.com/in/harshita-nagesh | https://linkedin.com/in/induj-gupta-35382752 | Not supplied — leave blank | Not supplied — leave blank |
| Public resume | Not supplied — leave blank | [Induj's resume](https://drive.google.com/file/d/1cpC_WRSW6VHzSTqkjatfut-t2u2n2jg8/view?usp=sharing) | Not supplied — leave blank | Not supplied — leave blank |

Resume URLs are needed for consideration for Amazon Fast Track Interviews. Do not publish a fabricated resume or a placeholder URL.

Induj's [WeMakeDevs profile](https://www.wemakedevs.org/induj) displays **INDUJ GUPTA (@induj)**, confirming `induj` as his username. The submitted receipt used a different value in the second-member field; correcting that field in the event form remains unverified. His resume opened in the signed-out Google Drive viewer on 20 September 2026. Harshita's username `hashh` comes from the supplied roster, and her leadership and profile links were supplied in the latest correction. Her GitHub profile displays Harshita Nagesh and links to the supplied LinkedIn profile. The GitHub link is normalized to the profile URL without date filters. Each profile and resume belongs only to the person in its column.

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

https://youtu.be/DAq-7V6UqVM

Verified on 20 September 2026: the YouTube page opens and playback starts while signed out, is marked **Unlisted**, and displays **2:46**. The uploaded content matches the finished demo. It contains recorded application interactions with disclosed still-frame narration holds, synthetic data, and generated narration. The local source is `output/video/ReceiveRight-Live-Demo.mp4` (166.023 seconds); optional SRT captions are included in the kit. [Publication details](VIDEO-PUBLISHING.md).

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
| Induj Gupta | TODO: actual published Builder Center article URL, or leave blank |
| Rayyan Shaikh | Leave blank unless actually published |
| Laavanya Gupta | Leave blank unless actually published |

## Team leader's contributions

**Harshita Nagesh:** Team lead for Bro code.

Only her leadership role has been confirmed. No additional coding, testing, deployment, or field-validation deliverables are attributed to her without further details.

## Second team member's contributions

**Induj Gupta:** Set the delivery-reconciliation project scope, directed AI-assisted implementation and submission preparation, completed AWS account sign-in and setup, and coordinated the deployment and team/profile details. OpenAI Codex substantially assisted with implementation, tests, deployment, browser verification, documentation, and review.

## Third team member's contributions

**Rayyan Shaikh:** No individual deliverables have been confirmed. Leave this optional field blank until actual completed work is supplied.

## Fourth team member's contributions

**Laavanya Gupta:** No individual deliverables have been confirmed. Leave this optional field blank until actual completed work is supplied.

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

## Checks for the submitted form

- Leader identity and profiles are entered, and all four supplied WeMakeDevs usernames are recorded.
- Public GitHub, deployed application, and verified unlisted YouTube links are entered. The video is under three minutes.
- Update the published YouTube description's leader sentence to `Team leader: Harshita Nagesh.`; it still named Induj at the latest check. The prepared description is corrected.
- The AWS answer matches the deployed services; Bedrock is explicitly disabled.
- Harshita's confirmed role is team lead. Keep Induj's factual contribution under his own entry and retain the AI-assistance disclosure. Add other deliverables only when actual work is supplied.
- Leave unsupplied optional blog/resume/member fields blank; do not copy explanatory placeholders into the form.
- The receipt shows the form was submitted. Edit **Second team member's WeMakeDevs username** to `induj`, save the change, and confirm the revised receipt. This local correction has not been applied to the event form by the assistant.
