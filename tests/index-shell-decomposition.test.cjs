"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const html = read("index.html");
const appRuntime = read("herdharbor-app-runtime.js");
const shellCss = read("herdharbor-index-shell.css");
const worker = read("service-worker.js");
const localPath = (value) => value.replace(/^\.\//, "").split("?")[0].split("#")[0].replace(/^\//, "");

test("index shell keeps only the early bootstrap inline", () => {
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  assert.equal(inlineScripts.length, 1);
  assert.ok(inlineScripts[0].length < 1000, "only the first-paint theme bootstrap remains inline");
  assert.match(inlineScripts[0], /herdharbor_theme/);
  assert.equal((html.match(/<style\b/gi) || []).length, 0, "page-owned CSS is external");
  assert.match(html, /herdharbor-index-shell\.css\?v=1/);
  assert.match(html, /herdharbor-app-runtime\.js\?v=2/);
  assert.doesNotMatch(html, /function renderSales\(\)/);
  assert.match(appRuntime, /function renderSales\(\)/);
  assert.ok(appRuntime.length > 500000);
  assert.ok(shellCss.length > 50000);
});

test("classic script and stylesheet order is preserved", () => {
  const baseCss = html.indexOf("herdharbor-v1.6.1.css?v=1.7.1");
  const shellCssIndex = html.indexOf("herdharbor-index-shell.css?v=1");
  const coreCss = html.indexOf("herdharbor-core-v1.6.1.css?v=1.7.1");
  assert.ok(baseCss >= 0 && shellCssIndex > baseCss && coreCss > shellCssIndex);

  const analyticsRuntime = html.indexOf("analytics-v1.6.1.js?v=1.7.1");
  const appRuntimeIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(analyticsRuntime >= 0 && appRuntimeIndex > analyticsRuntime);
  assert.doesNotMatch(html, /<script[^>]+src="herdharbor-app-runtime\.js\?v=2"[^>]+(?:async|defer|type="module")/);
});

test("static script and stylesheet references resolve once", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => match[1]);
  const styles = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
  assert.equal(new Set(scripts).size, scripts.length, "no duplicate static script loads");
  for (const source of [...scripts, ...styles]) {
    if (/^(?:https?:|data:)/.test(source)) continue;
    assert.ok(exists(localPath(source)), `missing static asset: ${source}`);
  }
});

test("service worker covers both required extracted shell assets", () => {
  for (const { asset, revision } of [
    { asset: "herdharbor-app-runtime.js", revision: "2" },
    { asset: "herdharbor-index-shell.css", revision: "1" }
  ]) {
    const escaped = asset.replaceAll(".", "\\.");
    assert.equal((worker.match(new RegExp("\\./" + escaped + "\\?v=" + revision, "g")) || []).length, 1, asset + " has one precache entry");
    assert.equal((worker.match(new RegExp('"/' + escaped + '"', "g")) || []).length, 1, asset + " has one network-first route");
    assert.ok(exists(asset), `missing extracted asset: ${asset}`);
  }
});
