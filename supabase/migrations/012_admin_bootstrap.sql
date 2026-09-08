create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and
     ((tg_op = 'INSERT' and new.role <> 'user') or
      (tg_op = 'UPDATE' and new.role <> old.role and not public.is_admin())) then
    raise exception 'Only an administrator can assign an administrator role';
  end if;
  return new;
end;
$$;
