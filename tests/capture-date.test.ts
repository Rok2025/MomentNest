import {describe,it,expect} from 'vitest';
import {captureDate} from '../src/domain/capture-date';
describe('capture date without file modification time',()=>{
 it('preserves camera wall-clock day when EXIF has no zone',()=>{expect(captureDate('2025:06:01 23:30:00')).toBe('2025-06-01');});
 it('converts UTC and EXIF offsets to Shanghai including midnight rollover',()=>{
  expect(captureDate('2025-06-01T18:30:00Z')).toBe('2025-06-02');
  expect(captureDate('2025:06:01 23:30:00','-04:00')).toBe('2025-06-02');
  expect(captureDate('2025-06-01T23:30:00+0800')).toBe('2025-06-01');
 });
 it.each([null,'','1904-01-01T00:00:00Z','0000:00:00 00:00:00','2025:02:30 12:00:00','2025:06:01 25:00:00','not a date'])('rejects unusable metadata %s',raw=>expect(captureDate(raw)).toBeNull());
});
