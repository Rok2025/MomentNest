import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {hashFile} from '../src/domain/file-hash';
describe('bounded file content hashing',()=>{
 it('分块结果与服务器SHA256相同，名称不同不影响结果',async()=>{
  const bytes=new Uint8Array(3*1024*1024+137);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const progress:number[]=[],hash=await hashFile(new Blob([bytes]),undefined,p=>progress.push(p));
  expect(hash).toBe(createHash('sha256').update(bytes).digest('hex'));expect(progress.at(-1)).toBe(100);expect(progress).toHaveLength(4);
  expect(await hashFile(new File(['same'],'a.jpg'))).toBe(await hashFile(new File(['same'],'b.jpg')));
  expect(await hashFile(new File(['different'],'a.jpg'))).not.toBe(await hashFile(new File(['same'],'a.jpg')));
 });
 it('取消后停止读取，不继续申请上传任务',async()=>{const c=new AbortController();c.abort();await expect(hashFile(new Blob(['abc']),c.signal)).rejects.toThrow();});
});
