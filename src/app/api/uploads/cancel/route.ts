import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { transaction } from '@/server/db';
import { cancelUpload } from '@/server/media-store';
import { json,apiFailure,checkOrigin } from '@/server/http';
export async function POST(req:Request){try{checkOrigin(req);const {id}=z.object({id:z.string().uuid()}).parse(await req.json());await cancelUpload(transaction,await requireIdentity(),id);return json({ok:true});}catch(e){return apiFailure(e);}}
