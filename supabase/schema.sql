-- =====================================================================
-- Negative Data Archive — Supabase schema
--
-- Run this once, in full, in the Supabase SQL Editor.
--
-- Assumes the project was created with:
--   Enable Data API              ON
--   Automatically expose tables  OFF   -> every grant below is explicit
--   Enable automatic RLS         ON    -> new tables start closed
--
-- Access model:
--   read    anyone, signed in or not  (the archive is public)
--   write   signed-in users whose login email ends in @korea.ac.kr
--   edit    the record's own submitter, or an admin
--   contact addresses are readable by signed-in members only, never by
--           anonymous visitors
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Who is allowed to write
-- ---------------------------------------------------------------------

-- Membership is proven by the login email domain, not by a separate
-- member list: korea.ac.kr addresses are issued by the university and
-- revoked when someone leaves, so they track affiliation on their own.
-- Add further domains here (e.g. a hospital domain) as an OR clause.
create or replace function public.is_ku_member()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@korea.ac.kr';
$$;

-- Operators. Kept as a table rather than a JWT claim so that it can be
-- changed from the SQL editor without touching auth configuration.
create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  note     text,
  added_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer                 -- so the check works without exposing the list
set search_path = public, pg_catalog
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


-- ---------------------------------------------------------------------
-- 2. Records
--
-- Columns are explicit rather than a single jsonb blob: the archive is
-- meant to be queried directly (SQL, R via DBI/RPostgres) and named
-- columns are what make that readable. Fields not used by a record's
-- type stay null.
-- ---------------------------------------------------------------------

create table if not exists public.records (
  id           uuid primary key default gen_random_uuid(),

  type         text not null check (type in ('antibody', 'mouse', 'protocol', 'null_result')),
  outcome      text not null check (outcome in ('dead', 'cond', 'repro', 'nodiff')),
  title        text not null check (length(btrim(title)) between 1 and 300),
  summary      text not null check (length(btrim(summary)) between 1 and 4000),

  -- common to every type
  species      text,
  tissue       text,
  detail       text,
  tried        text,
  resolution   text,
  refs         text,                     -- PMID / DOI, free text
  tags         text[] not null default '{}',

  -- antibody
  target       text,
  vendor       text,
  catalog      text,
  clone        text,
  lot          text,
  host_iso     text,
  conjugate    text,
  application  text[],                   -- IHC-P, WB, Flow, ...
  dilution     text,
  fixation     text,
  retrieval    text,
  blocking     text,
  pos_control  text,

  -- mouse line / Cre
  line_name    text,
  nomenclature text,
  stock_id     text,
  background   text,
  driver       text,
  reporter     text,
  induction    text,
  efficiency   text,
  leak         text,
  genotyping   text,
  pheno        text,

  -- protocol / reagent
  procedure_name text,
  kit_vendor     text,
  kit_catalog    text,
  source_ref     text,
  failed_step    text,
  conditions     text,
  alternative    text,

  -- null result
  hypothesis   text,
  model        text,
  intervention text,
  readout      text,
  group_sizes  text,                     -- "saline n=6 (3 litters), ..."
  stat_test    text,
  stat_result  text,
  power_note   text,

  -- attachments: [{"path": "<uid>/<uuid>.jpg", "caption": "..."}]
  images       jsonb not null default '[]'::jsonb,

  -- Provenance. The contact address lives in record_contacts, not here,
  -- so that an anonymous reader cannot select it.
  --
  -- submitter_id is nullable and clears when the account goes away: a
  -- student graduates, their login is deleted, and the record must still
  -- stand. Attribution survives in submitter_name / submitter_lab, which
  -- are plain text. Only an admin can edit such a record afterwards.
  submitter_id   uuid references auth.users (id) on delete set null,
  submitter_name text not null check (length(btrim(submitter_name)) > 0),
  submitter_lab  text not null check (length(btrim(submitter_lab)) > 0),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Operator hold. A record is mirrored to the public site only when
  -- published is true, which lets an operator pull something back
  -- without deleting the submitter's work.
  published    boolean not null default true
);

create index if not exists records_created_at_idx on public.records (created_at desc);
create index if not exists records_type_idx       on public.records (type);
create index if not exists records_outcome_idx    on public.records (outcome);
create index if not exists records_submitter_idx  on public.records (submitter_id);
create index if not exists records_tags_idx       on public.records using gin (tags);

alter table public.records enable row level security;


-- Contact address, separated so that column-level exposure is not a
-- concern: row security alone cannot hide one column of a readable row.
create table if not exists public.record_contacts (
  record_id uuid primary key references public.records (id) on delete cascade,
  email     text not null
);

