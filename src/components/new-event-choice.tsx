'use client';

import { useId, useState } from 'react';
import Link from 'next/link';

export function NewEventChoice({onContinue}:{onContinue?:()=>void}) {
  const [kind,setKind]=useState<'media'|'text'>('media');
  const group=useId();
  return <section className="new-event-choice" aria-label="选择记录方式">
    <h1>选择记录方式</h1>
    <p className="muted">收藏照片和视频，或写下这一刻的心情。</p>
    <fieldset className="record-kind-options">
      <legend className="sr-only">记录类型</legend>
      <label className="record-kind-option">
        <input type="radio" name={group} value="media" checked={kind==='media'} onChange={()=>setKind('media')}/>
        <span><strong>图片 / 视频</strong><small>上传照片和视频，按拍摄日期归档</small></span>
      </label>
      <label className="record-kind-option">
        <input type="radio" name={group} value="text" checked={kind==='text'} onChange={()=>setKind('text')}/>
        <span><strong>文字</strong><small>用文字记下故事、心情和小小成长</small></span>
      </label>
    </fieldset>
    <Link className="button primary record-kind-continue" href={`/events/new/${kind}`} onClick={onContinue}>{kind==='media'?'添加图片 / 视频':'添加文字'} →</Link>
  </section>;
}
