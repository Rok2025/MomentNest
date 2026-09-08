import Link from 'next/link';
import { pageContext } from '@/server/page-context';
import { database } from '@/server/db';
import { listEvents } from '@/server/event-store';
import { heatmapCounts } from '@/server/heatmap-store';
import { todayShanghai,isCalendarDate,ageOn } from '@/domain/dates';
import { Header,Unavailable } from '@/components/shell';
import { Timeline } from '@/components/timeline';
export const dynamic='force-dynamic';
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const c=await pageContext();if(!c.ok)return <Unavailable message={c.message}/>;
 const q=await searchParams,today=todayShanghai(),range=q.start&&q.end&&isCalendarDate(q.start)&&isCalendarDate(q.end)&&q.start<=q.end?{start:q.start,end:q.end}:undefined;
 const pages=Math.max(1,Math.min(50,Number.parseInt(q.pages||'1')||1));
 let page:Awaited<ReturnType<typeof listEvents>>,days:Awaited<ReturnType<typeof heatmapCounts>>;
 try{
  const result=await Promise.all([listEvents(database(),c.authId,undefined,range),heatmapCounts(database(),c.authId)]);
  page=result[0];days=result[1];for(let i=1;i<pages&&page.next;i++){const next=await listEvents(database(),c.authId,page.next,range);page={items:[...page.items,...next.items],next:next.next};}
 }catch{return <Unavailable message="暂时读不到回忆，请稍后再试。"/>;}
  return <><Header label={c.member.label}/><section className="intro"><div><p className="eyebrow">OUR LITTLE DAYS · 又又的成长手账</p><h1>把舍不得忘记的，<br/><em>慢慢留下来。</em></h1><p>记录孩子的小小成长，也收藏爸爸妈妈当时的心情。</p><div className="intro-actions"><Link className="button primary" href="/events/new">＋ 记下一刻</Link><span className="age">又又今天 {ageOn(today)}</span></div></div><div className="intro-decoration" aria-hidden="true"><span>✦</span><p>little moments<br/>big memories</p><small>EST. 2025.04.17</small></div></section>{q.saved==='1'&&<p className="success" role="status">记录已保存。照片与视频原件已收好，预览如需处理会在后台继续。</p>}<Timeline initial={page} days={days} today={today} memberId={c.member.id} initialRange={range} initialPages={pages}/></>;
}
