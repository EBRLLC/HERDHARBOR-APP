#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

function args(argv) {
  const out = { root: "_site", releaseSha: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") out.root = argv[++i];
    else if (argv[i] === "--release-sha") out.releaseSha = argv[++i] || "";
  }
  return out;
}

const TEXT_HASH_EXTENSIONS = new Set([".js", ".css", ".html", ".json"]);
const TRANSFORM_EXTENSIONS = new Set([".js", ".css", ".html"]);
const MANIFEST_NAME = "release-asset-manifest.json";
const REVISION_PLACEHOLDER = "__HH_RELEASE_ASSET_REVISION__";

async function walk(root, current = root, rows = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === MANIFEST_NAME) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, rows);
    else if (entry.isFile() && TEXT_HASH_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      rows.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  return rows;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stampReferences(source, revision) {
  const quotedAsset = /(["'`])((?:(?:\.\.?\/)|\/)?[A-Za-z0-9_@%+.,~\/-]+\.(?:js|css))(?:\?[^"'\x60\s<>)]*)?\1/g;
  return source.replace(quotedAsset, (match, quote, assetPath) => {
    if (/(?:^|\/)service-worker\.js$/i.test(assetPath)) return `${quote}${assetPath}${quote}`;
    return `${quote}${assetPath}?rev=${revision}${quote}`;
  });
}

async function main() {
  const options = args(process.argv.slice(2));
  const root = path.resolve(options.root);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Release asset root does not exist: ${root}`);

  const files = (await walk(root)).sort();
  if (!files.includes("service-worker.js")) throw new Error("service-worker.js is required in the staged release.");
  if (!files.includes("index.html")) throw new Error("index.html is required in the staged release.");

  const fileHashes = {};
  for (const relative of files) {
    fileHashes[relative] = digest(await readFile(path.join(root, relative)));
  }

  const revisionInput = files.map((relative) => `${relative}\0${fileHashes[relative]}`).join("\n");
  const revision = digest(revisionInput).slice(0, 24);

  let transformedFiles = 0;
  for (const relative of files) {
    if (!TRANSFORM_EXTENSIONS.has(path.extname(relative).toLowerCase())) continue;
    const absolute = path.join(root, relative);
    const before = await readFile(absolute, "utf8");
    let after = stampReferences(before, revision);
    if (relative === "service-worker.js") {
      after = after.replaceAll(REVISION_PLACEHOLDER, revision);
      if (after.includes(REVISION_PLACEHOLDER)) throw new Error("Service-worker release revision placeholder was not fully replaced.");
    }
    if (after !== before) {
      await writeFile(absolute, after, "utf8");
      transformedFiles += 1;
    }
  }

  const manifest = {
    schema_version: 1,
    revision,
    release_sha: String(options.releaseSha || ""),
    generated_from: "deterministic-content-sha256",
    asset_count: files.length,
    files: fileHashes
  };
  await writeFile(path.join(root, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const index = await readFile(path.join(root, "index.html"), "utf8");
  if (/\.(?:js|css)\?v=/i.test(index)) throw new Error("Staged index.html still contains a manually versioned JS/CSS URL.");
  if (!index.includes(`?rev=${revision}`)) throw new Error("Staged index.html does not reference the generated release revision.");

  const worker = await readFile(path.join(root, "service-worker.js"), "utf8");
  if (!worker.includes(`const RELEASE_ASSET_REVISION = "${revision}";`)) {
    throw new Error("Staged service-worker cache generation is not tied to the release manifest revision.");
  }

  process.stdout.write(JSON.stringify({ revision, assetCount: files.length, transformedFiles }) + "\n");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