alter table public.record_contacts enable row level security;


-- Reproduction confirmations: one per person per record. Same reasoning
-- as submitter_id above — a confirmation outlives the account that made
-- it, so the surrogate key is its own uuid and user_id merely clears.
create table if not exists public.confirms (
  id         uuid primary key default gen_random_uuid(),
  record_id  uuid not null references public.records (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (length(btrim(name)) > 0),
  lab        text not null check (length(btrim(lab)) > 0),
  note       text,
  created_at timestamptz not null default now(),
  unique (record_id, user_id)
);

create index if not exists confirms_record_idx on public.confirms (record_id);

alter table public.confirms enable row level security;


-- ---------------------------------------------------------------------
-- 3. Keep updated_at honest
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_touch_updated_at on public.records;
create trigger records_touch_updated_at
  before update on public.records
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------
-- 4. Row level security policies
-- ---------------------------------------------------------------------

-- records ------------------------------------------------------------

drop policy if exists records_read on public.records;
create policy records_read
  on public.records for select
  to anon, authenticated
  using (published or submitter_id = auth.uid() or public.is_admin());

-- A member may only file a record under their own identity: submitter_id
-- is forced to match the caller, so one person cannot post as another.
drop policy if exists records_insert on public.records;
create policy records_insert
  on public.records for insert
  to authenticated
  with check (submitter_id = auth.uid() and public.is_ku_member());

drop policy if exists records_update on public.records;
create policy records_update
  on public.records for update
  to authenticated
  using (submitter_id = auth.uid() or public.is_admin())
  with check (submitter_id = auth.uid() or public.is_admin());

drop policy if exists records_delete on public.records;
create policy records_delete
  on public.records for delete
  to authenticated
  using (submitter_id = auth.uid() or public.is_admin());


-- record_contacts ----------------------------------------------------
-- Signed-in members see contact addresses; anonymous readers never do.

drop policy if exists contacts_read on public.record_contacts;
create policy contacts_read
  on public.record_contacts for select
  to authenticated
  using (public.is_ku_member() or public.is_admin());

drop policy if exists contacts_write on public.record_contacts;
create policy contacts_write
  on public.record_contacts for insert
  to authenticated
  with check (
    exists (select 1 from public.records r
             where r.id = record_id and r.submitter_id = auth.uid())
  );

drop policy if exists contacts_update on public.record_contacts;
create policy contacts_update
  on public.record_contacts for update
  to authenticated
  using (
    exists (select 1 from public.records r
             where r.id = record_id and (r.submitter_id = auth.uid() or public.is_admin()))
  )
  with check (
    exists (select 1 from public.records r
             where r.id = record_id and (r.submitter_id = auth.uid() or public.is_admin()))
  );


-- confirms -----------------------------------------------------------

drop policy if exists confirms_read on public.confirms;
create policy confirms_read
  on public.confirms for select
  to anon, authenticated
  using (true);

drop policy if exists confirms_insert on public.confirms;
create policy confirms_insert
  on public.confirms for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_ku_member());

drop policy if exists confirms_update on public.confirms;
create policy confirms_update
  on public.confirms for update
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists confirms_delete on public.confirms;
create policy confirms_delete
  on public.confirms for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());


-- admins -------------------------------------------------------------
-- Readable so the page can show operator controls; never writable
-- through the API. Add an operator from the SQL editor:
--   insert into public.admins (user_id, note)
--   select id, 'PI' from auth.users where email = 'eunha_kim@korea.ac.kr';

drop policy if exists admins_read on public.admins;
create policy admins_read
  on public.admins for select
  to authenticated
  using (true);


-- ---------------------------------------------------------------------
-- 5. Public view with confirmation counts
--
-- security_invoker makes the view run under the caller's own policies,
-- so it cannot be used to read around row security.
-- ---------------------------------------------------------------------

create or replace view public.records_public
with (security_invoker = true)
as
select
  r.*,
  (select count(*) from public.confirms c where c.record_id = r.id) as confirm_count
from public.records r;


-- ---------------------------------------------------------------------
-- 6. Grants
--
-- "Automatically expose new tables" is off, so nothing above is
-- reachable through the Data API until it is granted here. RLS still
-- decides which rows; these grants only decide which tables.
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.records         to anon, authenticated;
grant select on public.records_public  to anon, authenticated;
grant select on public.confirms        to anon, authenticated;

grant insert, update, delete on public.records  to authenticated;
grant insert, update, delete on public.confirms to authenticated;

grant select, insert, update on public.record_contacts to authenticated;
grant select on public.admins to authenticated;

-- Deliberately not granted to anon: record_contacts, admins, and every
-- write on anything.
