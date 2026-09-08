import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPasswordRecovery } from '../src/server/auth/recovery';

afterEach(()=>vi.restoreAllMocks());
describe('password recovery delivery feedback',()=>{
  it('submits once and gives the same response for accepted and unknown accounts',async()=>{
    const send=vi.fn().mockResolvedValue({error:null});
    const accepted=await requestPasswordRecovery(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(accepted.ok).toBe(true);
    expect(await requestPasswordRecovery(async()=>({error:{code:'user_not_found'}}))).toEqual(accepted);
  });
  it.each([{status:429},{code:'over_email_send_rate_limit'},{code:'over_request_rate_limit'}])('reports rate limiting without claiming mail was sent (%j)',async error=>{
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    const result=await requestPasswordRecovery(async()=>({error}));
    expect(result.ok).toBe(false);
    expect(result.retryLimited).toBe(true);
    expect(result.message).not.toContain('60');
  });
  it('distinguishes email quota from request throttling',async()=>{
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    const quota=await requestPasswordRecovery(async()=>({error:{code:'over_email_send_rate_limit',status:429}}));
    const requests=await requestPasswordRecovery(async()=>({error:{code:'over_request_rate_limit',status:429}}));
    expect(quota.message).toContain('发送额度');
    expect(requests.message).toContain('频率限制');
    expect(warning.mock.calls).toEqual([['[auth-recovery] email_rate_limited'],['[auth-recovery] request_rate_limited']]);
  });
  it.each([{code:'email_address_not_authorized',status:403},{status:500},{code:'unexpected_failure'}])('reports service failure without exposing provider details (%j)',async error=>{
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    const result=await requestPasswordRecovery(async()=>({error:{...error,message:'private@example.org token=secret'}}));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)+JSON.stringify(warning.mock.calls)).not.toMatch(/private@example|secret/);
  });
  it('handles thrown connection failures without automatic retries',async()=>{
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    const send=vi.fn().mockRejectedValue(new Error('token=private'));
    const result=await requestPasswordRecovery(send);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('无法连接');
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private');
  });
});
