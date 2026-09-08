import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { transaction } from '@/server/db';
import { retryMedia } from '@/server/media-store';
import { json,apiFailure,checkOrigin } from '@/server/http';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(req);return json(await retryMedia(transaction,await requireIdentity(),z.string().uuid().parse((await params).id)));}catch(e){return apiFailure(e);}}
