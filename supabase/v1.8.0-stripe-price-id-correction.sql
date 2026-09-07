-- HerdHarbor Alpha v1.8.0 — verified live Stripe Price ID correction
-- The original IDs were transcribed from screenshots and confused lowercase l with uppercase I.
-- These values were verified directly against the connected HerdHarbor Stripe live account.

begin;

update public.subscription_plans
set provider_price_id = case id
  when 'founder' then 'price_1UCOktGlRukEX5RKPo6jm6Vr'
  when 'member' then 'price_1UCOjrGlRukEX5RK9my06yUP'
  when 'business' then 'price_1UCOuYGlRukEX5RKo6LUWZq3'
  else provider_price_id
end,
updated_at = now()
where id in ('founder','member','business');

update public.subscription_plan_prices
set provider_price_id = case id
  when 'founder_month' then 'price_1UCOktGlRukEX5RKPo6jm6Vr'
  when 'founder_year' then 'price_1UCOwAGlRukEX5RK34xr9dQS'
  when 'member_month' then 'price_1UCOjrGlRukEX5RK9my06yUP'
  when 'member_year' then 'price_1UCOvPGlRukEX5RKJA05lDmb'
  when 'business_month' then 'price_1UCOuYGlRukEX5RKo6LUWZq3'
  when 'business_year' then 'price_1UCOnnGlRukEX5RK36kjzNZ6'
  else provider_price_id
end,
updated_at = now()
where id in ('founder_month','founder_year','member_month','member_year','business_month','business_year');

commit;
