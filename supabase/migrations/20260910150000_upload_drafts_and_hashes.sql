-- Preserve existing unfinished originals and make their drafts recoverable.
alter table momentnest.upload_sessions
 add column batch_id uuid,
 add column request_key uuid,
 add column client_sha256 text check(client_sha256 ~ '^[0-9a-f]{64}$'),
 add column last_modified bigint,
 add column archive_date date;
alter table momentnest.upload_sessions alter column expires_at set default (clock_timestamp()+interval '7 days');
update momentnest.upload_sessions
 set batch_id=md5(member_id::text || date_trunc('minute',created_at)::text)::uuid,
     expires_at=greatest(expires_at,clock_timestamp()+interval '7 days')
 where state in ('authorized','verified');
create unique index upload_request_key on momentnest.upload_sessions(member_id,request_key) where request_key is not null;
create index upload_client_hash on momentnest.upload_sessions(member_id,client_sha256,expected_size);
create index upload_verified_hash on momentnest.upload_sessions(member_id,sha256,expected_size);
create index upload_draft_batch on momentnest.upload_sessions(member_id,batch_id);
create index media_content_hash on momentnest.media(household_id,sha256,size);
grant update(expires_at,client_sha256,archive_date) on momentnest.upload_sessions to momentnest_app;
