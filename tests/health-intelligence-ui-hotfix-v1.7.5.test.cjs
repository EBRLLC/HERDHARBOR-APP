"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const css = read("health-intelligence-ui-hotfix-v1.7.5.css");
const js = read("health-intelligence-ui-hotfix-v1.7.5.js");
const build = read("herdharbor-build.js");
const html = read("index.html");
const worker = read("service-worker.js");

assert.match(css, /\.hh-hi-overlay\{[^}]*position:fixed!important;[^}]*inset:0!important;/s);
assert.match(css, /\.hh-hi-overlay\{[^}]*height:100dvh!important;/s);
assert.match(css, /\.hh-hi-overlay \.hh-hi-modal\{[^}]*transform:none!important;[^}]*max-height:calc\(100dvh - 32px\)!important;/s);
assert.match(css, /\.hh-hi-modal>\.modal-content\{[^}]*overflow-y:auto!important;/s);
assert.match(css, /@media\(max-width:700px\)[\s\S]*\.hh-hi-grid\{grid-template-columns:1fr!important\}/);

assert.match(js, /const MODAL_ID='hh-health-intelligence-modal'/);
assert.match(js, /body\?\.classList\.add\(BODY_CLASS\)/);
assert.match(js, /content\.scrollTop=0/);
assert.match(js, /dialog\.focus\(\{preventScroll:true\}\)/);
assert.match(js, /observer\?\.observe\(root\.document\.body,\{childList:true\}\)/);
assert.doesNotMatch(js, /subtree:true/);
assert.match(js, /\[data-hi-action\],\[data-hi-assess\]/);
assert.match(js, /event\.key!==['"]Escape['"]/);

const stylePos = build.indexOf("health-intelligence-ui-hotfix-v1.7.5.css?v=1");
const healthPos = build.indexOf("health-intelligence-v1.7.1.js?v=1.7.1");
const hotfixPos = build.indexOf("health-intelligence-ui-hotfix-v1.7.5.js?v=1");
const stabilityPos = build.indexOf("herdharbor-v1.7.1-stability-hotfix.js?v=2");
assert.ok(stylePos >= 0, "health viewport hotfix stylesheet must load");
assert.ok(healthPos >= 0 && hotfixPos > healthPos, "health UI hotfix must load after Health Intelligence");
assert.ok(stabilityPos > hotfixPos, "stability runtime should remain after the health UI hotfix");
assert.match(html, /herdharbor-build\.js\?v=1\.7\.1&hotfix=health-ui-1/);
assert.match(worker, /health-intelligence-ui-hotfix-v1\.7\.5\.css\?v=1/);
assert.match(worker, /health-intelligence-ui-hotfix-v1\.7\.5\.js\?v=1/);
assert.match(worker, /health-ui-recovery-1/);

console.log("HerdHarbor v1.7.5 Health Intelligence modal viewport regression guard passed");
