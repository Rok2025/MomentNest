import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { database } from '@/server/db';
import { listMedia } from '@/server/media-store';
import { json,apiFailure } from '@/server/http';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{return json(await listMedia(database(),await requireIdentity(),z.string().uuid().parse((await params).id)));}catch(e){return apiFailure(e);}}
