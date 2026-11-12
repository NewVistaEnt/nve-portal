-- New Vista Enterprises: lead form + client portal
-- One migration that sets up every table, security rule and storage bucket.
-- Run it once in Supabase: SQL Editor -> paste -> Run (or `supabase db push`).


-- ---------------------------------------------------------------------------
-- Settings (one row per key). Edited by admins on the admin page.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('brands',          '["New Vista","Green Estates","Dura Lawn","Buckeye"]'),
  ('lead_sources',    '["Referral: past client","Referral: architect or builder","Website","Google","Yard sign or truck","Home show","Other"]'),
  ('lead_alert_to',   '[]'),                       -- emails that get "new lead" alerts (e.g. ["jana@newvistaent.com"])
  ('portal_branches', '["New Vista"]'),            -- Aspire branch names that get a portal when a job is Won
  ('portal_defaults', '{"sections":{"schedule":true,"updates":true,"photos":true,"payments":true,"documents":true,"team":true},"headline":"Welcome to your project.","cover_url":null}'),
  ('aspire_sync',     '{"last_won_check":null}'),
  ('billing_portal_url', '"https://newvistaenterprises.propertyserviceportal.com"'),
  ('companycam_tag',  '"Client"');

-- ---------------------------------------------------------------------------
-- Staff: who can sign in to the admin and team pages.
-- role 'admin' = Jana and anyone who manages leads and portals
-- role 'team'  = people who can post updates to portals they are added to
-- ---------------------------------------------------------------------------
create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text not null,
  title       text,
  role        text not null default 'team' check (role in ('admin','team')),
  phone       text,
  photo_path  text,                      -- storage path in portal-media, optional
  color       text default '#2C6E70',    -- avatar color when there is no photo
  on_lead_form boolean not null default true,  -- shows in the lead form "Your name" list
  can_own_accounts boolean not null default false, -- shows in "Account owner" list
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index staff_email_lower on public.staff (lower(email));

