-- Keep existing records; expand the per-event attachment limit.
alter table momentnest.events
  drop constraint events_media_count_check,
  add constraint events_media_count_check check (media_count between 0 and 50);
