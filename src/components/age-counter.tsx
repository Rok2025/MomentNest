import { agePartsOn } from '@/domain/dates';
import styles from './age-counter.module.css';

export function AgeCounter({date,compact=false,subtle=false}:{date:string;compact?:boolean;subtle?:boolean}){
 const age=agePartsOn(date);
 return <dl className={`${styles.counter} ${compact?styles.compact:''} ${subtle?styles.subtle:''}`} aria-label={`又又 ${age.years} 岁 ${age.months} 个月 ${age.days} 天`}>
  <div><dt>{age.years}</dt><dd>岁</dd></div>
  <div><dt>{age.months}</dt><dd>个月</dd></div>
  <div><dt>{age.days}</dt><dd>天</dd></div>
 </dl>;
}
