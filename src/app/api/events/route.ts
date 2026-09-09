import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { database } from '@/server/db';
import { listEvents } from '@/server/event-store';
import { isCalendarDate } from '@/domain/dates';
import { json,apiFailure } from '@/server/http';
const calendar=z.string().refine(isCalendarDate);
export async function GET(req:Request){try{const q=Object.fromEntries(new URL(req.url).searchParams);const p=z.object({date:calendar.optional(),at:z.iso.datetime().optional(),id:z.string().uuid().optional(),start:calendar.optional(),end:calendar.optional()}).parse(q);if((p.start&&!p.end)||(!p.start&&p.end)||(p.start&&p.end&&p.start>p.end))return json({message:'日期范围无效'},400);return json(await listEvents(database(),await requireIdentity(),p.date&&p.at&&p.id?{date:p.date,createdAt:p.at,id:p.id}:undefined,p.start&&p.end?{start:p.start,end:p.end}:undefined,true));}catch(e){return apiFailure(e);}}
