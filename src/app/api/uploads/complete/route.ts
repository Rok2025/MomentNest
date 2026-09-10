import {savedDuplicate} from '@/server/upload-drafts';
import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { database,transaction } from '@/server/db';
import { ownUpload,completeUpload } from '@/server/media-store';
import { originalEvidence } from '@/server/storage/local';
import { objectPath } from '@/server/storage/local';
import { readCapture } from '@/server/storage/capture';
import { json,apiFailure,checkOrigin } from '@/server/http';
export async function POST(req:Request){try{checkOrigin(req);const auth=await requireIdentity();const {id}=z.object({id:z.string().uuid()}).parse(await req.json());const u=await ownUpload(database(),auth,id);
 const [verified,capture]=await Promise.all([
  originalEvidence(String(u.object_key)).then(evidence=>completeUpload(transaction,auth,id,evidence)),
  readCapture(objectPath(String(u.object_key)),String(u.kind)),
 ]);
 const fresh=await ownUpload(database(),auth,id);
 const duplicate=await savedDuplicate(database(),String(u.household_id),String(fresh.sha256),Number(u.expected_size));
 return json({...verified,...capture,sha256:fresh.sha256,archiveDate:u.archive_date||null,duplicate});}catch(e){return apiFailure(e);}}
