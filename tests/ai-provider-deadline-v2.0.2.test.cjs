"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const path = require("node:path");
const esbuild = require("esbuild");

function extractor(name, options = {}) {
  const timers = new Map(), metrics = [], calls = [];
  let handler, timerId = 0;
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: "synthetic-tester" } } }) },
    from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: {
      membership_tier: "member", account_status: "active", subscription_status: "active" } }) }; },
    async rpc(name, args) {
      if (name === "herdharbor_reserve_ai_image_request") return { data: options.quota || "reserved" };
      metrics.push(args.p_metric); return { data: null };
    }
  };
  const env = { SUPABASE_URL: "https://synthetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-key",
    OPENAI_API_KEY: "synthetic-provider-key", HH_AI_TESTER_USER_IDS: "synthetic-tester" };
  const result = esbuild.buildSync({ entryPoints: [path.join(__dirname, "..", "supabase/functions", name, "index.ts")],
    bundle: true, write: false, platform: "neutral", format: "cjs", external: ["npm:*"], logLevel: "silent" });
  vm.runInNewContext(result.outputFiles[0].text, {
    require: () => ({ createClient: () => admin }),
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    fetch: async (url, init) => { calls.push({ url, init }); return options.fetch(init); },
    AbortController, Response, Request, Headers, console: { error() {}, warn() {} },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id)
  });
  return { calls, metrics, timers,
    request: (extra = {}) => handler(new Request("https://synthetic.invalid/extract", {
      method: "POST", headers: { Authorization: "Bearer synthetic-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ aiOptIn: true, species: "Rabbit", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA", ...extra })
    })) };
}
const turn = () => new Promise(resolve => setImmediate(resolve));

for (const name of ["paper-pedigree-extract", "record-photo-extract"]) {
  test(`${name}: slow response body remains subject to the provider deadline`, async () => {
    let bodyStarted = false;
    const env = extractor(name, { fetch: async init => ({ ok: true,
      json: () => { bodyStarted = true; return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
      }); }
    }) });
    const pending = env.request();
    await turn();
    assert.equal(bodyStarted, true);
    assert.equal(env.timers.size, 1, "headers must not clear the deadline");
    for (const timeout of [...env.timers.values()]) timeout();
    const response = await pending;
    assert.equal(response.status, 504);
    assert.equal((await response.json()).code, "provider_timeout");
    assert.equal(env.calls.length, 1, "no automatic paid retry");
    assert.equal(env.timers.size, 0);
    if (name === "paper-pedigree-extract") assert.ok(env.metrics.includes("provider_failure"));
  });
  test(`${name}: invalid envelope and malformed/incomplete drafts fail without committing`, async () => {
    for (const payload of [null, { status: "incomplete" }, { output_text: "{invalid" }, { output_text: '{"invalid":"draft"}' }]) {
      const env = extractor(name, { fetch: async () => ({ ok: true, json: async () => payload }) });
      const response = await env.request();
      assert.equal(response.status, 502);
      assert.match((await response.json()).code, /empty_extraction|extraction_incomplete|malformed_structured_result/);
      assert.equal(env.calls.length, 1);
      assert.equal(env.timers.size, 0);
      assert.ok(!env.metrics.includes("structured_draft"));
    }
  });
  test(`${name}: quota exhaustion and missing consent never call the provider`, async () => {
    const env = extractor(name, { quota: "user_quota", fetch: () => { throw new Error("must not fetch"); } });
    assert.equal((await env.request()).status, 429);
    assert.equal((await env.request()).status, 429);
    assert.equal((await env.request({ aiOptIn: false })).status, 403);
    assert.equal(env.calls.length, 0);
  });
  test(`${name}: provider rate limits remain classified without consuming the response body`, async () => {
    const env = extractor(name, { fetch: async () => ({ ok: false, status: 429, json() { throw new Error("error body should not be read"); } }) });
    const response = await env.request();
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "provider_rate_limit");
    assert.equal(env.calls.length, 1);
    assert.equal(env.timers.size, 0);
  });
}
