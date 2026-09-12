'use client';
import { useState } from 'react';
import { DateField } from './date-field';
import { BIRTHDAY, validEventDate } from '@/domain/dates';
import { captureDate, formatCaptureTime } from '@/domain/capture-date';
import { captureValue, type ConfirmedUploadTime } from '@/domain/upload-time';

export function UploadTimeConfirmation({ name, text, zone, existingYoyo, confirmed, automatic, today, disabled, onChange }: {
  name: string; text: string | null; zone: string | null; existingYoyo: boolean;
  confirmed?: ConfirmedUploadTime; automatic?: boolean; today: string; disabled: boolean;
  onChange: (value?: ConfirmedUploadTime) => void;
}) {
  const candidate = captureValue(text, zone);
  const initialValue = confirmed ? captureValue(confirmed.value, null) : candidate;
  const [editing, setEditing] = useState(!candidate);
  const [day, setDay] = useState(initialValue?.slice(0, 10) || '');
  const [time, setTime] = useState(initialValue?.match(/T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/)?.[1] || '');
  const [offset, setOffset] = useState(initialValue?.match(/(Z|[+-]\d{2}:?\d{2})$/)?.[1] || '');
  const value = day + (time ? `T${time}${offset}` : '');
  const chosenDay = captureDate(value);
  const ready = !!chosenDay && validEventDate(chosenDay, today);
  const invalidate = () => onChange(undefined);
  return <div className="media-date upload-time-confirmation">
    {candidate ? <small>{existingYoyo ? '文件已有 yoyotime' : '文件中的时间（请核对）'}：{formatCaptureTime(text, zone)}</small>
      : <small className="upload-attention">未找到可靠时间，请选择采用的日期；具体时刻可留空。</small>}
    {confirmed ? <>
      <strong>{automatic ? '已自动采用' : '已确认'}：{formatCaptureTime(confirmed.value)}</strong>
      <small>归档到 {captureDate(confirmed.value)}</small>
      <button type="button" disabled={disabled} onClick={() => { invalidate(); setEditing(true); }}>修改时间</button>
    </> : <>
      {candidate && !editing && <>
        <button type="button" disabled={disabled || !validEventDate(captureDate(candidate) || '', today)} onClick={() => onChange({ value: existingYoyo ? text! : candidate })}>确认采用文件中的时间</button>
        <button type="button" disabled={disabled} onClick={() => setEditing(true)}>选择其他时间</button>
      </>}
      {editing && <>
        <span>采用日期</span>
        <DateField label={`${name}的采用日期`} min={BIRTHDAY} max={today} required disabled={disabled} value={day} onChange={value => { setDay(value); invalidate(); }}/>
        <label>具体时刻（可留空）<input aria-label={`${name}的具体时刻`} type="time" step="any" value={time} disabled={disabled} onChange={event => { setTime(event.target.value); invalidate(); }}/></label>
        {time && <label>时区<select aria-label={`${name}的时区`} value={offset} disabled={disabled} onChange={event => { setOffset(event.target.value); invalidate(); }}>
          <option value="">未知，保留所选时刻</option><option value="+08:00">北京时间 UTC+08:00</option><option value="Z">UTC</option>
          {offset && !['+08:00', 'Z'].includes(offset) && <option value={offset}>文件时区 {offset}</option>}
        </select></label>}
        {existingYoyo && <small>采用其他时间会替换服务器副本中的 yoyotime。</small>}
        {ready && <small>将归档到 {chosenDay}{!time ? '（不补具体时刻）' : ''}</small>}
        <button type="button" disabled={disabled || !ready} onClick={() => onChange({ value, replaceExisting: existingYoyo })}>确认采用所选时间</button>
        {candidate && <button type="button" disabled={disabled} onClick={() => setEditing(false)}>返回文件时间</button>}
      </>}
    </>}
    <small>保存时写入服务器文件副本；手机相册原件和原始拍摄信息保留。</small>
  </div>;
}
