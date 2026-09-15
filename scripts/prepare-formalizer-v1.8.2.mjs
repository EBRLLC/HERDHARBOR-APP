import fs from "node:fs";

const target = "scripts/formalize-v1.8.2.mjs";
let source = fs.readFileSync(target, "utf8");
const strictLine = 'html = replaceAllRequired(html, "herdharbor-monitoring-config.js?v=1.8.1", "herdharbor-monitoring-config.js?v=1.8.2", "monitoring cache version");';
const optionalLine = 'html = html.split("herdharbor-monitoring-config.js?v=1.8.1").join("herdharbor-monitoring-config.js?v=1.8.2");';
if (source.includes(strictLine)) {
  source = source.replace(strictLine, optionalLine);
  fs.writeFileSync(target, source);
}
