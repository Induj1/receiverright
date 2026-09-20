# Operating cost and workload assumptions

Region: **Asia Pacific (Mumbai), ap-south-1**. Currency: USD. On-demand rates were retrieved on 20 September 2026 from the AWS Price List Query API. The [saved price products](evidence/aws-price-products.json) include service, SKU, rate code, unit, and catalog publication date. Run `node scripts/build-cost-model.mjs` to reproduce the [calculated model](evidence/aws-cost-model.json).

## Reference scenario

For **1,000 single-page invoices** processed during a month, assume per invoice:

- One Textract AnalyzeExpense page.
- 30 HTTP API requests and Lambda invocations, including interface/API traffic.
- 6 Lambda GB-seconds: 512 MiB × 12 aggregate execution seconds across those calls.
- 200 DynamoDB write request units and 100 read request units. The write allowance includes assumed transaction/snapshot overhead; real usage depends on item sizes and operations.
- 2 MB of S3 evidence and 100 KB of DynamoDB record/snapshot storage retained for one full month.

These workload quantities are modeling assumptions, not observed customer usage or measured Lambda billing durations. Provider response times from the synthetic invoice evaluation are reported separately.

| Component | Modeled cost for 1,000 invoices |
| --- | ---: |
| Textract, $0.01 per page | $10.0000 |
| HTTP API, $1.05 per million requests | $0.0315 |
| Lambda requests | $0.0060 |
| Lambda ARM compute | $0.0800 |
| DynamoDB writes | $0.1420 |
| DynamoDB reads | $0.0143 |
| S3 Standard storage | $0.0500 |
| DynamoDB storage at the paid marginal rate | $0.0285 |
| **Core-service subtotal** | **$10.3523** |

The subtotal is approximately **$0.01035 per invoice under these assumptions**. It excludes S3 request charges, CloudWatch ingestion/storage, internet data transfer, deployment artifacts, operational labor, and taxes. It ignores free tiers, promotional credits, and negotiated discounts. It is neither a complete account bill nor a spending cap. Repeated extraction, larger documents, more evidence, longer retention, and larger snapshots change the result.

## Design choices that affect cost

- Manual entry and deterministic calculations require no model call.
- Extraction is requested explicitly; changing a receiving count does not trigger another OCR request.
- The deployed app shares a durable daily quota of 50 Textract/Bedrock attempts. This limits provider attempts, not all AWS charges or document pages.
- Lambda uses ARM, 512 MiB, and no provisioned concurrency; DynamoDB uses on-demand capacity.
- Logs retain seven days. Evidence and snapshots remain until the operator explicitly removes the project's resources/data; storage therefore accumulates over time.
- API Gateway throttling is 5 requests/second with a burst of 15. This is a hackathon deployment limit, not a load-test result or concurrency guarantee.
- API Gateway/Lambda hosting was selected after a CloudFront account restriction. A larger rollout should revisit static-asset hosting, verified identity, retention, account spending alerts, and observed usage before making affordability claims.

## Refresh the rates

Use the AWS Price List Query API in `us-east-1`, filtering `regionCode=ap-south-1`, for service codes `AmazonTextract`, `AWSLambda`, `AmazonApiGateway`, `AmazonDynamoDB`, and `AmazonS3`. Preserve the full returned price product for each selected usage type rather than copying a rate from another region. Rebuild the model after updating the snapshot.

Official pricing references: [Textract](https://aws.amazon.com/textract/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [API Gateway](https://aws.amazon.com/api-gateway/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/on-demand/), [S3](https://aws.amazon.com/s3/pricing/).
