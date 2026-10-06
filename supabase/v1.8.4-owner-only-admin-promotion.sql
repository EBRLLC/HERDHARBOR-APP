-- Owner-only account role changes.
-- Live database hardening applied 2026-10-06.

create or replace function public.admin_set_account_role(
  target_user uuid,
  new_role text,
  change_reason text default null::text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_role text;
  old_role text;
begin
  actor_role := public.herdharbor_account_role();

  if actor_role <> 'owner' then
    raise exception 'Only the Owner account can change account roles'
      using errcode = '42501';
  end if;

  if new_role not in ('user', 'admin') then
    raise exception 'Invalid account role';
  end if;

  select account_role
  into old_role
  from public.account_access
  where user_id = target_user
  for update;

  if old_role is null then
    raise exception 'Account not found';
  end if;

  if old_role = 'owner' then
    raise exception 'The Owner account cannot be changed';
  end if;

  update public.account_access
  set
    account_role = new_role,
    updated_at = now()
  where user_id = target_user;

  insert into public.admin_audit_log (
    actor_user_id,
    target_user_id,
    action,
    previous_account_role,
    new_account_role,
    reason
  )
  values (
    auth.uid(),
    target_user,
    'account_role_changed',
    old_role,
    new_role,
    change_reason
  );
end;
$function$;

revoke execute on function public.admin_set_account_role(uuid, text, text)
from public, anon;

grant execute on function public.admin_set_account_role(uuid, text, text)
to authenticated, service_role;
