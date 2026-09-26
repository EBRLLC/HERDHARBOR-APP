(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudRecordOutboxWorker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0";
  const RELEASE = "1.8.4";
  const DEFAULT_WRITER_VERSION = "record-cas-v1";
  const DEFAULT_NAMESPACE = "legacy-state";
  const DEFAULT_MAX_GROUPS = 100;
  const DEFAULT_BASE_BACKOFF_MS = 2000;
  const DEFAULT_MAX_BACKOFF_MS = 5 * 60 * 1000;

  function cloneJson(value, fallback = null) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
  }

  function requiredText(value, label, maxLength = 200) {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(`${label} is required.`);
    if (text.length > maxLength) throw new TypeError(`${label} is too long.`);
    return text;
  }

  function logicalKey(mutation) {
    return `${String(mutation?.domain || "")}\u0000${String(mutation?.recordId || "")}`;
  }

  function sameLogicalRecord(left, right) {
    return logicalKey(left) === logicalKey(right);
  }

  function mutationRevision(mutation) {
    const value = Number(mutation?.localRevision || 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function parseTime(value) {
    const time = Date.parse(String(value || ""));
    return Number.isFinite(time) ? time : 0;
  }

  function groupPendingMutations(outbox, nowMs, maxGroups = DEFAULT_MAX_GROUPS) {
    const groups = new Map();
    for (const mutation of Array.isArray(outbox) ? outbox : []) {
      if (!mutation?.mutationId || !mutation?.domain || !mutation?.recordId) continue;
      if (String(mutation.retryState || "") === "conflict") continue;
      const nextRetryAt = parseTime(mutation.nextRetryAt);
      if (nextRetryAt > nowMs) continue;
      const key = logicalKey(mutation);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mutation);
    }

    return [...groups.values()]
      .map((entries) => {
        entries.sort((left, right) =>
          mutationRevision(left) - mutationRevision(right) ||
          String(left.mutationId).localeCompare(String(right.mutationId))
        );
        return {
          entries,
          latest: entries[entries.length - 1],
          mutationIds: entries.map((entry) => String(entry.mutationId))
        };
      })
      .sort((left, right) =>
        mutationRevision(left.latest) - mutationRevision(right.latest) ||
        logicalKey(left.latest).localeCompare(logicalKey(right.latest))
      )
      .slice(0, Math.max(1, Number(maxGroups) || DEFAULT_MAX_GROUPS));
  }

  function classifyFailure(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    if (code === "HH_SYNC_CONFLICT" || code === "HH_SYNC_CONFLICT_RETRY") return "cas_conflict";
    if (/auth|required|jwt|session|401|403/.test(`${code} ${message}`)) return "auth";
    if (/timeout|timed out|abort/.test(`${code} ${message}`)) return "timeout";
    if (/offline|network|fetch|connection|failed to fetch/.test(`${code} ${message}`)) return "network";
    if (/stage|writer|required|manifest/.test(`${code} ${message}`)) return "migration_stage";
    if (/invalid|payload|checksum|serialize/.test(`${code} ${message}`)) return "local_payload";
    if (/5\d\d|server|provider/.test(`${code} ${message}`)) return "provider";
    return "provider";
  }

  function retryDelayMs(retryCount, base = DEFAULT_BASE_BACKOFF_MS, max = DEFAULT_MAX_BACKOFF_MS) {
    const attempts = Math.max(0, Number(retryCount || 0));
    return Math.min(max, base * (2 ** Math.min(attempts, 8)));
  }

  function rowVersion(row) {
    const value = Number(row?.record_version ?? row?.recordVersion ?? 0);
    return Number.isSafeInteger(value) && value >= 1 ? value : null;
  }

  function rowDeleted(row) {
    return Boolean(row?.deleted_at ?? row?.deletedAt);
  }

  function rowChecksum(row) {
    return String(row?.payload_checksum ?? row?.payloadChecksum ?? "");
  }

  function rowId(row) {
    return String(row?.record_id ?? row?.recordId ?? "");
  }

  function rowNamespace(row) {
    return String(row?.namespace || "");
  }

  function logicalIdentity(normalizer, row) {
    const payload = row?.payload;
    if (payload?.kind === "root_value") return { domain: String(payload.key || ""), recordId: "$section" };
    if (payload?.kind === "array_manifest") return { domain: String(payload.key || ""), recordId: "$order" };
    if (payload?.kind === "array_item") {
      const id = normalizer.logicalIdentityValue(payload.value);
      return id ? { domain: String(payload.key || ""), recordId: id } : null;
    }
    return null;
  }

  function create(options = {}) {
    const stateStore = options.stateStore;
    const recordStore = options.recordStore;
    const normalizer = options.normalizer;
    const baselineStore = options.baselineStore;
    const namespace = String(options.namespace || normalizer?.namespace || DEFAULT_NAMESPACE);
    const writerVersion = String(options.writerVersion || DEFAULT_WRITER_VERSION);
    const online = typeof options.online === "function"
      ? options.online
      : () => typeof navigator === "undefined" ? true : navigator.onLine !== false;
    const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    const maxGroups = Math.max(1, Number(options.maxGroups || DEFAULT_MAX_GROUPS));
    const baseBackoffMs = Math.max(100, Number(options.baseBackoffMs || DEFAULT_BASE_BACKOFF_MS));
    const maxBackoffMs = Math.max(baseBackoffMs, Number(options.maxBackoffMs || DEFAULT_MAX_BACKOFF_MS));

    if (!stateStore?.getOutbox || !stateStore?.acknowledgeMutations || !stateStore?.markMutationRetry) {
      throw new TypeError("A canonical HerdHarbor state store is required.");
    }
    if (!recordStore?.get || !recordStore?.list || !recordStore?.getManifest || !recordStore?.applyRecordMutation || !recordStore?.applyRecordMutationsAtomic) {
      throw new TypeError("A normalized record store with record CAS and atomic logical groups is required.");
    }
    if (!normalizer?.planLogicalMutation || !normalizer?.mergeNormalizedPayload || !normalizer?.checksumValue) {
      throw new TypeError("The normalized state mapper is incomplete.");
    }
    if (!baselineStore?.list || !baselineStore?.get || !baselineStore?.put || !baselineStore?.replace || !baselineStore?.getMeta) {
      throw new TypeError("A durable normalized record baseline is required.");
    }

    async function rememberLogicalVersion(row) {
      const identity = logicalIdentity(normalizer, row);
      const version = rowVersion(row);
      if (!identity || !version) return false;
      return Boolean(stateStore.setRecordVersion?.(identity.domain, identity.recordId, version));
    }

    async function primeBaseline({ force = false } = {}) {
      const meta = await baselineStore.getMeta(namespace);
      if (meta?.primed && !force) return { ok: true, skipped: true, reason: "already-primed", meta };
      if (force && stateStore.getOutbox().length > 0) {
        return { ok: false, skipped: true, reason: "pending-local-mutations" };
      }

      const manifest = await recordStore.getManifest();
      if (!manifest) return { ok: false, skipped: true, reason: "manifest-missing" };

      const rows = await recordStore.list(namespace, { includeDeleted: true });
      await baselineStore.replace(namespace, rows, {
        primed: true,
        generation: manifest.sync_generation ?? manifest.syncGeneration ?? null,
        stage: manifest.cutover_stage ?? manifest.cutoverStage ?? "",
        updatedAt: now()
      });
      for (const row of rows) await rememberLogicalVersion(row);
      return { ok: true, skipped: false, rows: rows.length, manifest };
    }

    function normalizedResultRow(operation, result, at) {
      const source = operation.row || {};
      return {
        namespace: rowNamespace(source) || namespace,
        record_id: rowId(source),
        payload: cloneJson(source.payload, {}),
        payload_checksum: rowChecksum(source),
        record_version: Number(result?.record_version ?? result?.recordVersion),
        deleted_at: operation.type === "delete" ? (result?.deleted_at || at) : null
      };
    }

    async function persistConfirmed(operation, result) {
      const at = now();
      const row = normalizedResultRow(operation, result, at);
      if (!Number.isSafeInteger(row.record_version) || row.record_version < 1) {
        throw new Error("Confirmed normalized write did not return a valid record version.");
      }
      await baselineStore.put(row);
      await rememberLogicalVersion(row);
      return row;
    }

    async function acceptRemoteAsCommitted(operation, remote) {
      await baselineStore.put(remote);
      await rememberLogicalVersion(remote);
      return { ok: true, idempotent: true, remote };
    }

    async function updateLocalAfterCompatibleMerge(operation, mutation, processedRevision) {
      if (operation.role !== "primary" || operation.row?.payload?.kind === "array_manifest") return false;
      const newer = stateStore.getOutbox().some((entry) =>
        sameLogicalRecord(entry, mutation) && mutationRevision(entry) > processedRevision
      );
      if (newer) return false;
      const current = stateStore.getState?.();
      if (!current) return false;
      const recordId = rowId(operation.row);
      const next = normalizer.applyNormalizedPayloadToSnapshot(current, recordId, operation.row.payload);
      stateStore.replaceRaw?.(JSON.stringify(next), {
        source: "cloud",
        reason: "record-cas-compatible-merge",
        notify: true
      });
      return true;
    }

    function atomicInput(operation, expectedVersion) {
      return {
        namespace,
        recordId: rowId(operation.row),
        payload: operation.type === "delete" ? null : operation.row.payload,
        payloadChecksum: operation.type === "delete" ? null : rowChecksum(operation.row),
        expectedVersion,
        deleted: operation.type === "delete"
      };
    }

    async function reconcileConflict(operation, mutation, processedRevision) {
      const recordId = rowId(operation.row);
      const remote = await recordStore.get(namespace, recordId, { includeDeleted: true });
      const baseline = await baselineStore.get(namespace, recordId);

      if (!remote) {
        return { ok: false, conflict: true, fields: ["$record_missing"] };
      }

      if (operation.type === "delete") {
        if (rowDeleted(remote)) return acceptRemoteAsCommitted(operation, remote);
        return { ok: false, conflict: true, fields: ["$delete"] };
      }

      if (rowDeleted(remote)) {
        return { ok: false, conflict: true, fields: ["$record_deleted"] };
      }

      if (rowChecksum(remote) && rowChecksum(remote) === rowChecksum(operation.row)) {
        return acceptRemoteAsCommitted(operation, remote);
      }

      if (!baseline?.payload || rowDeleted(baseline)) {
        return { ok: false, conflict: true, fields: ["$baseline"] };
      }

      const merged = normalizer.mergeNormalizedPayload(
        baseline.payload,
        operation.row.payload,
        remote.payload
      );
      if (!merged.ok) {
        return { ok: false, conflict: true, fields: [...merged.conflicts] };
      }

      const mergedChecksum = normalizer.checksumValue(merged.value);
      const retry = await recordStore.applyRecordMutation({
        namespace,
        recordId,
        payload: merged.value,
        payloadChecksum: mergedChecksum,
        expectedVersion: rowVersion(remote),
        deleted: false,
        writerVersion
      });
      const mergedOperation = {
        ...operation,
        row: {
          ...operation.row,
          payload: merged.value,
          payload_checksum: mergedChecksum
        }
      };
      const confirmedRow = await persistConfirmed(mergedOperation, retry);
      await updateLocalAfterCompatibleMerge(mergedOperation, mutation, processedRevision);
      return { ok: true, merged: true, row: confirmedRow };
    }

    async function applyOperation(operation, mutation, processedRevision) {
      const recordId = rowId(operation.row);
      const baseline = await baselineStore.get(namespace, recordId);
      if (operation.type === "put" && rowDeleted(baseline)) {
        return { ok: false, conflict: true, fields: ["$record_deleted"] };
      }

      const expectedVersion = rowVersion(baseline);
      try {
        const result = await recordStore.applyRecordMutation({
          namespace,
          recordId,
          payload: operation.type === "delete" ? null : operation.row.payload,
          payloadChecksum: operation.type === "delete" ? null : rowChecksum(operation.row),
          expectedVersion,
          deleted: operation.type === "delete",
          writerVersion
        });
        const row = await persistConfirmed(operation, result);
        return { ok: true, row };
      } catch (error) {
        if (String(error?.code || "") !== "HH_SYNC_CONFLICT") throw error;
        return reconcileConflict(operation, mutation, processedRevision);
      }
    }

    async function persistAtomicResults(entries, response) {
      const results = Array.isArray(response?.operations) ? response.operations : [];
      if (results.length !== entries.length) {
        throw Object.assign(new Error("Atomic normalized write returned an incomplete result set."), {
          code: "HH_SYNC_ATOMIC_RESULT_INCOMPLETE"
        });
      }
      const byId = new Map(results.map((result) => [String(result?.record_id ?? result?.recordId ?? ""), result]));
      for (const entry of entries) {
        const result = byId.get(rowId(entry.operation.row));
        if (!result) {
          throw Object.assign(new Error("Atomic normalized write omitted a committed record."), {
            code: "HH_SYNC_ATOMIC_RESULT_INCOMPLETE"
          });
        }
        await persistConfirmed(entry.operation, result);
      }
    }

    async function reconcileAtomicOperation(operation) {
      const recordId = rowId(operation.row);
      const remote = await recordStore.get(namespace, recordId, { includeDeleted: true });
      const baseline = await baselineStore.get(namespace, recordId);

      if (!remote) {
        if (operation.type === "put" && !baseline) {
          return { ok: true, operation, input: atomicInput(operation, null), merged: false };
        }
        return { ok: false, conflict: true, fields: ["$record_missing"] };
      }

      if (operation.type === "delete") {
        if (rowDeleted(remote)) {
          await acceptRemoteAsCommitted(operation, remote);
          return { ok: true, committed: true, operation, merged: false };
        }
        if (!baseline || rowVersion(remote) !== rowVersion(baseline)) {
          return { ok: false, conflict: true, fields: ["$delete"] };
        }
        return { ok: true, operation, input: atomicInput(operation, rowVersion(remote)), merged: false };
      }

      if (rowDeleted(remote)) {
        return { ok: false, conflict: true, fields: ["$record_deleted"] };
      }

      if (rowChecksum(remote) && rowChecksum(remote) === rowChecksum(operation.row)) {
        await acceptRemoteAsCommitted(operation, remote);
        return { ok: true, committed: true, operation, merged: false };
      }

      if (!baseline) {
        return { ok: false, conflict: true, fields: ["$create"] };
      }
      if (!baseline.payload || rowDeleted(baseline)) {
        return { ok: false, conflict: true, fields: ["$baseline"] };
      }

      if (rowVersion(remote) === rowVersion(baseline)) {
        return { ok: true, operation, input: atomicInput(operation, rowVersion(remote)), merged: false };
      }

      const merged = normalizer.mergeNormalizedPayload(
        baseline.payload,
        operation.row.payload,
        remote.payload
      );
      if (!merged.ok) {
        return { ok: false, conflict: true, fields: [...merged.conflicts] };
      }

      const mergedChecksum = normalizer.checksumValue(merged.value);
      const mergedOperation = {
        ...operation,
        row: {
          ...operation.row,
          payload: merged.value,
          payload_checksum: mergedChecksum
        }
      };
      return {
        ok: true,
        operation: mergedOperation,
        input: atomicInput(mergedOperation, rowVersion(remote)),
        merged: true
      };
    }

    async function applyAtomicOperations(operations, mutation, processedRevision) {
      const initialEntries = [];
      for (const operation of operations) {
        const baseline = await baselineStore.get(namespace, rowId(operation.row));
        if (operation.type === "put" && rowDeleted(baseline)) {
          return { ok: false, conflict: true, fields: ["$record_deleted"] };
        }
        initialEntries.push({
          operation,
          input: atomicInput(operation, rowVersion(baseline)),
          merged: false
        });
      }

      try {
        const response = await recordStore.applyRecordMutationsAtomic({
          operations: initialEntries.map((entry) => entry.input),
          writerVersion
        });
        await persistAtomicResults(initialEntries, response);
        return { ok: true, atomic: true };
      } catch (error) {
        if (String(error?.code || "") !== "HH_SYNC_CONFLICT") throw error;
      }

      const retryEntries = [];
      for (const operation of operations) {
        const reconciled = await reconcileAtomicOperation(operation);
        if (!reconciled.ok) return reconciled;
        if (!reconciled.committed) retryEntries.push(reconciled);
      }

      if (retryEntries.length) {
        let response;
        try {
          response = await recordStore.applyRecordMutationsAtomic({
            operations: retryEntries.map((entry) => entry.input),
            writerVersion
          });
        } catch (error) {
          if (String(error?.code || "") === "HH_SYNC_CONFLICT") {
            return { ok: false, retry: true, fields: ["$concurrent_retry"] };
          }
          throw error;
        }
        await persistAtomicResults(retryEntries, response);
        for (const entry of retryEntries) {
          if (entry.merged) {
            await updateLocalAfterCompatibleMerge(entry.operation, mutation, processedRevision);
          }
        }
      }

      return { ok: true, atomic: true, reconciled: true };
    }

    async function processGroup(group) {
      const mutation = group.latest;
      const processedRevision = mutationRevision(mutation);
      const currentState = stateStore.getState?.();
      if (!currentState || typeof currentState !== "object") {
        throw Object.assign(new Error("Local state is unavailable for normalized planning."), { code: "HH_SYNC_LOCAL_STATE_MISSING" });
      }
      const baselineRows = await baselineStore.list(namespace);
      const plan = normalizer.planLogicalMutation(currentState, baselineRows, mutation);

      if (Array.isArray(plan.conflictFields) && plan.conflictFields.length) {
        stateStore.markMutationRetry(mutation.mutationId, {
          retryState: "conflict",
          lastErrorClass: "cas_conflict",
          conflictFields: plan.conflictFields,
          nextRetryAt: null,
          lastAttemptAt: now()
        }, mutation.ownerId);
        return {
          ok: false,
          conflict: true,
          domain: mutation.domain,
          recordId: mutation.recordId,
          fields: [...plan.conflictFields]
        };
      }

      if (!plan.operations.length) {
        stateStore.acknowledgeMutations(group.mutationIds, mutation.ownerId);
        return { ok: true, acknowledged: group.mutationIds.length, noop: true };
      }

      if (plan.operations.length > 1) {
        const result = await applyAtomicOperations(plan.operations, mutation, processedRevision);
        if (!result.ok) {
          if (result.retry) {
            throw Object.assign(new Error("Normalized record group changed again during conflict reconciliation."), {
              code: "HH_SYNC_CONFLICT_RETRY"
            });
          }
          stateStore.markMutationRetry(mutation.mutationId, {
            retryState: "conflict",
            lastErrorClass: "cas_conflict",
            conflictFields: result.fields,
            nextRetryAt: null,
            lastAttemptAt: now()
          }, mutation.ownerId);
          return {
            ok: false,
            conflict: true,
            domain: mutation.domain,
            recordId: mutation.recordId,
            fields: result.fields
          };
        }
      } else {
        const result = await applyOperation(plan.operations[0], mutation, processedRevision);
        if (!result.ok) {
          stateStore.markMutationRetry(mutation.mutationId, {
            retryState: "conflict",
            lastErrorClass: "cas_conflict",
            conflictFields: result.fields,
            nextRetryAt: null,
            lastAttemptAt: now()
          }, mutation.ownerId);
          return {
            ok: false,
            conflict: true,
            domain: mutation.domain,
            recordId: mutation.recordId,
            fields: result.fields
          };
        }
      }

      const latestOutbox = stateStore.getOutbox(mutation.ownerId);
      const newer = latestOutbox.some((entry) =>
        sameLogicalRecord(entry, mutation) && mutationRevision(entry) > processedRevision
      );
      stateStore.acknowledgeMutations(group.mutationIds, mutation.ownerId);

      return {
        ok: true,
        acknowledged: group.mutationIds.length,
        newerPending: newer,
        operations: plan.operations.length,
        snapshotManifestDeferred: plan.snapshotManifestChanged
      };
    }

    async function drain(options = {}) {
      if (!online()) {
        return { ok: true, skipped: true, reason: "offline", processed: 0, succeeded: 0, failed: 0, conflicts: 0 };
      }

      const primed = await primeBaseline();
      if (!primed.ok) return { ...primed, processed: 0, succeeded: 0, failed: 0, conflicts: 0 };

      const manifest = primed.manifest || await recordStore.getManifest();
      const stage = String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? (await baselineStore.getMeta(namespace))?.stage ?? "");
      if (!["shadow", "dual_write", "normalized"].includes(stage)) {
        return { ok: true, skipped: true, reason: "stage-disabled", stage, processed: 0, succeeded: 0, failed: 0, conflicts: 0 };
      }

      const currentState = stateStore.getState?.();
      if (!currentState || typeof currentState !== "object") {
        return { ok: false, skipped: true, reason: "local-state-missing", processed: 0, succeeded: 0, failed: 0, conflicts: 0 };
      }

      const nowMs = Date.parse(now());
      const groups = groupPendingMutations(
        stateStore.getOutbox(options.ownerId),
        Number.isFinite(nowMs) ? nowMs : Date.now(),
        options.maxGroups || maxGroups
      );
      const summary = {
        ok: true,
        skipped: false,
        stage,
        processed: 0,
        succeeded: 0,
        failed: 0,
        conflicts: 0,
        results: []
      };

      for (const group of groups) {
        summary.processed += 1;
        try {
          const result = await processGroup(group);
          summary.results.push({
            domain: group.latest.domain,
            recordId: group.latest.recordId,
            ...result
          });
          if (result.ok) summary.succeeded += 1;
          else {
            summary.failed += 1;
            if (result.conflict) summary.conflicts += 1;
          }
        } catch (error) {
          const errorClass = classifyFailure(error);
          const retryCount = Number(group.latest.retryCount || 0);
          const delay = retryDelayMs(retryCount, baseBackoffMs, maxBackoffMs);
          const nextRetryAt = new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) + delay).toISOString();
          stateStore.markMutationRetry(group.latest.mutationId, {
            retryState: "retry",
            lastErrorClass: errorClass,
            nextRetryAt,
            lastAttemptAt: now()
          }, group.latest.ownerId);
          summary.failed += 1;
          summary.results.push({
            ok: false,
            domain: group.latest.domain,
            recordId: group.latest.recordId,
            errorClass,
            retryAt: nextRetryAt
          });
        }
      }

      summary.ok = summary.failed === 0;
      return summary;
    }

    return Object.freeze({
      version: VERSION,
      release: RELEASE,
      writerVersion,
      namespace,
      primeBaseline,
      drain,
      classifyFailure,
      retryDelayMs
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    defaultWriterVersion: DEFAULT_WRITER_VERSION,
    groupPendingMutations,
    classifyFailure,
    retryDelayMs,
    create
  });
});
