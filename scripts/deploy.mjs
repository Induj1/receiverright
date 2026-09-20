import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import template from '../infrastructure/template.mjs';

const profile = process.env.AWS_PROFILE || 'receiverright';
const region = process.env.AWS_REGION || 'ap-south-1';
const stack = process.env.STACK_NAME || 'receiverright-app';
const aws = (...args) => {
  const result = spawnSync('aws', [...args, '--profile', profile, '--region', region, '--no-cli-pager'], { encoding: 'utf8', env: { ...process.env, AWS_PAGER: '' } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message);
  return result.stdout.trim();
};
await mkdir('.artifacts', { recursive: true });
await writeFile('.artifacts/template.json', JSON.stringify(template, null, 2));
aws('cloudformation', 'validate-template', '--template-body', 'file://.artifacts/template.json');
const identity = JSON.parse(aws('sts', 'get-caller-identity', '--output', 'json'));
const bucket = `${stack}-artifacts-${identity.Account}-${region}`;
try { aws('s3api', 'head-bucket', '--bucket', bucket); }
catch {
  const args = ['s3api', 'create-bucket', '--bucket', bucket];
  if (region !== 'us-east-1') args.push('--create-bucket-configuration', `LocationConstraint=${region}`);
  aws(...args);
}
aws('s3api', 'put-public-access-block', '--bucket', bucket, '--public-access-block-configuration', 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true');
const bytes = await readFile('.artifacts/lambda.zip');
const key = `lambda/${createHash('sha256').update(bytes).digest('hex').slice(0,20)}.zip`;
aws('s3', 'cp', '.artifacts/lambda.zip', `s3://${bucket}/${key}`, '--sse', 'AES256', '--only-show-errors');
console.log(`Deploying ${stack} to ${region}…`);
console.log(aws('cloudformation', 'deploy', '--stack-name', stack, '--template-file', '.artifacts/template.json', '--capabilities', 'CAPABILITY_IAM', '--no-fail-on-empty-changeset', '--parameter-overrides', `CodeBucket=${bucket}`, `CodeKey=${key}`, `BedrockModel=${process.env.BEDROCK_MODEL_ID || ''}`, `TextractEnabled=${process.env.TEXTRACT_ENABLED || 'false'}`, `MaxDailyAiCalls=${process.env.MAX_DAILY_AI_CALLS || '50'}`));
const resources = JSON.parse(aws('cloudformation', 'describe-stacks', '--stack-name', stack, '--query', 'Stacks[0].Outputs', '--output', 'json'));
const outputs = Object.fromEntries(resources.map(o => [o.OutputKey, o.OutputValue]));
await writeFile('deployment-outputs.json', JSON.stringify({ ...outputs, region, stack }, null, 2));
console.log(`Live site: ${outputs.SiteUrl}`);
