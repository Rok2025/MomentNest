import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({connect:vi.fn(),constructed:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('pg',()=>({Pool:class {
 idleCount=0;ended=false;connect=mock.connect;on=vi.fn();
 constructor(options:unknown){mock.constructed(options);}
}}));
beforeEach(()=>{
 vi.resetModules();vi.clearAllMocks();Reflect.deleteProperty(globalThis,'__momentnestDatabase');
 vi.stubEnv('DATABASE_URL','postgresql://momentnest_app.test:placeholder@localhost/test');
 vi.stubEnv('SUPABASE_PROJECT_REF','test');vi.stubEnv('DATABASE_CA_FILE','');
});
afterEach(()=>{Reflect.deleteProperty(globalThis,'__momentnestDatabase');vi.unstubAllEnvs();});
describe('database preparation',()=>{
 it('deduplicates concurrent preparation and releases both connections',async()=>{
  const releases=[vi.fn(),vi.fn()];let second!:(value:{release:()=>void})=>void;
  mock.connect.mockResolvedValueOnce({release:releases[0]}).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve;}));
  const {prepareDatabase}=await import('../src/server/db');
  const first=prepareDatabase(),same=prepareDatabase();
  expect(first).toBe(same);expect(mock.connect).toHaveBeenCalledTimes(2);
  expect(releases[0]).not.toHaveBeenCalled();second({release:releases[1]});await first;
  expect(releases[0]).toHaveBeenCalledOnce();expect(releases[1]).toHaveBeenCalledOnce();
 });
 it('releases a successful connection when its sibling fails and allows another attempt',async()=>{
  const release=vi.fn();mock.connect.mockResolvedValueOnce({release}).mockRejectedValueOnce(Error('timeout'));
  const {prepareDatabase}=await import('../src/server/db');
  await expect(prepareDatabase()).resolves.toBeUndefined();expect(release).toHaveBeenCalledOnce();
  mock.connect.mockResolvedValue({release:vi.fn()});await prepareDatabase();expect(mock.connect).toHaveBeenCalledTimes(4);
 });
 it('reuses the pool across route module reloads and skips preparation when idle',async()=>{
  const first=await import('../src/server/db');const pool=first.database();
  vi.resetModules();const second=await import('../src/server/db');
  expect(second.database()).toBe(pool);expect(mock.constructed).toHaveBeenCalledOnce();
  Object.defineProperty(pool,'idleCount',{value:2});await second.prepareDatabase();expect(mock.connect).not.toHaveBeenCalled();
 });
});
