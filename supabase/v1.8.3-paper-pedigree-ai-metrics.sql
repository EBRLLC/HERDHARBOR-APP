-- HerdHarbor v1.8.3 Paper Pedigree AI aggregate production metrics.
-- Privacy boundary: this table stores only daily aggregate counters. It contains
-- no user ids, pedigree values, image metadata, farm state, prompts, or provider text.

create table if not exists public.herdharbor_paper_pedigree_ai_metrics (
  usage_date date primary key,
  extraction_requests bigint not null default 0,
  structured_drafts bigint not null default 0,
  correction_required_drafts bigint not null default 0,
  rejected_outputs bigint not null default 0,
  rate_limit_hits bigint not null default 0,
  provider_failures bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint herdharbor_paper_pedigree_ai_metrics_nonnegative check (
    extraction_requests >= 0
    and structured_drafts >= 0
    and correction_required_drafts >= 0
    and rejected_outputs >= 0
    and rate_limit_hits >= 0
    and provider_failures >= 0
  )
);

alter table public.herdharbor_paper_pedigree_ai_metrics enable row level security;

revoke all on table public.herdharbor_paper_pedigree_ai_metrics from public, anon, authenticated;
grant all on table public.herdharbor_paper_pedigree_ai_metrics to service_role;

create or replace function public.herdharbor_record_paper_pedigree_ai_metric(
  p_metric text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_metric not in (
    'extraction_request',
    'structured_draft',
    'correction_required',
    'rejected_output',
    'rate_limit_hit',
    'provider_failure'
  ) then
    raise exception 'Unsupported paper pedigree AI metric.';
  end if;

  insert into public.herdharbor_paper_pedigree_ai_metrics (usage_date)
  values ((now() at time zone 'UTC')::date)
  on conflict (usage_date) do nothing;

  update public.herdharbor_paper_pedigree_ai_metrics
  set extraction_requests = extraction_requests + case when p_metric = 'extraction_request' then 1 else 0 end,
      structured_drafts = structured_drafts + case when p_metric = 'structured_draft' then 1 else 0 end,
      correction_required_drafts = correction_required_drafts + case when p_metric = 'correction_required' then 1 else 0 end,
      rejected_outputs = rejected_outputs + case when p_metric = 'rejected_output' then 1 else 0 end,
      rate_limit_hits = rate_limit_hits + case when p_metric = 'rate_limit_hit' then 1 else 0 end,
      provider_failures = provider_failures + case when p_metric = 'provider_failure' then 1 else 0 end,
      updated_at = now()
  where usage_date = (now() at time zone 'UTC')::date;
end;
$$;

revoke all on function public.herdharbor_record_paper_pedigree_ai_metric(text)
  from public, anon, authenticated;
grant execute on function public.herdharbor_record_paper_pedigree_ai_metric(text)
  to service_role;

comment on table public.herdharbor_paper_pedigree_ai_metrics is
  'Privacy-safe daily aggregate metrics for Paper Pedigree AI. No farm, pedigree, image, prompt, or user data.';
comment on function public.herdharbor_record_paper_pedigree_ai_metric(text) is
  'Service-role-only increment of an allowlisted aggregate Paper Pedigree AI outcome metric.';
