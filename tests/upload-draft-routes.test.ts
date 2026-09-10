import {beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {draftBatchIdSchema} from '../src/domain/upload-draft';
const mocks=vi.hoisted(()=>({files:vi.fn(),discard:vi.fn(),authorize:vi.fn()}));
vi.mock('../src/server/db',()=>({database:()=>({}),transaction:vi.fn(),prepareDatabase:vi.fn()}));
vi.mock('../src/server/auth/session',()=>({requireIdentity:async()=> 'authenticated-member'}));
vi.mock('../src/server/upload-drafts',()=>({draftFiles:mocks.files,discardDraft:mocks.discard,authorizeDraft:mocks.authorize,draftBatches:vi.fn(),draftDate:vi.fn()}));
vi.mock('../src/server/media-store',()=>({authorizeUpload:vi.fn(),authorizeUploads:vi.fn()}));
vi.mock('../src/server/storage/local',()=>({signedObjectUrl:()=>'/test-upload'}));
import {GET,DELETE} from '../src/app/api/uploads/drafts/route';
import {POST} from '../src/app/api/uploads/authorize/route';
const legacy='e4ccf1a5-9e71-322a-71ae-b1e8607db17a';
const selection=(batchId:string)=>({batchId,name:'test.jpg',size:12,sha256:'a'.repeat(64),requestKey:randomUUID()});
function request(method:string,body:unknown){return new Request('http://localhost:3000/api/uploads/drafts',{method,headers:{origin:process.env.APP_URL||'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)});}
beforeEach(()=>{vi.clearAllMocks();mocks.files.mockResolvedValue([{id:'restored'}]);mocks.discard.mockResolvedValue(undefined);mocks.authorize.mockResolvedValue({upload:{id:randomUUID(),object_key:'test',expected_size:12,kind:'image',expires_at:new Date(Date.now()+86400000).toISOString()}});});
describe('legacy batch API compatibility',()=>{
 it('reproduces why strict RFC validation rejected a PostgreSQL batch',()=>{
  expect(z.string().uuid().safeParse(legacy).success).toBe(false);
  expect(draftBatchIdSchema.parse(legacy)).toBe(legacy);
 });
 it.each([legacy,'33575d2b-ad45-e0ce-a0f6-988aff60068e',randomUUID()])('restores, discards and resumes batch %s',async batchId=>{
  const response=await GET(new Request(`http://localhost:3000/api/uploads/drafts?batchId=${batchId}`));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({files:[{id:'restored'}]});
  expect(mocks.files).toHaveBeenCalledWith({},'authenticated-member',batchId);
  expect((await DELETE(request('DELETE',{batchId}))).status).toBe(200);
  expect(mocks.discard.mock.calls[0].slice(1)).toEqual(['authenticated-member',batchId]);
  expect((await POST(request('POST',selection(batchId)))).status).toBe(200);
  expect(mocks.authorize.mock.calls[0][2].batchId).toBe(batchId);
 });
 it.each(['not-a-batch',legacy+' OR 1=1',legacy.replace('e','z')])('rejects malformed batch without passing it to data access: %s',async batchId=>{
  expect((await GET(new Request(`http://localhost:3000/api/uploads/drafts?batchId=${encodeURIComponent(batchId)}`))).status).toBe(400);
  expect((await DELETE(request('DELETE',{batchId}))).status).toBe(400);
  expect((await POST(request('POST',selection(batchId)))).status).toBe(400);
  expect(mocks.files).not.toHaveBeenCalled();expect(mocks.discard).not.toHaveBeenCalled();expect(mocks.authorize).not.toHaveBeenCalled();
 });
});
