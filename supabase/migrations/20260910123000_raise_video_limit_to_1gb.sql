-- Allow individual videos up to 1 GiB while keeping photos at 50 MiB.
alter table momentnest.upload_sessions drop constraint if exists upload_sessions_expected_size_check;
alter table momentnest.upload_sessions add constraint upload_sessions_expected_size_check
  check(expected_size>0 and expected_size<=1073741824);
