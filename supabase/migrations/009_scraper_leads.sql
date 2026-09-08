alter table public.review_queue
  add column if not exists lead_key text;

create unique index if not exists review_queue_lead_key_idx
  on public.review_queue(lead_key)
  where lead_key is not null;
