begin;

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_pedigree_visibility_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_pedigree_visibility_check
  check (pedigree_visibility in ('hidden','parents','3','4','5'));

create or replace function herdharbor_private.marketplace_sanitize_public_pedigree(payload jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  result jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'generations', least(greatest(coalesce((payload->>'generations')::integer,2),2),5),
    'nodes', '[]'::jsonb
  );
  item jsonb;
  animal jsonb;
  safe_animal jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return null;
  end if;
  if jsonb_typeof(payload->'nodes') <> 'array' then
    return result;
  end if;
  for item in select value from jsonb_array_elements(payload->'nodes')
  loop
    animal := case when jsonb_typeof(item->'animal')='object' then item->'animal' else '{}'::jsonb end;
    safe_animal := jsonb_strip_nulls(jsonb_build_object(
      'name', nullif(animal->>'name',''),
      'rabbitry', nullif(animal->>'rabbitry',''),
      'sex', nullif(animal->>'sex',''),
      'dob', nullif(animal->>'dob',''),
      'breed', nullif(animal->>'breed',''),
      'variety', nullif(animal->>'variety',''),
      'color', nullif(animal->>'color',''),
      'weight', nullif(animal->>'weight',''),
      'registrationNumber', nullif(animal->>'registrationNumber',''),
      'gcNumber', nullif(animal->>'gcNumber',''),
      'photoData', nullif(animal->>'photoData','')
    ));
    result := jsonb_set(
      result,
      '{nodes}',
      (result->'nodes') || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'path', nullif(item->>'path',''),
        'generation', coalesce((item->>'generation')::integer,0),
        'relation', nullif(item->>'relation',''),
        'publicKey', nullif(item->>'publicKey',''),
        'known', coalesce((item->>'known')::boolean,false),
        'cycle', coalesce((item->>'cycle')::boolean,false),
        'missingReference', coalesce((item->>'missingReference')::boolean,false),
        'animal', case when coalesce((item->>'known')::boolean,false) then safe_animal else null end
      )))
    );
  end loop;
  return result;
exception when others then
  return null;
end;
$$;

create or replace function herdharbor_private.marketplace_sanitize_listing_pedigree()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.pedigree_visibility='hidden' then
    new.pedigree_depth := 0;
    new.public_pedigree := null;
  else
    new.pedigree_depth := least(greatest(coalesce(new.pedigree_depth,2),2),5);
    new.public_pedigree := herdharbor_private.marketplace_sanitize_public_pedigree(new.public_pedigree);
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_sanitize_public_pedigree on public.marketplace_listings;
create trigger marketplace_sanitize_public_pedigree
before insert or update of public_pedigree,pedigree_visibility,pedigree_depth
on public.marketplace_listings
for each row execute function herdharbor_private.marketplace_sanitize_listing_pedigree();

create or replace function public.marketplace_public_pedigree(target_listing_id uuid)
returns table (
  listing_id uuid,
  pedigree_visibility text,
  pedigree_depth integer,
  public_pedigree jsonb
)
language sql
stable
security definer
set search_path=''
as $$
  select l.id,l.pedigree_visibility,l.pedigree_depth,l.public_pedigree
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=target_listing_id
    and l.state in ('available','pending','sold')
    and p.marketplace_status='active'
    and l.pedigree_visibility<>'hidden'
    and l.public_pedigree is not null
  limit 1;
$$;

revoke all on function public.marketplace_public_pedigree(uuid) from public;
grant execute on function public.marketplace_public_pedigree(uuid) to anon,authenticated;

comment on function public.marketplace_public_pedigree(uuid) is
  'Returns only the server-sanitized public pedigree snapshot. Private animal records are never queried by public listing id.';

commit;
