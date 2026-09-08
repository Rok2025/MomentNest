import Link from 'next/link';
import { ageOn } from '@/domain/dates';

export function HomeIntro({today}:{today:string}){
 return <section className="home-intro" aria-label="成长手账">
  <div><div className="home-title"><h1>又又的成长手账</h1><span className="age">又又今天 {ageOn(today)}</span></div><p>把舍不得忘记的，慢慢留下来。</p></div>
  <Link className="button primary" href="/events/new">＋ 记下一刻</Link>
 </section>;
}
