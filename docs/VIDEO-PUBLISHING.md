# Video ready for publication

The finished local file is `output/video/ReceiveRight-Live-Demo.mp4`: **166.023 seconds (2:46)**, 1920 × 1080, H.264/AAC, 30 fps. English captions are in `output/video/ReceiveRight-Live-Demo.srt` (40 cues); the adjacent transcript and render report document the narration and edit.

The video contains actual browser interactions with synthetic data and generated narration. Captured actions total about 11.84 seconds; the edit adds still-frame holds for explanation and omits pauses between separate captures. It is not an uninterrupted desktop recording. Original capture timestamps and endpoints were retained when 158 captures were sampled to 140 frames compatible with the output clock. Audio/video decoding, representative frames, caption bounds, duration, and audio levels were checked.

**Publishing status: awaiting the user's YouTube sign-in for an authorized unlisted upload.**

## Suggested title

ReceiveRight | One Delivery, One Shared Record | AWS First Commit 2026

## Description to paste

ReceiveRight helps small shops and suppliers resolve delivery discrepancies using one shared record: invoice, physical counts, evidence, calculated item value, and the supplier's response to that saved version.

Try the deployed application:
https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com

Public source code and setup:
https://github.com/Induj1/receiverright

Built by Bro code for First Commit 2026 by AWS × WeMakeDevs, Ship it track. Team leader: Induj Gupta.

AWS services exercised: API Gateway HTTP API, Lambda, DynamoDB, private versioned S3, and Textract AnalyzeExpense. DynamoDB transactions preserve saved states; S3 object versions preserve attached evidence. Summaries use deterministic templates. Bedrock is disabled and CloudFront is not deployed.

This recorded synthetic demonstration shows a real invoice upload and Textract request, correction of an unknown unit, explicit carton conversion, a INR 280 discrepancy, supplier acknowledgement, closure, retained versions, and workspace recovery. Supplier names are self-reported; acknowledgement is not a refund or payment.

103 automated tests passed. A separate live evaluation of five generated invoice images returned 12 of 13 printed rows; the missing row and unknown units are documented publicly. This is a small synthetic test set, not a real-invoice accuracy benchmark. No real-shop pilot, savings, or recovered-money result is claimed.

The video uses actual recorded app interactions with still-frame narration holds, synthetic documents, and generated Microsoft David narration. It is edited, not an uninterrupted screen recording. OpenAI Codex substantially assisted implementation, testing, deployment, documentation, and presentation.

## After uploading

Use **Unlisted** visibility as authorized by Induj, and verify the finished link opens without signing into the channel. Confirm processing has completed, the correct video plays, and its duration remains under three minutes. Add the SRT captions if supported. Replace the YouTube TODO in `docs/SUBMISSION.md` and the README with the actual watch URL. A local MP4 path is not a YouTube submission link.

Induj has confirmed he is the leader, with username `indujgupta`; his GitHub, LinkedIn, and public resume are recorded. Other members' unsupplied optional profile, resume, and contribution fields can remain blank. Optional blog fields stay blank unless actually published. The supplied Builder Center article is an unpublished draft. The event form has not been submitted.
