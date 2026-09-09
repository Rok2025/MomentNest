import {describe,it,expect} from 'vitest';
import {uploadProgress,formatUploadBytes} from '../src/domain/upload-progress';
describe('aggregate upload progress',()=>{
 it('weights bytes instead of averaging file percentages and separates verification',()=>{
  expect(uploadProgress([{file:{size:10},status:'verified'},{file:{size:90},status:'uploading',uploadedBytes:45}])).toMatchObject({completed:1,count:2,remaining:45,percent:55});
  expect(uploadProgress([{file:{size:100},status:'verifying'}])).toMatchObject({completed:0,verifying:1,remaining:0,percent:100});
 });
 it('keeps confirmed failed-file bytes and recalculates when a file is removed',()=>{
  const failed={file:{size:100},status:'failed',uploadedBytes:40};
  expect(uploadProgress([failed,{file:{size:100},status:'waiting'}])).toMatchObject({remaining:160,failed:1,percent:20});
  expect(uploadProgress([failed])).toMatchObject({remaining:60,percent:40});
  expect(uploadProgress([])).toMatchObject({percent:0,remaining:0});
 });
 it('formats small files and large video totals without rounding to zero',()=>{
  expect(formatUploadBytes(1)).toBe('1 KB');expect(formatUploadBytes(0)).toBe('0 MB');expect(formatUploadBytes(2**30)).toBe('1.0 GB');
 });
});
