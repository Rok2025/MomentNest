import {describe,it,expect} from 'vitest';
import {captureDate,formatCaptureTime,sortByCaptureTime} from '../src/domain/capture-date';
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

describe('gallery capture order',()=>{
 const clip=(id:string,capturedText:string|null,capturedZone:string|null=null)=>({id,capturedText,capturedZone});
 it('orders the day from morning to evening without changing upload order in the source',()=>{
  const items=[clip('evening','2026-09-09T12:00:00Z'),clip('morning','2026:09:09 09:00:00'),clip('noon','2026-09-09T12:00:00+0800')];
  expect(sortByCaptureTime(items).map(m=>m.id)).toEqual(['morning','noon','evening']);
  expect(items.map(m=>m.id)).toEqual(['evening','morning','noon']);
 });
 it('compares embedded and separate offsets including midnight rollover',()=>{
  const items=[clip('later','2026-09-08T23:30:00','-04:00'),clip('earlier','2026-09-08T16:10:00Z','+08:00'),clip('middle','2026:09:09 01:00:00','+08:00')];
  expect(sortByCaptureTime(items).map(m=>m.id)).toEqual(['earlier','middle','later']);
 });
 it('places missing, date-only and invalid capture times last without inventing a time',()=>{
  const items=[clip('missing',null),clip('date-only','2026-09-09'),clip('invalid','2026-02-30T10:00:00Z'),clip('known','2026-09-09T10:00:00Z')];
  expect(sortByCaptureTime(items).map(m=>m.id)).toEqual(['known','missing','date-only','invalid']);
 });
 it('keeps ties stable and compares fractional seconds',()=>{
  const items=[clip('later','2026-09-09T01:00:00.900Z'),clip('first','2026-09-09T01:00:00.100Z'),clip('second','2026-09-09T09:00:00.100+08:00')];
  expect(sortByCaptureTime(items).map(m=>m.id)).toEqual(['first','second','later']);
 });
 it('reorders when processing supplies previously unknown capture metadata',()=>{
  const items=[clip('afternoon','2026-09-09T15:00:00+08:00'),clip('processing',null)];
  expect(sortByCaptureTime(items).map(m=>m.id)).toEqual(['afternoon','processing']);
  const refreshed=items.map(item=>item.id==='processing'?{...item,capturedText:'2026-09-09T09:00:00+08:00'}:item);
  expect(sortByCaptureTime(refreshed).map(m=>m.id)).toEqual(['processing','afternoon']);
 });
});
