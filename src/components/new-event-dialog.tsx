'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { NewEventChoice } from './new-event-choice';

const NewEventContext = createContext<(() => void) | null>(null);

export function NewEventDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    element.scrollTop = 0;
    element.querySelector<HTMLInputElement>('input:checked')?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      trigger?.focus({preventScroll:true});
    };
  }, [open]);

  return <NewEventContext.Provider value={() => setOpen(true)}>
    {children}
    <dialog ref={dialog} className="new-event-dialog record-kind-dialog" aria-label="记下一刻" onClose={() => {
      if (!dialog.current?.open) setOpen(false);
    }} onCancel={event => {
      event.preventDefault();
      setOpen(false);
    }}>
      <div className="dialog-bar"><span>记下一刻</span><button type="button" aria-label="关闭记录弹窗" onClick={() => setOpen(false)}>关闭 ×</button></div>
      {open && <NewEventChoice onContinue={() => setOpen(false)}/>}
    </dialog>
  </NewEventContext.Provider>;
}

export function NewEventButton({ children }: { children: ReactNode }) {
  const open = useContext(NewEventContext);
  return open
    ? <button type="button" className="button primary" onClick={open}>{children}</button>
    : <Link className="button primary" href="/events/new">{children}</Link>;
}
