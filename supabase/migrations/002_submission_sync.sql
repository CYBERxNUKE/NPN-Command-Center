alter table public.submissions add column if not exists submission_key text;
create unique index if not exists submissions_submission_key_idx on public.submissions(submission_key);

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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
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
    values (p_external_key, p_manufacturer, p_product, p_source_url, p_postmark_deadline, p_address, p_instructions, 'OPEN', 'UNVERIFIED')
    on conflict (external_key) do update set product = excluded.product, source_url = excluded.source_url, postmark_deadline = excluded.postmark_deadline, address = excluded.address, instructions = excluded.instructions, updated_at = now()
    returning id into opportunity;

  insert into public.submissions (submission_key, opportunity_id, household_id, member_id, owner_id, status, mailed_at)
    values (p_external_key || ':' || current_user_id::text, opportunity, household, member, current_user_id, p_status, p_mailed_at)
    on conflict (submission_key) do update set status = excluded.status, mailed_at = excluded.mailed_at, updated_at = now()
    returning id into submission;
  return submission;
end;
$$;

revoke all on function public.record_submission(text,text,text,text,text,date,date,text,text) from public;
grant execute on function public.record_submission(text,text,text,text,text,date,date,text,text) to authenticated;
