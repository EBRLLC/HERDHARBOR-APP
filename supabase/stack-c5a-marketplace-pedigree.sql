-- HerdHarbor revised Stack C5A — canonical pedigree snapshot bridge + hardening.


-- Remove the abandoned pre-C7 pedigree sanitizer before the canonical C5
-- snapshot contract is introduced. Otherwise an intermediate C5 deployment
-- can rewrite the new snapshot into the old schema before C7C cleanup lands.
drop trigger if exists marketplace_sanitize_public_pedigree
on public.marketplace_listings;
-- The database does not calculate lineage. It exposes a narrow Owner-only source
-- to the server adapter, which invokes the existing canonical JS pedigree engine.

create or replace function public.marketplace_owner_pedigree_source(listing_id_value uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $c5_source$
declare
  actor uuid := auth.uid();
  source_id text;
  visibility_value text;
  authority_stage text;
  snapshot jsonb;
  animal_count integer := 0;
  safe_animals jsonb := '[]'::jsonb;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace pedigree preview is Owner-only'
      using errcode = '42501';
  end if;

  select l.source_animal_id, l.pedigree_visibility
  into source_id, visibility_value
  from public.marketplace_listings l
  where l.id = listing_id_value
    and l.seller_id = actor
  limit 1;

  if not found then
    raise exception 'Marketplace listing is unavailable'
      using errcode = '22023';
  end if;

  visibility_value := lower(btrim(coalesce(visibility_value, 'hidden')));
  if visibility_value = 'hidden' then
    return jsonb_build_object(
      'available', false,
      'reason', 'hidden',
      'visibility', 'hidden'
    );
  end if;

  source_id := nullif(btrim(coalesce(source_id, '')), '');
  if source_id is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'no_linked_source',
      'visibility', visibility_value
    );
  end if;

  select m.cutover_stage
  into authority_stage
  from public.herdharbor_sync_manifest m
  where m.user_id = actor;

  if coalesce(authority_stage, 'legacy') = 'normalized' then
    raise exception 'Marketplace pedigree source requires a normalized-authority bridge upgrade'
      using errcode = '55000';
  end if;

  select d.app_state
  into snapshot
  from public.herdharbor_user_data d
  where d.user_id = actor
  limit 1;

  if snapshot is null or jsonb_typeof(snapshot -> 'animals') <> 'array' then
    return jsonb_build_object(
      'available', false,
      'reason', 'source_unavailable',
      'visibility', visibility_value
    );
  end if;

  animal_count := jsonb_array_length(snapshot -> 'animals');
  if animal_count > 5000 then
    raise exception 'Marketplace pedigree source exceeds safe processing limit'
      using errcode = '54000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', nullif(btrim(coalesce(item ->> 'id', item ->> 'uuid', item ->> 'recordId', item ->> 'record_id', item ->> 'key')), ''),
        'name', nullif(btrim(coalesce(item ->> 'name', item ->> 'registeredName', item ->> 'animalName')), ''),
        'species', nullif(btrim(coalesce(item ->> 'species', '')), ''),
        'breed', nullif(btrim(coalesce(item ->> 'breed', '')), ''),
        'sex', nullif(btrim(coalesce(item ->> 'sex', item ->> 'gender')), ''),
        'dob', nullif(btrim(coalesce(item ->> 'dob', item ->> 'dateOfBirth', item ->> 'birthDate')), ''),
        'color', nullif(btrim(coalesce(item ->> 'variety', item ->> 'color')), ''),
        'registrationNumber', nullif(btrim(coalesce(item ->> 'registrationNumber', item ->> 'registration', item ->> 'regNumber', item ->> 'regNo')), ''),
        'prefix', nullif(btrim(coalesce(item ->> 'prefix', item ->> 'rabbitry', item ->> 'rabbitryName', item ->> 'breeder')), ''),
        'sireId', nullif(btrim(coalesce(item ->> 'sireId', item ->> 'sire_id')), ''),
        'damId', nullif(btrim(coalesce(item ->> 'damId', item ->> 'dam_id')), '')
      ))
      order by lower(coalesce(item ->> 'id', item ->> 'uuid', item ->> 'recordId', item ->> 'record_id', item ->> 'key'))
    ),
    '[]'::jsonb
  )
  into safe_animals
  from jsonb_array_elements(snapshot -> 'animals') item
  where nullif(btrim(coalesce(item ->> 'id', item ->> 'uuid', item ->> 'recordId', item ->> 'record_id', item ->> 'key')), '') is not null;

  if not exists (
    select 1
    from jsonb_array_elements(safe_animals) item
    where item ->> 'id' = source_id
  ) then
    return jsonb_build_object(
      'available', false,
      'reason', 'source_missing',
      'visibility', visibility_value
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'visibility', visibility_value,
    'subjectId', source_id,
    'animals', safe_animals
  );
