create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_owner on public.push_subscriptions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
