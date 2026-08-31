-- HerdHarbor Alpha v1.5.1: require an active account for Admin authorization.
-- The installed Admin mutation RPCs use herdharbor_account_role() as their
-- server-side authorization gate. Keep that gate aligned with the protected
-- directory RPC and the client policy layer.

create or replace function public.herdharbor_account_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select aa.account_role
      from public.account_access as aa
      where aa.user_id = auth.uid()
        and aa.account_status = 'active'
      limit 1
    ),
    'user'
  );
$$;

comment on function public.herdharbor_account_role() is
  'Returns the active HerdHarbor account role; disabled accounts resolve to user.';