end
$c5_source$;

revoke all on function public.marketplace_owner_pedigree_source(uuid) from public, anon;
grant execute on function public.marketplace_owner_pedigree_source(uuid) to authenticated;

create or replace function public.marketplace_reset_pedigree_snapshot_on_source_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $c5_reset$
begin
  if old.source_animal_id is distinct from new.source_animal_id
    or old.pedigree_visibility is distinct from new.pedigree_visibility
  then
    new.public_pedigree := null;
    new.pedigree_depth := 0;
  end if;
  return new;
end
$c5_reset$;

revoke all on function public.marketplace_reset_pedigree_snapshot_on_source_change() from public, anon, authenticated;

drop trigger if exists marketplace_reset_pedigree_snapshot_on_source_change
on public.marketplace_listings;

create trigger marketplace_reset_pedigree_snapshot_on_source_change
before update of source_animal_id, pedigree_visibility
on public.marketplace_listings
for each row
execute function public.marketplace_reset_pedigree_snapshot_on_source_change();

create or replace function public.marketplace_owner_set_pedigree_snapshot(
  listing_id_value uuid,
  snapshot_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $c5_set$
declare
  actor uuid := auth.uid();
  listing_visibility text;
  expected_generations integer;
  snapshot_generations integer;
  expected_nodes integer;
  node jsonb;
  animal jsonb;
  node_generation integer;
  node_status text;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace pedigree preview is Owner-only'
      using errcode = '42501';
  end if;

  select lower(btrim(coalesce(l.pedigree_visibility, 'hidden')))
  into listing_visibility
  from public.marketplace_listings l
  where l.id = listing_id_value
    and l.seller_id = actor
  limit 1;

  if not found then
    raise exception 'Marketplace listing is unavailable'
      using errcode = '22023';
  end if;

  expected_generations := case listing_visibility
    when 'parents' then 2
    when '3' then 3
    when '4' then 4
    when '5' then 5
    else 0
  end;

  if expected_generations = 0 then
    update public.marketplace_listings
    set public_pedigree = null,
        pedigree_depth = 0,
        updated_at = now()
    where id = listing_id_value and seller_id = actor;

    return jsonb_build_object('available', false, 'reason', 'hidden', 'visibility', 'hidden');
  end if;

  if snapshot_value is null or jsonb_typeof(snapshot_value) <> 'object' then
    raise exception 'Marketplace pedigree snapshot is invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(snapshot_value) k(key)
    where key not in ('schema','engineVersion','visibility','generations','nodes')
  ) then
    raise exception 'Marketplace pedigree snapshot contains unsupported fields'
      using errcode = '22023';
  end if;

  if snapshot_value ->> 'schema' <> 'herdharbor-marketplace-pedigree-v1'
    or lower(btrim(coalesce(snapshot_value ->> 'visibility', ''))) <> listing_visibility
    or coalesce(snapshot_value ->> 'generations', '') !~ '^[1-5]$'
    or jsonb_typeof(snapshot_value -> 'nodes') <> 'array'
    or char_length(coalesce(snapshot_value ->> 'engineVersion', '')) > 80
  then
    raise exception 'Marketplace pedigree snapshot contract is invalid'
      using errcode = '22023';
  end if;

  snapshot_generations := (snapshot_value ->> 'generations')::integer;
  if snapshot_generations <> expected_generations then
    raise exception 'Marketplace pedigree snapshot depth does not match listing visibility'
      using errcode = '22023';
  end if;

  expected_nodes := power(2, snapshot_generations)::integer - 1;
  if jsonb_array_length(snapshot_value -> 'nodes') <> expected_nodes then
    raise exception 'Marketplace pedigree snapshot does not match canonical slot count'
      using errcode = '22023';
  end if;

  for node in
    select value from jsonb_array_elements(snapshot_value -> 'nodes')
  loop
    if jsonb_typeof(node) <> 'object' then
      raise exception 'Marketplace pedigree node is invalid'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(node) k(key)
      where key not in ('key','generation','relation','status','repeatOf','animal')
    ) then
      raise exception 'Marketplace pedigree node contains unsupported fields'
        using errcode = '22023';
    end if;

    if char_length(coalesce(node ->> 'key', '')) > 80
      or char_length(coalesce(node ->> 'relation', '')) > 120
      or char_length(coalesce(node ->> 'repeatOf', '')) > 80
      or coalesce(node ->> 'generation', '') !~ '^[0-9]+$'
    then
      raise exception 'Marketplace pedigree node field is invalid'
        using errcode = '22023';
    end if;

    node_generation := (node ->> 'generation')::integer;
    if node_generation < 0 or node_generation >= snapshot_generations then
      raise exception 'Marketplace pedigree node generation is outside snapshot depth'
        using errcode = '22023';
    end if;

    node_status := lower(btrim(coalesce(node ->> 'status', '')));
    if node_status not in ('known','repeat','unknown','missing-reference','malformed-reference','cycle') then
      raise exception 'Marketplace pedigree node status is invalid'
        using errcode = '22023';
    end if;

    animal := node -> 'animal';
    if animal is not null and jsonb_typeof(animal) <> 'null' then
      if jsonb_typeof(animal) <> 'object' then
        raise exception 'Marketplace pedigree animal payload is invalid'
          using errcode = '22023';
      end if;

      if exists (
        select 1
        from jsonb_object_keys(animal) k(key)
        where key not in ('name','prefix','sex','dob','breed','color','registrationNumber')
      ) then
        raise exception 'Marketplace pedigree animal contains unsupported fields'
          using errcode = '22023';
      end if;

      if exists (
        select 1
        from jsonb_each_text(animal) e(key, value)
        where char_length(coalesce(value, '')) > 160
      ) then
        raise exception 'Marketplace pedigree animal field exceeds allowed length'
          using errcode = '22001';
      end if;
    end if;
  end loop;

  if not exists (
    select 1
    from jsonb_array_elements(snapshot_value -> 'nodes') node_value
    where node_value ->> 'key' = 'subject'
      and node_value ->> 'generation' = '0'
  ) then
    raise exception 'Marketplace pedigree snapshot is missing its subject slot'
      using errcode = '22023';
  end if;

  update public.marketplace_listings
  set public_pedigree = snapshot_value,
      pedigree_depth = snapshot_generations,
      updated_at = now()
  where id = listing_id_value
    and seller_id = actor;

  return snapshot_value;
