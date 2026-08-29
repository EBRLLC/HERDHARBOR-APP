-- HerdHarbor Alpha v1.5.1 protected Admin member directory.
-- Run once in the Supabase SQL Editor before live acceptance testing PR #38.

begin;

create or replace function public.admin_member_directory()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  account_role text,
  membership_tier text,
  membership_source text,
  account_status text,
  override_expires_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.account_access as caller
    where caller.user_id = auth.uid()
      and caller.account_role in ('owner', 'admin')
      and caller.account_status = 'active'
  ) then
    raise exception 'HerdHarbor Admin directory access denied.'
      using errcode = '42501';
  end if;

  return query
  select
    access.user_id,
    users.email::text,
    nullif(
      btrim(
        coalesce(
          users.raw_user_meta_data ->> 'display_name',
          users.raw_user_meta_data ->> 'full_name',
          users.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    )::text as display_name,
    users.created_at,
    users.last_sign_in_at,
    access.account_role::text,
    access.membership_tier::text,
    access.membership_source::text,
    access.account_status::text,
    access.override_expires_at,
    access.updated_at
  from public.account_access as access
  inner join auth.users as users on users.id = access.user_id
  order by users.created_at desc;
end;
$$;

comment on function public.admin_member_directory() is
  'Owner/Admin-only allowlisted HerdHarbor account directory; never returns farm state or Auth secrets.';

revoke all on function public.admin_member_directory() from public;
revoke all on function public.admin_member_directory() from anon;
revoke all on function public.admin_member_directory() from authenticated;
grant execute on function public.admin_member_directory() to authenticated;

commit;

-- Acceptance checks after installation:
-- 1. As Owner/Admin: select * from public.admin_member_directory();
-- 2. Through the app as an ordinary User: the RPC must fail with SQLSTATE 42501.
-- 3. Confirm results contain only the eleven columns declared above.
