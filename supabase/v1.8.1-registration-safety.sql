create table if not exists public.registration_policy (
  singleton boolean primary key default true check (singleton = true),
  enabled boolean not null default false,
  enforcement_started_at timestamptz,
  minimum_account_holder_age smallint not null default 18 check (minimum_account_holder_age between 18 and 25),
  updated_at timestamptz not null default now()
);

insert into public.registration_policy (singleton, enabled, enforcement_started_at, minimum_account_holder_age)
values (true, false, null, 18)
on conflict (singleton) do nothing;

alter table public.registration_policy enable row level security;
revoke all on table public.registration_policy from anon, authenticated;
comment on table public.registration_policy is 'Server-only rollout policy for HerdHarbor adult account-holder registration requirements.';

create table if not exists public.registration_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legal_first_name text not null check (char_length(legal_first_name) between 1 and 80),
  legal_last_name text not null check (char_length(legal_last_name) between 1 and 80),
  age_at_registration smallint not null check (age_at_registration between 18 and 120),
  phone_normalized text not null check (char_length(phone_normalized) between 10 and 18),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region text not null check (char_length(region) between 1 and 80),
  postal_code text not null check (char_length(postal_code) between 3 and 16),
  organization_name text check (organization_name is null or char_length(organization_name) <= 120),
  usage_type text not null check (usage_type in ('adult_self', 'farm_business', 'guardian_for_minor')),
  guardian_attestation boolean not null default false,
  terms_accepted_at timestamptz not null,
  accuracy_certified_at timestamptz not null,
  age_verified_at timestamptz not null,
  risk_status text not null default 'clear' check (risk_status in ('clear', 'review', 'blocked')),
  risk_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (usage_type <> 'guardian_for_minor' or guardian_attestation = true)
);

create index if not exists registration_profiles_phone_idx on public.registration_profiles (phone_normalized);
create index if not exists registration_profiles_created_at_idx on public.registration_profiles (created_at desc);
create index if not exists registration_profiles_risk_status_idx on public.registration_profiles (risk_status);

alter table public.registration_profiles enable row level security;
revoke all on table public.registration_profiles from anon, authenticated;
comment on table public.registration_profiles is 'Server-only registration identity and age-verification profile. Full date of birth is intentionally not retained.';
