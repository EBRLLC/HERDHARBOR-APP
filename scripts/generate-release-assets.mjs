import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(process.argv[2] || "_site");
const MANIFEST_NAME = "release-asset-manifest.json";
const EXCLUDED_DIRS = new Set([".git", ".github", "node_modules", "tests", "scripts", "android", "monitoring"]);
const URL_PATTERN = /((?:(?:\.\.\/)+|\.\/|\/)?[A-Za-z0-9_.\/-]+\.(?:js|css))((?:\?[^#"'\`\s<>)\\]*)?)(#[^"'\`\s<>)\\]*)?(?=["'\`\s<>)\\]|$)/g;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === MANIFEST_NAME) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...await walk(absolute, base));
      continue;
    }
    files.push(path.relative(base, absolute).split(path.sep).join("/"));
  }
  return files;
}

function resolveReference(reference, fromRelative) {
  const normalizedReference = String(reference || "").replace(/\\/g, "/");
  if (normalizedReference.startsWith("/")) {
    return path.posix.normalize(normalizedReference.replace(/^\/+/, ""));
  }
  const fromDir = path.posix.dirname(String(fromRelative || "").replace(/\\/g, "/"));
  const resolved = path.posix.normalize(path.posix.join(fromDir === "." ? "" : fromDir, normalizedReference));
  return resolved === ".." || resolved.startsWith("../") ? "" : resolved.replace(/^\.\//, "");
}

function fingerprintQuery(query, digest) {
  const params = new URLSearchParams(String(query || "").replace(/^\?/, ""));
  params.delete("v");
  params.delete("rev");
  params.set("rev", digest);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : `?rev=${digest}`;
}

function rewriteReferences(text, hashes, fromRelative) {
  return text.replace(URL_PATTERN, (full, reference, query = "", hash = "") => {
    const normalized = resolveReference(reference, fromRelative);
    const digest = normalized ? hashes.get(normalized) : null;
    if (!digest) return full;
    return `${reference}${fingerprintQuery(query, digest)}${hash || ""}`;
  });
}

async function readText(relative) {
  return fs.readFile(path.join(root, relative), "utf8");
}

async function writeText(relative, content) {
  await fs.writeFile(path.join(root, relative), content, "utf8");
}

async function computeHashes(assetFiles) {
  const hashes = new Map();
  for (const relative of assetFiles) {
    const content = await fs.readFile(path.join(root, relative));
    hashes.set(relative, sha256(content).slice(0, 16));
  }
  return hashes;
}

function mapsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

const allFiles = await walk(root);
const assetFiles = allFiles
  .filter((relative) => /\.(?:js|css)$/i.test(relative))
  .filter((relative) => relative !== "service-worker.js")
  .sort();

if (!assetFiles.length) throw new Error("No JavaScript or CSS assets were found to fingerprint.");

let hashes = await computeHashes(assetFiles);
let stable = false;

for (let pass = 0; pass < 8; pass += 1) {
  let changed = false;
  for (const relative of assetFiles) {
    const before = await readText(relative);
    const after = rewriteReferences(before, hashes, relative);
    if (after !== before) {
      await writeText(relative, after);
      changed = true;
    }
  }
  const nextHashes = await computeHashes(assetFiles);
  if (!changed && mapsEqual(hashes, nextHashes)) {
    hashes = nextHashes;
    stable = true;
    break;
  }
  hashes = nextHashes;
}

if (!stable) {
  throw new Error("Release asset fingerprints did not stabilize. Check for cyclic JS/CSS URL references.");
}

const textFiles = allFiles
  .filter((relative) => /\.(?:html|js|css)$/i.test(relative))
  .sort();

for (const relative of textFiles) {
  const before = await readText(relative);
  const after = rewriteReferences(before, hashes, relative);
  if (after !== before) await writeText(relative, after);
}

const assets = Object.fromEntries([...hashes.entries()].sort(([a], [b]) => a.localeCompare(b)));
const manifestBase = {
  schemaVersion: 1,
  algorithm: "sha256-16",
  assets
};
const generation = sha256(JSON.stringify(manifestBase)).slice(0, 16);
const manifest = {
  ...manifestBase,
  generation,
  cacheName: `herdharbor-shell-${generation}`
};

const workerPath = path.join(root, "service-worker.js");
let worker = await fs.readFile(workerPath, "utf8");
const cachePattern = /const CACHE_NAME = "herdharbor-shell-[^"]+";/;
if (!cachePattern.test(worker)) throw new Error("Service worker cache identity declaration was not found.");
worker = worker.replace(cachePattern, `const CACHE_NAME = "${manifest.cacheName}";`);
await fs.writeFile(workerPath, worker, "utf8");

await fs.writeFile(
  path.join(root, MANIFEST_NAME),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

const staleLocalReferences = [];
for (const relative of textFiles) {
  const content = await readText(relative);
  for (const match of content.matchAll(new RegExp(URL_PATTERN.source, "g"))) {
    const reference = match[1];
    const normalized = resolveReference(reference, relative);
    if (!normalized || !hashes.has(normalized)) continue;
    const expected = `?rev=${hashes.get(normalized)}`;
    if (!match[0].endsWith(expected)) staleLocalReferences.push(`${relative}: ${match[0]}`);
  }
}
if (staleLocalReferences.length) {
  throw new Error("Mutable local asset references remain after fingerprinting:\n" + staleLocalReferences.join("\n"));
}

process.stdout.write(
  `Generated ${MANIFEST_NAME} with ${assetFiles.length} fingerprinted assets; cache ${manifest.cacheName}.\n`
);
