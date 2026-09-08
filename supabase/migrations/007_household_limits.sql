alter table public.households
  add column if not exists limits jsonb not null default '{}'::jsonb;

create or replace function public.enforce_submission_limits(
  target_opportunity uuid,
  target_household uuid,
  target_member uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_limit integer;
  household_limit integer;
  member_count integer;
  household_count integer;
begin
  select case
    when (limits->>'max_submissions_per_opportunity') ~ '^[0-9]+$'
    then (limits->>'max_submissions_per_opportunity')::integer
  end
  into member_limit
  from public.household_members
  where id = target_member;

  select case
    when (limits->>'max_submissions_per_opportunity') ~ '^[0-9]+$'
    then (limits->>'max_submissions_per_opportunity')::integer
  end
  into household_limit
  from public.households
  where id = target_household;

  select count(*) into member_count
  from public.submissions
  where opportunity_id = target_opportunity
    and member_id = target_member
    and status not in ('CANCELLED', 'LOST');

  select count(*) into household_count
  from public.submissions
  where opportunity_id = target_opportunity
    and household_id = target_household
    and status not in ('CANCELLED', 'LOST');

  if member_limit is not null and member_count >= member_limit then
    raise exception 'Member submission limit reached for this opportunity';
  end if;
  if household_limit is not null and household_count >= household_limit then
    raise exception 'Household submission limit reached for this opportunity';
  end if;
end;
$$;

create or replace function public.record_submission(
  p_external_key text,
  p_manufacturer text,
  p_product text,
  p_source_url text,
  p_status text,
  p_mailed_at date default null,
  p_postmark_deadline date default null,
  p_address text default null,
  p_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  household uuid;
  member uuid;
  opportunity uuid;
  submission uuid;
  submission_key_value text := p_external_key || ':' || current_user_id::text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(p_external_key), '') is null or nullif(trim(p_product), '') is null then
    raise exception 'Opportunity key and product are required';
  end if;

  insert into public.profiles (id) values (current_user_id) on conflict (id) do nothing;
  select id into household from public.households where owner_id = current_user_id order by created_at limit 1;
  if household is null then
    insert into public.households (name, owner_id) values ('My Household', current_user_id) returning id into household;
  end if;
  insert into public.household_members (household_id, profile_id, label, role)
    values (household, current_user_id, 'Primary', 'owner')
    on conflict (household_id, profile_id) do update set role = 'owner'
    returning id into member;

  insert into public.opportunities (external_key, manufacturer, product, source_url, postmark_deadline, address, instructions, status, confidence)
    values (p_external_key, coalesce(nullif(trim(p_manufacturer), ''), 'Unknown'), trim(p_product), trim(p_source_url), p_postmark_deadline, p_address, p_instructions, 'OPEN', 'UNVERIFIED')
    on conflict (external_key) do update set product = excluded.product, source_url = excluded.source_url, postmark_deadline = excluded.postmark_deadline, address = excluded.address, instructions = excluded.instructions, updated_at = now()
    returning id into opportunity;

  select id into submission from public.submissions where submission_key = submission_key_value;
  if submission is null then
    perform public.enforce_submission_limits(opportunity, household, member);
  end if;

  insert into public.submissions (submission_key, opportunity_id, household_id, member_id, owner_id, status, mailed_at)
    values (submission_key_value, opportunity, household, member, current_user_id, p_status, p_mailed_at)
    on conflict (submission_key) do update set status = excluded.status, mailed_at = excluded.mailed_at, updated_at = now()
    returning id into submission;
  return submission;
end;
$$;

revoke all on function public.record_submission(text,text,text,text,text,date,date,text,text) from public;
grant execute on function public.record_submission(text,text,text,text,text,date,date,text,text) to authenticated;
