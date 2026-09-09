export const UPLOAD_CHUNK_SIZE=8*1024*1024;
export const RESUMABLE_THRESHOLD=16*1024*1024;
export function uploadProgress(items:{file:{size:number};status:string;uploadedBytes?:number}[]){
 const total=items.reduce((n,i)=>n+i.file.size,0);
 const sent=items.reduce((n,i)=>n+(['verified','verifying'].includes(i.status)?i.file.size:Math.min(i.file.size,Math.max(0,i.uploadedBytes||0))),0);
 return {total,sent,remaining:total-sent,percent:total?Math.floor(sent/total*100):0,
  completed:items.filter(i=>i.status==='verified').length,failed:items.filter(i=>i.status==='failed').length,
  verifying:items.filter(i=>i.status==='verifying').length,count:items.length};
}
export function formatUploadBytes(bytes:number){
 if(bytes===0)return '0 MB';
 if(bytes<1024*1024)return `${Math.ceil(bytes/1024)} KB`;
 if(bytes>=1024*1024*1024)return `${(bytes/1024/1024/1024).toFixed(1)} GB`;
 return `${(bytes/1024/1024).toFixed(1)} MB`;
}
