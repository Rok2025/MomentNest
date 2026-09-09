export const MAX_FILES=20;
export const MAX_IMAGE_BYTES=50*1024*1024;
export const MAX_VIDEO_BYTES=500*1024*1024;
export type MediaKind='image'|'video';
export type PreviewLinks={url:string;srcSet?:string;width:number;height:number;expiresAt:number;revision:string};
export type MediaRecord={id:string;eventId:string;filename:string;kind:MediaKind;mime:string;size:number;position:number;status:'pending'|'processing'|'ready'|'failed';capturedText:string|null;capturedZone:string|null;errorCode:string|null;hasPreview:boolean;hasPlayback:boolean;preview?:PreviewLinks};
export function mediaPending(media:MediaRecord){return media.status==='pending'||media.status==='processing';}
// Keep unchanged, still-valid image URLs during status polling to avoid redownloading them.
export function reusePreview(previous:MediaRecord|undefined|null,next:MediaRecord,now=Date.now()):MediaRecord{
 if(previous?.id===next.id&&previous.preview&&next.preview&&previous.preview.revision===next.preview.revision&&previous.preview.expiresAt>now+30000)return {...next,preview:previous.preview};
 return next;
}
export function mediaStatusText(media:MediaRecord){
 if(media.status==='failed')return media.hasPreview?'封面已生成，播放版处理失败':'原件已保存，预览处理失败';
 if(media.status==='pending')return media.hasPreview?'封面已生成，等待生成播放版':'原件已保存，等待处理';
 if(media.status==='processing')return media.kind==='video'?(media.hasPreview?'封面已生成，正在生成播放版':'正在生成视频封面'):'正在生成照片预览';
 return '预览加载中';
}
export function fileKind(name:string):MediaKind|null{if(/\.(jpe?g|png|webp|heic|heif)$/i.test(name))return 'image';if(/\.(mp4|mov|m4v)$/i.test(name))return 'video';return null;}
export function fileProblem(name:string,size:number):string|null{const kind=fileKind(name);if(!kind)return '支持 JPEG、PNG、WebP、HEIC/HEIF 照片与 MOV/MP4 视频';if(size<=0)return '文件为空';if(size>(kind==='image'?MAX_IMAGE_BYTES:MAX_VIDEO_BYTES))return kind==='image'?'照片不能超过50 MB':'视频不能超过500 MB';return null;}
