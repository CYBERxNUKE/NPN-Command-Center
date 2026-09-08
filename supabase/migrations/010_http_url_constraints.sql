create or replace function public.is_http_url(value text)
returns boolean
language sql
immutable
as $$
  select value ~* '^https?://[^[:space:]]+$';
$$;

alter table public.opportunities
  add constraint opportunities_source_url_http_check
  check (public.is_http_url(source_url))
  not valid;

alter table public.opportunities
  add constraint opportunities_checklist_url_http_check
  check (checklist_url is null or public.is_http_url(checklist_url))
  not valid;

alter table public.opportunities
  add constraint opportunities_odds_url_http_check
  check (odds_url is null or public.is_http_url(odds_url))
  not valid;

alter table public.opportunity_prizes
  add constraint opportunity_prizes_source_url_http_check
  check (source_url is null or public.is_http_url(source_url))
  not valid;

alter table public.review_queue
  add constraint review_queue_source_url_http_check
  check (public.is_http_url(source_url))
  not valid;

create or replace function public.approve_review_lead(
  p_review_id uuid,
  p_manufacturer text,
  p_product text,
  p_source_url text,
  p_checklist_url text default null,
  p_odds_url text default null,
  p_prize_name text default null,
  p_card_pool text default null,
  p_odds_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  opportunity uuid;
begin
  if current_user_id is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if nullif(trim(p_product), '') is null or not public.is_http_url(trim(p_source_url)) then
    raise exception 'Product and HTTP source URL are required';
  end if;
  if p_checklist_url is not null and not public.is_http_url(trim(p_checklist_url)) then
    raise exception 'Checklist URL must use HTTP or HTTPS';
  end if;
  if p_odds_url is not null and not public.is_http_url(trim(p_odds_url)) then
    raise exception 'Odds URL must use HTTP or HTTPS';
  end if;

  insert into public.opportunities (external_key, manufacturer, product, status, confidence, source_url, source_kind, checklist_url, odds_url, created_by)
    values ('review:' || p_review_id::text, coalesce(nullif(trim(p_manufacturer), ''), 'Unknown'), trim(p_product), 'VERIFY_NPN', 'LEAD', trim(p_source_url), 'secondary', nullif(trim(p_checklist_url), ''), nullif(trim(p_odds_url), ''), current_user_id)
    on conflict (external_key) do update set manufacturer = excluded.manufacturer, product = excluded.product, source_url = excluded.source_url, checklist_url = excluded.checklist_url, odds_url = excluded.odds_url, updated_at = now()
    returning id into opportunity;

  if nullif(trim(p_prize_name), '') is not null then
    insert into public.opportunity_prizes (opportunity_id, prize_name, card_pool, odds_text, source_url, evidence_notes)
      values (opportunity, trim(p_prize_name), nullif(trim(p_card_pool), ''), nullif(trim(p_odds_text), ''), trim(p_source_url), 'Captured during admin lead review');
  end if;

  update public.review_queue
  set status = 'approved', opportunity_id = opportunity, reviewer_id = current_user_id, reviewed_at = now()
  where id = p_review_id and status = 'pending';
  if not found then raise exception 'Review lead is missing or already reviewed'; end if;
  return opportunity;
end;
$$;

revoke all on function public.approve_review_lead(uuid,text,text,text,text,text,text,text,text) from public;
grant execute on function public.approve_review_lead(uuid,text,text,text,text,text,text,text,text) to authenticated;
