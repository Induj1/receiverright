# ReceiveRight — 2 minute 45 second demo

Target length: **2:45**. Leave at least 10 seconds below the three-minute submission limit. Record the deployed application with readable browser text. Use a clearly labeled synthetic sample; describe real-user validation only if it has actually occurred.

## Prepare before recording

- Open the verified deployment in the receiver browser. Start a fresh workspace or an unused synthetic sample.
- Keep a second browser/device available for supplier review. Use its PIN entry screen on camera; avoid displaying the receiver's access token or AWS credentials.
- Keep a compact architecture view and the relevant AWS console resources ready in separate tabs. Show only services that were deployed and exercised.
- For a live Textract segment, prepare a supported JPEG/PNG/PDF invoice that you have permission to use. The bundled sample SVG is an illustration and does not run through Textract. Redact private details first.
- Prepare the sample's carton conversion: one carton contains 12 tea packets. Water shortage is ₹200; two damaged biscuit packets are ₹80; final discrepancy is ₹280.
- Do a complete unrecorded run once. Check that both views refresh successfully and that the chosen AWS provider works in the deployed region.

## Recording sequence

| Time | Show | Suggested narration |
| --- | --- | --- |
| 0:00–0:18 | Overview, then open the sample record | “A small shop receives a delivery. The invoice is on paper, the counts are in someone's head, and a shortage becomes a long message thread. ReceiveRight brings the invoice, observations, and supplier response into one record.” |
| 0:18–0:35 | Synthetic banner, original invoice, source highlight | “This is labeled synthetic data. The original document stays beside editable item fields. With AWS Textract configured, a real supported upload produces suggested fields for the receiver to check.” |
| 0:35–1:02 | Water and biscuits lines | “Twelve bottles were billed at one hundred rupees; ten arrived. That is two hundred rupees of missing item value. Twenty-four biscuit packets arrived, including two damaged ones. Damage is already inside the received count, so it is not counted as missing too. That adds eighty rupees.” |
| 1:02–1:20 | Tea's unresolved carton, then enter 12 and confirm lines | “The tea invoice says one carton, while the receiver counted twelve packets. We block sharing until the pack size is confirmed. Twelve packets per carton resolves this line. The final calculated item discrepancy is two hundred and eighty rupees.” |
| 1:20–1:47 | Create share, switch to supplier, enter PIN, acknowledge both lines | “The supplier receives a link and separate PIN for this saved revision. They can inspect the evidence and acknowledge or dispute each affected line. Their supplied name is recorded as self-reported.” |
| 1:47–2:03 | Receiver refresh, visible responses, close, activity tab | “Both responses now appear on the receiver's record. Closing means the observations were acknowledged; it does not claim a refund. Later edits invalidate old review links, so agreement always refers to the version that was reviewed.” |
| 2:03–2:29 | Architecture plus actual deployed AWS resources/provider indicator | “API Gateway provides the HTTPS entry point; Lambda serves the mobile web app and API. DynamoDB keeps cases and revision checks; private versioned S3 keeps evidence. Textract proposes invoice fields. Integer-based application code calculates the money, and deterministic templates summarize the record. An optional Bedrock adapter is available.” |
| 2:29–2:45 | Final record on a narrow/mobile screen | “We learned to separate AI suggestions from human observations and deterministic calculations. ReceiveRight is built for the moment goods arrive: clear counts, shared evidence, and a recorded response. We used Codex substantially for implementation and testing.” |

If Bedrock is not enabled in the verified deployment, say **“Summaries currently use deterministic templates; a Bedrock adapter is available”**, and do not imply the model was called. If Textract has not been exercised live, describe the adapter honestly rather than showing the sample as an AWS result. Replace architecture wording with actual deployed services if the deployment changes.

The current hosting plan uses API Gateway and Lambda because the AWS account encountered a CloudFront verification restriction. CloudFront is not part of the current claimed deployment. If useful, mention the account restriction and working fallback as a short learning point; keep the product demonstration primary.

## Optional short cutaway

If time permits, replace 10 seconds of the architecture segment with a fresh supported invoice upload and the Textract suggestion dialog. Keep source confidence visible and explain that received counts still require a person. Do not substitute OCR latency, accuracy, or user savings claims that were not measured.

## Publication checklist

- Export a final video no longer than **3:00**; verify the duration after upload.
- Publish or make it unlisted on YouTube. Confirm the link opens without the team's account.
- Show actual AWS use in the recording and include the repository/deployment links in the video description.
- Label the sample as synthetic and include AI-assistance disclosure.
- Add the verified YouTube URL to `docs/SUBMISSION.md` and the README. A local recording path is not a valid YouTube submission link.
