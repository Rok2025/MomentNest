'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from './shell';

type Job = { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; stage: string; progress: number; startedAt: string; finishedAt?: string; records?: number; originals?: number; exportedFiles?: number; reviewFiles?: number; error?: string };

const stageText: Record<string, string> = { waiting: '等待开始', snapshot: '整理回忆和原件', files: '生成照片视频副本', completed: '已完成并校验', failed: '备份失败' };
function time(value?: string) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''; }

export function BackupPage({ label, initialJobs }: { label: string; initialJobs: Job[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const active = useMemo(() => jobs.some(job => job.status === 'queued' || job.status === 'running'), [jobs]);

  async function refresh() {
    const response = await fetch('/api/backups', { cache: 'no-store' });
    if (response.ok) setJobs((await response.json() as { jobs: Job[] }).jobs);
  }
  useEffect(() => { if (!active) return; const timer = window.setInterval(() => void refresh(), 1800); return () => window.clearInterval(timer); }, [active]);
  async function create() {
    setCreating(true);
    setError('');
    try { const response = await fetch('/api/backups', { method: 'POST', cache: 'no-store' }); if (response.ok || response.status === 202) { const data = await response.json() as { job: Job }; setJobs(current => [data.job, ...current.filter(job => job.status !== 'queued' && job.status !== 'running')]); } else { const data = await response.json().catch(() => ({})) as { message?: string }; setError(data.message || '暂时无法创建备份，请稍后重试。'); } }
    catch { setError('网络暂时不可用，请稍后重试。'); }
    finally { setCreating(false); }
  }
  return <>
    <Header label={label} />
    <section className="backup-page">
      <Link href="/" className="backup-back">← 返回时间线</Link>
      <div className="backup-heading"><div><p className="eyebrow">家庭资料</p><h1>备份与导出</h1><p>给珍贵的回忆，多留一份安心。</p></div><span className="backup-admin">仅爸爸可操作</span></div>
      <div className="backup-scope"><span className="backup-info-icon" aria-hidden="true">i</span><span>备份范围</span><strong>当前家庭 · 所有成员已保存的文字、照片和视频</strong></div>
      {error && <p className="backup-error" role="alert">{error}</p>}
      <section className="backup-action panel"><div className="backup-action-icon" aria-hidden="true">✓</div><div><h2>一次备份，两份保存</h2><p>系统恢复包保留完整回忆，照片视频包按日期整理，方便下载查看。</p><small>照片视频副本保留原始文件名；同名文件会自动区分。</small></div><button className="primary" type="button" disabled={creating || active} onClick={() => void create()}>{active ? '正在创建备份' : creating ? '正在提交…' : '创建备份'}</button></section>
      {jobs.length === 0 ? <section className="panel backup-empty"><p className="empty-mark" aria-hidden="true">◇</p><h2>还没有备份记录</h2><p>创建后，备份会在服务器后台继续进行。</p></section> : <section className="backup-history"><div className="backup-history-title"><h2>备份记录</h2><span>仅显示当前家庭</span></div>{jobs.map(job => <article className="backup-record panel" key={job.id}><div className="backup-record-header"><div><h3>{time(job.startedAt)}</h3><span className={`backup-status ${job.status}`}>{stageText[job.stage] || job.status}</span></div>{job.status === 'completed' && <span className="backup-count">{job.exportedFiles ?? job.originals ?? 0} 个媒体文件</span>}</div>{(job.status === 'queued' || job.status === 'running') && <div className="backup-progress"><div className="backup-progress-label"><span>正在整理照片和视频</span><strong>{job.progress}%</strong></div><progress value={job.progress} max="100" /><small>关闭页面后仍会继续，可稍后回来查看。</small></div>}{job.status === 'failed' && <p className="backup-error" role="alert">{job.error || '备份未完成，请稍后重试。'}</p>}{job.status === 'completed' && <div className="backup-downloads"><div><strong>系统恢复包</strong><small>用于恢复回忆、成员信息和媒体原件</small><a className="button" href={`/api/backups/${job.id}/download?kind=system`}>↓ 下载</a></div><div><strong>照片视频包</strong><small>按日期分文件夹，解压后即可浏览</small><a className="button" href={`/api/backups/${job.id}/download?kind=readable`}>↓ 下载</a></div></div>}</article>)}</section>}
      <p className="backup-footnote">下载后建议另存到电脑或移动硬盘。HEIC、MOV 等格式需要兼容的查看软件。</p>
    </section>
  </>;
}
