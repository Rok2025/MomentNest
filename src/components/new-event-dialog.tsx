'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { todayShanghai } from '@/domain/dates';

const EventEditor = dynamic(() => import('./event-editor').then(module => module.EventEditor), {
  loading: () => <p className="dialog-loading" role="status">正在打开记录表单…</p>,
});
const NewEventContext = createContext<(() => void) | null>(null);

export function NewEventDialog({ memberId, children }: { memberId: string; children: ReactNode }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    element.scrollTop = 0;
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, [open]);

  function start() {
    setDraftDate(current => current ?? todayShanghai());
    setOpen(true);
  }

  return <NewEventContext.Provider value={start}>
    {savedId && <p className="success dialog-saved" role="status">记录已保存。<Link href={`/events/${savedId}`}>查看这段回忆 →</Link></p>}
    {children}
    <dialog ref={dialog} className="new-event-dialog" aria-label="记下一刻" onClose={() => {
      if (!dialog.current?.open) setOpen(false);
    }} onCancel={event => {
      event.preventDefault();
      if (!saving) setOpen(false);
    }}>
      <div className="dialog-bar"><span>记下一刻</span><button type="button" aria-label="关闭记录弹窗" disabled={saving} onClick={() => setOpen(false)}>关闭 ×</button></div>
      <p className="dialog-hint">暂时关闭可保留本页输入，刷新或离开页面后不保留。</p>
      {draftDate && <EventEditor today={draftDate} memberId={memberId} onClose={() => setOpen(false)} onSavingChange={setSaving} onSaved={id => {
        setOpen(false);
        setDraftDate(null);
        setSavedId(id);
        router.refresh();
      }}/>}
    </dialog>
  </NewEventContext.Provider>;
}

export function NewEventButton({ children }: { children: ReactNode }) {
  const open = useContext(NewEventContext);
  return open
    ? <button type="button" className="button primary" onClick={open}>{children}</button>
    : <Link className="button primary" href="/events/new">{children}</Link>;
}
