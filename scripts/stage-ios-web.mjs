import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectDirectory, "web");

const applicationFiles = [
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "herdharbor-release-v1.5.1.js",
  "herdharbor-membership-v1.5.1.js",
  "herdharbor-billing-v1.5.1.js",
  "herdharbor-access-cache-v1.5.1.js",
  "herdharbor-cloud.js",
  "herdharbor-admin-v1.5.1.js",
  "herdharbor-v1.5.1.css",
  "herdharbor-monitoring-config.js",
  "pedigree-visual.css",
  "pedigree-visual.js",
  "pedigree-genetics-v1.4.5.css",
  "pedigree-genetics-v1.4.5.js",
  "pwa.js",
  "service-worker.js",
  "spreadsheet-import.js",
  "styles.css",
  "symptom-guide.js",
  "breeding-genetics-v2.css",
  "breeding-intelligence-core.js",
  "breeding-intelligence-tools.js",
  "breeding-intelligence.css",
  "breeding-intelligence.js",
  "breeding-pair-hotfix-v1.4.2.js",
  "rabbit-genetics-engine-v1.4.5.js",
  "rabbit-genetics-engine-v2.js",
  "rabbit-genetics-runtime-v1.4.5.js",
  "rabbit-genetics-ui-v1.4.5.js",
  "rabbit-genetics-ui-v2.js",
  "rabbit-records-v1.4.5.js",
  "herdharbor-release-v1.4.5.js",
  "shows-v1.5.0.css",
  "shows-v1.5.0.js",
  "shows-v1.5.0-hardening.js",
  "shows-v1.5.0-performance.js"
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of applicationFiles) {
  await cp(path.join(projectDirectory, file), path.join(outputDirectory, file));
}

await cp(
  path.join(projectDirectory, "vendor"),
  path.join(outputDirectory, "vendor"),
  { recursive: true }
);

const indexPath = path.join(outputDirectory, "index.html");
const indexSource = await readFile(indexPath, "utf8");
const nativeBridgeTag = "  <script src=\"native-bridge.js\"></script>\n";
const closingBodyIndex = indexSource.lastIndexOf("</body>");

if (closingBodyIndex === -1) {
  throw new Error("Could not stage iOS assets: index.html has no closing body tag.");
}

const stagedIndex = indexSource.includes("native-bridge.js")
  ? indexSource
  : `${indexSource.slice(0, closingBodyIndex)}${nativeBridgeTag}${indexSource.slice(closingBodyIndex)}`;

await writeFile(indexPath, stagedIndex);
await cp(
  path.join(scriptDirectory, "native-bridge.js"),
  path.join(outputDirectory, "native-bridge.js")
);

console.log(`Staged ${applicationFiles.length} application files and vendor assets for iOS.`);
