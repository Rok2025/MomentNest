import { requireIdentity } from '@/server/auth/session';
import { createBackupJob, getBackupJob, listBackupJobs } from '@/server/backup-jobs';
import { memberFor } from '@/server/event-store';
import { database } from '@/server/db';
import { apiFailure, checkOrigin, json } from '@/server/http';
import { DomainError } from '@/domain/events';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authId = await requireIdentity();
    const member = await memberFor(database(), authId);
    if (member.label !== '爸爸') throw new DomainError('FORBIDDEN', '只有爸爸可以查看家庭备份');
    const jobs = listBackupJobs(member.householdId);
    return json({ jobs });
  } catch (error) { return apiFailure(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const authId = await requireIdentity();
    const job = await createBackupJob(authId);
    const member = await memberFor(database(), authId);
    return json({ job: getBackupJob(job.id, member.householdId) }, job.status === 'queued' ? 202 : 200);
  } catch (error) { return apiFailure(error); }
}
