-- Attachment totals may grow across batches; retain only count integrity.
alter table momentnest.events
  drop constraint events_media_count_check,
  add constraint events_media_count_check check (media_count >= 0);
