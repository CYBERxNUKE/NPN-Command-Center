create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.role <> 'user') or
     (tg_op = 'UPDATE' and new.role <> old.role and not public.is_admin()) then
    raise exception 'Only an administrator can assign an administrator role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
before insert or update on public.profiles
for each row execute function public.prevent_profile_role_escalation();

create or replace function public.is_household_manager(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.households
    where id = target_household and owner_id = auth.uid()
  ) or exists (
    select 1 from public.household_members
    where household_id = target_household
      and profile_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

drop policy if exists members_household_access on public.household_members;
create policy members_household_read on public.household_members
for select using (public.is_household_member(household_id));
create policy members_household_manage on public.household_members
for insert with check (public.is_household_manager(household_id));
create policy members_household_update on public.household_members
for update using (public.is_household_manager(household_id))
with check (public.is_household_manager(household_id));
create policy members_household_delete on public.household_members
for delete using (public.is_household_manager(household_id));

drop policy if exists review_queue_authenticated_submit on public.review_queue;
create policy review_queue_authenticated_submit on public.review_queue
for insert with check (submitted_by = auth.uid());

drop policy if exists evidence_owner_access on public.submission_evidence;
create policy evidence_owner_access on public.submission_evidence
for all
using (
  owner_id = auth.uid() and exists (
    select 1 from public.submissions s
    where s.id = submission_id and s.owner_id = auth.uid()
  )
)
with check (
  owner_id = auth.uid() and exists (
    select 1 from public.submissions s
    where s.id = submission_id and s.owner_id = auth.uid()
  )
);

drop policy if exists postage_items_household_access on public.postage_batch_items;
create policy postage_items_household_access on public.postage_batch_items
for all
using (
  exists (
    select 1
    from public.postage_batches b
    join public.submissions s on s.id = submission_id
    where b.id = batch_id
      and s.household_id = b.household_id
      and (b.owner_id = auth.uid() or public.is_household_member(b.household_id))
  )
)
with check (
  exists (
    select 1
    from public.postage_batches b
    join public.submissions s on s.id = submission_id
    where b.id = batch_id
      and s.household_id = b.household_id
      and (b.owner_id = auth.uid() or public.is_household_member(b.household_id))
  )
);

drop policy if exists evidence_storage_read on storage.objects;
drop policy if exists evidence_storage_insert on storage.objects;
drop policy if exists evidence_storage_delete on storage.objects;
create policy evidence_storage_read on storage.objects
for select using (
  bucket_id = 'submission-evidence'
  and owner_id = auth.uid()
  and name like auth.uid()::text || '/%'
);
create policy evidence_storage_insert on storage.objects
for insert with check (
  bucket_id = 'submission-evidence'
  and owner_id = auth.uid()
  and name like auth.uid()::text || '/%'
);
create policy evidence_storage_delete on storage.objects
for delete using (
  bucket_id = 'submission-evidence'
  and owner_id = auth.uid()
  and name like auth.uid()::text || '/%'
);

alter table public.notification_jobs
  add column if not exists locked_at timestamptz;

create or replace function public.claim_notification_jobs(p_limit integer default 25)
returns setof public.notification_jobs
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.notification_jobs
    where (status = 'queued' and available_at <= now())
       or (status = 'processing' and (locked_at is null or locked_at < now() - interval '15 minutes'))
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.notification_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now()
  from candidates
  where j.id = candidates.id
  returning j.*;
$$;

revoke all on function public.claim_notification_jobs(integer) from public;
grant execute on function public.claim_notification_jobs(integer) to service_role;
