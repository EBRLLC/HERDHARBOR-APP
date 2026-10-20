"use strict";
// S19 transactional, per-account, server-only migration SQL builder.
// The caller MUST verify a durable encrypted backup and legacy-client shutdown first.
const { planMigration } = require("./s19-cloud-migration-core.cjs");
function encoded(value) { return Buffer.from(JSON.stringify(value), "utf8").toString("base64"); }
function sqlForCutover(input, plan = planMigration(input)) {
  if (plan.stage !== "missing" && plan.stage !== "dual_write") throw new Error("S19_UNSUPPORTED_STAGE");
  if (!Number.isSafeInteger(Number(input.manifest?.sync_generation ?? 0))) throw new Error("S19_INVALID_GENERATION");
  const uid = plan.accountId;  // validated UUID in planMigration
  const generation = Number(input.manifest?.sync_generation ?? 0);
  const stage = plan.stage;
  const timestamp = new Date(plan.sourceRevision).toISOString();
  const payload = encoded(input.legacy.app_state);
  const rowObject = Object.fromEntries(plan.normalizedRecords.map(r => [
    r.namespace + "/" + r.record_id, { payload: r.payload, checksum: r.payload_checksum }
  ]));
  const expected = encoded(rowObject);
  return `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
DO $s19$
DECLARE
 v_user uuid := '${uid}'::uuid;
 v_source jsonb := convert_from(decode('${payload}','base64'),'UTF8')::jsonb;
 v_expected jsonb := convert_from(decode('${expected}','base64'),'UTF8')::jsonb;
 v_current jsonb;
 v_legacy jsonb;
 v_modified timestamptz;
 v_stage text;
 v_generation bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,19));
 IF NOT EXISTS (SELECT 1 FROM public.herdharbor_sync_cohort
       WHERE user_id=v_user AND enabled=true AND cohort='internal_test')
 THEN RAISE EXCEPTION 'S19_COHORT_NOT_ELIGIBLE'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='public.herdharbor_user_data'::regclass
       AND tgname='herdharbor_legacy_write_cutover_guard'
       AND tgenabled <> 'D')
 THEN RAISE EXCEPTION 'S19_LEGACY_GUARD_MISSING'; END IF;
 SELECT d.app_state,d.updated_at INTO v_legacy,v_modified
   FROM public.herdharbor_user_data d WHERE d.user_id=v_user FOR UPDATE;
 IF NOT FOUND OR v_legacy IS DISTINCT FROM v_source
    OR v_modified IS DISTINCT FROM '${timestamp}'::timestamptz
 THEN RAISE EXCEPTION 'S19_LEGACY_CHANGED'; END IF;
 SELECT m.cutover_stage,m.sync_generation INTO v_stage,v_generation
   FROM public.herdharbor_sync_manifest m WHERE m.user_id=v_user FOR UPDATE;
 IF '${stage}'='missing' THEN
   IF FOUND THEN RAISE EXCEPTION 'S19_CONCURRENT_MANIFEST'; END IF;
 ELSE
   IF NOT FOUND OR v_stage <> 'dual_write'
      OR v_generation IS DISTINCT FROM ${generation}::bigint
   THEN RAISE EXCEPTION 'S19_STAGE_CHANGED'; END IF;
 END IF;
 SELECT coalesce(jsonb_object_agg(r.namespace||'/'||r.record_id,
        jsonb_build_object('payload',r.payload,'checksum',r.payload_checksum)),'{}'::jsonb)
 INTO v_current FROM public.herdharbor_sync_records r
 WHERE r.user_id=v_user AND r.deleted_at IS NULL;
 IF '${stage}'='missing' THEN
   IF EXISTS(SELECT 1 FROM public.herdharbor_sync_records WHERE user_id=v_user)
     THEN RAISE EXCEPTION 'S19_ORPHANED_RECORDS'; END IF;
   INSERT INTO public.herdharbor_sync_manifest(user_id) VALUES(v_user);
   INSERT INTO public.herdharbor_sync_records(user_id,namespace,record_id,payload,payload_checksum)
   SELECT v_user,split_part(e.key,'/',1),substr(e.key,position('/' in e.key)+1),
          e.value->'payload',e.value->>'checksum'
   FROM jsonb_each(v_expected) AS e;
 ELSIF v_current IS DISTINCT FROM v_expected THEN
   RAISE EXCEPTION 'S19_RECORD_PARITY_CHANGED';
 END IF;
 SELECT coalesce(jsonb_object_agg(r.namespace||'/'||r.record_id,
        jsonb_build_object('payload',r.payload,'checksum',r.payload_checksum)),'{}'::jsonb)
 INTO v_current FROM public.herdharbor_sync_records r
 WHERE r.user_id=v_user AND r.deleted_at IS NULL;
 IF v_current IS DISTINCT FROM v_expected THEN
   RAISE EXCEPTION 'S19_RECORD_READBACK_MISMATCH'; END IF;
 UPDATE public.herdharbor_sync_manifest m SET
   schema_version=2,cutover_stage='normalized',
   sync_generation=m.sync_generation+1,
   legacy_snapshot_updated_at=v_modified,
   last_backfill_at=now(),normalized_verified_at=now(),
   metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
      'source_checksum','${plan.sourceChecksum}',
      'verified_checksum','${plan.sourceChecksum}',
      'normalized_record_count',${plan.recordCount},
      'verification_record_count',${plan.recordCount},
      'normalized_namespace','legacy-state','normalized_format_version',2,
      'normalized_writer_ready',true,'normalized_writer_version','record-cas-v1',
      'normalized_authority_ready',true,'normalized_authority_version','record-authority-v1',
      'normalized_authority_activated_at',now(),'legacy_recovery_lock',false,
      's19_server_cutover',true)
 WHERE m.user_id=v_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'S19_MANIFEST_MISSING'; END IF;
END; $s19$;
COMMIT;`;
}
module.exports = { sqlForCutover };
