import {z} from 'zod';

const count=z.number().int().min(0).max(100);
export const uploadSnapshotSchema=z.object({
 pageId:z.string().uuid(),documentId:z.string().uuid(),at:z.number().int().nonnegative(),
 event:z.enum(['mount','heartbeat','hidden','visible','pagehide','pageshow','unmount','offline','online','error','unhandledrejection']),
 count,active:count,failed:count,verified:count,visible:z.boolean(),online:z.boolean(),
 navigation:z.enum(['navigate','reload','back_forward','prerender','unknown']),discarded:z.boolean().nullable(),
}).strict();
export const uploadDiagnosticSchema=z.object({current:uploadSnapshotSchema,previous:uploadSnapshotSchema.optional()}).strict();
export type UploadSnapshot=z.infer<typeof uploadSnapshotSchema>;
type Item={status:string};
let documentId:string|undefined;

// Counts only: never retain File/Blob, names, URLs, exception text or credentials.
export function monitorUploads(memberId:string,items:()=>readonly Item[]){
 documentId??=crypto.randomUUID();
 const pageId=crypto.randomUUID(),docId=documentId,key=`momentnest:upload-diagnostic:${memberId}`;
 let previous:UploadSnapshot|undefined,sent=0;
 try{const parsed=uploadSnapshotSchema.safeParse(JSON.parse(sessionStorage.getItem(key)||'null'));if(parsed.success&&Date.now()-parsed.data.at<86400000)previous=parsed.data;}catch{}
 const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
 const navigation=nav?.type||'unknown';
 function record(event:UploadSnapshot['event']){
  const list=items(),current:UploadSnapshot={pageId,documentId:docId,at:Date.now(),event,
   count:list.length,active:list.filter(i=>!['verified','failed'].includes(i.status)).length,
   failed:list.filter(i=>i.status==='failed').length,verified:list.filter(i=>i.status==='verified').length,
   visible:document.visibilityState==='visible',online:navigator.onLine,navigation,
   discarded:typeof (document as Document&{wasDiscarded?:boolean}).wasDiscarded==='boolean'?(document as Document&{wasDiscarded:boolean}).wasDiscarded:null};
  try{sessionStorage.setItem(key,JSON.stringify(current));}catch{}
  // Keep diagnostics best-effort; their failure must never interrupt uploads.
  if(event==='heartbeat'&&!current.count)return;
  if(['error','unhandledrejection'].includes(event)&&sent++>=20)return;
  try{const body=JSON.stringify({current,...(event==='mount'&&previous?{previous}:{})});
   void fetch('/api/uploads/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,signal:AbortSignal.timeout(5000)}).catch(()=>{});
  }catch{}
 }
 const listeners:[EventTarget,string,EventListener][]=[];
 const on=(target:EventTarget,name:string,run:()=>void)=>{listeners.push([target,name,run]);target.addEventListener(name,run);};
 on(document,'visibilitychange',()=>record(document.visibilityState==='visible'?'visible':'hidden'));
 for(const event of ['pagehide','pageshow','offline','online','error','unhandledrejection'] as const)on(window,event,()=>record(event));
 const timer=setInterval(()=>record('heartbeat'),15000);
 record('mount');
 return()=>{record('unmount');clearInterval(timer);for(const [target,name,run] of listeners)target.removeEventListener(name,run);};
}
