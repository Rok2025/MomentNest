import { BackupPage } from '@/components/backup-page';
import { Header, Unavailable } from '@/components/shell';
import { pageContext } from '@/server/page-context';
import { listBackupJobs } from '@/server/backup-jobs';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Backup() {
  const context = await pageContext();
  if (!context.ok) return <Unavailable message={context.message} />;
  if (context.member.label !== '爸爸') return <><Header label={context.member.label} /><section className="panel empty"><p className="eyebrow">家庭资料</p><h1>备份与导出</h1><p>目前只有爸爸可以创建和下载家庭备份。</p><Link className="button" href="/">返回时间线</Link></section></>;
  return <BackupPage label={context.member.label} initialJobs={listBackupJobs(context.member.householdId).filter(Boolean) as Exclude<ReturnType<typeof listBackupJobs>[number], undefined>[]} />;
}
