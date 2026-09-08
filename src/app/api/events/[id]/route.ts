import { NextResponse } from 'next/server';
import { requireIdentity } from '@/server/auth/session';
import { database } from '@/server/db';
import { getEvent } from '@/server/event-store';
import { failure } from '@/server/errors';
import { uuid } from '@/domain/events';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const authId=await requireIdentity(),{id}=await params;uuid.parse(id);return NextResponse.json(await getEvent(database(),authId,id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const result=failure(error);return NextResponse.json(result,{status:result.code==='UNAUTHENTICATED'?401:result.code==='FORBIDDEN'?403:result.code==='NOT_FOUND'?404:result.code==='VALIDATION'?400:503});}}
