import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DomainError } from '@/domain/events';
import { memberFor } from './event-store';
import { database } from './db';
import { exportSnapshot } from './backup';
import { finalizeBackup } from './readable-backup';
import { storageRoot } from './storage/local';

export type BackupJob = {
  id: string;
  householdId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: 'waiting' | 'snapshot' | 'files' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  finishedAt?: string;
  directory?: string;
  records?: number;
  originals?: number;
  exportedFiles?: number;
  reviewFiles?: number;
  error?: string;
};

const runtime = globalThis as typeof globalThis & { __momentnestBackupJobs?: Map<string, BackupJob> };
const jobs = runtime.__momentnestBackupJobs ??= new Map();

function backupRoot() { return resolve(/* turbopackIgnore: true */ process.env.BACKUP_ROOT || '.private/backups'); }

function visible(job: BackupJob, householdId: string) {
  return job.householdId === householdId ? { ...job, directory: undefined } : undefined;
}

export function listBackupJobs(householdId: string) {
  return [...jobs.values()].filter(job => job.householdId === householdId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(job => visible(job, householdId));
}

export function getBackupJob(id: string, householdId: string) {
  const job = jobs.get(id);
  return job && visible(job, householdId);
}

export function getBackupJobForDownload(id: string, householdId: string) {
  const job = jobs.get(id);
  return job && job.householdId === householdId ? job : undefined;
}

async function run(job: BackupJob) {
  const folder = join(backupRoot(), `${job.startedAt.replaceAll(':', '-')}-${job.id.slice(0, 8)}`);
  job.status = 'running'; job.stage = 'snapshot'; job.progress = 8; job.directory = folder;
  try {
    await mkdir(backupRoot(), { recursive: true, mode: 0o700 });
    const client = await database().connect();
    let result: { records: number; originals: number };
    try {
      await client.query('begin isolation level repeatable read read only');
      result = await exportSnapshot(client, folder, storageRoot(), job.householdId);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
    job.records = result.records; job.originals = result.originals; job.stage = 'files'; job.progress = 55;
    const readable = await finalizeBackup(folder);
    job.exportedFiles = readable.exportedFiles; job.reviewFiles = readable.reviewFiles;
    job.status = 'completed'; job.stage = 'completed'; job.progress = 100; job.finishedAt = new Date().toISOString();
  } catch (error) {
    job.status = 'failed'; job.stage = 'failed'; job.progress = 0; job.finishedAt = new Date().toISOString();
    job.error = error instanceof Error && error.message === 'RESTRICTED_CONNECTION_REQUIRED' ? '服务器备份配置无效' : '备份未完成，请稍后重试';
  }
}

export async function createBackupJob(authId: string) {
  const member = await memberFor(database(), authId);
  if (member.label !== '爸爸') throw new DomainError('FORBIDDEN', '只有爸爸可以创建家庭备份');
  const active = [...jobs.values()].find(job => job.householdId === member.householdId && (job.status === 'queued' || job.status === 'running'));
  if (active) return active;
  const job: BackupJob = { id: randomUUID(), householdId: member.householdId, status: 'queued', stage: 'waiting', progress: 0, startedAt: new Date().toISOString() };
  jobs.set(job.id, job);
  void run(job);
  return job;
}
