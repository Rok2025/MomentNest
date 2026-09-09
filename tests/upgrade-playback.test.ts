import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {Transaction} from '../src/server/event-store';
vi.mock('../workers/process-media',()=>({processMedia:vi.fn(async()=>({playbackKey:'derivatives/new.mp4',metadata:{playbackProfile:'mobile-v1'}})),discardOutputs:vi.fn()}));
vi.mock('../src/server/storage/local',()=>({objectPath:(key:string)=>key}));
vi.mock('node:fs/promises',()=>({stat:vi.fn(async()=>({size:100}))}));
import {upgradePlayback} from '../workers/upgrade-playback';
import {processMedia,discardOutputs} from '../workers/process-media';
const row={generation:1,object_key:'originals/clip.bin',sha256:'hash',preview_key:'derivatives/poster.jpg',playback_key:'derivatives/old.mp4',metadata:{existing:'keep'}};
function transaction(changed=false){
 const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('select m.')?[row]:changed?[]:[{id:'clip'}]}));
 const tx:Transaction=fn=>fn({query});return {tx,query};
}
beforeEach(()=>vi.clearAllMocks());
describe('explicit playback upgrade',()=>{
 it('publishes only playback fields with a compare-and-swap and keeps the old copy',async()=>{
  const {tx,query}=transaction();expect(await upgradePlayback(tx,'clip')).toMatchObject({status:'upgraded'});
  const update=query.mock.calls.map(([sql])=>sql).find(sql=>sql.startsWith('update'))!;
  expect(update).toContain('playback_key=$4');expect(update).not.toMatch(/captured|occurred|object_key|preview_key/);
  expect(processMedia).toHaveBeenCalledWith(expect.objectContaining({key:row.object_key,previewKey:row.preview_key}),'playback');
  expect(discardOutputs).not.toHaveBeenCalled();
 });
 it('discards only the new outputs if the job changes during encoding',async()=>{
  const {tx,query}=transaction(true);await expect(upgradePlayback(tx,'clip')).rejects.toThrow('VIDEO_CHANGED_DURING_UPGRADE');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('update'))).toBe(false);expect(discardOutputs).toHaveBeenCalledOnce();
 });
});
