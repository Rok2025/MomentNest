import { mkdir,readFile,writeFile,copyFile,stat } from 'node:fs/promises';
import { join,resolve,dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileHash } from './storage/local';
import type { Queryable } from './event-store';
export const backupTables=['households','members','subjects','events','upload_sessions','media','media_jobs','save_requests'] as const;
export type Snapshot={version:1;createdAt:string;tables:Record<string,Record<string,unknown>[]>;files:{key:string;sha256:string;size:number}[];note:string};
export async function exportSnapshot(db:Queryable,folder:string,mediaRoot:string){
 await mkdir(folder,{recursive:false,mode:0o700});
 // SQL DATE is a calendar day, never a JS Date. pg otherwise serializes local
 // midnight to the previous UTC day on this Mac (Asia/Shanghai).
 const tables:Snapshot['tables']={};for(const t of backupTables){
  const dateColumn=t==='subjects'?'birth_date':t==='events'?'occurred_on':null;
  tables[t]=(await db.query(`select *${dateColumn?`, ${dateColumn}::text as ${dateColumn}`:''} from momentnest.${t}`)).rows;
 }
 // Only committed originals; temporary uploads are not a long-term backup asset.
 const files:Snapshot['files']=[];
 for(const m of tables.media){const key=String(m.object_key);if(!/^originals\/[a-f0-9-]+\/[a-f0-9-]+\.bin$/.test(key))throw Error('INVALID_BACKUP_KEY');const source=resolve(mediaRoot,key),target=join(folder,'originals',key);await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(source,target);const hash=await fileHash(target);if(hash!==m.sha256)throw Error('BACKUP_HASH_MISMATCH');files.push({key,sha256:hash,size:(await stat(target)).size});}
 const snapshot:Snapshot={version:1,createdAt:new Date().toISOString(),tables,files,note:'Business data and original media. Supabase Auth credentials are excluded; restore requires re-invitation and explicit auth_user_id mapping. Derivatives may be regenerated.'};
 const data=JSON.stringify(snapshot,null,2);await writeFile(join(folder,'snapshot.json'),data,{mode:0o600});await writeFile(join(folder,'snapshot.sha256'),createHash('sha256').update(data).digest('hex')+'\n',{mode:0o600});return {records:tables.events.length,originals:files.length};
}
export async function verifySnapshot(folder:string){
 const data=await readFile(join(folder,'snapshot.json'),'utf8'),expected=(await readFile(join(folder,'snapshot.sha256'),'utf8')).trim();if(createHash('sha256').update(data).digest('hex')!==expected)throw Error('SNAPSHOT_HASH_MISMATCH');
 const snapshot=JSON.parse(data) as Snapshot;if(snapshot.version!==1)throw Error('UNSUPPORTED_BACKUP');
 for(const [table,column] of [['subjects','birth_date'],['events','occurred_on']])for(const row of snapshot.tables[table])if(typeof row[column]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row[column] as string))throw Error('INVALID_CALENDAR_DATE_EXPORT');
 for(const file of snapshot.files){if(!/^originals\/[a-f0-9-]+\/[a-f0-9-]+\.bin$/.test(file.key))throw Error('INVALID_BACKUP_KEY');const path=join(folder,'originals',file.key);if(await fileHash(path)!==file.sha256||(await stat(path)).size!==file.size)throw Error('ORIGINAL_HASH_MISMATCH');}
 return snapshot;
}
