import type {ReceivingCase} from '../shared/types.js';
import type {Stored,Store,Write} from './store.js';

export const MAX_CASE_SNAPSHOTS=1000;
export const snapshotNotice='Read-only saved states, including supplier responses and attached evidence references. These are application records, not identity verification or a legally certified archive. For records created before history was enabled, only the state available at migration and later changes are retained.';
export interface SnapshotMetadata {
  snapshotId:string;revision:number;savedAt:string;action:string;status:ReceivingCase['status'];
  lineCount:number;evidenceCount:number;responseCount:number;legacyBaseline?:boolean;
}
export interface Snapshot extends SnapshotMetadata {record:ReceivingCase;}
const archiveKey=(workspaceId:string,caseId:string)=>`ARCHIVE#${workspaceId}#${caseId}`;
const snapshotId=(sequence:number)=>String(sequence).padStart(10,'0');

export function snapshotWrites(workspaceId:string,record:ReceivingCase,sequence:number,legacyBaseline=false):Write[] {
  const pk=archiveKey(workspaceId,record.id);
  const metadata:SnapshotMetadata={snapshotId:snapshotId(sequence),revision:record.revision,savedAt:record.updatedAt,action:legacyBaseline ? 'history_started' : record.history.at(-1)?.action ?? 'saved',status:record.status,lineCount:record.lines.length,evidenceCount:record.evidence.length,responseCount:record.responses.length,...(legacyBaseline ? {legacyBaseline:true} : {})};
  return [
    {pk,sk:`SNAPSHOT#${metadata.snapshotId}`,value:{...metadata,record:structuredClone(record)},expected:null},
    {pk,sk:`INDEX#${metadata.snapshotId}`,value:metadata,expected:null}
  ];
}

/** Save the available legacy state before an edit; never invent earlier content. */
export async function ensureSnapshot(store:Store,workspaceId:string,stored:Stored<ReceivingCase>) {
  const pk=archiveKey(workspaceId,stored.value.id);
  const existing=await store.get(pk,`INDEX#${snapshotId(stored.version)}`);
  if(existing) return;
  await store.transact(snapshotWrites(workspaceId,stored.value,stored.version,true),[{pk:stored.pk,sk:stored.sk,expected:stored.version}]);
}

export async function listSnapshots(store:Store,workspaceId:string,stored:Stored<ReceivingCase>) {
  const entries=await store.list<SnapshotMetadata>(archiveKey(workspaceId,stored.value.id),'INDEX#');
  return entries.map(entry=>({...entry.value,isCurrent:entry.value.snapshotId===snapshotId(stored.version)})).sort((a,b)=>b.snapshotId.localeCompare(a.snapshotId));
}

export async function getSnapshot(store:Store,workspaceId:string,caseId:string,id:string) {
  return (await store.get<Snapshot>(archiveKey(workspaceId,caseId),`SNAPSHOT#${id}`))?.value;
}
