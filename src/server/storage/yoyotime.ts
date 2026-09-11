import exiftoolPath from 'exiftool-vendored.pl';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { captureDate } from '../../domain/capture-date';

const run = promisify(execFile);
export type YoyoTime = { value: string | null; source: string | null; rawValue: string | null; valid: boolean };

// Read XMP from the actual container (including HEIC and MOV/MP4), not filenames
// or a scan of arbitrary media bytes. Only the bundled, trusted config is loaded.
export async function readYoyoTime(path: string): Promise<YoyoTime | null> {
  await access(resolve('config/yoyotime.config'));
  const { stdout } = await run(process.env.PERL_PATH || 'perl', [exiftoolPath,
    '-config', resolve('config/yoyotime.config'), '-j', '-G1', '-s', '-XMP-yoyo:all', '--', resolve(path),
  ], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const tags = JSON.parse(stdout)[0] as Record<string, unknown>;
  if (!tags || !Object.hasOwn(tags, 'XMP-yoyo:yoyotime')) return null;
  const string = (name: string) => typeof tags[`XMP-yoyo:${name}`] === 'string' ? tags[`XMP-yoyo:${name}`] as string : null;
  const value = string('yoyotime');
  return { value, source: string('yoyotimeSource'), rawValue: string('yoyotimeRawValue'), valid: captureDate(value) !== null };
}
