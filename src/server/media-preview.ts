import type { PreviewLinks } from '../domain/media';
import { createHash } from 'node:crypto';
import { signedObjectUrl } from './storage/local';

export type PreviewSize={key:string;width:number;height:number};
export function previewSizes(metadata:Record<string,unknown>):PreviewSize[]{
 if(!Array.isArray(metadata.previewSizes))return [];
 return metadata.previewSizes.filter((s):s is PreviewSize=>!!s&&typeof s.key==='string'&&s.key.startsWith('derivatives/')&&s.key.endsWith('.jpg')&&Number.isSafeInteger(s.width)&&s.width>0&&Number.isSafeInteger(s.height)&&s.height>0);
}
// Call only after checking active membership and ownership. Never expose raw metadata.
export function previewLinks(row:Record<string,unknown>):PreviewLinks|undefined{
 if(!row.preview_key)return undefined;
 const metadata=(row.metadata||{}) as Record<string,unknown>;
 const sizes=previewSizes(metadata).sort((a,b)=>a.width-b.width);
 const expiresAt=Date.now()+5*60*1000;
 const url=(key:string)=>signedObjectUrl({key,operation:'get',expires:expiresAt,mime:'image/jpeg'});
 const unique=sizes.filter((s,i)=>i===0||s.width!==sizes[i-1].width);
 return {url:url(String(row.preview_key)),expiresAt,revision:createHash('sha256').update(JSON.stringify([row.preview_key,unique])).digest('hex').slice(0,24),
  width:Number(metadata.previewWidth)||Number(metadata.width)||1920,
  height:Number(metadata.previewHeight)||Number(metadata.height)||1280,
  ...(unique.length?{srcSet:unique.map(s=>`${url(s.key)} ${s.width}w`).join(', ')}:{}),
 };
}
