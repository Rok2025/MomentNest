export const MAX_FILES=20;
export const MAX_IMAGE_BYTES=50*1024*1024;
export const MAX_VIDEO_BYTES=500*1024*1024;
export type MediaKind='image'|'video';
export type MediaRecord={id:string;eventId:string;filename:string;kind:MediaKind;mime:string;size:number;position:number;status:'pending'|'processing'|'ready'|'failed';capturedText:string|null;capturedZone:string|null;errorCode:string|null;hasPreview:boolean;hasPlayback:boolean};
export function fileKind(name:string):MediaKind|null{if(/\.(jpe?g|png|webp|heic|heif)$/i.test(name))return 'image';if(/\.(mp4|mov|m4v)$/i.test(name))return 'video';return null;}
export function fileProblem(name:string,size:number):string|null{const kind=fileKind(name);if(!kind)return '支持 JPEG、PNG、WebP、HEIC/HEIF 照片与 MOV/MP4 视频';if(size<=0)return '文件为空';if(size>(kind==='image'?MAX_IMAGE_BYTES:MAX_VIDEO_BYTES))return kind==='image'?'照片不能超过50 MB':'视频不能超过500 MB';return null;}
