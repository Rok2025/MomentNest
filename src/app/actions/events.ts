'use server';
import { requireIdentity } from '@/server/auth/session';
import { transaction } from '@/server/db';
import { saveEvent } from '@/server/event-store';
import { failure } from '@/server/errors';
import type { SaveResult } from '@/domain/events';
import { revalidatePath } from 'next/cache';
export async function saveEventAction(raw:unknown):Promise<SaveResult>{
  try{const authId=await requireIdentity();const id=await saveEvent(transaction,authId,raw);revalidatePath('/');revalidatePath(`/events/${id}`);return {ok:true,id};}
  catch(error){return failure(error);}
}
