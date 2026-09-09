import {describe,it,expect} from 'vitest';
import {captureDate,formatCaptureTime} from '../src/domain/capture-date';
describe('capture date without file modification time',()=>{
 it('preserves camera wall-clock day when EXIF has no zone',()=>{expect(captureDate('2025:06:01 23:30:00')).toBe('2025-06-01');});
 it('converts UTC and EXIF offsets to Shanghai including midnight rollover',()=>{
  expect(captureDate('2025-06-01T18:30:00Z')).toBe('2025-06-02');
  expect(captureDate('2025:06:01 23:30:00','-04:00')).toBe('2025-06-02');
  expect(captureDate('2025-06-01T23:30:00+0800')).toBe('2025-06-01');
 });
 it.each([null,'','1904-01-01T00:00:00Z','0000:00:00 00:00:00','2025:02:30 12:00:00','2025:06:01 25:00:00','not a date'])('rejects unusable metadata %s',raw=>expect(captureDate(raw)).toBeNull());
});
describe('capture time display',()=>{
 it('formats the original UTC timestamp in Beijing time to seconds',()=>{
  expect(formatCaptureTime('2026-09-04T04:26:29.000000Z','UTC')).toBe('2026-09-04 12:26:29（北京时间）');
 });
 it('handles offsets and midnight without depending on the browser timezone',()=>{
  expect(formatCaptureTime('2025:06:01 23:30:00','-04:00')).toBe('2025-06-02 11:30:00（北京时间）');
  expect(formatCaptureTime('2025-06-01T16:00:00Z')).toBe('2025-06-02 00:00:00（北京时间）');
  expect(formatCaptureTime('2025-06-01T23:30:00+0800')).toBe('2025-06-01 23:30:00（北京时间）');
 });
 it('preserves camera time when the zone is unknown and does not invent missing time',()=>{
  expect(formatCaptureTime('2025:06:01 23:30:00')).toBe('2025-06-01 23:30:00（时区未知）');
  expect(formatCaptureTime('2025-06-01')).toBe('2025-06-01（时间未知）');
 });
 it.each([null,'','not a date','2025-02-30T12:00:00Z'])('handles unusable metadata %s',raw=>{
  expect(formatCaptureTime(raw)).toBe('未知');
 });
});