end
$c5_set$;

revoke all on function public.marketplace_owner_set_pedigree_snapshot(uuid,jsonb) from public, anon;
grant execute on function public.marketplace_owner_set_pedigree_snapshot(uuid,jsonb) to authenticated;

create or replace function public.marketplace_owner_listing_pedigree_preview(listing_id_value uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $c5_preview$
declare
  actor uuid := auth.uid();
  visibility_value text;
  snapshot_value jsonb;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace pedigree preview is Owner-only'
      using errcode = '42501';
  end if;

  select
    lower(btrim(coalesce(l.pedigree_visibility, 'hidden'))),
    l.public_pedigree
  into visibility_value, snapshot_value
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id = l.seller_id
  where l.id = listing_id_value
    and l.state = 'available'
    and p.marketplace_status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'not_available');
  end if;

  if visibility_value = 'hidden' then
    return jsonb_build_object('available', false, 'reason', 'hidden', 'visibility', 'hidden');
  end if;

  if snapshot_value is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'refresh_required',
      'visibility', visibility_value
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'visibility', visibility_value,
    'snapshot', snapshot_value
  );
end
$c5_preview$;

revoke all on function public.marketplace_owner_listing_pedigree_preview(uuid) from public, anon;
grant execute on function public.marketplace_owner_listing_pedigree_preview(uuid) to authenticated;

-- Keep every pre-existing pedigree-related Marketplace RPC closed unless it is
-- one of the revised private-preview contracts above.
do $c5_legacy$
declare
  function_row record;
begin
  for function_row in
    select
      p.proname,
      format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'marketplace_%'
      and p.proname ilike '%pedigree%'
      and p.proname not in (
        'marketplace_owner_pedigree_source',
        'marketplace_reset_pedigree_snapshot_on_source_change',
        'marketplace_owner_set_pedigree_snapshot',
        'marketplace_owner_listing_pedigree_preview'
      )
  loop
    execute format('revoke all privileges on function %s from public, anon, authenticated', function_row.signature);
    execute format('grant execute on function %s to service_role', function_row.signature);
  end loop;
end
$c5_legacy$;
