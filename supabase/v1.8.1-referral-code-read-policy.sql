-- HerdHarbor Alpha v1.8.1
-- Authenticated members may read only their own public Referral ID.
-- Public/anonymous enumeration remains blocked by RLS.
begin;

drop policy if exists "users read own referral code" on public.referral_codes;
create policy "users read own referral code"
on public.referral_codes
for select
to authenticated
using (user_id = auth.uid());

grant select on table public.referral_codes to authenticated;

commit;
