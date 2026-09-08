import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocked=vi.hoisted(()=>({create:vi.fn(),claims:vi.fn(),user:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocked.create}));
import { proxy } from '../src/proxy';
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubEnv('SUPABASE_URL','https://fixture.supabase.co');
 vi.stubEnv('SUPABASE_PROJECT_REF','fixture');
 vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','fixture-public-key');
 mocked.create.mockReturnValue({auth:{getClaims:mocked.claims,getUser:mocked.user}});
});
afterEach(()=>{vi.unstubAllEnvs();});
describe('session refresh proxy',()=>{
 it('verifies claims without the redundant user request and prevents response caching',async()=>{
  const response=await proxy(new NextRequest('https://example.com/'));
  expect(mocked.claims).toHaveBeenCalledTimes(1);
  expect(mocked.user).not.toHaveBeenCalled();
  expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
 });
 it('forwards refreshed cookies to both the route guard and the browser',async()=>{
  mocked.claims.mockImplementation(()=>{
   mocked.create.mock.calls[0][2].cookies.setAll([{name:'session',value:'fixture-refreshed',options:{httpOnly:true,secure:true,path:'/'}}]);
  });
  const request=new NextRequest('https://example.com/');
  const response=await proxy(request);
  expect(request.cookies.get('session')?.value).toBe('fixture-refreshed');
  expect(response.cookies.get('session')).toMatchObject({value:'fixture-refreshed',httpOnly:true,secure:true});
 });
 it('leaves failures for route-level authentication and never caches the response',async()=>{
  mocked.claims.mockRejectedValue(new Error('unavailable'));
  const response=await proxy(new NextRequest('https://example.com/'));
  expect(response.headers.get('Cache-Control')).toContain('no-store');
 });
});
