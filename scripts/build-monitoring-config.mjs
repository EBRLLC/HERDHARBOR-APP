"use strict";

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "herdharbor-monitoring-config.js");
const environment = String(process.env.HERDHARBOR_MONITORING_ENVIRONMENT || "").trim().toLowerCase();
const allowedEnvironments = new Set(["development", "test", "production", ""]);
if (!allowedEnvironments.has(environment)) {
  throw new Error("HERDHARBOR_MONITORING_ENVIRONMENT must be development, test, production, or blank.");
}

const config = {
  dsn: String(process.env.HERDHARBOR_SENTRY_DSN || "").trim(),
  environment,
  release: "HerdHarbor@1.5.1",
  build: String(process.env.HERDHARBOR_BUILD_ID || "membership-review-2").trim().slice(0, 80),
  enableTestCrash: /^(1|true|yes)$/i.test(String(process.env.HERDHARBOR_ENABLE_MONITORING_TEST || "")) && environment !== "production"
};

const source = `(() => {\n  "use strict";\n  window.HerdHarborMonitoringConfig = Object.freeze(${JSON.stringify(config, null, 2)});\n})();\n`;
await writeFile(target, source, "utf8");
console.log(`Generated ${path.basename(target)} for ${environment || "auto-detected"} environment. DSN ${config.dsn ? "configured" : "not configured"}.`);
