import { MediaGallery } from '@/components/media-gallery';
import { listMedia } from '@/server/media-store';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext } from '@/server/page-context';
import { database } from '@/server/db';
import { getEvent } from '@/server/event-store';
import { uuid,DomainError } from '@/domain/events';
import { ageOn,displayTimestamp } from '@/domain/dates';
import { Header,Unavailable } from '@/components/shell';
import { Back } from '@/components/back';
export const dynamic='force-dynamic';
export default async function Detail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){
 const c=await pageContext();if(!c.ok)return <Unavailable message={c.message}/>;const {id}=await params;if(!uuid.safeParse(id).success)notFound();
 let e;try{e=await getEvent(database(),c.authId,id);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND')notFound();return <Unavailable message="暂时无法读取这段回忆"/>;}
 const saved=(await searchParams).saved==='1';return <><Header label={c.member.label}/><article className="detail panel"><Back memberId={c.member.id}/>{saved&&<p className="success" role="status">记录已保存</p>}<p className="eyebrow">{e.author}留下的回忆</p><h1>{e.title||'一个想留下的瞬间'}</h1><p>{e.occurredOn} <span className="age">{ageOn(e.occurredOn)}</span></p>{e.body&&<p className="preserve story">{e.body}</p>}{e.feeling&&<blockquote className="preserve">{e.feeling}</blockquote>}<MediaGallery eventId={id} initial={await listMedia(database(),c.authId,id)}/><div className="metadata"><p>创建于 {displayTimestamp(e.createdAt)}</p><p>最后编辑：{e.editor} · {displayTimestamp(e.updatedAt)}</p></div><Link className="button primary" href={`/events/${id}/edit`}>补充 / 编辑</Link></article></>;
}
