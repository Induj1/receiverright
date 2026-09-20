# Final recorded demo narration

Measured length: **166.023 seconds (2:46)**. The MP4 uses actual browser interactions with disclosed still-frame narration holds, synthetic data, and generated narration.

ReceiveRight - recorded app interactions
Generated narration: Microsoft David Desktop. Timestamped browser frames preserve captured interaction timing at normal speed; gaps between recorded sections are omitted. Extra narration time holds the first or last captured frame. Any explicit 30fps sampling is recorded in the render metadata. Demonstration data is synthetic.

## SECTION 1 - One shared delivery record (16.1s)
For a small shop, delivery discrepancies are scattered across an invoice photo, a physical count, and messages. ReceiveRight turns them into one shared receiving record. This demonstration uses synthetic data.

## SECTION 2 - Request real invoice extraction (6.3s)
We request real Amazon Textract extraction from the privately uploaded invoice.

## SECTION 3 - Unknown means review, never assume (14.1s)
Textract found the invoice rows, but could not identify the first billed unit. Unknown fields require review; received counts are never inferred. We choose bottle from the source and apply.

## SECTION 4 - Confirm the physical count (13.9s)
The receiver enters what actually arrived, including damaged goods. A carton requires an explicit conversion: twelve packets here. Each line needs confirmation before sharing.

## SECTION 5 - An inspectable 280-rupee discrepancy (17.3s)
Two missing bottles add two hundred rupees. Two damaged biscuit packets add eighty. Damage stays inside the received total, so it is not counted twice. The calculation uses integer paise and excludes taxes and discounts.

## SECTION 6 - A supplier view of the exact saved revision (10.3s)
A separate PIN unlocks the supplier view for this exact saved revision. The supplier can acknowledge or dispute each affected item with a written note.

## SECTION 7 - An acknowledgment, not an assumed refund (13.8s)
The recorded response is tied to those quantities. The supplier name is self-reported. Acknowledgment records agreement with the observation; it does not issue a credit or confirm a refund.

## SECTION 8 - Close with a recorded response (9.1s)
The receiver refreshes and closes the record only after every affected line is acknowledged. Closed records are read-only.

## SECTION 9 - Keep the earlier version in context (14.0s)
Saved versions retain the earlier quantities, supplier responses, and attached evidence. Later edits require a fresh supplier review. Each retained version can be inspected and exported.

## SECTION 10 - Return to the same workspace (12.0s)
A privately saved recovery code restores the same workspace on another device, including this acknowledged delivery. Sessions can renew without losing saved records.

## SECTION 11 - AWS services with a concrete purpose (19.8s)
React and TypeScript run through API Gateway and Lambda. DynamoDB transactions save records and history together. Private, versioned S3 preserves evidence; Textract suggests invoice fields. Summaries use templates; Bedrock is disabled.

## SECTION 12 - Measured limits, reproducible evidence (19.4s)
We passed one hundred and three automated tests. Five synthetic invoices produced twelve of thirteen expected rows: one omission, so checking the original remains essential. No shop pilot is claimed. AI substantially assisted implementation and testing.


Publication settings and current status: [Video publishing](VIDEO-PUBLISHING.md).
