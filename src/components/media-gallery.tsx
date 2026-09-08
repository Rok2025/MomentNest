'use client';
import Image from 'next/image';
import { useEffect,useState,useRef } from 'react';
import type { MediaRecord } from '@/domain/media';
async function getUrl(id:string,variant:string){const r=await fetch(`/api/media/${id}/url`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variant}),cache:'no-store'});if(!r.ok)throw Error('素材暂不可用，请重新登录或稍后重试');return (await r.json()).url as string;}
export function MediaView({media,compact=false}:{media:MediaRecord;compact?:boolean}){
 const [preview,setPreview]=useState(''),[playback,setPlayback]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const [refresh,setRefresh]=useState(0);const video=useRef<HTMLVideoElement>(null),resume=useRef(0);
 useEffect(()=>{let alive=true;if(media.hasPreview)void getUrl(media.id,'preview').then(u=>{if(alive)setPreview(u);}).catch(()=>{if(alive)setError('预览暂不可用');});return()=>{alive=false;};},[media.id,media.hasPreview,refresh]);
 async function play(){setBusy(true);setError('');try{resume.current=video.current?.currentTime||0;setPlayback(await getUrl(media.id,'playback'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <figure className={`media-item ${compact?'compact':''}`}>
  {media.kind==='video'&&playback&&!compact?<video ref={video} src={playback} poster={preview||undefined} controls playsInline preload="metadata" onLoadedMetadata={()=>{if(video.current&&resume.current)video.current.currentTime=resume.current;}} onError={()=>setError('播放链接可能已过期，请刷新播放链接后继续。')}/>:preview?<Image unoptimized width={1920} height={1280} src={preview} alt={compact?'回忆封面':media.filename} loading="lazy" onError={()=>setError('预览链接已过期，可刷新重试')}/>:<div className="media-placeholder"><span>{media.kind==='video'?'▷':'▧'}</span><p>{media.status==='failed'?'原件已保存，预览处理失败':media.status==='ready'?'预览加载中':'原件已保存，正在处理'}</p></div>}
  {compact&&media.kind==='video'&&<span className="video-badge">▷ 视频</span>}
  {!compact&&<figcaption><strong>{media.filename}</strong><p className="muted">拍摄时间：{media.capturedText||'未知'}{media.capturedText?`（${media.capturedZone||'时区未知'}）`:''}</p><div className="media-actions">
   {media.kind==='video'&&media.hasPlayback&&<button type="button" disabled={busy} onClick={()=>void play()}>{playback?'刷新播放链接':'加载视频'} ▷</button>}
   <button type="button" onClick={()=>void getUrl(media.id,'original').then(u=>{window.location.assign(u);}).catch(()=>setError('原件暂不可用，请稍后重试'))}>下载原件</button>
   {media.status==='failed'&&<button type="button" onClick={()=>void fetch(`/api/media/${media.id}/retry`,{method:'POST'}).then(r=>setError(r.ok?'已安排重新处理':'重试失败，请稍后再试'))}>重新处理</button>}
  </div>{error&&<p role="status">{error} <button type="button" onClick={()=>{setRefresh(n=>n+1);setError('');}}>刷新预览</button></p>}</figcaption>}
 </figure>;
}
export function MediaGallery({eventId,initial}:{eventId:string;initial:MediaRecord[]}){
 const [media,setMedia]=useState(initial);
 useEffect(()=>{const controller=new AbortController();const id=setInterval(()=>{void fetch(`/api/events/${eventId}/media`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(r.ok)setMedia(await r.json());}).catch(()=>{});},6000);return()=>{clearInterval(id);controller.abort();};},[eventId]);
 if(!media.length)return null;return <section className="gallery" aria-label="完整照片与视频"><h2>这一刻的画面 <small>{media.length} 份</small></h2>{media.map(m=><MediaView key={m.id} media={m}/>)}</section>;
}
export function Cover({eventId,id}:{eventId:string;id:string|null}){
 const [media,setMedia]=useState<MediaRecord|null>(null);
 useEffect(()=>{
  const c=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  async function refresh(){try{const r=await fetch(`/api/events/${eventId}/media`,{cache:'no-store',signal:c.signal});if(!r.ok)return;const list:MediaRecord[]=await r.json();const cover=list.find(m=>m.id===id)||list[0]||null;setMedia(cover);if(cover&&['pending','processing'].includes(cover.status))timer=setTimeout(()=>void refresh(),6000);}catch{}}
  void refresh();return()=>{c.abort();if(timer)clearTimeout(timer);};
 },[eventId,id]);
 return media?<MediaView media={media} compact/>:null;
}
