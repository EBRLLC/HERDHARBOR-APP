"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "_site",
  "dist",
  "coverage",
  ".gradle",
  ".idea",
  ".vscode"
]);
const ignoredDirectoryPaths = new Set([
  "android/.gradle",
  "android/build",
  "android/app/build",
  "supabase/.temp",
  "supabase/.branches",
  "vendor"
]);
const textExtensions = new Set([
  ".cjs", ".css", ".gradle", ".html", ".js", ".json", ".md", ".mjs", ".sql", ".toml", ".txt", ".xml", ".yml", ".yaml"
]);
const forbiddenFilePatterns = [
  { label: "environment file", test: (rel, base) => base === ".env" || (base.startsWith(".env.") && base !== ".env.example") },
  { label: "private/signing key", test: (_rel, base) => /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(base) },
  { label: "credential bundle", test: (_rel, base) => /^(?:credentials\.json|keystore\.properties|local\.properties)$/i.test(base) },
  { label: "build package", test: (_rel, base) => /\.(?:aab|apk)$/i.test(base) },
  { label: "backup/temp file", test: (_rel, base) => /(?:\.bak|\.tmp|\.temp|\.orig|~)$/i.test(base) }
];
const secretPatterns = [
  { label: "Stripe secret/restricted key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { label: "Stripe webhook signing secret", pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/g },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: "private key material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g }
];

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function shouldSkipDirectory(relativePath, name) {
  const normalized = normalize(relativePath);
  return ignoredDirectories.has(name) || ignoredDirectoryPaths.has(normalized);
}

function collectFiles(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const childAbsolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(childRelative, entry.name)) files.push(...collectFiles(childAbsolute, childRelative));
      continue;
    }
    if (entry.isFile()) files.push({ absolute: childAbsolute, relative: normalize(childRelative), base: entry.name });
  }
  return files;
}

const violations = [];
const files = collectFiles(root);

for (const file of files) {
  for (const rule of forbiddenFilePatterns) {
    if (rule.test(file.relative, file.base)) violations.push(`${rule.label}: ${file.relative}`);
  }

  if (!textExtensions.has(path.extname(file.base).toLowerCase())) continue;
  const content = fs.readFileSync(file.absolute, "utf8");
  for (const rule of secretPatterns) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(content)) violations.push(`${rule.label}: ${file.relative}`);
  }
}

const topLevelRuntimeFiles = files.filter((file) => !file.relative.includes("/") && (file.relative.endsWith(".js") || file.relative === "index.html"));
for (const file of topLevelRuntimeFiles) {
  const content = fs.readFileSync(file.absolute, "utf8");
  const calls = content.match(/(?:window\.)?supabase\.createClient\s*\(/g) || [];
  if (file.relative === "herdharbor-cloud.js") {
    if (calls.length !== 1) violations.push(`browser Supabase client ownership: herdharbor-cloud.js must create exactly one client (found ${calls.length})`);
  } else if (calls.length > 0) {
    violations.push(`duplicate browser Supabase client creation: ${file.relative}`);
  }
}

if (violations.length) {
  console.error("HerdHarbor repository security audit failed:\n- " + violations.join("\n- "));
  process.exitCode = 1;
} else {
  console.log(`HerdHarbor repository security audit passed (${files.length} source files checked).`);
}
