import {uploadDiagnosticSchema} from '@/domain/upload-diagnostic';
import {requireIdentity} from '@/server/auth/session';
import {memberFor} from '@/server/event-store';
import {database} from '@/server/db';
import {checkOrigin,json,apiFailure} from '@/server/http';

const windows=new Map<string,{at:number;count:number}>();
export async function POST(req:Request){try{
 checkOrigin(req);
 const identity=await requireIdentity(),now=Date.now();
 for(const [key,value] of windows)if(now-value.at>60000)windows.delete(key);
 const window=windows.get(identity)||{at:now,count:0};
 if(window.count++>=30)return json({ok:false},429);
 windows.set(identity,window);
 const reader=req.body?.getReader();if(!reader)return json({ok:false},400);
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({ok:false},413);}chunks.push(value);}
 const raw=Buffer.concat(chunks).toString('utf8');
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return json({ok:false},400);}
 const data=uploadDiagnosticSchema.parse(parsed);
 const member=await memberFor(database(),identity);
 // Structured, bounded data only. A missing pagehide is a clue, not proof of a crash.
 console.info('upload-diagnostic',JSON.stringify({memberId:member.id,...data}));
 return json({ok:true});
}catch(e){return apiFailure(e);}}
