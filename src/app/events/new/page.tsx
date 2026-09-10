import { pageContext } from '@/server/page-context';
import Link from 'next/link';
import { NewEventChoice } from '@/components/new-event-choice';
import { Header,Unavailable } from '@/components/shell';
export const dynamic='force-dynamic';
export default async function NewEvent(){const context=await pageContext();if(!context.ok)return <Unavailable message={context.message}/>;return <><Header label={context.member.label}/><div className="panel record-kind-page"><Link href="/">返回时间线</Link><NewEventChoice/></div></>;}
