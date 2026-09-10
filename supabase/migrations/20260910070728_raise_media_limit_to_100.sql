-- Expand the per-event attachment limit while retaining existing records.
alter table momentnest.events
  drop constraint events_media_count_check,
  add constraint events_media_count_check check (media_count between 0 and 100);
