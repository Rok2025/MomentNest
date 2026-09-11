import exifr from 'exifr';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureDate } from '../../domain/capture-date';
import { readYoyoTime } from './yoyotime';

const run = promisify(execFile);
export async function readCapture(path: string, kind: string) {
  // Failure to read the preferred metadata must not silently select another date.
  const yoyotime = await readYoyoTime(path);
  if (yoyotime) {
    const capturedText = yoyotime.valid ? yoyotime.value : null;
    const capturedZone = capturedText?.match(/(Z|[+-]\d{2}:?\d{2})$/)?.[1] || null;
    return { capturedText, capturedZone: capturedZone === 'Z' ? 'UTC' : capturedZone,
      capturedOn: captureDate(capturedText), captureSource: 'yoyotime', yoyotime };
  }
  let capturedText: string | null = null, capturedZone: string | null = null;
  try {
    if (kind === 'image') {
      const tags = await exifr.parse(path, { pick: ['DateTimeOriginal', 'OffsetTimeOriginal'], reviveValues: false, gps: false });
      if (tags?.DateTimeOriginal) {
        capturedText = String(tags.DateTimeOriginal);
        capturedZone = tags.OffsetTimeOriginal ? String(tags.OffsetTimeOriginal) : null;
      }
    } else {
      const { stdout } = await run(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format_tags:stream_tags', '-of', 'json', path], { timeout: 15000, maxBuffer: 1024 * 1024 });
      const probe = JSON.parse(stdout);
      const tags = probe.format?.tags || {};
      const raw = tags['com.apple.quicktime.creationdate'] || tags.creation_time || probe.streams?.find((s: { tags?: { creation_time?: string } }) => s.tags?.creation_time)?.tags.creation_time;
      if (typeof raw === 'string') {
        capturedText = raw;
        capturedZone = /Z$/.test(raw) ? 'UTC' : raw.match(/[+-]\d\d:?\d\d$/)?.[0] || null;
      }
    }
  } catch { /* Exported files may have no usable metadata; ask for the day in the editor. */ }
  const capturedOn = captureDate(capturedText, capturedZone);
  return { capturedText: capturedOn ? capturedText : null, capturedZone: capturedOn ? capturedZone : null,
    capturedOn, captureSource: capturedOn ? 'metadata' : null, yoyotime: null };
}
