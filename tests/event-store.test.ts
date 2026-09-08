import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { saveEvent,getEvent,listEvents,memberFor,homeData,heatmapCounts,type Transaction } from '../src/server/event-store';
const h='10000000-0000-4000-8000-000000000001',father='20000000-0000-4000-8000-000000000001',mother='20000000-0000-4000-8000-000000000002',other='20000000-0000-4000-8000-000000000003';
let db:PGlite;
const tx:Transaction=fn=>db.transaction(t=>fn(t));
const input=()=>({requestKey:randomUUID(),occurredOn:'2025-04-17',title:'测试回忆',body:'仅用于隔离测试',feeling:''});
beforeAll(async()=>{
 db=new PGlite();await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
 await db.exec(readFileSync(new URL('../supabase/migrations/20260907171842_m1_private_events.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20260908011410_v1_media.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2),($3)',[father,mother,other]);
 await db.query('insert into momentnest.households(id,name) values($1,$2)',[h,'隔离测试家庭']);
 await db.query('insert into momentnest.subjects(household_id) values($1)',[h]);
 await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸'),($1,$3,'妈妈')",[h,father,mother]);
});
afterAll(async()=>{await db.close();});
describe('真实PostgreSQL引擎中的迁移与事件事务（隔离测试，不是远端账号）',()=>{
 it('只允许active家庭成员',async()=>{await expect(memberFor(db,other)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(saveEvent(tx,other,input())).rejects.toMatchObject({code:'FORBIDDEN'});});
 it('创建/同键重放不重复，同键换内容拒绝',async()=>{const raw=input(),id=await saveEvent(tx,father,raw),first=await getEvent(db,father,id);expect(await saveEvent(tx,father,raw)).toBe(id);expect((await getEvent(db,father,id)).createdAt).toBe(first.createdAt);await expect(saveEvent(tx,father,{...raw,body:'different'})).rejects.toMatchObject({code:'CONFLICT'});const count=await db.query('select count(*)::int as n from momentnest.events where id=$1',[id]);expect(count.rows[0]).toEqual({n:1});});
 it('妈妈补充爸爸记录，作者/创建日不变，编辑人更新且有冲突保护',async()=>{const id=await saveEvent(tx,father,input()),first=await getEvent(db,father,id);const update={...input(),id,expectedVersion:1,body:'妈妈补充'};expect(await saveEvent(tx,mother,update)).toBe(id);expect(await saveEvent(tx,mother,update)).toBe(id);const latest=await getEvent(db,mother,id);expect(latest.author).toBe('爸爸');expect(latest.editor).toBe('妈妈');expect(latest.version).toBe(2);expect(latest.createdAt).toBe(first.createdAt);await expect(saveEvent(tx,father,{...input(),id,expectedVersion:1})).rejects.toMatchObject({code:'CONFLICT'});});
 it('日期校验拒绝未来与无效，补录按实际日排序',async()=>{await expect(saveEvent(tx,father,{...input(),occurredOn:'2026-09-09'},'2026-09-08')).rejects.toMatchObject({code:'VALIDATION'});await expect(saveEvent(tx,father,{...input(),occurredOn:'2026-02-30'},'2026-09-08')).rejects.toMatchObject({code:'VALIDATION'});const id=await saveEvent(tx,father,{...input(),occurredOn:'2026-01-01'});expect((await listEvents(db,father)).items[0].id).toBe(id);});
 it('同日分页不重不漏',async()=>{for(let i=0;i<22;i++)await saveEvent(tx,father,input());const first=await listEvents(db,father),second=await listEvents(db,father,first.next!);expect(first.items.length).toBe(20);expect(first.next).not.toBeNull();const ids=[...first.items,...second.items].map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);});
 it('保存请求失败会回滚整个事件',async()=>{const count=async()=>Number((await db.query<{n:number}>('select count(*) as n from momentnest.events')).rows[0].n);const before=await count();await expect(saveEvent(async fn=>db.transaction(async t=>{await fn(t);throw new Error('simulated transaction failure');}),father,input())).rejects.toThrow();expect(await count()).toBe(before);});
 it('成员停用后已知事件ID也不能访问',async()=>{const id=await saveEvent(tx,father,input());await db.query('update momentnest.members set active=false where auth_user_id=$1',[mother]);await expect(getEvent(db,mother,id)).rejects.toMatchObject({code:'FORBIDDEN'});await db.query('update momentnest.members set active=true where auth_user_id=$1',[mother]);});
 it('非公开schema、运行角色无删除/成员写入/DDL，但允许保存',async()=>{const result=await db.query("select has_schema_privilege('anon','momentnest','usage') as anon,has_table_privilege('momentnest_app','momentnest.events','delete') as del,has_table_privilege('momentnest_app','momentnest.members','update') as member_update,has_schema_privilege('momentnest_app','momentnest','create') as ddl");expect(result.rows[0]).toEqual({anon:false,del:false,member_update:false,ddl:false});await db.exec('set role momentnest_app');try{await saveEvent(tx,father,input());}finally{await db.exec('reset role');}});
 it('仅爸爸启用时可以独立保存，无需妈妈账号',async()=>{await db.query('update momentnest.members set active=false where auth_user_id=$1',[mother]);try{const id=await saveEvent(tx,father,input());expect((await getEvent(db,father,id)).author).toBe('爸爸');}finally{await db.query('update momentnest.members set active=true where auth_user_id=$1',[mother]);}});
 it('数据库本身禁止更改作者和创建时间',async()=>{const id=await saveEvent(tx,father,input());await expect(db.query("update momentnest.events set created_at=created_at+interval '1 day',version=version+1 where id=$1",[id])).rejects.toThrow('immutable event identity');});
 it('首页合并读取与原分页/热力图一致，只查询一次成员',async()=>{
  const queries:string[]=[];
  const counted={query:async(sql:string,values?:unknown[])=>{queries.push(sql);return db.query<Record<string,unknown>>(sql,values);}};
  const range={start:'2025-04-17',end:'2025-04-17'};
  const data=await homeData(counted,father,range,2);
  const first=await listEvents(db,father,undefined,range),second=await listEvents(db,father,first.next!,range);
  expect(data.page).toEqual({items:[...first.items,...second.items],next:second.next});
  expect(data.days).toEqual(await heatmapCounts(db,father));
  expect(data.member.label).toBe('爸爸');
  expect(queries.filter(sql=>sql.includes('auth_user_id=$1'))).toHaveLength(1);
  expect(queries).toHaveLength(4);
 });
 it('首页不会跨请求缓存权限，停用成员后立即拒绝且不读取回忆',async()=>{
  await homeData(db,mother);
  await db.query('update momentnest.members set active=false where auth_user_id=$1',[mother]);
  const queries:string[]=[];
  const counted={query:async(sql:string,values?:unknown[])=>{queries.push(sql);return db.query<Record<string,unknown>>(sql,values);}};
  try{
   await expect(homeData(counted,mother)).rejects.toMatchObject({code:'FORBIDDEN'});
   expect(queries).toHaveLength(1);
   await expect(homeData(db,other)).rejects.toMatchObject({code:'FORBIDDEN'});
  }finally{await db.query('update momentnest.members set active=true where auth_user_id=$1',[mother]);}
 });
 it('首页数据与热力图都按家庭隔离',async()=>{
  const otherHouse=randomUUID();
  await db.query('insert into momentnest.households(id,name) values($1,$2)',[otherHouse,'另一家庭']);
  await db.query('insert into momentnest.subjects(household_id) values($1)',[otherHouse]);
  await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸')",[otherHouse,other]);
  const id=await saveEvent(tx,other,{...input(),occurredOn:'2026-02-02'});
  const theirs=await homeData(db,other),ours=await homeData(db,father);
  expect(theirs.page.items.map(e=>e.id)).toEqual([id]);
  expect(theirs.days).toEqual([{date:'2026-02-02',count:1}]);
  expect(ours.page.items.some(e=>e.id===id)).toBe(false);
  expect(ours.days.some(d=>d.date==='2026-02-02')).toBe(false);
 });
});
