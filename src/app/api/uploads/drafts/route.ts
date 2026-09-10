import {z} from 'zod';
import {database,transaction} from '@/server/db';
import {requireIdentity} from '@/server/auth/session';
import {json,apiFailure,checkOrigin} from '@/server/http';
import {draftBatches,draftFiles,discardDraft,draftDate} from '@/server/upload-drafts';
import {validEventDate,todayShanghai} from '@/domain/dates';
import {draftBatchIdSchema} from '@/domain/upload-draft';
export async function GET(req:Request){try{
 const auth=await requireIdentity(),batchId=new URL(req.url).searchParams.get('batchId');
 return json(batchId?{files:await draftFiles(database(),auth,draftBatchIdSchema.parse(batchId))}:{batches:await draftBatches(database(),auth)});
}catch(e){return apiFailure(e);}}
export async function DELETE(req:Request){try{
 checkOrigin(req);const {batchId}=z.object({batchId:draftBatchIdSchema}).strict().parse(await req.json());
 await discardDraft(transaction,await requireIdentity(),batchId);return json({ok:true});
}catch(e){return apiFailure(e);}}
export async function PATCH(req:Request){try{
 checkOrigin(req);const {id,date}=z.object({id:z.string().uuid(),date:z.string().refine(d=>validEventDate(d,todayShanghai())).nullable()}).strict().parse(await req.json());
 await draftDate(transaction,await requireIdentity(),id,date);return json({ok:true});
}catch(e){return apiFailure(e);}}
