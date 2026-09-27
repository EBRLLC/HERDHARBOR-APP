-- HerdHarbor v1.8.4
-- Prevent expected normalized CAS conflicts from leaving PostgREST sessions
-- in an aborted transaction state.
--
-- The existing record/group implementations are retained behind internal
-- SECURITY DEFINER functions. Public RPC names become safe wrappers that
-- execute the implementation inside a PL/pgSQL exception subtransaction.
-- Expected serialization-style HerdHarbor conflicts are rolled back and
-- returned as structured JSON instead of escaping as SQL errors.

begin;

alter function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) rename to herdharbor_sync_apply_record_internal_v184;

alter function public.herdharbor_sync_apply_record_group(
  jsonb, text
) rename to herdharbor_sync_apply_record_group_internal_v184;

revoke all on function public.herdharbor_sync_apply_record_internal_v184(
  text, text, jsonb, text, bigint, boolean, text
) from public, anon, authenticated;

revoke all on function public.herdharbor_sync_apply_record_group_internal_v184(
  jsonb, text
) from public, anon, authenticated;

create function public.herdharbor_sync_apply_record(
  p_namespace text,
  p_record_id text,
  p_payload jsonb,
  p_payload_checksum text,
  p_expected_version bigint,
  p_delete boolean,
  p_writer_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_message text;
begin
  begin
    v_result := public.herdharbor_sync_apply_record_internal_v184(
      p_namespace,
      p_record_id,
      p_payload,
      p_payload_checksum,
      p_expected_version,
      p_delete,
      p_writer_version
    );
    return v_result;
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_message = message_text;
      if v_message in ('HH_SYNC_CONFLICT', 'HH_SYNC_STAGE_CHANGED') then
        return jsonb_build_object(
          'ok', false,
          'code', v_message,
          'conflict', true,
          'namespace', p_namespace,
          'record_id', p_record_id
        );
      end if;
      raise;
  end;
end;
$$;

create function public.herdharbor_sync_apply_record_group(
  p_operations jsonb,
  p_writer_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_message text;
begin
  begin
    v_result := public.herdharbor_sync_apply_record_group_internal_v184(
      p_operations,
      p_writer_version
    );
    return v_result;
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_message = message_text;
      if v_message in ('HH_SYNC_CONFLICT', 'HH_SYNC_STAGE_CHANGED') then
        return jsonb_build_object(
          'ok', false,
          'code', v_message,
          'conflict', true
        );
      end if;
      raise;
  end;
end;
$$;

revoke all on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) from public, anon, authenticated;

revoke all on function public.herdharbor_sync_apply_record_group(
  jsonb, text
) from public, anon, authenticated;

grant execute on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) to authenticated;

grant execute on function public.herdharbor_sync_apply_record_group(
  jsonb, text
) to authenticated;

comment on function public.herdharbor_sync_apply_record_internal_v184(
  text, text, jsonb, text, bigint, boolean, text
) is
  'Internal v1.8.4 normalized record CAS implementation. Called only through the non-aborting public wrapper.';

comment on function public.herdharbor_sync_apply_record_group_internal_v184(
  jsonb, text
) is
  'Internal v1.8.4 atomic record-group CAS implementation. Called only through the non-aborting public wrapper.';

comment on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) is
  'Normalized record CAS wrapper. Expected HerdHarbor concurrency conflicts roll back safely and return structured JSON instead of aborting the PostgREST transaction.';

comment on function public.herdharbor_sync_apply_record_group(
  jsonb, text
) is
  'Atomic normalized record-group CAS wrapper. Expected HerdHarbor concurrency conflicts roll back safely and return structured JSON instead of aborting the PostgREST transaction.';

commit;
