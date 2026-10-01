-- HerdHarbor Alpha v1.8.4: subscription/access advisor cleanup.
-- Consolidates account-access reads and adds missing Admin audit foreign-key indexes.

begin;

drop policy if exists "Users can view own access" on public.account_access;
drop policy if exists "Admins can view member access" on public.account_access;

create policy "Users and Admins can view account access"
on public.account_access
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.herdharbor_account_role()) in ('owner', 'admin')
);

create index if not exists admin_audit_log_actor_user_id_idx
  on public.admin_audit_log(actor_user_id);

create index if not exists admin_audit_log_target_user_id_idx
  on public.admin_audit_log(target_user_id);

commit;
