import { validEventDate } from './dates';

type UploadDate = {
  occurredOn?: string;
  capturedOn?: string | null;
  dateEdited?: boolean;
};

// A fallback form date is not evidence of capture time or user confirmation.
export function uploadDateReady(item: UploadDate, today: string): boolean {
  return validEventDate(item.occurredOn ?? '', today) &&
    (Boolean(item.capturedOn) || item.dateEdited === true);
}
