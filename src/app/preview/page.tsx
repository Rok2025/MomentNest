import { notFound } from 'next/navigation';
import { Preview } from '@/components/preview';
import { Header } from '@/components/shell';
import { todayShanghai } from '@/domain/dates';
export const dynamic='force-dynamic';
export default function PreviewPage(){if(process.env.MOMENTNEST_PREVIEW!=='1')notFound();return <><Header/><section className="intro"><div><p className="eyebrow">OUR LITTLE DAYS · 又又的成长手账</p><h1>把舍不得忘记的，<br/><em>慢慢留下来。</em></h1><p>记录孩子的小小成长，也收藏爸爸妈妈当时的心情。</p></div><div className="intro-decoration" aria-hidden="true"><span>✦</span><p>little moments<br/>big memories</p><small>EST. 2025.04.17</small></div></section><Preview today={todayShanghai()}/></>;}
