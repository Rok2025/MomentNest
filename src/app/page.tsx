import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireIdentity } from '@/server/auth/session';
import { appConfigured } from '@/server/config';
import { DomainError } from '@/domain/events';
import { database,prepareDatabase } from '@/server/db';
import { timed } from '@/server/timing';
import { homeData } from '@/server/event-store';
import { todayShanghai,isCalendarDate } from '@/domain/dates';
import { Unavailable } from '@/components/shell';
import { HomeJournal } from '@/components/home-journal';
export const dynamic='force-dynamic';
type HomeProps={searchParams:Promise<Record<string,string|undefined>>};
export default async function Home(props:HomeProps){
 if(!appConfigured())return <Unavailable message="还差一步：请先完成服务配置，再开始保存回忆。"/>;
 // Connection setup can overlap live Auth verification; it reads no private data.
 void prepareDatabase();
 let authId:string;
 try{authId=await timed('home.auth',requireIdentity);}catch(error){
  if(error instanceof DomainError&&error.code==='UNAUTHENTICATED')redirect('/login');
  return <Unavailable message="登录服务暂不可用，请稍后重试。"/>;
 }
 return <Suspense fallback={<HomeLoading/>}><HomeContent {...props} authId={authId}/></Suspense>;
}
function HomeLoading(){
 return <><header className="topbar"><Link className="brand" href="/">拾光记</Link></header><section className="panel empty" aria-busy="true"><p className="eyebrow">欢迎回家</p><h1>正在打开我们的回忆…</h1><p role="status">正在读取成长记录，请稍候。</p></section></>;
}
async function HomeContent({searchParams,authId}:HomeProps&{authId:string}){
 const q=await searchParams,today=todayShanghai(),range=q.start&&q.end&&isCalendarDate(q.start)&&isCalendarDate(q.end)&&q.start<=q.end?{start:q.start,end:q.end}:undefined;
 const pages=Math.max(1,Math.min(50,Number.parseInt(q.pages||'1')||1));
 let data:Awaited<ReturnType<typeof homeData>>;
 try{data=await timed('home.data',async()=>{await prepareDatabase();return homeData(database(),authId,range,pages);});}catch(error){
  return <Unavailable message={error instanceof DomainError&&error.code==='FORBIDDEN'?'此账号尚未加入家庭，或已停用。':'暂时读不到回忆，请稍后再试。'}/>;
 }
 const {member,page,days}=data;
  return <HomeJournal label={member.label} memberId={member.id} today={today} initial={page} days={days} initialRange={range} initialPages={pages} saved={q.saved==='1'}/>;
}
