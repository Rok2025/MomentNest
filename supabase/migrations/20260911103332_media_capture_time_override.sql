-- Human corrections are separate from extracted metadata, so workers cannot
-- overwrite them while publishing a preview or retrying a video conversion.
alter table momentnest.media add column capture_time_override text;
alter table momentnest.media add constraint media_capture_time_override_valid check (
 capture_time_override is null or (
  capture_time_override ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$'
  and capture_time_override::timestamp >= timestamp '1970-01-01'
  and to_char(capture_time_override::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') = capture_time_override
 )
);
grant update(capture_time_override) on momentnest.media to momentnest_app;
