-- Private local-media metadata. Original bytes stay outside the web public directory.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='momentnest_worker') then
  create role momentnest_worker nologin nosuperuser nocreatedb nocreaterole;
 end if;
end $$;
grant usage on schema momentnest to momentnest_worker;
create table momentnest.upload_sessions (
 id uuid primary key default gen_random_uuid(), household_id uuid not null, member_id uuid not null,
 object_key text not null unique, filename text not null check(length(filename)<=255),
 kind text not null check(kind in ('image','video')), expected_size bigint not null check(expected_size>0 and expected_size<=524288000),
 state text not null default 'authorized' check(state in ('authorized','verified','bound','cancelled','cleanup_claimed','expired')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default (clock_timestamp()+interval '24 hours'),
 sha256 text, mime text, event_id uuid, unique(household_id,id),
 foreign key(household_id,member_id) references momentnest.members(household_id,id),
 foreign key(household_id,event_id) references momentnest.events(household_id,id),
 check(kind='video' or expected_size<=52428800),
 check((state='bound')=(event_id is not null)),
 check(state not in ('verified','bound') or (sha256 ~ '^[0-9a-f]{64}$' and mime is not null))
);
create index upload_cleanup on momentnest.upload_sessions(expires_at) where state not in ('bound','expired');
create table momentnest.media (
 id uuid primary key default gen_random_uuid(), household_id uuid not null, event_id uuid not null,
 upload_session_id uuid not null unique, object_key text not null unique, filename text not null,
 kind text not null check(kind in ('image','video')), mime text not null, size bigint not null, sha256 text not null,
 position integer not null check(position>=0), status text not null default 'pending' check(status in ('pending','processing','ready','failed')),
 captured_text text, captured_zone text, metadata jsonb not null default '{}',
 preview_key text, playback_key text, error_code text, created_at timestamptz not null default clock_timestamp(),
 unique(household_id,id), unique(event_id,position),
 foreign key(household_id,event_id) references momentnest.events(household_id,id),
 foreign key(household_id,upload_session_id) references momentnest.upload_sessions(household_id,id)
);
create index media_event on momentnest.media(household_id,event_id);
create table momentnest.media_jobs (
 media_id uuid primary key references momentnest.media(id),
 state text not null default 'pending' check(state in ('pending','processing','ready','failed')),
 attempts integer not null default 0, generation integer not null default 1,
 available_at timestamptz not null default clock_timestamp(), lease_until timestamptz,
 claim_token uuid, updated_at timestamptz not null default clock_timestamp()
);
create index job_queue on momentnest.media_jobs(available_at) where state in ('pending','processing');
alter table momentnest.events add column media_count integer not null default 0 check(media_count between 0 and 20);
alter table momentnest.events add column cover_media_id uuid;
alter table momentnest.events add constraint event_cover_same_household foreign key(household_id,cover_media_id) references momentnest.media(household_id,id) deferrable initially deferred;
-- Replace the M1 text-only check by the equivalent text-or-media contract.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='momentnest.events'::regclass and contype='c' and pg_get_constraintdef(oid) like '%btrim(body)%' loop
 execute format('alter table momentnest.events drop constraint %I',c.conname);
 end loop;
end $$;
alter table momentnest.events add constraint event_has_content check(length(btrim(body))>0 or length(btrim(feeling))>0 or media_count>0);
-- A count cannot stand in for real attachments; check all links at commit.
create function momentnest.check_event_media() returns trigger language plpgsql set search_path=pg_catalog as $$
declare e momentnest.events%rowtype; n integer;
begin
 if tg_table_name='events' then select * into e from momentnest.events where id=new.id;
 else select * into e from momentnest.events where id=new.event_id; end if;
 select count(*) into n from momentnest.media where event_id=e.id and household_id=e.household_id;
 if n<>e.media_count then raise exception 'media count mismatch' using errcode='23514'; end if;
 if e.cover_media_id is not null and not exists(select 1 from momentnest.media where id=e.cover_media_id and event_id=e.id) then raise exception 'cover outside event' using errcode='23514';end if;
 return null;
end $$;
create constraint trigger event_media_consistency after insert or update on momentnest.events deferrable initially deferred for each row execute function momentnest.check_event_media();
create constraint trigger media_event_consistency after insert on momentnest.media deferrable initially deferred for each row execute function momentnest.check_event_media();
revoke all on momentnest.upload_sessions,momentnest.media,momentnest.media_jobs from public,anon,authenticated;
revoke all on function momentnest.check_event_media() from public,anon,authenticated;
grant select,insert on momentnest.upload_sessions,momentnest.media,momentnest.media_jobs to momentnest_app;
grant update(state,sha256,mime,event_id) on momentnest.upload_sessions to momentnest_app;
grant update(media_count,cover_media_id) on momentnest.events to momentnest_app;
grant update(status,error_code) on momentnest.media to momentnest_app;
grant update(state,attempts,generation,available_at,lease_until,claim_token,updated_at) on momentnest.media_jobs to momentnest_app;
grant select on momentnest.upload_sessions,momentnest.media,momentnest.media_jobs to momentnest_worker;
grant update(state) on momentnest.upload_sessions to momentnest_worker;
grant update(status,captured_text,captured_zone,metadata,preview_key,playback_key,error_code) on momentnest.media to momentnest_worker;
grant update(state,attempts,generation,available_at,lease_until,claim_token,updated_at) on momentnest.media_jobs to momentnest_worker;
