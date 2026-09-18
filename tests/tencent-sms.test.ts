import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const mocked=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('tencentcloud-sdk-nodejs-sms',()=>({sms:{v20210111:{Client:class{SendSms=mocked.send;}}}}));
import { sendVerificationSms } from '../src/server/auth/sms';
beforeEach(()=>{
 vi.resetAllMocks();
 for(const name of ['SECRET_ID','SECRET_KEY','SDK_APP_ID','SIGN_NAME','TEMPLATE_ID'])vi.stubEnv(`TENCENT_SMS_${name}`,name);
 mocked.send.mockResolvedValue({SendStatusSet:[{Code:'Ok'}]});
});
afterEach(()=>vi.unstubAllEnvs());
describe('Tencent SMS adapter',()=>{
 it('uses the existing provider contract with one country code and a five-minute template',async()=>{
  await sendVerificationSms('+8613800138000','123456');
  expect(mocked.send).toHaveBeenCalledExactlyOnceWith({SmsSdkAppId:'SDK_APP_ID',SignName:'SIGN_NAME',TemplateId:'TEMPLATE_ID',TemplateParamSet:['123456','5'],PhoneNumberSet:['+8613800138000']});
 });
 it.each([{SendStatusSet:[{Code:'FailedOperation'}]},{SendStatusSet:[]}])('does not report rejected deliveries as success',async response=>{
  mocked.send.mockResolvedValue(response);
  await expect(sendVerificationSms('+8613800138000','123456')).rejects.toThrow('SMS_DELIVERY_FAILED');
 });
 it('does not send without credentials',async()=>{
  vi.stubEnv('TENCENT_SMS_SECRET_KEY','');
  await expect(sendVerificationSms('+8613800138000','123456')).rejects.toThrow();
  expect(mocked.send).not.toHaveBeenCalled();
 });
});
