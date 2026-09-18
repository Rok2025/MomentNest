import { Webhook } from 'standardwebhooks';
import { z } from 'zod';
import { phoneSchema,phoneCodeSchema } from '@/domain/phone';
import { database } from '@/server/db';
import { memberFor } from '@/server/event-store';
import { sendVerificationSms } from '@/server/auth/sms';

export const runtime='nodejs';
const payloadSchema=z.object({
 user:z.object({id:z.uuid(),phone:z.string().optional(),new_phone:z.string().optional()}),
 sms:z.object({otp:phoneCodeSchema,phone:z.string().optional()}),
});
function failure(status:number){return Response.json({error:{http_code:status,message:'短信暂时无法发送'}},{status});}

export async function POST(request:Request){
 const secret=process.env.SUPABASE_SMS_HOOK_SECRET;
 if(!secret)return failure(503);
 let payload:unknown;
 try{
  const body=await request.text();
  if(body.length>32768)return failure(413);
  payload=new Webhook(secret.replace(/^v1,/,'' )).verify(body,Object.fromEntries(request.headers));
 }catch{return failure(401);}
 const parsed=payloadSchema.safeParse(payload);
 if(!parsed.success)return failure(400);
 const {user,sms}=parsed.data;
 // Newer Auth versions specify the actual recipient in sms.phone. Older ones
 // expose the pending binding number in new_phone instead.
 const phone=phoneSchema.safeParse(sms.phone||user.new_phone||user.phone);
 if(!phone.success)return failure(400);
 try{
  // Also enforced here because callers can reach Supabase Auth directly.
  await memberFor(database(),user.id);
  await sendVerificationSms(phone.data,sms.otp);
  return Response.json({});
 }catch{return failure(503);}
}
