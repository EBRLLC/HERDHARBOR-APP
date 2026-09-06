"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("mobile-viewport-hotfix-v1.8.0.css", "utf8");
const build = fs.readFileSync("herdharbor-build.js", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");

test("mobile viewport uses device width without forced scale", () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /html\s*\{[\s\S]*overflow-x:\s*hidden/);
  assert.match(html, /body\s*\{[\s\S]*overflow-x:\s*hidden/);
  assert.match(html, /\.app-shell\s*\{[\s\S]*min-width:\s*0/);
  assert.match(html, /\.workspace\s*\{[\s\S]*min-width:\s*0/);
});

test("narrow iPhone topbar cannot establish a wider layout viewport", () => {
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /\.topbar-title\s*\{\s*display:\s*none/);
  assert.match(css, /\.topbar\s*\{[\s\S]*gap:\s*6px/);
  assert.match(css, /\.topbar-actions\s*\{[\s\S]*gap:\s*4px/);
  assert.match(css, /\.topbar-actions \.icon-button[\s\S]*width:\s*36px[\s\S]*min-width:\s*36px/);
  assert.match(css, /\.operation-logo\s*\{[\s\S]*width:\s*36px[\s\S]*flex:\s*0 0 36px/);
});

test("mobile dashboard and Today workflow are constrained to the viewport", () => {
  assert.match(css, /\.main-content,[\s\S]*\.hh-p1-today-item\s*\{[\s\S]*max-width:\s*100%[\s\S]*min-width:\s*0/);
  assert.match(css, /\.header-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.hh-p1-today\s*\{\s*overflow:\s*hidden/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
});

test("mobile hotfix stays loaded last among the v1.8.0 layout assets under the v1.8.x shell", () => {
  assert.match(build, /addStyle\("hh-mobile-viewport-v180-style", "mobile-viewport-hotfix-v1\.8\.0\.css\?v=1"\)/);
  assert.ok(build.indexOf("mobile-viewport-hotfix-v1.8.0.css?v=1") > build.indexOf("subscription-member-ui-v1.8.0.css?v=1"));
  assert.match(worker, /herdharbor-shell-v1\.8\.[01]-alpha-/);
  assert.match(worker, /"\.\/mobile-viewport-hotfix-v1\.8\.0\.css\?v=1"/);
  assert.match(worker, /"\/mobile-viewport-hotfix-v1\.8\.0\.css"/);
});