'use client';
import { useEffect,useState,useRef } from 'react';
import { mediaPending,mediaStatusText,reusePreview,type MediaRecord,type PreviewLinks } from '@/domain/media';
import { pollWhileVisible } from '@/domain/visible-poll';
import { formatCaptureTime } from '@/domain/capture-date';
async function getLink(id:string,variant:string):Promise<{url:string;preview?:PreviewLinks}>{
 const r=await fetch(`/api/media/${id}/url`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variant}),cache:'no-store'});
 if(!r.ok)throw Error('素材暂不可用，请重新登录或稍后重试');
 return r.json();
}
export function MediaView({media,compact=false,priority=false,onRetry}:{media:MediaRecord;compact?:boolean;priority?:boolean;onRetry?:()=>void}){
 const [renewed,setRenewed]=useState<{source:string|undefined;links:PreviewLinks}|null>(null);
 const preview=renewed&&renewed.source===media.preview?.url?renewed.links:media.preview;
 const [playback,setPlayback]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const video=useRef<HTMLVideoElement>(null),resume=useRef(0),attempted=useRef('');
 async function refreshPreview(){
  try{const data=await getLink(media.id,'preview');if(data.preview)setRenewed({source:media.preview?.url,links:data.preview});setError('');}
  catch{setError('预览暂不可用，请稍后重试');}
 }
 function imageError(){
  if(preview&&attempted.current!==preview.url&&preview.expiresAt<=Date.now()+1000){attempted.current=preview.url;void refreshPreview();}
  else setError('预览加载失败，请刷新重试');
 }
 async function play(){setBusy(true);setError('');try{resume.current=video.current?.currentTime||0;setPlayback((await getLink(media.id,'playback')).url);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function retry(){
  setBusy(true);setError('');
  try{const r=await fetch(`/api/media/${media.id}/retry`,{method:'POST'});if(!r.ok)throw Error();onRetry?.();}
  catch{setError('重试失败，请稍后再试');}finally{setBusy(false);}
 }
 const status=mediaStatusText(media);
 return <figure className={`media-item ${compact?'compact':''}`}>
  {media.kind==='video'&&playback&&!compact?
   <video ref={video} src={playback} poster={preview?.url} controls playsInline preload="metadata" onLoadedMetadata={()=>{if(video.current&&resume.current)video.current.currentTime=resume.current;}} onError={()=>setError('播放链接可能已过期，请刷新播放链接后继续。')}/>:
   preview?
    // Private, pre-generated variants use browser srcSet; do not pass signed URLs through a public image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={preview.url} srcSet={preview.srcSet} sizes={compact?'(max-width: 650px) calc(100vw - 104px), (max-width: 1120px) 40vw, 450px':'(max-width: 650px) calc(100vw - 74px), 760px'} width={preview.width} height={preview.height} alt={compact?'回忆封面':media.filename} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async" onError={imageError}/>:
    <div className="media-placeholder"><span aria-hidden="true">{media.kind==='video'?'▷':'▧'}</span><p role="status">{status}</p></div>}
  {compact&&media.kind==='video'&&<span className="video-badge">▷ {media.status==='ready'?'视频':status}</span>}
  {compact&&error&&<span className="media-load-error">预览暂不可用，点开重试</span>}
  {!compact&&<figcaption><strong>{media.filename}</strong>
   {preview&&media.status!=='ready'&&<p className="media-processing" role="status">{status}</p>}
   <p className="muted">拍摄时间：{formatCaptureTime(media.capturedText,media.capturedZone)}</p><div className="media-actions">
    {media.kind==='video'&&media.hasPlayback&&<button type="button" disabled={busy} onClick={()=>void play()}>{playback?'刷新播放链接':'加载视频'} ▷</button>}
    <button type="button" onClick={()=>void getLink(media.id,'original').then(data=>window.location.assign(data.url)).catch(()=>setError('原件暂不可用，请稍后重试'))}>下载原件</button>
    {media.status==='failed'&&<button type="button" disabled={busy} onClick={()=>void retry()}>重新处理</button>}
   </div>{error&&<p role="status">{error} <button type="button" onClick={()=>void refreshPreview()}>刷新预览</button></p>}
  </figcaption>}
 </figure>;
}
export function MediaGallery({eventId,initial}:{eventId:string;initial:MediaRecord[]}){
 const [media,setMedia]=useState(initial),[previous,setPrevious]=useState(initial);
 if(previous!==initial){setPrevious(initial);setMedia(initial);}
 const pending=media.some(mediaPending);
 useEffect(()=>{
  if(!pending)return;
  return pollWhileVisible(async signal=>{
   const r=await fetch(`/api/events/${eventId}/media`,{cache:'no-store',signal});
   if(r.ok){const next:MediaRecord[]=await r.json();if(!signal.aborted)setMedia(current=>{const byId=new Map(current.map(m=>[m.id,m]));return next.map(m=>reusePreview(byId.get(m.id),m));});}
  });
 },[eventId,pending]);
 if(!media.length)return null;
 return <section className="gallery" aria-label="完整照片与视频"><h2>这一刻的画面 <small>{media.length} 份</small></h2>{media.map((m,i)=><MediaView key={m.id} media={m} priority={i===0} onRetry={()=>setMedia(current=>current.map(item=>item.id===m.id?{...item,status:'pending',errorCode:null}:item))}/>)}</section>;
}
export function Cover({media,priority=false}:{media?:MediaRecord|null;priority?:boolean}){
 return media?<MediaView media={media} compact priority={priority}/>:null;
}
