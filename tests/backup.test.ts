import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { it,expect } from 'vitest';
import { exportSnapshot,verifySnapshot } from '../src/server/backup';
import { saveEvent,type Transaction } from '../src/server/event-store';
import { authorizeUpload,completeUpload } from '../src/server/media-store';
it('非空数据库与原件备份可恢复到独立目录，损坏文件被拒绝',async()=>{
 const root=await mkdtemp(join(tmpdir(),'momentnest-backup-')),db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');for(const name of ['20260907171842_m1_private_events.sql','20260908011410_v1_media.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const auth=randomUUID(),h=randomUUID();await db.query('insert into auth.users values($1)',[auth]);await db.query('insert into momentnest.households(id,name) values($1,$2)',[h,'恢复测试']);await db.query('insert into momentnest.subjects(household_id) values($1)',[h]);await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸')",[h,auth]);
  const tx:Transaction=fn=>db.transaction(t=>fn(t)),bytes=await sharp({create:{width:12,height:8,channels:3,background:'#65884f'}}).png().toBuffer(),sha=createHash('sha256').update(bytes).digest('hex');const u=await authorizeUpload(tx,auth,{name:'test.jpg',size:bytes.length});const original=join(root,'media',String(u.object_key));await mkdir(dirname(original),{recursive:true});await writeFile(original,bytes);await completeUpload(tx,auth,String(u.id),{sha256:sha,kind:'image',mime:'image/jpeg',size:bytes.length});
  await saveEvent(tx,auth,{requestKey:randomUUID(),occurredOn:'2025-06-01',title:'恢复测试',body:'原始正文',feeling:'',uploadIds:[u.id]});const temporary=await authorizeUpload(tx,auth,{name:'temporary.jpg',size:123});const folder=join(root,'backup');expect(await exportSnapshot(db,folder,join(root,'media'))).toEqual({records:1,originals:1});
  const snapshot=await verifySnapshot(folder);expect(snapshot.tables.subjects[0].birth_date).toBe('2025-04-17');expect(snapshot.tables.events[0].occurred_on).toBe('2025-06-01');
  const result=await promisify(execFile)(process.execPath,['--import','tsx','scripts/restore-check.ts',folder,join(root,'restored')],{timeout:60000});expect(JSON.parse(result.stdout).counts.events).toBe(1);expect(JSON.parse(result.stdout).verifiedOriginals).toBe(1);expect((await sharp(join(root,'restored','media',String(u.object_key))).metadata()).width).toBe(12);const restored=new PGlite(join(root,'restored','database'));try{expect((await restored.query('select state from momentnest.upload_sessions where id=$1',[temporary.id])).rows[0]).toEqual({state:'expired'});}finally{await restored.close();}
  await writeFile(join(folder,'originals',String(u.object_key)),'corrupt');await expect(promisify(execFile)(process.execPath,['--import','tsx','scripts/restore-check.ts',folder,join(root,'corrupt-restore')],{timeout:60000})).rejects.toThrow();
 }finally{await db.close();await rm(root,{recursive:true,force:true});}
},120000);
