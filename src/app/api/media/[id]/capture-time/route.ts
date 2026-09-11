import {z} from 'zod';
import {requireIdentity} from '@/server/auth/session';
import {database,transaction} from '@/server/db';
import {mediaRecord,ownMedia,updateMediaCaptureTime} from '@/server/media-store';
import {json,apiFailure,checkOrigin} from '@/server/http';

type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Context){
 try{return json(mediaRecord(await ownMedia(database(),await requireIdentity(),z.string().uuid().parse((await params).id))));}
 catch(error){return apiFailure(error);}
}
export async function PATCH(req:Request,{params}:Context){
 try{
  checkOrigin(req);
  const authId=await requireIdentity(),id=z.string().uuid().parse((await params).id);
  return json(await updateMediaCaptureTime(transaction,authId,id,await req.json()));
 }catch(error){return apiFailure(error);}
}
