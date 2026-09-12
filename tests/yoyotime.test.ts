import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, copyFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import exiftool from 'exiftool-vendored.pl';
import { readCapture } from '../src/server/storage/capture';
import { fileHash, objectPath, originalEvidence } from '../src/server/storage/local';
import { confirmedCopy } from '../src/server/storage/confirmed-copy';
import { captureDate } from '../src/domain/capture-date';
import { processMedia } from '../workers/process-media';

const run = promisify(execFile);
let root: string;
const originalRoot = process.env.MEDIA_ROOT;
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'momentnest-yoyotime-')); process.env.MEDIA_ROOT = root; });
afterAll(async () => { if (originalRoot === undefined) delete process.env.MEDIA_ROOT; else process.env.MEDIA_ROOT = originalRoot; await rm(root, { recursive: true, force: true }); });
async function stamp(path: string, value: string) {
  await run('perl', [exiftool, '-config', resolve('config/yoyotime.config'), '-overwrite_original',
    `-XMP-yoyo:yoyotime=${value}`, '-XMP-yoyo:yoyotimeSource=confirmed:manual',
    '-XMP-yoyo:yoyotimeRawValue=人工确认时间', path]);
}
async function processFixture(path: string, kind: 'image' | 'video') {
  const key = `originals/${randomUUID()}/${randomUUID()}.bin`;
  await mkdir(dirname(objectPath(key)), { recursive: true }); await copyFile(path, objectPath(key));
  const sha256 = await fileHash(path);
  const result = await processMedia({ mediaId: randomUUID(), token: randomUUID(), generation: 1, attempts: 1, key, kind, sha256 });
  expect(await fileHash(objectPath(key))).toBe(sha256);
  return result;
}
describe('MomentStamp XMP yoyotime import contract', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('prioritizes yoyotime over EXIF for %s and preserves evidence after processing', async format => {
    const path = join(root, `photo.${format}`);
    await sharp({ create: { width: 16, height: 12, channels: 3, background: 'green' } })
      .withExif({ IFD2: { DateTimeOriginal: '2026:01:01 10:00:00', OffsetTimeOriginal: '+08:00' } })
      .toFormat(format).toFile(path);
    await confirmFixture(path, 'image');
    await stamp(path, '2025-06-01T23:30:00-04:00');
    expect(await readCapture(path, 'image')).toMatchObject({ capturedText: '2025-06-01T23:30:00-04:00', capturedOn: '2025-06-02', capturedZone: '-04:00', captureSource: 'yoyotime' });
    const result = await processFixture(path, 'image');
    expect(result.capturedText).toBe('2025-06-01T23:30:00-04:00');
    expect(result.metadata.yoyotime).toMatchObject({ source: 'confirmed:manual', rawValue: '人工确认时间', valid: true });
  });
  it.each(['mov', 'mp4'])('reads XMP inside %s and keeps the same date after transcoding', async extension => {
    const path = join(root, `video.${extension}`);
    await run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=10', '-t', '0.2', '-c:v', 'libx264', '-metadata', 'creation_time=2026-01-01T00:00:00Z', path]);
    await confirmFixture(path, 'video');
    await stamp(path, '2025-06-01T23:30:00');
    expect(await readCapture(path, 'video')).toMatchObject({ capturedText: '2025-06-01T23:30:00', capturedOn: '2025-06-01', capturedZone: null });
    const result = await processFixture(path, 'video');
    expect(result.capturedText).toBe('2025-06-01T23:30:00'); expect(result.capturedZone).toBeNull();
    expect(result.metadata.captureSource).toBe('yoyotime');
  });
  it('reads yoyotime from a HEIC image container', async () => {
    const input = join(root, 'heic-source.png'), path = join(root, 'dated.heic');
    await sharp({ create: { width: 16, height: 16, channels: 3, background: 'green' } }).png().toFile(input);
    if (process.platform === 'darwin') await run('sips', ['-s', 'format', 'heic', input, '--out', path]);
    else await run('heif-enc', ['-q', '50', '-o', path, input]);
    await confirmFixture(path, 'image');
    await stamp(path, '2025-06-01T23:30:00Z');
    expect(await readCapture(path, 'image')).toMatchObject({ capturedText: '2025-06-01T23:30:00Z', capturedOn: '2025-06-02', capturedZone: 'UTC' });
  });
  it('requires date confirmation for invalid yoyotime even when EXIF is valid', async () => {
    const path = join(root, 'invalid.jpg');
    await sharp({ create: { width: 16, height: 16, channels: 3, background: 'green' } }).withExif({ IFD2: { DateTimeOriginal: '2026:01:01 10:00:00' } }).jpeg().toFile(path);
    for (const value of ['2025-02-30T12:00:00', '2025-06-01T24:00:00', 'not-a-date', '2025-06-01T12:00:00+99:00']) {
      await stamp(path, value);
      expect(await readCapture(path, 'image')).toMatchObject({ capturedText: null, capturedOn: null, yoyotime: { value, valid: false } });
    }
  });
  it('does not use another XMP namespace with a similarly named property', async () => {
    const path = join(root, 'other.jpg');
    await sharp({ create: { width: 16, height: 16, channels: 3, background: 'green' } })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:other="urn:other:" other:yoyotime="2025-06-01T10:00:00"/></rdf:RDF></x:xmpmeta>')
      .jpeg().toFile(path);
    expect(await readCapture(path, 'image')).toMatchObject({ capturedText: null, capturedOn: null, yoyotime: null });
  });
});

