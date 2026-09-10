import { z } from 'zod';
import {authorizeDraft} from '@/server/upload-drafts';
import { MAX_FILES } from '@/domain/media';
import {draftBatchIdSchema} from '@/domain/upload-draft';
import { requireIdentity } from '@/server/auth/session';
import { transaction,prepareDatabase } from '@/server/db';
import { authorizeUpload,authorizeUploads } from '@/server/media-store';
import { signedObjectUrl } from '@/server/storage/local';
import { json,apiFailure,checkOrigin } from '@/server/http';
const file=z.object({name:z.string().min(1).max(255),size:z.number().int().positive()}).strict();
const draft=file.extend({sha256:z.string().regex(/^[0-9a-f]{64}$/),requestKey:z.string().uuid(),batchId:draftBatchIdSchema,lastModified:z.number().int().nonnegative().optional()}).strict();
const schema=z.union([draft,z.object({files:z.array(file).min(1).max(MAX_FILES)}).strict(),file.extend({id:z.string().uuid().optional()})]);
function ticket(u:Record<string,unknown>){
 const expires=Math.min(Date.now()+30*60*1000,new Date(String(u.expires_at)).valueOf()-1000);
 return {id:u.id,name:u.filename,archiveDate:u.archive_date||null,expires,url:signedObjectUrl({key:String(u.object_key),operation:'put',expires,size:Number(u.expected_size),kind:u.kind as 'image'|'video'}),verified:u.state==='verified'};
}
export async function POST(req:Request){try{
 checkOrigin(req);const input=schema.parse(await req.json());
 void prepareDatabase();const auth=await requireIdentity();
 if('sha256' in input){const r=await authorizeDraft(transaction,auth,input);return json(r.duplicate?{duplicate:r.duplicate}:{...ticket(r.upload!),reused:r.reused});}
 if('files' in input)return json({uploads:(await authorizeUploads(transaction,auth,input.files)).map(ticket)});
 return json(ticket(await authorizeUpload(transaction,auth,input)));
}catch(e){return apiFailure(e);}}
