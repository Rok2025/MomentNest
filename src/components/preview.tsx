'use client';
import { useState } from 'react';
import { Timeline } from './timeline';
import { EventEditor } from './event-editor';
import type { EventRecord } from '@/domain/events';
export function Preview({today}:{today:string}){
 const [editor,setEditor]=useState(false);
 const examples=[{title:'今天的小小发现',body:'一片落叶、一束阳光，都能让你停下来看好久。希望我们一直记得，这些平凡的小事也很珍贵。',occurredOn:today,author:'爸爸'},{title:'又学会了一件事',body:'你试了好多次，终于自己完成了。抬头看向我们的那一瞬间，眼睛里都是亮晶晶的开心。',occurredOn:today.slice(0,7)+'-01',author:'妈妈'},{title:'第一次一起看世界',body:'从抱着你的小心翼翼，到一起迎接每个普通的早晨。这是我们故事开始的地方。',occurredOn:'2025-04-17',author:'爸爸'}];
 const events:EventRecord[]=examples.map((e,i)=>({...e,id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,feeling:'',createdAt:'2025-04-17T00:00:00Z',updatedAt:'2025-04-17T00:00:00Z',version:1,editor:e.author,mediaCount:0,imageCount:0,videoCount:0,coverMediaId:null}));
 const days=Array.from(new Set(events.map(e=>e.occurredOn))).map(date=>({date,count:events.filter(e=>e.occurredOn===date).length}));
 return <><p className="notice">本地界面预览 · 以下均为虚构示例，未写入家庭数据库。<button onClick={()=>setEditor(v=>!v)}>{editor?'查看时间线':'查看记录表单'}</button></p>{editor?<EventEditor preview today={today} memberId="00000000-0000-4000-8000-000000000000"/>:<Timeline initial={{items:events,next:null}} days={days} today={today} memberId="preview" demoEvents={events}/>}</>;
}
