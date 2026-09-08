import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireIdentity } from '@/server/auth/session';
import { appConfigured } from '@/server/config';
import { DomainError } from '@/domain/events';
import { database } from '@/server/db';
import { homeData } from '@/server/event-store';
import { todayShanghai,isCalendarDate,ageOn } from '@/domain/dates';
import { Header,Unavailable } from '@/components/shell';
import { Timeline } from '@/components/timeline';
export const dynamic='force-dynamic';
type HomeProps={searchParams:Promise<Record<string,string|undefined>>};
export default async function Home(props:HomeProps){
 if(!appConfigured())return <Unavailable message="还差一步：请先完成服务配置，再开始保存回忆。"/>;
 let authId:string;
 try{authId=await requireIdentity();}catch(error){
  if(error instanceof DomainError&&error.code==='UNAUTHENTICATED')redirect('/login');
  return <Unavailable message="登录服务暂不可用，请稍后重试。"/>;
 }
 return <Suspense fallback={<HomeLoading/>}><HomeContent {...props} authId={authId}/></Suspense>;
}
function HomeLoading(){
 return <><header className="topbar"><Link className="brand" href="/">MomentNest<span>又又的成长手账</span></Link></header><section className="panel empty" aria-busy="true"><p className="eyebrow">欢迎回家</p><h1>正在打开我们的回忆…</h1><p role="status">正在读取成长记录，请稍候。</p></section></>;
}
async function HomeContent({searchParams,authId}:HomeProps&{authId:string}){
 const q=await searchParams,today=todayShanghai(),range=q.start&&q.end&&isCalendarDate(q.start)&&isCalendarDate(q.end)&&q.start<=q.end?{start:q.start,end:q.end}:undefined;
 const pages=Math.max(1,Math.min(50,Number.parseInt(q.pages||'1')||1));
 let data:Awaited<ReturnType<typeof homeData>>;
 try{data=await homeData(database(),authId,range,pages);}catch(error){
  return <Unavailable message={error instanceof DomainError&&error.code==='FORBIDDEN'?'此账号尚未加入家庭，或已停用。':'暂时读不到回忆，请稍后再试。'}/>;
 }
 const {member,page,days}=data;
  return <><Header label={member.label}/><section className="intro"><div><p className="eyebrow">OUR LITTLE DAYS · 又又的成长手账</p><h1>把舍不得忘记的，<br/><em>慢慢留下来。</em></h1><p>记录孩子的小小成长，也收藏爸爸妈妈当时的心情。</p><div className="intro-actions"><Link className="button primary" href="/events/new">＋ 记下一刻</Link><span className="age">又又今天 {ageOn(today)}</span></div></div><div className="intro-decoration" aria-hidden="true"><span>✦</span><p>little moments<br/>big memories</p><small>EST. 2025.04.17</small></div></section>{q.saved==='1'&&<p className="success" role="status">记录已保存。照片与视频原件已收好，预览如需处理会在后台继续。</p>}<Timeline initial={page} days={days} today={today} memberId={member.id} initialRange={range} initialPages={pages}/></>;
}
