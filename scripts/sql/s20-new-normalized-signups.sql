-- S20 proposed database migration. DO NOT apply before verified 2.0.1
-- release and the old-PWA client upgrade/rollback acceptance.
-- This affects only auth.users inserted AFTER the trigger is deployed.
-- Existing breeder accounts and their legacy backups are not modified.
CREATE OR REPLACE FUNCTION public.herdharbor_s20_initialize_normalized_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $s20$
DECLARE
  v_empty_checksum CONSTANT text := 'hh64:5465b825fabc98ff';
  v_manifest_payload CONSTANT jsonb := '{"kind":"snapshot_manifest","format_version":2,"snapshot_checksum":"hh64:5465b825fabc98ff","entry_count":0,"entries":[]}'::jsonb;
  v_payload_checksum CONSTANT text := 'hh64:976db5f570268d3b';
BEGIN
  -- A signup that already owns legacy or normalized records MUST NOT be
  -- overwritten or silently initialized as a blank farm.
  IF EXISTS (SELECT 1 FROM public.herdharbor_user_data d WHERE d.user_id = new.id)
     OR EXISTS (SELECT 1 FROM public.herdharbor_sync_manifest m WHERE m.user_id = new.id)
     OR EXISTS (SELECT 1 FROM public.herdharbor_sync_records r WHERE r.user_id = new.id)
  THEN
    RAISE EXCEPTION USING errcode='55000',
      message='HH_S20_SIGNUP_STORAGE_ALREADY_EXISTS';
  END IF;

  -- Current schema only permits internal_test; this is a technical
  -- allowlist for the normalized client, not a paid/AI entitlements grant.
  INSERT INTO public.herdharbor_sync_cohort(user_id,cohort,enabled)
  VALUES (new.id,'internal_test',true);
  INSERT INTO public.herdharbor_sync_manifest(
    user_id,schema_version,cutover_stage,sync_generation,
    normalized_verified_at,metadata
  ) VALUES (
    new.id,2,'normalized',1,now(),
    jsonb_build_object(
      'source_checksum',v_empty_checksum,
      'verified_checksum',v_empty_checksum,
      'normalized_record_count',1,
      'verification_record_count',1,
      'normalized_namespace','legacy-state',
      'normalized_format_version',2,
      'normalized_writer_ready',true,
      'normalized_writer_version','record-cas-v1',
      'normalized_authority_ready',true,
      'normalized_authority_version','record-authority-v1',
      'normalized_authority_activated_at',now(),
      'legacy_recovery_lock',false,
      's20_normalized_signup',true
    )
  );
  INSERT INTO public.herdharbor_sync_records(
    user_id,namespace,record_id,payload,payload_checksum
  ) VALUES (
    new.id,'legacy-state','snapshot-manifest',
    v_manifest_payload,v_payload_checksum
  );

  RETURN new;
END;
$s20$;

REVOKE ALL ON FUNCTION public.herdharbor_s20_initialize_normalized_signup()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS herdharbor_s20_normalized_signup ON auth.users;
CREATE TRIGGER herdharbor_s20_normalized_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.herdharbor_s20_initialize_normalized_signup();

-- Verification after deployment (read-only):
-- SELECT tgname,tgenabled FROM pg_trigger
--  WHERE tgrelid='auth.users'::regclass
--  AND tgname='herdharbor_s20_normalized_signup';
-- Test a new account only in isolated staging; never create fake
-- production users to verify this trigger.