async function confirmFixture(path: string, kind: 'image' | 'video') {
  const key = `originals/${randomUUID()}/${randomUUID()}.bin`;
  await mkdir(dirname(objectPath(key)), { recursive: true }); await copyFile(path, objectPath(key));
  const evidence = await originalEvidence(key);
  const upload = { object_key: key, expected_size: evidence.size, sha256: evidence.sha256, kind, filename: path.split('/').at(-1) };
  const value = '2025-06-01T23:30:12.123-04:00';
  const copy = await confirmedCopy(upload, { value }, '2025-06-02');
  expect(copy.capturedText).toBe(value);
  expect(await fileHash(objectPath(key))).toBe(evidence.sha256);
  expect(await originalEvidence(copy.key)).toMatchObject({ size: copy.size, sha256: copy.sha256 });
  if (kind === 'video') {
    const processed = await processMedia({ mediaId: randomUUID(), token: randomUUID(), generation: 1, attempts: 1, key: copy.key, kind, sha256: copy.sha256 });
    expect(processed.capturedText).toBe(value);
    expect(processed.playbackKey).toBeTruthy();
  }
  // Original camera/container creation metadata remains intact in the output.
  const tags = async (p: string) => JSON.parse((await run('perl', [exiftool, '-j', '-s', '-DateTimeOriginal', '-OffsetTimeOriginal', '-CreateDate', p])).stdout)[0];
  const before = await tags(objectPath(key)), after = await tags(objectPath(copy.key));
  delete before.SourceFile; delete after.SourceFile; expect(after).toEqual(before);
  await stamp(objectPath(key), value);
  const existingEvidence = await originalEvidence(key);
  const existing = { ...upload, sha256: existingEvidence.sha256, expected_size: existingEvidence.size };
  const kept = await confirmedCopy(existing, { value }, captureDate(value)!);
  expect(kept.sha256).toBe(existingEvidence.sha256);
  await expect(confirmedCopy(existing, { value: '2025-07-01' }, '2025-07-01')).rejects.toMatchObject({ code: 'VALIDATION' });
  const replaced = await confirmedCopy(existing, { value: '2025-07-01', replaceExisting: true }, '2025-07-01');
  expect(replaced.capturedText).toBe('2025-07-01');
}
