-- MomentNest only. Private schema; no business tables exposed to Data API.
create schema momentnest;
revoke all on schema momentnest from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='momentnest_app') then
    create role momentnest_app nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;
grant usage on schema momentnest to momentnest_app;
create table momentnest.households (
 id uuid primary key default gen_random_uuid(), name text not null,
 date_timezone text not null default 'Asia/Shanghai' check(date_timezone='Asia/Shanghai')
);
create table momentnest.members (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references momentnest.households,
 auth_user_id uuid not null unique references auth.users(id), label text not null check(label in ('爸爸','妈妈')),
 active boolean not null default true, unique(household_id,label), unique(household_id,id)
);
create table momentnest.subjects (
 id uuid primary key default gen_random_uuid(), household_id uuid not null unique references momentnest.households,
 name text not null default '又又', birth_date date not null default date '2025-04-17' check(birth_date=date '2025-04-17'), unique(household_id,id)
);
create table momentnest.events (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references momentnest.households,
 subject_id uuid not null, author_member_id uuid not null, updated_by uuid not null,
 title text not null default '' check(length(title)<=120), body text not null default '' check(length(body)<=20000),
 feeling text not null default '' check(length(feeling)<=5000),
 occurred_on date not null check(occurred_on>=date '2025-04-17'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 version integer not null default 1 check(version>0), unique(household_id,id),
 check(length(btrim(body))>0 or length(btrim(feeling))>0),
 foreign key(household_id,subject_id) references momentnest.subjects(household_id,id),
 foreign key(household_id,author_member_id) references momentnest.members(household_id,id),
 foreign key(household_id,updated_by) references momentnest.members(household_id,id)
);
create index events_timeline on momentnest.events(household_id,occurred_on desc,created_at desc,id desc);
create table momentnest.save_requests (
 household_id uuid not null, member_id uuid not null, request_key uuid not null,
 payload_hash text not null, event_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 primary key(household_id,member_id,request_key),
 foreign key(household_id,member_id) references momentnest.members(household_id,id),
 foreign key(household_id,event_id) references momentnest.events(household_id,id)
);
create function momentnest.guard_event() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.occurred_on > (clock_timestamp() at time zone 'Asia/Shanghai')::date then
   raise exception 'event date outside allowed range' using errcode='23514';
 end if;
 if tg_op='INSERT' then
   new.created_at=clock_timestamp(); new.updated_at=new.created_at; new.version=1;
 else
   if new.id<>old.id or new.household_id<>old.household_id or new.subject_id<>old.subject_id or new.author_member_id<>old.author_member_id or new.created_at<>old.created_at then
     raise exception 'immutable event identity' using errcode='23514';
   end if;
   if new.version<>old.version+1 then raise exception 'invalid event version' using errcode='23514'; end if;
   new.updated_at=clock_timestamp();
 end if;
 return new;
end $$;
create trigger guard_event before insert or update on momentnest.events for each row execute function momentnest.guard_event();
revoke all on all tables in schema momentnest from public, anon, authenticated;
revoke all on all functions in schema momentnest from public, anon, authenticated;
grant select on momentnest.households,momentnest.members,momentnest.subjects,momentnest.events,momentnest.save_requests to momentnest_app;
grant insert on momentnest.events,momentnest.save_requests to momentnest_app;
grant update(title,body,feeling,occurred_on,updated_by,version) on momentnest.events to momentnest_app;
-- No DELETE, no member management, no DDL for runtime. Auth -> active Member is enforced in server DAL.
-- RLS is not claimed as identity propagation for direct SQL; private schema + grants + DAL are the selected boundary.
alter default privileges in schema momentnest revoke all on tables from public, anon, authenticated;
alter default privileges in schema momentnest revoke execute on functions from public, anon, authenticated;
