alter table momentnest.upload_sessions add column confirmed_yoyotime text;

alter table momentnest.upload_sessions add constraint upload_sessions_confirmed_yoyotime_format
check (confirmed_yoyotime is null or confirmed_yoyotime ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:?\d{2})$');

grant update (sha256, expected_size, archive_date, confirmed_yoyotime) on momentnest.upload_sessions to momentnest_app;
