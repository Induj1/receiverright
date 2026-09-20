# AWS deployment

Requirements: Node.js22, AWS CLI v2, and an authenticated AWS profile with permission to create the resources in infrastructure/template.mjs. No access keys belong in the repository.

```powershell
npm ci
npm test
npm run build
npm run build:lambda
aws login --profile receiverright --region ap-south-1
node scripts/deploy.mjs
```

The script validates CloudFormation, creates a private artifact bucket, uploads the content-addressed Lambda ZIP, deploys the stack, and writes deployment-outputs.json locally (gitignored). Its default profile is receiverright, region ap-south-1 and stack receiverright-app. Override with AWS_PROFILE, AWS_REGION and STACK_NAME environment variables.

The deployed HTTPS API Gateway endpoint serves the React application and /api via Lambda. DynamoDB stores scoped records. S3 holds private versioned evidence, with five-minute uploads and one-minute signed downloads. Textract AnalyzeExpense returns suggestions requiring receiver confirmation. Bedrock summaries are optional; an empty BEDROCK_MODEL_ID uses deterministic templates.

The initial account blocked CloudFront creation and Bedrock invocation while account verification was pending. Hosting through API Gateway avoids the CloudFront dependency. This does not bypass AWS authorization; unavailable services remain unavailable. The deployment does not require Cognito, Amplify, Strands, blockchain or a Telegram bot.

## Operating limits

- HTTP API stage throttle:5requests/second, burst15. This is throttling, not a spending cap.
- Durable global Textract+Bedrock daily quota:50attempts by default, configurable with MAX_DAILY_AI_CALLS at deployment.
- Uploads:JPEG, PNG or PDF; maximum5MB;10files/case;25cases/workspace.
- DynamoDB uses on-demand billing. Lambda has no provisioned concurrency. Logs retain7days.
- Public workspace creation is intended for a hackathon evaluation. Add verified identity, global storage quotas, a production threat assessment and spending alerts before broader operation.
- AWS charges can still accrue for API calls, compute and storage. AI quotas do not cap the entire account bill.

## Lifecycle

S3 and DynamoDB data are retained when the CloudFormation stack is deleted, preventing accidental evidence loss. The artifact bucket is created outside CloudFormation. Inventory and explicitly remove only this project's retained resources when finished. Do not issue broad account-wide deletion commands. A failed initial CloudFront stack may also have retained empty buckets/table; keep their exact names in the local deployment notes until cleaned up.

## Update

Build the frontend and Lambda again, then rerun node scripts/deploy.mjs. A new ZIP hash updates the Lambda code. Static assets use hashed filenames. No secrets or session tokens are included in build outputs.
