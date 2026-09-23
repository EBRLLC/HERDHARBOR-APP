"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const cloud=fs.readFileSync(path.join(root,"herdharbor-cloud.js"),"utf8");
const instrumentation=fs.readFileSync(path.join(root,"monitoring","herdharbor-monitoring-instrumentation.mjs"),"utf8");
const core=fs.readFileSync(path.join(root,"monitoring","herdharbor-monitoring-core.mjs"),"utf8");

test("cloud telemetry reports current app release independently from component build",()=>{
  assert.match(cloud,/CLOUD_SYNC_APP_RELEASE = "1\.8\.4"/);
  assert.match(cloud,/CLOUD_SYNC_COMPONENT_BUILD = "legacy-full-state-observability-3"/);
  assert.match(cloud,/app_release: CLOUD_SYNC_APP_RELEASE/);
  assert.match(cloud,/component_build: CLOUD_SYNC_COMPONENT_BUILD/);
});

test("cloud provider failures preserve originating Error and structured failures do not fabricate stacks",()=>{
  const start=instrumentation.indexOf("export function installCloudSyncFailureMonitoring");
  const end=instrumentation.indexOf("export function installMonitoringAdapters");
  const adapter=instrumentation.slice(start,end);
  assert.match(adapter,/detail\.source_error instanceof Error \? detail\.source_error : null/);
  assert.doesNotMatch(adapter,/new Error\(/);
  assert.doesNotMatch(adapter,/CloudSyncProviderError/);
});

test("cloud classifications cover evidence-backed statuses and retain unknown fallback",()=>{
  for(const p of [
    /status === 401\) return "auth"/,
    /status === 403[\s\S]*return "permission"/,
    /status === 409[\s\S]*return "conflict"/,
    /status === 413\) return "payload"/,
    /status === 429\) return "rate_limit"/,
    /status >= 500[\s\S]*return "server"/,
    /return "offline"/,
    /return "timeout"/,
    /return "network"/,
    /return "unknown"/
  ]) assert.match(cloud,p);
});

test("retry, auth refresh, byte-count and privacy metadata stay bounded",()=>{
  assert.match(cloud,/CLOUD_RETRY_DELAYS_MS = \[750, 2000\]/);
  assert.match(cloud,/retry_result = "recovered"/);
  assert.match(cloud,/retry_result = transient \? "exhausted" : "not_retryable"/);
  assert.match(cloud,/session_refresh_attempted = true/);
  assert.match(cloud,/serialized_state_bytes/);
  assert.match(cloud,/slice\(0, maxLength\)/);
  for(const key of ["app_release","component_build","serialized_state_bytes","provider_details","provider_hint","retry_attempts","retry_result","session_refresh_attempted","session_refresh_result"]){
    assert.match(core,new RegExp('"'+key+'"'));
  }
});

test("production telemetry runbook forbids destructive synthetic failure generation",()=>{
  const runbook=fs.readFileSync(path.join(root,"CLOUD-SYNC-PRODUCTION-TELEMETRY-RUNBOOK.md"),"utf8");
  assert.match(runbook,/Do not trigger destructive writes or deliberately corrupt production data/i);
  assert.match(runbook,/unknown/i);
  assert.match(runbook,/provider\/runtime-origin stack/i);
});
