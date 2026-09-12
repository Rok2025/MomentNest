import { describe, expect, it } from 'vitest';
import { automaticUploadTime } from '../src/domain/upload-time';

describe('automaticUploadTime', () => {
  const today = '2026-09-13';

  it('keeps a valid yoyotime exactly as stored', () => {
    expect(automaticUploadTime({
      capturedText: '2026-01-02T12:00:00+08:00', capturedZone: '+08:00',
      yoyotime: { valid: true, value: '2026:01:02 12:00:00+08:00' },
    }, today)).toEqual({ value: '2026:01:02 12:00:00+08:00' });
  });

  it('uses a reliable camera time and preserves unknown time zones', () => {
    expect(automaticUploadTime({
      capturedText: '2026:01:02 12:00:00', capturedZone: null, captureReliable: true,
    }, today)).toEqual({ value: '2026-01-02T12:00:00' });
  });

  it('keeps invalid, unreliable, missing, and out-of-range values pending', () => {
    expect(automaticUploadTime({
      capturedText: '2026-01-02T12:00:00', capturedZone: null, captureReliable: false,
    }, today)).toBeNull();
    expect(automaticUploadTime({ capturedText: null, capturedZone: null }, today)).toBeNull();
    expect(automaticUploadTime({
      capturedText: '2025-01-02T12:00:00', capturedZone: null,
      yoyotime: { valid: false, value: 'not-a-time' },
    }, today)).toBeNull();
  });
});
