import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { requireIdentity } from '@/server/auth/session';
import { memberFor } from '@/server/event-store';
import { database } from '@/server/db';
import { getBackupJobForDownload } from '@/server/backup-jobs';
import { DomainError } from '@/domain/events';
import { apiFailure } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await memberFor(database(), await requireIdentity());
    if (member.label !== '爸爸') throw new DomainError('FORBIDDEN', '只有爸爸可以下载家庭备份');
    const job = getBackupJobForDownload((await params).id, member.householdId);
    if (!job || job.status !== 'completed' || !job.directory) throw new DomainError('NOT_FOUND', '备份尚未完成或已不可用');
    const kind = new URL(request.url).searchParams.get('kind') === 'readable' ? 'readable' : 'system';
    const entries = kind === 'readable' ? ['照片和视频', 'VERIFIED'] : ['snapshot.json', 'snapshot.sha256', 'originals', 'VERIFIED'];
    const child = spawn('tar', ['-czf', '-', ...entries], { cwd: job.directory, stdio: ['ignore', 'pipe', 'ignore'] });
    child.on('error', () => child.stdout?.destroy());
    const stream = Readable.toWeb(child.stdout!) as ReadableStream;
    const filename = `momentnest-${kind === 'readable' ? '照片视频' : '系统恢复'}-${job.id.slice(0, 8)}.tar.gz`;
    return new Response(stream, { headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    }});
  } catch (error) { return apiFailure(error); }
}
