import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { transaction } from '@/server/db';
import { authorizeUpload } from '@/server/media-store';
import { signedObjectUrl } from '@/server/storage/local';
import { json,apiFailure,checkOrigin } from '@/server/http';
export async function POST(req:Request){try{checkOrigin(req);const auth=await requireIdentity();const input=z.object({name:z.string().min(1).max(255),size:z.number().int().positive(),id:z.string().uuid().optional()}).strict().parse(await req.json());const u=await authorizeUpload(transaction,auth,input);return json({id:u.id,url:signedObjectUrl({key:String(u.object_key),operation:'put',expires:Math.min(Date.now()+30*60*1000,new Date(String(u.expires_at)).valueOf()-1000),size:Number(u.expected_size),kind:u.kind as 'image'|'video'}),verified:u.state==='verified'});}catch(e){return apiFailure(e);}}
