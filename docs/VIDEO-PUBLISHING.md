# Video ready for publication

The finished local file is `output/video/ReceiveRight-Demo.mp4`: **165.08 seconds**, 1920 × 1080, H.264 video with AAC narration. English captions are in `output/video/ReceiveRight-Demo.srt`; the complete spoken text is in `ReceiveRight-Demo.transcript.txt`.

This is a narrated walkthrough of actual application screenshots, not a continuous live screen recording. A visible label identifies the format and synthetic demonstration. The narration uses Windows text-to-speech. Nothing has been uploaded to YouTube yet.

## Suggested title

ReceiveRight | Delivery Reconciliation on AWS | First Commit 2026

## Description to paste

ReceiveRight helps small shops keep delivery invoices, physical receiving counts, photographs, and supplier responses in one shared record.

Try the deployed application:
https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com

Public source code and setup:
https://github.com/Induj1/receiverright

Built for First Commit 2026 by AWS × WeMakeDevs, Ship it track.

AWS services exercised: API Gateway HTTP API, Lambda, DynamoDB, private versioned S3, and Textract AnalyzeExpense. Summaries use deterministic templates; the optional Bedrock adapter is disabled. CloudFront is not used in this deployment.

This narrated screenshot walkthrough shows actual application screens with clearly labeled synthetic demonstration data. The example combines a ₹200 shortage and ₹80 of damaged-item value. Human confirmation resolves ambiguous pack sizes; deterministic code calculates discrepancies. Supplier acknowledgement records agreement with observations, not a refund or money recovered.

33 automated tests passed, and the deployed receiver/supplier workflow, private evidence upload, and Textract integration were verified. No real-shop pilot or measured financial impact is claimed.

OpenAI Codex substantially assisted with implementation, testing, deployment, documentation, and this presentation. Narration is generated with Windows text-to-speech.

## After uploading

Use Public or Unlisted visibility, and verify the finished link opens without signing into the channel. Add the SRT captions if desired. Replace the YouTube TODO in `docs/SUBMISSION.md` and the README with the actual watch URL. A local MP4 path is not a YouTube submission link.

The final event form also still needs the leader's actual WeMakeDevs username and real teammate details/contributions. Public resumes are needed for the interview consideration option. Optional blog fields can remain blank; the supplied Builder Center article is a draft, not a published blog.
