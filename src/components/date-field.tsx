'use client';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  label: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
};

// Native date controls localize their visible text independently of the page language.
// Keep the native picker and validation, with an ISO display above its transparent input.
export function DateField({value,onChange,label,...props}:DateFieldProps) {
  return <span className="iso-date">
    <span aria-hidden="true">{value || '选择日期'}</span>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/></svg>
    <input {...props} type="date" aria-label={label} value={value}
      onInput={event=>onChange(event.currentTarget.value)} onChange={event=>onChange(event.target.value)}
      onClick={event=>{try{event.currentTarget.showPicker?.();}catch{/* Older browsers open the native picker themselves. */}}}/>
  </span>;
}
