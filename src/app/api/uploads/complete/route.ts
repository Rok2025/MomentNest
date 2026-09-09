import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { database,transaction } from '@/server/db';
import { ownUpload,completeUpload } from '@/server/media-store';
import { originalEvidence } from '@/server/storage/local';
import { objectPath } from '@/server/storage/local';
import { readCapture } from '@/server/storage/capture';
import { json,apiFailure,checkOrigin } from '@/server/http';
export async function POST(req:Request){try{checkOrigin(req);const auth=await requireIdentity();const {id}=z.object({id:z.string().uuid()}).parse(await req.json());const u=await ownUpload(database(),auth,id);const verified=await completeUpload(transaction,auth,id,await originalEvidence(String(u.object_key)));return json({...verified,...await readCapture(objectPath(String(u.object_key)),String(u.kind))});}catch(e){return apiFailure(e);}}
