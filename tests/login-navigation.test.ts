import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked=vi.hoisted(()=>({login:vi.fn(),redirect:vi.fn()}));
vi.mock('../src/app/actions/auth',()=>({loginAction:mocked.login}));
vi.mock('next/navigation',()=>({RedirectType:{replace:'replace'},redirect:mocked.redirect}));
import { loginPageAction } from '../src/app/actions/login';

beforeEach(()=>{
  vi.resetAllMocks();
  mocked.redirect.mockImplementation(()=>{throw new Error('NEXT_REDIRECT');});
});
describe('login page navigation',()=>{
  it('redirects on success instead of resolving a success state that resets the form',async()=>{
    mocked.login.mockResolvedValue({ok:true,message:'登录成功'});
    const form=new FormData();
    await expect(loginPageAction({ok:false,message:''},form)).rejects.toThrow('NEXT_REDIRECT');
    expect(mocked.login).toHaveBeenCalledWith({ok:false,message:''},form);
    expect(mocked.redirect).toHaveBeenCalledExactlyOnceWith('/','replace');
  });
  it.each(['邮箱或密码不正确，请重试','此账号尚未加入家庭，或记录服务尚未就绪'])('keeps authentication failures on the form: %s',async message=>{
    const failure={ok:false,message};
    mocked.login.mockResolvedValue(failure);
    expect(await loginPageAction({ok:false,message:''},new FormData())).toEqual(failure);
    expect(mocked.redirect).not.toHaveBeenCalled();
  });
  it('does not navigate before asynchronous authentication and membership checks finish',async()=>{
    let complete!:(result:{ok:boolean;message:string})=>void;
    mocked.login.mockReturnValue(new Promise(resolve=>{complete=resolve;}));
    const submitted=loginPageAction({ok:false,message:''},new FormData());
    const outcome=expect(submitted).rejects.toThrow('NEXT_REDIRECT');
    expect(mocked.redirect).not.toHaveBeenCalled();
    complete({ok:true,message:'登录成功'});
    await outcome;
    expect(mocked.redirect).toHaveBeenCalledTimes(1);
  });
});
