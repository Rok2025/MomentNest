-- Editorial review state is independent of capture metadata and worker processing.
alter table momentnest.media
  add column needs_time_review boolean not null default false;
