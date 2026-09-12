import { copyFile, rename, rm, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import exiftool from 'exiftool-vendored.pl';
import { DomainError } from '../../domain/events';
import { captureDate } from '../../domain/capture-date';
import { confirmedUploadTime, type ConfirmedUploadTime } from '../../domain/upload-time';
import { objectPath, originalEvidence, fileHash } from './local';
import { readYoyoTime } from './yoyotime';

const run = promisify(execFile);

// Caller holds the upload row lock until media binding commits. Never change the
// verified upload: its size/hash remain usable for retry, draft recovery and dedup.
// A rollback leaves only this deterministic, unreferenced copy, reusable on retry
// and removed with an expired draft. Workers only see it after the DB commit.
export async function confirmedCopy(upload: Record<string, unknown>, confirmation: ConfirmedUploadTime, day: string) {
  const { value, replaceExisting } = confirmedUploadTime.parse(confirmation);
  if (captureDate(value) !== day) throw new DomainError('VALIDATION', '确认时间与归档日期不一致');
  const sourceKey = String(upload.object_key), source = objectPath(sourceKey);
  const key = sourceKey.replace(/\.bin$/, '-c.bin'), output = objectPath(key);
  const temporary = output + '.' + randomUUID() + '.part';
  try {
    const evidence = await originalEvidence(sourceKey);
    if (evidence.sha256 !== upload.sha256 || evidence.size !== Number(upload.expected_size) || evidence.kind !== upload.kind)
      throw new DomainError('VALIDATION', '上传文件校验失败，请重新上传后确认时间');
    const existing = await readYoyoTime(source);
    if (existing?.valid && existing.value !== value && !replaceExisting)
      throw new DomainError('VALIDATION', '文件已有 yoyotime，请明确选择更换时间或保留原时间');
    await copyFile(source, temporary);
    if (await fileHash(temporary) !== evidence.sha256) throw Error('COPY_HASH_MISMATCH');
    if (!existing?.valid || existing.value !== value) {
      const { stderr } = await run(process.env.PERL_PATH || 'perl', [exiftool,
        '-config', resolve('config/yoyotime.config'), '-overwrite_original',
        `-XMP-yoyo:yoyotime=${value}`, '-XMP-yoyo:yoyotimeSource=confirmed:mobile',
        `-XMP-yoyo:yoyotimeRawValue=${existing?.value || ''}`, '--', temporary,
      ], { timeout: 120000, maxBuffer: 1024 * 1024 });
      if (/Error:/i.test(stderr)) throw Error('METADATA_WRITE_FAILED');
    }
    const result = await readYoyoTime(temporary);
    if (!result?.valid || result.value !== value) throw Error('METADATA_READBACK_FAILED');
    const file = await open(temporary, 'r');
    try { await file.sync(); } finally { await file.close(); }
    await rename(temporary, output);
    const directory = await open(dirname(output), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    const written = await originalEvidence(key);
    if (written.kind !== evidence.kind || written.mime !== evidence.mime) throw Error('CONTAINER_CHANGED');
    // `result` is the post-write ExifTool readback. Calling readCapture here
    // would launch ExifTool a third time for the same verified copy.
    const capturedZone = value.match(/(Z|[+-]\d{2}:?\d{2})$/)?.[1] || null;
    return { key, ...written, capturedText: value, capturedZone: capturedZone === 'Z' ? 'UTC' : capturedZone,
      metadata: { captureSource: 'yoyotime', yoyotime: result, confirmedOnUpload: true } };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // This is a definite pre-commit failure: let the user edit/remove this file.
    // Unknown save/connection outcomes still use UNAVAILABLE and the request-key replay.
    throw new DomainError('VALIDATION', `${String(upload.filename)}：时间写入或回读失败，此文件可能不支持写入或暂时无法处理。尚未保存，请重试或移除此文件。`);
  } finally {
    await rm(temporary, { force: true });
  }
}
