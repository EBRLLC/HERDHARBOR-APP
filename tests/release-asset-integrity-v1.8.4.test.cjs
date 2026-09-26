const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const generator = path.join(root, "scripts", "generate-release-assets.mjs");
const workerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hh-release-assets-"));
  fs.writeFileSync(path.join(dir, "index.html"), [
    '<!doctype html>',
    '<link rel="stylesheet" href="./style.css?v=1">',
    '<script src="./app.js?v=1"></script>'
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "app.js"), [
    'const feature = "./feature.js?v=1";',
    'const moduleRef = "./feature.js?module=1#ready";',
    'const jsonRef = "./feature.json";',
    'const mapRef = "./feature.js.map";',
    'console.log(feature, moduleRef, jsonRef, mapRef);'
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "feature.js"), 'globalThis.HerdHarborFeature = true;\n');
  fs.mkdirSync(path.join(dir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(dir, "nested", "helper.js"), 'globalThis.HerdHarborNestedHelper = true;\n');
  fs.writeFileSync(path.join(dir, "shared.js"), 'globalThis.HerdHarborShared = true;\n');
  fs.writeFileSync(path.join(dir, "nested", "app.js"), [
    'const helper = "./helper.js?v=1";',
    'const shared = "../shared.js?v=1";',
    'console.log(helper, shared);'
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "style.css"), 'body { min-height: 100%; }\n');
  fs.writeFileSync(path.join(dir, "service-worker.js"), [
    '"use strict";',
    'const CACHE_NAME = "herdharbor-shell-manual";',
    'const REQUIRED_SHELL = ["./app.js?v=1", "./style.css?v=1"];'
  ].join("\n"));
  return dir;
}

function generate(dir) {
  execFileSync(process.execPath, [generator, dir], { stdio: "pipe" });
  return JSON.parse(fs.readFileSync(path.join(dir, "release-asset-manifest.json"), "utf8"));
}

test("release artifact fingerprints local JS/CSS and derives the service-worker generation from the same manifest", () => {
  const dir = fixture();
  try {
    const manifest = generate(dir);
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
    const worker = fs.readFileSync(path.join(dir, "service-worker.js"), "utf8");

    assert.match(html, new RegExp(`app\\.js\\?rev=${manifest.assets["app.js"]}`));
    assert.match(html, new RegExp(`style\\.css\\?rev=${manifest.assets["style.css"]}`));
    assert.match(app, new RegExp(`feature\\.js\\?rev=${manifest.assets["feature.js"]}`));
    assert.ok(worker.includes(`const CACHE_NAME = "${manifest.cacheName}";`));
    assert.equal(manifest.cacheName, `herdharbor-shell-${manifest.generation}`);
    assert.doesNotMatch(html + app + worker, /\.(?:js|css)\?v=/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("nested relative references resolve from the file that contains them", () => {
  const dir = fixture();
  try {
    const manifest = generate(dir);
    const nestedApp = fs.readFileSync(path.join(dir, "nested", "app.js"), "utf8");

    assert.match(nestedApp, new RegExp(`\\.\\/helper\\.js\\?rev=${manifest.assets["nested/helper.js"]}`));
    assert.match(nestedApp, new RegExp(`\\.\\.\\/shared\\.js\\?rev=${manifest.assets["shared.js"]}`));
    assert.doesNotMatch(nestedApp, /(?:helper|shared)\\.js\\?v=/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fingerprinting preserves arbitrary query parameters and ignores lookalike suffixes", () => {
  const dir = fixture();
  try {
    const manifest = generate(dir);
    const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
    const digest = manifest.assets["feature.js"];

    assert.ok(app.includes(`./feature.js?module=1&rev=${digest}#ready`));
    assert.ok(app.includes("./feature.json"));
    assert.ok(app.includes("./feature.js.map"));
    assert.doesNotMatch(app, /feature\.json\?rev=/);
    assert.doesNotMatch(app, /feature\.js\?rev=[a-f0-9]+\.map/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("changing application JavaScript necessarily changes its served identity", () => {
  const dir = fixture();
  try {
    const first = generate(dir);
    const firstHtml = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const firstHash = first.assets["app.js"];
    assert.ok(firstHtml.includes(`app.js?rev=${firstHash}`));

    fs.appendFileSync(path.join(dir, "app.js"), '\nconsole.log("changed application bytes");\n');
    const second = generate(dir);
    const secondHtml = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const secondHash = second.assets["app.js"];

    assert.notEqual(secondHash, firstHash);
    assert.ok(secondHtml.includes(`app.js?rev=${secondHash}`));
    assert.ok(!secondHtml.includes(`app.js?rev=${firstHash}`));
    assert.notEqual(second.generation, first.generation);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cache-first is reserved for immutable rev-fingerprinted JS/CSS", () => {
  assert.match(workerSource, /function isImmutableFingerprintAsset\(url\)/);
  assert.match(workerSource, /url\.searchParams\.get\("rev"\)/);
  assert.doesNotMatch(workerSource, /url\.searchParams\.has\("v"\)/);
  assert.match(workerSource, /if \(isImmutableFingerprintAsset\(url\)\)[\s\S]*cacheFirst\(request\)/);
  assert.match(workerSource, /if \(isRuntimeCachePath\(url\)\)[\s\S]*networkFirst\(request\)/);
});
