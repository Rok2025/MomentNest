import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {draftBatchIdSchema} from '../src/domain/upload-draft';
import {draftFiles,discardDraft} from '../src/server/upload-drafts';
import type {Transaction} from '../src/server/event-store';
it('迁移保留已有未验证及已验证原件的记录与哈希，延长恢复期限',async()=>{
 const db=new PGlite(),auth=randomUUID(),house=randomUUID(),member=randomUUID();
 try{
  await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
  const migration='20260910150000_upload_drafts_and_hashes.sql';
  for(const name of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')&&n<migration).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1)',[auth]);await db.query("insert into momentnest.households(id,name) values($1,'旧任务迁移测试')",[house]);await db.query("insert into momentnest.members(id,household_id,auth_user_id,label) values($1,$2,$3,'爸爸')",[member,house,auth]);
  await db.query(`insert into momentnest.upload_sessions(household_id,member_id,object_key,filename,kind,expected_size,state,sha256,mime,expires_at) values($1,$2,'originals/keep-a.bin','a.jpg','image',12,'authorized',null,null,clock_timestamp()-interval '1 minute'),($1,$2,'originals/keep-b.bin','b.jpg','image',12,'verified',$3,'image/jpeg',clock_timestamp()+interval '1 minute')`,[house,member,'a'.repeat(64)]);
  await db.exec(readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
  const {rows}=await db.query<{object_key:string;state:string;sha256:string|null;batch_id:string;expires_at:Date}>('select object_key,state,sha256,batch_id,expires_at from momentnest.upload_sessions order by filename');
  expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({object_key:'originals/keep-a.bin',state:'authorized',sha256:null});expect(rows[1]).toMatchObject({object_key:'originals/keep-b.bin',state:'verified',sha256:'a'.repeat(64)});
  expect(rows.every(r=>r.batch_id&&new Date(r.expires_at).valueOf()>Date.now()+6*86400000)).toBe(true);
  for(const batchId of new Set(rows.map(r=>r.batch_id))){
   expect(draftBatchIdSchema.parse(batchId)).toBe(batchId);
   expect((await draftFiles(db,auth,batchId)).length).toBeGreaterThan(0);
   const tx:Transaction=fn=>db.transaction(fn);
   await discardDraft(tx,auth,batchId);
   expect(await draftFiles(db,auth,batchId)).toEqual([]);
  }
 }finally{await db.close();}
});
