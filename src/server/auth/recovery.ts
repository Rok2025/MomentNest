import type { AuthResult } from '../../domain/events';

const accepted: AuthResult = {ok:true,message:'请求已提交。若此邮箱已受邀，你将收到恢复链接。'};

// Keep account existence private, while reporting operational failures honestly.
export async function requestPasswordRecovery(send:()=>Promise<{error:unknown}>):Promise<AuthResult> {
  try {
    const {error}=await send();
    if(!error)return accepted;
    const code=typeof error==='object'&&'code' in error?error.code:undefined;
    const status=typeof error==='object'&&'status' in error?error.status:undefined;
    if(code==='user_not_found')return accepted;
    if(status===429||code==='over_email_send_rate_limit'||code==='over_request_rate_limit') {
      console.warn('[auth-recovery] rate_limited');
      return {ok:false,message:'邮件发送过于频繁，请稍后再试。若持续收不到，请联系管理员检查邮件额度。'};
    }
    // Never log provider messages, addresses, or recovery tokens.
    console.warn('[auth-recovery] delivery_request_failed');
    return {ok:false,message:'恢复邮件请求未成功，邮件服务暂不可用。请稍后重试或联系管理员。'};
  } catch {
    console.warn('[auth-recovery] service_unavailable');
    return {ok:false,message:'暂时无法连接恢复服务，请稍后重试。'};
  }
}
