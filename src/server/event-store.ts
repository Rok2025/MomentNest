import { lockUploads,bindUploads } from './media-store';
import { createHash } from 'node:crypto';
import { DomainError, inputSchema, type EventRecord, type Member } from '../domain/events';
import { validEventDate, todayShanghai } from '../domain/dates';
export interface Queryable { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
export type Transaction = <T>(fn: (db: Queryable) => Promise<T>) => Promise<T>;
export async function memberFor(db: Queryable, authId: string): Promise<Member> {
  const { rows } = await db.query('select id, household_id, label from momentnest.members where auth_user_id=$1 and active=true', [authId]);
  if (rows.length !== 1) throw new DomainError('FORBIDDEN', '此账号尚未加入家庭，或已停用');
  return { id: String(rows[0].id), householdId: String(rows[0].household_id), label: rows[0].label as Member['label'] };
}
const selection = `select e.id,e.title,e.body,e.feeling,e.occurred_on::text as occurred_on,e.created_at,e.updated_at,e.version,e.media_count,e.cover_media_id,(select count(*)::int from momentnest.media m where m.household_id=e.household_id and m.event_id=e.id and m.kind='image') as image_count,(select count(*)::int from momentnest.media m where m.household_id=e.household_id and m.event_id=e.id and m.kind='video') as video_count,a.label as author,u.label as editor
 from momentnest.events e join momentnest.members a on a.id=e.author_member_id join momentnest.members u on u.id=e.updated_by`;
function record(row: Record<string, unknown>): EventRecord {
  return { id:String(row.id),title:String(row.title),body:String(row.body),feeling:String(row.feeling),occurredOn:String(row.occurred_on),createdAt:new Date(String(row.created_at)).toISOString(),updatedAt:new Date(String(row.updated_at)).toISOString(),author:String(row.author),editor:String(row.editor),version:Number(row.version),mediaCount:Number(row.media_count||0),imageCount:Number(row.image_count||0),videoCount:Number(row.video_count||0),coverMediaId:row.cover_media_id?String(row.cover_media_id):null };
}
export async function getEvent(db: Queryable, authId: string, id: string): Promise<EventRecord> {
  const m = await memberFor(db, authId);
  const { rows } = await db.query(`${selection} where e.household_id=$1 and e.id=$2`, [m.householdId,id]);
  if (!rows[0]) throw new DomainError('NOT_FOUND','没有找到这条回忆');
  return record(rows[0]);
}
export type Cursor = { date: string; createdAt: string; id: string };
export async function listEvents(db: Queryable, authId: string, cursor?: Cursor, range?: {start:string;end:string}) {
  const m = await memberFor(db,authId);
  const values: unknown[] = [m.householdId];
  let after = '';
  if(cursor) { after=' and (e.occurred_on,e.created_at,e.id)<($2::date,$3::timestamptz,$4::uuid)'; values.push(cursor.date,cursor.createdAt,cursor.id); }
  if(range){const n=values.length;values.push(range.start,range.end);after+=` and e.occurred_on between $${n+1}::date and $${n+2}::date`;}
  const { rows }=await db.query(`${selection} where e.household_id=$1${after} order by e.occurred_on desc,e.created_at desc,e.id desc limit 21`,values);
  const items=rows.slice(0,20).map(record),last=items.at(-1);
  return { items, next: rows.length>20 && last ? { date:last.occurredOn,createdAt:last.createdAt,id:last.id } : null };
}
export async function saveEvent(transaction: Transaction, authId: string, raw: unknown, today=todayShanghai()): Promise<string> {
  // Shape validation first; replay a known successful operation before checking a moving 'today'.
  const input=inputSchema.parse(raw);
  const payloadHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return transaction(async db=>{
    const m=await memberFor(db,authId);
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${m.householdId}:${m.id}:${input.requestKey}`]);
    const prior=await db.query('select payload_hash,event_id from momentnest.save_requests where household_id=$1 and member_id=$2 and request_key=$3',[m.householdId,m.id,input.requestKey]);
    if(prior.rows[0]) {
      if(prior.rows[0].payload_hash!==payloadHash) throw new DomainError('CONFLICT','这次保存的内容已变化，请先查看已保存结果');
      return String(prior.rows[0].event_id);
    }
    if(!validEventDate(input.occurredOn,today)) throw new DomainError('VALIDATION','发生日期须在2025年4月17日至北京时间今天之间');
    const uploads=await lockUploads(db,m,input.uploadIds);
    let offset=0;let id: string;
    if(input.id) {
      const current=await db.query('select media_count from momentnest.events where household_id=$1 and id=$2 for update',[m.householdId,input.id]);
      if(!current.rows[0])throw new DomainError('NOT_FOUND','没有找到这条回忆');
      offset=Number(current.rows[0].media_count);
      if(offset+uploads.length>20)throw new DomainError('VALIDATION','每条回忆最多20份素材');
      if(!input.body&&!input.feeling&&!offset&&!uploads.length)throw new DomainError('VALIDATION','记录不能是空的');
      if(input.coverMediaId){const cover=await db.query('select id from momentnest.media where household_id=$1 and event_id=$2 and id=$3',[m.householdId,input.id,input.coverMediaId]);if(!cover.rows[0])throw new DomainError('VALIDATION','封面必须属于这条回忆');}
      const result=await db.query(`update momentnest.events set title=$1,body=$2,feeling=$3,occurred_on=$4,updated_by=$5,version=version+1,media_count=$9,cover_media_id=case when $10::boolean then $11::uuid else cover_media_id end where household_id=$6 and id=$7 and version=$8 returning id`,[input.title,input.body,input.feeling,input.occurredOn,m.id,m.householdId,input.id,input.expectedVersion,offset+uploads.length,input.coverMediaId!==undefined,input.coverMediaId||null]);
      if(!result.rows[0]) {
        const exists=await db.query('select id from momentnest.events where household_id=$1 and id=$2',[m.householdId,input.id]);
        throw new DomainError(exists.rows[0]?'CONFLICT':'NOT_FOUND',exists.rows[0]?'另一位家长已修改，请查看最新内容；你的输入仍保留':'没有找到这条回忆');
      }
      id=String(result.rows[0].id);
    } else {
      const result=await db.query(`insert into momentnest.events(household_id,subject_id,author_member_id,updated_by,title,body,feeling,occurred_on,media_count)
       select $1,s.id,$2,$2,$3,$4,$5,$6,$7 from momentnest.subjects s where s.household_id=$1 returning id`,[m.householdId,m.id,input.title,input.body,input.feeling,input.occurredOn,uploads.length]);
      if(result.rows.length!==1) throw new DomainError('UNAVAILABLE','家庭资料尚未初始化');
      id=String(result.rows[0].id);
    }
    await bindUploads(db,m,id,uploads,offset);
    await db.query('insert into momentnest.save_requests(household_id,member_id,request_key,payload_hash,event_id) values($1,$2,$3,$4,$5)',[m.householdId,m.id,input.requestKey,payloadHash,id]);
    return id;
  });
}
