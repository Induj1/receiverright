import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

export interface Stored<T> { pk:string; sk:string; version:number; value:T; expiresAt?:number; }
export class Conflict extends Error { constructor() { super('This record changed. Refresh and try again.'); } }
export interface Write { pk:string; sk:string; value:unknown; expected:number|null; expiresAt?:number; }
export interface Check { pk:string; sk:string; expected:number; }
export interface Store {
  kind:'local'|'dynamodb';
  get<T>(pk:string, sk:string):Promise<Stored<T>|undefined>;
  list<T>(pk:string, prefix?:string):Promise<Stored<T>[]>;
  put<T>(pk:string, sk:string, value:T, expected:number|null, expiresAt?:number):Promise<Stored<T>>;
  transact(writes:Write[],checks?:Check[]):Promise<void>;
}

/** Serialize read/modify/write locally; atomic rename avoids partially written records. */
export class FileStore implements Store {
  kind = 'local' as const;
  private queue:Promise<unknown> = Promise.resolve();
  private file:string;
  constructor(readonly directory = path.resolve('.data')) { this.file = path.join(directory, 'records.json'); }
  private async read():Promise<Record<string,Stored<unknown>>> {
    try { return JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  }
  private key(pk:string, sk:string) { return JSON.stringify([pk, sk]); }
  async get<T>(pk:string, sk:string) { await this.queue; return (await this.read())[this.key(pk,sk)] as Stored<T>|undefined; }
  async list<T>(pk:string, prefix?:string) { await this.queue; return Object.values(await this.read()).filter(r => r.pk === pk && (!prefix || r.sk.startsWith(prefix))) as Stored<T>[]; }
  async transact(writes:Write[],checks:Check[] = []) {
    const operation=this.queue.then(async()=>{
      const records=await this.read();
      for(const item of [...writes,...checks]) {
        const current=records[this.key(item.pk,item.sk)];
        if(item.expected===null ? !!current : current?.version!==item.expected) throw new Conflict();
      }
      for(const item of writes) records[this.key(item.pk,item.sk)]={pk:item.pk,sk:item.sk,version:(item.expected ?? 0)+1,value:item.value,...(item.expiresAt ? {expiresAt:item.expiresAt} : {})};
      await mkdir(this.directory,{recursive:true});
      const temporary=`${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary,JSON.stringify(records),{mode:0o600});
      await rename(temporary,this.file);
    });
    this.queue=operation.catch(()=>{});return operation;
  }
  async put<T>(pk:string, sk:string, value:T, expected:number|null, expiresAt?:number) {
    const operation = this.queue.then(async () => {
      const records = await this.read(); const key = this.key(pk,sk); const current = records[key];
      if (expected === null ? !!current : current?.version !== expected) throw new Conflict();
      const next:Stored<T> = {pk,sk,version:(current?.version ?? 0)+1,value,...(expiresAt ? {expiresAt} : {})};
      records[key] = next;
      await mkdir(this.directory, {recursive:true});
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(records), {mode:0o600});
      await rename(temporary, this.file); return next;
    });
    this.queue = operation.catch(() => {}); return operation;
  }
}

export class DynamoStore implements Store {
  kind = 'dynamodb' as const;
  private client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {marshallOptions:{removeUndefinedValues:true}});
  constructor(private table:string) {}
  async get<T>(pk:string, sk:string) { const result = await this.client.send(new GetCommand({TableName:this.table,Key:{pk,sk},ConsistentRead:true})); return result.Item as Stored<T>|undefined; }
  async list<T>(pk:string, prefix?:string) {
    const records:Stored<T>[] = []; let cursor:Record<string,unknown>|undefined;
    do { const result = await this.client.send(new QueryCommand({TableName:this.table,KeyConditionExpression:prefix ? 'pk = :pk AND begins_with(sk, :prefix)' : 'pk = :pk',ExpressionAttributeValues:{':pk':pk,...(prefix ? {':prefix':prefix} : {})},ConsistentRead:true,ExclusiveStartKey:cursor})); records.push(...(result.Items ?? []) as Stored<T>[]); cursor = result.LastEvaluatedKey; } while(cursor);
    return records;
  }
  async put<T>(pk:string, sk:string, value:T, expected:number|null, expiresAt?:number) {
    const next:Stored<T> = {pk,sk,version:(expected ?? 0)+1,value,...(expiresAt ? {expiresAt} : {})};
    try { await this.client.send(new PutCommand({TableName:this.table,Item:next,ConditionExpression:expected === null ? 'attribute_not_exists(pk)' : '#version = :version',...(expected === null ? {} : {ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':version':expected}})})); }
    catch(error) { if ((error as Error).name === 'ConditionalCheckFailedException') throw new Conflict(); throw error; }
    return next;
  }
  async transact(writes:Write[], checks:Check[] = []) {
    const condition=(expected:number|null)=>({ConditionExpression:expected===null ? 'attribute_not_exists(pk)' : '#version = :version',...(expected===null ? {} : {ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':version':expected}})});
    try {
      await this.client.send(new TransactWriteCommand({TransactItems:[
        ...writes.map(item=>({Put:{TableName:this.table,Item:{pk:item.pk,sk:item.sk,version:(item.expected ?? 0)+1,value:item.value,...(item.expiresAt ? {expiresAt:item.expiresAt} : {})},...condition(item.expected)}})),
        ...checks.map(item=>({ConditionCheck:{TableName:this.table,Key:{pk:item.pk,sk:item.sk},...condition(item.expected)}}))
      ]}));
    } catch(error) {
      const failure=error as Error & {CancellationReasons?:Array<{Code?:string}>};
      if(failure.name==='TransactionCanceledException' && failure.CancellationReasons?.some(reason=>reason.Code==='ConditionalCheckFailed' || reason.Code==='TransactionConflict')) throw new Conflict();
      if(failure.name==='TransactionConflictException') throw new Conflict();
      throw error;
    }
  }
}

export function defaultStore() { return process.env.TABLE_NAME ? new DynamoStore(process.env.TABLE_NAME) : new FileStore(process.env.DATA_DIR); }
