import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {authorizeDraft,draftBatches,draftFiles,discardDraft,draftDate} from '../src/server/upload-drafts';
import {completeUpload,authorizeUpload,cancelUpload} from '../src/server/media-store';
import {saveEvent,type Transaction} from '../src/server/event-store';
import {claimExpired} from '../src/server/job-store';
let db:PGlite;const father=randomUUID(),mother=randomUUID(),outsider=randomUUID(),home=randomUUID();
const tx:Transaction=fn=>db.transaction(t=>fn(t));
const selection=(sha:string,extra={})=>({name:'photo.jpg',size:12,sha256:sha.repeat(64),requestKey:randomUUID(),batchId:randomUUID(),lastModified:123,...extra});
const evidence=(sha:string)=>({sha256:sha.repeat(64),size:12,kind:'image',mime:'image/jpeg'});
const save=(id:string)=>({requestKey:randomUUID(),occurredOn:'2025-08-16',title:'',body:'',feeling:'',uploadIds:[id]});
beforeAll(async()=>{
 db=new PGlite();await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
 for(const f of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2),($3)',[father,mother,outsider]);await db.query('insert into momentnest.households(id,name) values($1,$2)',[home,'恢复测试']);await db.query('insert into momentnest.subjects(household_id) values($1)',[home]);await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸'),($1,$3,'妈妈')",[home,father,mother]);
});
afterAll(async()=>db.close());
describe('recoverable content-addressed uploads',()=>{
 it('同一请求重放与改名重选复用同一个任务，不能伪造客户端哈希',async()=>{
  const input=selection('1'),a=await authorizeDraft(tx,father,input),b=await authorizeDraft(tx,father,input);
  expect(b.upload!.id).toBe(a.upload!.id);
  expect((await authorizeDraft(tx,father,{...input,requestKey:randomUUID(),name:'renamed.jpg'})).upload!.id).toBe(a.upload!.id);
  await expect(completeUpload(tx,father,String(a.upload!.id),evidence('2'))).rejects.toMatchObject({code:'VALIDATION'});
  await completeUpload(tx,father,String(a.upload!.id),evidence('1'));
  expect((await authorizeDraft(tx,father,{...input,requestKey:randomUUID()})).upload!.state).toBe('verified');
  await expect(authorizeDraft(tx,father,{...input,sha256:'2'.repeat(64)})).rejects.toMatchObject({code:'CONFLICT'});
 });
 it('保存后的同一内容返回原回忆入口，家庭内可识别、家庭外不能读取',async()=>{
  const input=selection('3'),a=await authorizeDraft(tx,father,input),id=String(a.upload!.id);
  await completeUpload(tx,father,id,evidence('3'));const eventId=await saveEvent(tx,father,save(id));
  const r=await authorizeDraft(tx,mother,{...input,name:'other-name.jpg',requestKey:randomUUID()});expect(r.duplicate).toEqual({eventId,occurredOn:'2025-08-16'});
  await expect(authorizeDraft(tx,outsider,input)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('刷新后恢复同一批文件和手动日期，不能访问或放弃另一成员的草稿',async()=>{
  const input=selection('4'),a=await authorizeDraft(tx,father,input),id=String(a.upload!.id);
  await completeUpload(tx,father,id,evidence('4'));
  await db.exec('set role momentnest_app');
  try{
   await draftDate(tx,father,id,'2025-08-17');
   const batch=(await draftBatches(db,father)).find(b=>b.id===input.batchId)!;expect(batch).toMatchObject({count:1,verified:1});expect(Date.parse(batch.expiresAt)-Date.now()).toBeGreaterThan(6*86400000);
   expect(await draftFiles(db,father,input.batchId)).toMatchObject([{id,archiveDate:'2025-08-17',state:'verified',sha256:'4'.repeat(64)}]);
   expect(await draftFiles(db,mother,input.batchId)).toEqual([]);await discardDraft(tx,mother,input.batchId);
   expect(await draftFiles(db,father,input.batchId)).toHaveLength(1);
  }finally{await db.exec('reset role');}
 });
 it('放弃只取消该批未保存素材，保存后的原件不进入清理',async()=>{
  const input=selection('5'),a=await authorizeDraft(tx,father,input),id=String(a.upload!.id);
  await discardDraft(tx,father,input.batchId);expect(await draftFiles(db,father,input.batchId)).toEqual([]);
  expect((await db.query('select state from momentnest.upload_sessions where id=$1',[id])).rows[0]).toEqual({state:'cancelled'});
  await db.query("update momentnest.upload_sessions set expires_at=clock_timestamp()-interval '1 minute' where id=$1 or state='bound'",[id]);
  const expired=await claimExpired(tx);expect(expired.map(u=>u.id)).toContain(id);
  expect(expired).toHaveLength(1);
  expect((await db.query<{n:number}>("select count(*)::int as n from momentnest.upload_sessions where state='bound'")).rows[0].n).toBe(1);
 });
 it('旧流程或并发重复上传即使完成验证，保存事务也不能重复收录',async()=>{
  const a=await authorizeUpload(tx,father,{name:'duplicate.jpg',size:12});await completeUpload(tx,father,String(a.id),evidence('3'));
  await expect(saveEvent(tx,father,save(String(a.id)))).rejects.toMatchObject({code:'CONFLICT'});
  await cancelUpload(tx,father,String(a.id));
  const b=await authorizeUpload(tx,father,{name:'b.jpg',size:12}),c=await authorizeUpload(tx,father,{name:'c.jpg',size:12});
  await completeUpload(tx,father,String(b.id),evidence('6'));await completeUpload(tx,father,String(c.id),evidence('6'));
  await expect(saveEvent(tx,father,{...save(String(b.id)),uploadIds:[String(b.id),String(c.id)]})).rejects.toMatchObject({code:'VALIDATION'});
 });
 it('临时容量保护不受文件数影响，并明确返回容量错误',async()=>{
  const m=(await db.query<{id:string}>('select id from momentnest.members where auth_user_id=$1',[mother])).rows[0];
  await db.query(`insert into momentnest.upload_sessions(household_id,member_id,object_key,filename,kind,expected_size) select $1,$2,'originals/large-'||n||'.bin','large.mp4','video',1073741824 from generate_series(1,10) n`,[home,m.id]);
  await expect(authorizeDraft(tx,mother,selection('7'))).rejects.toThrow('10 GB');
 });
});