-- ---------------------------------------------------------------------------
-- Leads from the universal lead form. Written only by the lead-submit function.
-- ---------------------------------------------------------------------------
create table public.leads (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz not null default now(),
  status                text not null default 'new' check (status in ('new','entered','archived')),
  brand                 text not null,
  kind                  text not null check (kind in ('Residential','Commercial')),
  submitted_by          text not null,
  account_owner         text not null,
  first_name            text,
  last_name             text,
  property_name         text,
  property_address      text not null,
  billing_same          boolean not null default true,
  billing_address       text,
  contact_name          text not null,
  contact_phone         text not null,
  contact_email         text not null,
  billing_contact_same  boolean not null default true,
  billing_contact_name  text,
  billing_contact_email text,
  paperless             boolean not null default true,
  lead_source           text not null,
  notes                 text,
  extra_contacts        jsonb not null default '[]',
  entered_by            text,
  entered_at            timestamptz,
  aspire_property_id    bigint,          -- filled in later (option B)
  aspire_contact_id     bigint
);
create index leads_status_created on public.leads (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Portals: one per won job.
-- ---------------------------------------------------------------------------
create table public.portals (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  status                text not null default 'pending' check (status in ('pending','invited','archived','skipped')),
  aspire_opportunity_id bigint unique,
  aspire_property_id    bigint,
  opportunity_number    text,
  project_name          text not null,
  property_name         text,
  property_address      text,
  property_city         text,
  branch                text,
  won_date              date,
  sales_rep             text,
  cover_path            text,             -- storage path, null = plain green
  headline              text,
  contact_staff_id      uuid references public.staff(id),
  sections              jsonb not null default '{"schedule":true,"updates":true,"photos":true,"payments":true,"documents":true,"team":true}',
  hidden_items          jsonb not null default '{"invoices":[],"photos":[],"documents":[]}',
  companycam_project_id text,
  invite_note           text,
  invited_at            timestamptz,
  invited_by            text,
  needs_attention       text              -- e.g. "No email in Aspire"
);
create index portals_status on public.portals (status, created_at desc);

-- Clients (and spouses/partners) who can open a portal
create table public.portal_people (
  id           uuid primary key default gen_random_uuid(),
  portal_id    uuid not null references public.portals(id) on delete cascade,
  name         text not null,
  email        text not null,
  is_primary   boolean not null default false,
  invited_at   timestamptz,
  last_seen_at timestamptz,
  unique (portal_id, email)
);
create index portal_people_email on public.portal_people (lower(email));

-- Teammates on a portal (can post updates, shown on the Team tab)
create table public.portal_team (
  portal_id    uuid not null references public.portals(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  show_on_team boolean not null default true,
  primary key (portal_id, staff_id)
);

-- Updates posted by the team
create table public.updates (
  id          uuid primary key default gen_random_uuid(),
  portal_id   uuid not null references public.portals(id) on delete cascade,
  author_id   uuid references public.staff(id) on delete set null,
  body        text not null check (length(body) between 1 and 4000),
  photo_paths text[] not null default '{}',
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index updates_portal on public.updates (portal_id, created_at desc);

-- Messages clients send to their contact (a log; the message itself is emailed)
create table public.messages (
  id          bigint generated always as identity primary key,
  portal_id   uuid not null references public.portals(id) on delete cascade,
  from_email  text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Who is signed in? Helpers used by the security rules.
-- ---------------------------------------------------------------------------
create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email','')) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where lower(email) = my_email() and role = 'admin' and active)
$$;

create or replace function public.my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from staff where lower(email) = my_email() and active limit 1
$$;

create or replace function public.can_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from portal_team pt join staff s on s.id = pt.staff_id
    where pt.portal_id = p and lower(s.email) = my_email() and s.active)
$$;

-- Same check for a given email; used only by server functions.
create or replace function public.can_post_as(p uuid, e text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where lower(email) = lower(e) and role = 'admin' and active)
      or exists (select 1 from portal_team pt join staff s on s.id = pt.staff_id
                 where pt.portal_id = p and lower(s.email) = lower(e) and s.active)
$$;
revoke execute on function public.can_post_as(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Security rules. Clients never read tables directly: the portal-data
-- function checks who they are and returns only their own project.
-- ---------------------------------------------------------------------------
alter table public.app_settings  enable row level security;
alter table public.staff         enable row level security;
alter table public.leads         enable row level security;
alter table public.portals       enable row level security;
alter table public.portal_people enable row level security;
alter table public.portal_team   enable row level security;
alter table public.updates       enable row level security;
alter table public.messages      enable row level security;

-- settings: admins read and write
create policy settings_admin on public.app_settings for all using (is_admin()) with check (is_admin());

-- staff: admins manage; any staff member can read the list (names on team pages)
create policy staff_admin on public.staff for all using (is_admin()) with check (is_admin());
create policy staff_read  on public.staff for select using (my_staff_id() is not null);

-- leads: admins only (inserts come from the lead-submit function)
create policy leads_admin on public.leads for all using (is_admin()) with check (is_admin());

-- portals: admins manage; team members can read portals they are on
create policy portals_admin on public.portals for all using (is_admin()) with check (is_admin());
create policy portals_team  on public.portals for select using (can_post(id));

create policy people_admin on public.portal_people for all using (is_admin()) with check (is_admin());

create policy team_admin on public.portal_team for all using (is_admin()) with check (is_admin());
create policy team_read  on public.portal_team for select using (can_post(portal_id));

-- updates: admins manage; team can post to their portals and edit their own
create policy updates_admin  on public.updates for all using (is_admin()) with check (is_admin());
create policy updates_read   on public.updates for select using (can_post(portal_id));
create policy updates_insert on public.updates for insert with check (can_post(portal_id) and author_id = my_staff_id());
create policy updates_own    on public.updates for update using (author_id = my_staff_id()) with check (author_id = my_staff_id() and can_post(portal_id));

create policy messages_admin on public.messages for select using (is_admin());

-- ---------------------------------------------------------------------------
-- Photo storage (private). Paths:
--   covers/<anything>          cover photos (library + uploads), admins only
--   updates/<portal_id>/<file> update photos, posted by that portal's team
--   staff/<file>               staff headshots, admins only
-- Clients see photos through short-lived signed links from portal-data.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-media', 'portal-media', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy media_admin on storage.objects for all
  using (bucket_id = 'portal-media' and public.is_admin())
  with check (bucket_id = 'portal-media' and public.is_admin());

create policy media_team_upload on storage.objects for insert
  with check (
    bucket_id = 'portal-media'
    and (storage.foldername(name))[1] = 'updates'
    and public.can_post(((storage.foldername(name))[2])::uuid)
  );

create policy media_team_read on storage.objects for select
  using (
    bucket_id = 'portal-media'
    and (storage.foldername(name))[1] = 'updates'
    and public.can_post(((storage.foldername(name))[2])::uuid)
  );
