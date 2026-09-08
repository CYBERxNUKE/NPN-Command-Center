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
