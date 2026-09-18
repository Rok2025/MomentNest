import 'server-only';
import { sms } from 'tencentcloud-sdk-nodejs-sms';

function required(name:string){
 const value=process.env[name];
 if(!value)throw Error(`Missing ${name}`);
 return value;
}

// Adapted from audio2text-web/src/lib/sms/tencent.ts. Supabase owns the OTP.
export async function sendVerificationSms(phone:string,code:string){
 const client=new sms.v20210111.Client({
  credential:{secretId:required('TENCENT_SMS_SECRET_ID'),secretKey:required('TENCENT_SMS_SECRET_KEY')},
  region:process.env.TENCENT_SMS_REGION||'ap-guangzhou',
  profile:{httpProfile:{reqTimeout:3}},
 });
 const response=await client.SendSms({
  SmsSdkAppId:required('TENCENT_SMS_SDK_APP_ID'),SignName:required('TENCENT_SMS_SIGN_NAME'),
  TemplateId:required('TENCENT_SMS_TEMPLATE_ID'),TemplateParamSet:[code,'5'],PhoneNumberSet:[phone],
 });
 if(response.SendStatusSet?.[0]?.Code!=='Ok')throw Error('SMS_DELIVERY_FAILED');
}
