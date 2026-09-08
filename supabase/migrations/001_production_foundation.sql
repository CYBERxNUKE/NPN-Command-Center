create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Chicago',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (household_id, profile_id),
  unique (household_id, label)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  manufacturer text not null,
  product text not null,
  program text,
  category text,
  status text not null default 'VERIFY_NPN' check (status in ('RADAR','VERIFY_NPN','OPEN','PROGRAM','EXPIRED','CLOSED')),
  confidence text not null default 'UNVERIFIED' check (confidence in ('UNVERIFIED','LEAD','VERIFIED')),
  release_date date,
  postmark_deadline date,
  received_deadline date,
  entry_limit text,
  method text,
  address text,
  attention text,
  instructions text,
  prize text,
  source_url text not null,
  source_kind text not null default 'official' check (source_kind in ('official','secondary','user_submitted')),
  source_last_checked_at timestamptz,
  checklist_url text,
  odds_url text,
  review_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_prizes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  prize_name text not null,
  card_pool text,
  estimated_value numeric,
  odds_text text,
  source_url text,
  evidence_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete restrict,
  household_id uuid not null references public.households(id) on delete restrict,
  member_id uuid references public.household_members(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PLANNED' check (status in ('PLANNED','PREPARED','MAILED','RECEIVED','WON','LOST','CANCELLED')),
  mailed_at date,
  tracking_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submission_evidence (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email','sms','push')),
  destination text,
  enabled boolean not null default true,
  event_types text[] not null default array['deadline_soon','source_changed'],
  created_at timestamptz not null default now(),
  unique (owner_id, channel, destination)
);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email','sms','push')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  source_url text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','duplicate')),
  reviewer_id uuid references auth.users(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.postage_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','ready','printed','mailed')),
  mail_class text not null default 'usps_ground_advantage',
  package_weight_ounces numeric not null default 1,
  estimated_cost numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.postage_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.postage_batches(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete restrict,
  address_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, submission_id)
);

create or replace function public.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = target_household and profile_id = auth.uid())
    or exists (select 1 from public.households where id = target_household and owner_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger households_updated_at before update on public.households for each row execute function public.touch_updated_at();
create trigger opportunities_updated_at before update on public.opportunities for each row execute function public.touch_updated_at();
create trigger submissions_updated_at before update on public.submissions for each row execute function public.touch_updated_at();
create trigger postage_batches_updated_at before update on public.postage_batches for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_prizes enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_evidence enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.review_queue enable row level security;
alter table public.postage_batches enable row level security;
alter table public.postage_batch_items enable row level security;

create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy households_member_read on public.households for select using (public.is_household_member(id));
create policy households_owner_write on public.households for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy members_household_access on public.household_members for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy opportunities_public_read on public.opportunities for select using (true);
create policy opportunities_authenticated_write on public.opportunities for insert with check (auth.uid() is not null);
create policy opportunity_prizes_public_read on public.opportunity_prizes for select using (true);
create policy submissions_household_access on public.submissions for all using (owner_id = auth.uid() or public.is_household_member(household_id)) with check (owner_id = auth.uid() or public.is_household_member(household_id));
create policy evidence_owner_access on public.submission_evidence for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy notification_preferences_owner on public.notification_preferences for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy notification_jobs_owner_read on public.notification_jobs for select using (owner_id = auth.uid());
create policy review_queue_authenticated_submit on public.review_queue for insert with check (auth.uid() is not null);
create policy review_queue_admin_access on public.review_queue for all using (public.is_admin()) with check (public.is_admin());
create policy postage_household_access on public.postage_batches for all using (owner_id = auth.uid() or public.is_household_member(household_id)) with check (owner_id = auth.uid() or public.is_household_member(household_id));
create policy postage_items_household_access on public.postage_batch_items for all using (exists (select 1 from public.postage_batches b where b.id = batch_id and (b.owner_id = auth.uid() or public.is_household_member(b.household_id))));

insert into storage.buckets (id, name, public)
values ('submission-evidence', 'submission-evidence', false)
on conflict (id) do nothing;

create policy evidence_storage_read on storage.objects for select using (bucket_id = 'submission-evidence' and owner_id = auth.uid());
create policy evidence_storage_insert on storage.objects for insert with check (bucket_id = 'submission-evidence' and owner_id = auth.uid());
create policy evidence_storage_delete on storage.objects for delete using (bucket_id = 'submission-evidence' and owner_id = auth.uid());
