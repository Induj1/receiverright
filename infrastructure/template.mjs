// CloudFormation source. Generated JSON is the exact template deployed by scripts/deploy.mjs.
const ref = Ref => ({ Ref });
const att = (resource, attribute) => ({ 'Fn::GetAtt': [resource, attribute] });
const sub = value => ({ 'Fn::Sub': value });
const privateBucket = {
  PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
  BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] }
};
export default {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'ReceiveRight: private receiving evidence, deterministic reconciliation and supplier review.',
  Parameters: {
    CodeBucket: { Type: 'String' }, CodeKey: { Type: 'String' },
    BedrockModel: { Type: 'String', Default: '' },
    MaxDailyAiCalls: { Type: 'Number', Default: 50, MinValue: 0, MaxValue: 500 }
  },
  Resources: {
    Records: { Type: 'AWS::DynamoDB::Table', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      BillingMode: 'PAY_PER_REQUEST', AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true }, SSESpecification: { SSEEnabled: true }
    } },
    EvidenceBucket: { Type: 'AWS::S3::Bucket', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      ...privateBucket, VersioningConfiguration: { Status: 'Enabled' },
      CorsConfiguration: { CorsRules: [{ AllowedHeaders: ['*'], AllowedMethods: ['GET', 'HEAD', 'PUT'], AllowedOrigins: ['*'], ExposedHeaders: ['ETag'], MaxAge: 300 }] },
      LifecycleConfiguration: { Rules: [{ Id: 'AbortIncompleteUploads', Status: 'Enabled', AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] }
    } },
    ExecutionRole: { Type: 'AWS::IAM::Role', Properties: {
      AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] },
      ManagedPolicyArns: [sub('arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')],
      Policies: [{ PolicyName: 'ReceiveRightResources', PolicyDocument: { Version: '2012-10-17', Statement: [
        { Effect: 'Allow', Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'], Resource: att('Records', 'Arn') },
        { Effect: 'Allow', Action: ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'], Resource: sub('${EvidenceBucket.Arn}/*') },
        { Effect: 'Allow', Action: 'textract:AnalyzeExpense', Resource: '*' },
        { Effect: 'Allow', Action: 'bedrock:InvokeModel', Resource: [sub('arn:${AWS::Partition}:bedrock:*::foundation-model/amazon.nova-lite-v1:0'), sub('arn:${AWS::Partition}:bedrock:${AWS::Region}:${AWS::AccountId}:inference-profile/apac.amazon.nova-lite-v1:0')] }
      ] } }]
    } },
    ApiFunction: { Type: 'AWS::Lambda::Function', Properties: {
      Runtime: 'nodejs22.x', Handler: 'index.handler', Architectures: ['arm64'], MemorySize: 512, Timeout: 29,
      Role: att('ExecutionRole', 'Arn'), Code: { S3Bucket: ref('CodeBucket'), S3Key: ref('CodeKey') },
      Environment: { Variables: { NODE_ENV: 'production', TABLE_NAME: ref('Records'), EVIDENCE_BUCKET: ref('EvidenceBucket'), BEDROCK_MODEL_ID: ref('BedrockModel'), MAX_DAILY_AI_CALLS: ref('MaxDailyAiCalls') } }
    } },
    ApiLogs: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: sub('/aws/lambda/${ApiFunction}'), RetentionInDays: 7 } },
    Api: { Type: 'AWS::ApiGatewayV2::Api', Properties: { Name: sub('${AWS::StackName}-api'), ProtocolType: 'HTTP' } },
    Integration: { Type: 'AWS::ApiGatewayV2::Integration', Properties: { ApiId: ref('Api'), IntegrationType: 'AWS_PROXY', IntegrationUri: att('ApiFunction', 'Arn'), PayloadFormatVersion: '2.0', TimeoutInMillis: 29000 } },
    ApiRoute: { Type: 'AWS::ApiGatewayV2::Route', Properties: { ApiId: ref('Api'), RouteKey: '$default', Target: { 'Fn::Join': ['/', ['integrations', ref('Integration')]] } } },
    Stage: { Type: 'AWS::ApiGatewayV2::Stage', Properties: { ApiId: ref('Api'), StageName: '$default', AutoDeploy: true, DefaultRouteSettings: { ThrottlingBurstLimit: 15, ThrottlingRateLimit: 5 } } },
    InvokePermission: { Type: 'AWS::Lambda::Permission', Properties: { Action: 'lambda:InvokeFunction', FunctionName: ref('ApiFunction'), Principal: 'apigateway.amazonaws.com', SourceArn: sub('arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*') } },
  },
  Outputs: {
    SiteUrl: { Value: att('Api', 'ApiEndpoint') }, ApiUrl: { Value: att('Api', 'ApiEndpoint') },
    EvidenceBucket: { Value: ref('EvidenceBucket') },
    RecordsTable: { Value: ref('Records') }, FunctionName: { Value: ref('ApiFunction') }
  }
};
