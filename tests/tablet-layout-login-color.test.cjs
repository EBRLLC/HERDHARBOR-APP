"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const release = fs.readFileSync(path.join(root, "herdharbor-release-v1.6.1.js"), "utf8");
const pedigreeGeneticsCss = fs.readFileSync(path.join(root, "pedigree-genetics-v1.6.1.css"), "utf8");
const showsCss = fs.readFileSync(path.join(root, "shows-v1.6.1.css"), "utf8");

// The recovered consolidated index shell intentionally retains the v1.6.5
// inline fallback; HerdHarborBuild is authoritative for the current v1.6.7 identity.
assert.match(html, /const APP_VERSION = "1\.6\.5"/);
assert.match(html, /html \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: hidden;[\s\S]*?overscroll-behavior-x: none;/);
assert.match(html, /body \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: hidden;[\s\S]*?overscroll-behavior-x: none;/);
assert.match(html, /\.app-shell \{[\s\S]*?grid-template-columns: minmax\(0, var\(--sidebar-width\)\) minmax\(0, 1fr\);[\s\S]*?overflow-x: clip;/);
assert.match(html, /\.workspace \{[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;/);
assert.match(html, /\.view\.active \{ width: 100%; max-width: 100%; min-width: 0;/);
assert.match(html, /\.dashboard-grid > \*/);
assert.match(html, /\.dashboard-grid > \*[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;/);
assert.match(html, /@media \(max-width: 1180px\) \{[\s\S]*?\.dashboard-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
assert.match(html, /class="list activity-list"/);
assert.match(html, /\.list-item-main strong \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;[\s\S]*?word-break: break-word;/);
assert.match(html, /\.list-item \{[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;/);
assert.match(html, /\.data-table-wrap \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: auto;[\s\S]*?overscroll-behavior-inline: contain;/);
assert.match(html, /@media \(max-width: 820px\) \{[\s\S]*?#quick-add-button[\s\S]*?width: 42px;/);
assert.equal(manifest.orientation, "portrait");
assert.equal(manifest.version, "1.6.7");

assert.match(cloud, /version: "1\.6\.5"/);
assert.match(cloud, /html\[data-theme="dark"\] #hh-auth-root/);
assert.match(cloud, /#hh-auth-root \.hh-auth-form label/);
assert.match(cloud, /#hh-auth-root \.hh-auth-form input/);
assert.match(cloud, /-webkit-text-fill-color: var\(--hh-auth-text\)/);
assert.match(cloud, /input:-webkit-autofill/);
assert.match(cloud, /--hh-auth-surface: #102A41/);
assert.match(cloud, /--hh-auth-input: #0A2033/);
assert.match(cloud, /html\[data-theme="dark"\] \.hh-account-dialog \{[\s\S]*?color: #18212A;[\s\S]*?background: #FFFFFF;[\s\S]*?color-scheme: light;/);
assert.match(cloud, /html\[data-theme="dark"\] \.hh-account-dialog h2 \{ color: #0D2540; \}/);
assert.match(cloud, /html\[data-theme="dark"\] \.hh-account-dialog \.hh-account-email \{ color: #526474; \}/);
assert.match(worker, /v1\.6\.7-alpha-completion-debt-1/);
assert.match(worker, /herdharbor-access-cache-v1\.6\.1\.js\?v=1\.6\.7/);
assert.match(worker, /herdharbor-cloud\.js\?v=19/);
assert.match(worker, /pedigree-visual\.css\?v=2/);
assert.match(worker, /pedigree-genetics-v1\.6\.1\.js\?v=1\.6\.7/);
assert.ok(worker.includes("shows-v1.6.1.css?v=1.6.7"));
assert.match(worker, /shows-v1\.6\.1\.js\?v=1\.6\.7/);
assert.match(worker, /shows-v1\.6\.1-hardening\.js\?v=1\.6\.7/);
assert.match(worker, /NETWORK_FIRST_PATHS/);
assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
assert.match(release, /@media\(max-width:620px\)/);
assert.match(release, /help-toggle/);
assert.match(pedigreeGeneticsCss, /max-width:100%/);
assert.match(pedigreeGeneticsCss, /flex-wrap:wrap/);
assert.match(showsCss, /#view-shows \{ min-width: 0; max-width: 100%; \}/);
assert.match(showsCss, /overflow-x:auto/);
assert.match(showsCss, /@media \(max-width:820px\)/);
assert.match(showsCss, /@media \(max-width:520px\)/);
assert.match(showsCss, /grid-template-columns:1fr/);

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

[
  ["#0D2540", "#FFFFFF", "light headings"],
  ["#65727E", "#FFFFFF", "light supporting text"],
  ["#FFFFFF", "#2E7D7B", "primary auth button"],
  ["#F3F6F8", "#102A41", "dark headings"],
  ["#B8C5CE", "#102A41", "dark supporting text"],
  ["#E8EEF2", "#0A2033", "dark input text"],
  ["#82D0CC", "#102A41", "dark auth links"],
  ["#0D2540", "#FFFFFF", "dark-theme account modal heading"],
  ["#526474", "#FFFFFF", "dark-theme account modal email"]
].forEach(([foreground, background, label]) => {
  assert.ok(contrast(foreground, background) >= 4.5, `${label} meets WCAG AA contrast`);
});

console.log("Alpha v1.6.7 tablet containment, PWA cache freshness, existing pedigree genetics, Help, and login color tests passed");
