import { createHmac,timingSafeEqual,createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { stat,open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
export type StorageTicket={key:string;operation:'put'|'get';expires:number;size?:number;kind?:'image'|'video';mime?:string;download?:string};
export function storageRoot(){return resolve(/* turbopackIgnore: true */ process.env.MEDIA_ROOT||'.private/media');}
export function objectPath(key:string){if(!/^[a-z0-9/-]+\.(bin|jpg|mp4|json)$/.test(key)||key.includes('..')||key.startsWith('/')||!key.startsWith('originals/')&&!key.startsWith('derivatives/'))throw Error('INVALID_OBJECT_KEY');return resolve(storageRoot(),key);}
function secret(){const s=process.env.MEDIA_SIGNING_SECRET;if(!s||s.length<40)throw Error('MEDIA_NOT_CONFIGURED');return s;}
export function signTicket(ticket:StorageTicket){const payload=Buffer.from(JSON.stringify(ticket)).toString('base64url');return payload+'.'+createHmac('sha256',secret()).update(payload).digest('base64url');}
export function verifyTicket(token:string):StorageTicket{
 if(token.length>4096)throw Error('INVALID_TICKET');const [body,sig]=token.split('.');if(!body||!sig)throw Error('INVALID_TICKET');
 const expected=createHmac('sha256',secret()).update(body).digest(),actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('INVALID_TICKET');
 const t=JSON.parse(Buffer.from(body,'base64url').toString()) as StorageTicket;objectPath(t.key);if(!Number.isFinite(t.expires)||t.expires<=Date.now())throw Error('EXPIRED_TICKET');return t;
}
export function signedObjectUrl(ticket:StorageTicket){return `${process.env.MEDIA_PUBLIC_URL||'http://localhost:3001'}/object?ticket=${signTicket(ticket)}`;}
export function detectMime(b:Buffer):{mime:string;kind:'image'|'video'}|null{
 if(b.subarray(0,3).equals(Buffer.from([255,216,255])))return {mime:'image/jpeg',kind:'image'};
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',kind:'image'};
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return {mime:'image/webp',kind:'image'};
 if(b.toString('ascii',4,8)==='ftyp'){
  const brand=b.toString('ascii',8,12);if(['heic','heix','hevc','hevx','mif1','msf1'].includes(brand))return {mime:'image/heic',kind:'image'};
  if(['qt  ','isom','iso2','mp41','mp42','avc1','M4V ','MSNV','dash'].includes(brand))return {mime:brand==='qt  '?'video/quicktime':'video/mp4',kind:'video'};
 }
 return null;
}
export async function fileHash(path:string){const h=createHash('sha256');for await(const b of createReadStream(/* turbopackIgnore: true */ path))h.update(b);return h.digest('hex');}
export async function originalEvidence(key:string){
 const path=objectPath(key),info=await stat(/* turbopackIgnore: true */ path),handle=await open(/* turbopackIgnore: true */ path,'r'),b=Buffer.alloc(64);try{await handle.read(b,0,64,0);}finally{await handle.close();}
 const detected=detectMime(b);if(!detected)throw Error('UNSUPPORTED_CONTENT');
 return {...detected,size:info.size,sha256:await fileHash(path)};
}
