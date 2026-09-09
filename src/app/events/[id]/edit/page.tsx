import { listMedia } from '@/server/media-store';
import { notFound } from 'next/navigation';
import { pageContext } from '@/server/page-context';
import { database } from '@/server/db';
import { getEvent } from '@/server/event-store';
import { uuid,DomainError } from '@/domain/events';
import { todayShanghai } from '@/domain/dates';
import { EventEditor } from '@/components/event-editor';
import { Header,Unavailable } from '@/components/shell';
export const dynamic='force-dynamic';
export default async function Edit({params}:{params:Promise<{id:string}>}){const c=await pageContext();if(!c.ok)return <Unavailable message={c.message}/>;const {id}=await params;if(!uuid.safeParse(id).success)notFound();let initial;try{initial=await getEvent(database(),c.authId,id);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND')notFound();return <Unavailable message="暂时无法读取这段回忆"/>;}return <><Header label={c.member.label}/><EventEditor initial={initial} today={todayShanghai()} memberId={c.member.id} media={await listMedia(database(),c.authId,id,true)}/></>;}
