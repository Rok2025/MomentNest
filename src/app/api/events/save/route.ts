import {revalidatePath} from 'next/cache';
import {requireIdentity} from '@/server/auth/session';
import {transaction} from '@/server/db';
import {saveEvent} from '@/server/event-store';
import {checkOrigin,json,apiFailure} from '@/server/http';

export async function POST(req:Request){
 try{
  checkOrigin(req);
  const start=performance.now();
  const authId=await requireIdentity(),authenticated=performance.now();
  const id=await saveEvent(transaction,authId,await req.json()),saved=performance.now();
  // In a Route Handler this invalidates the next read without rendering the home
  // page inside the save response. The dialog confirms first, then refreshes once.
  revalidatePath('/');revalidatePath(`/events/${id}`);
  const response=json({ok:true,id});
  response.headers.set('Server-Timing',`auth;dur=${(authenticated-start).toFixed(1)},save;dur=${(saved-authenticated).toFixed(1)}`);
  return response;
 }catch(error){return apiFailure(error);}
}
