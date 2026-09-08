alter table public.notification_jobs add column if not exists dedupe_key text;
create unique index if not exists notification_jobs_dedupe_key_idx on public.notification_jobs(dedupe_key) where dedupe_key is not null;
