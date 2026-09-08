import { pageContext } from '@/server/page-context';
import { todayShanghai } from '@/domain/dates';
import { EventEditor } from '@/components/event-editor';
import { Header,Unavailable } from '@/components/shell';
export const dynamic='force-dynamic';
export default async function NewEvent(){const context=await pageContext();if(!context.ok)return <Unavailable message={context.message}/>;return <><Header label={context.member.label}/><EventEditor today={todayShanghai()} memberId={context.member.id}/></>;}
