import { z } from 'zod';
import { isCalendarDate } from '@/domain/dates';
import { requireIdentity } from '@/server/auth/session';
import { database } from '@/server/db';
import { DAY_MEDIA_PAGE_SIZE,listDayMedia } from '@/server/media-store';
import { json,apiFailure } from '@/server/http';

export async function GET(request:Request,{params}:{params:Promise<{date:string}>}){
 try{
  const date=z.string().refine(isCalendarDate,'日期无效').parse((await params).date);
  const offset=z.coerce.number().int().min(0).max(10_000).catch(0).parse(new URL(request.url).searchParams.get('offset')||'0');
  return json(await listDayMedia(database(),await requireIdentity(),date,offset,DAY_MEDIA_PAGE_SIZE,true));
 }catch(error){return apiFailure(error);}
}
