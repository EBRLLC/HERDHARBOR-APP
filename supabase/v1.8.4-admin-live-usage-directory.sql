-- HerdHarbor Alpha v1.8.4: live Admin account usage telemetry.
-- Adds aggregate active-animal usage and last cloud-save timestamps without
-- exposing animal records or other private farm-state content to the browser.

begin;

create or replace function public.admin_member_directory_v2()
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
  subscription_status text,
  override_expires_at timestamptz,
  updated_at timestamptz,
  active_animal_count integer,
  last_sync_save_at timestamptz
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
    access.subscription_status::text,
    access.override_expires_at,
    access.updated_at,
    case
      when coalesce(normalized.has_animals_array, false)
        then coalesce(normalized.active_animal_count, 0)
      when legacy.user_id is not null
        then (
          select count(*)::integer
          from jsonb_array_elements(
            case
              when jsonb_typeof(legacy.app_state -> 'animals') = 'array'
                then legacy.app_state -> 'animals'
              else '[]'::jsonb
            end
          ) as animal
          where lower(coalesce(animal ->> 'status', 'active'))
            not in ('sold', 'deceased', 'archived', 'ancestor only')
        )
      else 0
    end as active_animal_count,
    greatest(
      legacy.updated_at,
      normalized.last_sync_save_at
    ) as last_sync_save_at
  from public.account_access as access
  inner join auth.users as users on users.id = access.user_id
  left join public.herdharbor_user_data as legacy on legacy.user_id = access.user_id
  left join lateral (
    select
      bool_or(
        records.deleted_at is null
        and records.record_id like 'array:animals-%'
      ) as has_animals_array,
      count(*) filter (
        where records.deleted_at is null
          and records.record_id like 'item:animals-%'
          and lower(coalesce(records.payload -> 'value' ->> 'status', 'active'))
            not in ('sold', 'deceased', 'archived', 'ancestor only')
      )::integer as active_animal_count,
      max(records.updated_at) filter (
        where records.deleted_at is null
      ) as last_sync_save_at
    from public.herdharbor_sync_records as records
    where records.user_id = access.user_id
      and records.namespace = 'legacy-state'
  ) as normalized on true
  order by users.created_at desc;
end;
$$;

comment on function public.admin_member_directory_v2() is
  'Owner/Admin-only account directory with aggregate animal usage and cloud-save timestamps; never returns member farm records.';

revoke all on function public.admin_member_directory_v2() from public;
revoke all on function public.admin_member_directory_v2() from anon;
revoke all on function public.admin_member_directory_v2() from authenticated;
grant execute on function public.admin_member_directory_v2() to authenticated;

commit;
