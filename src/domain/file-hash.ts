import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
// One small buffer at a time; yield between chunks so mobile interaction stays responsive.
export async function hashFile(file:Blob,signal?:AbortSignal,onProgress?:(percent:number)=>void){
 const hash=sha256.create(),chunk=1024*1024;
 try{
  for(let offset=0;offset<file.size;offset+=chunk){
   signal?.throwIfAborted();
   hash.update(new Uint8Array(await file.slice(offset,offset+chunk).arrayBuffer()));
   onProgress?.(Math.floor(Math.min(offset+chunk,file.size)/file.size*100));
   await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  signal?.throwIfAborted();return bytesToHex(hash.digest());
 }finally{hash.destroy();}
}
