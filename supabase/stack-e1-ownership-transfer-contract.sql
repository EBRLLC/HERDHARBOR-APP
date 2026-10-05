-- Stack E1 — harden the existing direct animal transfer contract.
-- Extends the canonical v1.8.2 transfer lifecycle; does not introduce a parallel transfer system.

alter table public.herdharbor_direct_animal_transfers
  add column if not exists transfer_categories jsonb not null
    default '{"identity":true,"pedigree":true,"genetics":true,"ownershipHistory":true}'::jsonb,
  add column if not exists expires_at timestamptz;

update public.herdharbor_direct_animal_transfers
set expires_at = coalesce(expires_at, created_at + interval '14 days')
where status = 'pending';

alter table public.herdharbor_direct_animal_transfers
  alter column expires_at set default (now() + interval '14 days');

alter table public.herdharbor_direct_animal_transfers
  drop constraint if exists herdharbor_direct_transfer_status_check;
alter table public.herdharbor_direct_animal_transfers
  add constraint herdharbor_direct_transfer_status_check
  check (status in ('pending','accepted','declined','cancelled','expired'));

alter table public.herdharbor_direct_animal_transfers
  drop constraint if exists herdharbor_direct_transfer_categories_check;
alter table public.herdharbor_direct_animal_transfers
  add constraint herdharbor_direct_transfer_categories_check
  check (
    jsonb_typeof(transfer_categories) = 'object'
    and transfer_categories ? 'identity'
    and transfer_categories ? 'pedigree'
    and transfer_categories ? 'genetics'
    and transfer_categories ? 'ownershipHistory'
    and (transfer_categories ->> 'identity')::boolean is true
    and (transfer_categories ->> 'pedigree')::boolean is true
  );

-- Service-role-only authoritative animal snapshot used by the existing animal-transfer
-- Edge Function. It follows the current normalized-authority stage and falls back to
-- the legacy snapshot for accounts that have not cut over.
create or replace function public.herdharbor_direct_transfer_owned_animals(owner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $e1$
declare
  stage text := 'legacy';
  normalized_animals jsonb;
  legacy_animals jsonb;
begin
  if owner_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(m.cutover_stage, 'legacy')
    into stage
  from public.herdharbor_sync_manifest m
  where m.user_id = owner_user_id;

  if stage = 'normalized' then
    select coalesce(jsonb_agg(r.payload -> 'value' order by r.record_id), '[]'::jsonb)
      into normalized_animals
    from public.herdharbor_sync_records r
    where r.user_id = owner_user_id
      and r.namespace = 'legacy-state'
      and r.deleted_at is null
      and r.payload ->> 'kind' = 'array_item'
      and r.payload ->> 'key' = 'animals'
      and jsonb_typeof(r.payload -> 'value') = 'object';

    return coalesce(normalized_animals, '[]'::jsonb);
  end if;

  select case
    when jsonb_typeof(d.app_state -> 'animals') = 'array' then d.app_state -> 'animals'
    else '[]'::jsonb
  end
    into legacy_animals
  from public.herdharbor_user_data d
  where d.user_id = owner_user_id;

  return coalesce(legacy_animals, '[]'::jsonb);
end;
$e1$;

revoke all on function public.herdharbor_direct_transfer_owned_animals(uuid)
  from public, anon, authenticated;
grant execute on function public.herdharbor_direct_transfer_owned_animals(uuid)
  to service_role;

comment on function public.herdharbor_direct_transfer_owned_animals(uuid) is
  'Service-role-only authoritative herd snapshot for the canonical direct transfer Edge Function. Reads normalized authority after cutover and legacy state otherwise.';
