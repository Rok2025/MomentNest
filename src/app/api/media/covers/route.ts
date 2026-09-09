import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { database } from '@/server/db';
import { listEventCovers } from '@/server/media-store';
import { json,apiFailure,checkOrigin } from '@/server/http';

export async function POST(req:Request){
 try{
  checkOrigin(req);
  const {eventIds}=z.object({eventIds:z.array(z.string().uuid()).min(1).max(100)}).strict().parse(await req.json());
  return json(await listEventCovers(database(),await requireIdentity(),[...new Set(eventIds)],true));
 }catch(e){return apiFailure(e);}
}
