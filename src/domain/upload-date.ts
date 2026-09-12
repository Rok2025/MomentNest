import { validEventDate } from './dates';
import { captureDate } from './capture-date';
import type { ConfirmedUploadTime } from './upload-time';

type UploadDate = {
  occurredOn?: string;
  capturedOn?: string | null;
  dateEdited?: boolean;
  requiresTimeConfirmation?: boolean;
  confirmedTime?: ConfirmedUploadTime;
};

// A fallback form date is not evidence of capture time or user confirmation.
export function uploadDateReady(item: UploadDate, today: string): boolean {
  if (item.requiresTimeConfirmation) return !!item.confirmedTime &&
    captureDate(item.confirmedTime.value) === item.occurredOn && validEventDate(item.occurredOn ?? '', today);
  return validEventDate(item.occurredOn ?? '', today) &&
    (Boolean(item.capturedOn) || item.dateEdited === true);
}
