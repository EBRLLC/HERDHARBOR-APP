const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "index.html"), "utf8");
const genetics = fs.readFileSync(path.join(root, "rabbit-genetics-ui-advanced-v1.6.1.js"), "utf8");
const intelligenceCss = fs.readFileSync(path.join(root, "breeding-intelligence-v1.6.1.css"), "utf8");

test("animal card photos cannot shrink when genetics adds a third action", () => {
  assert.match(page, /\.animal-avatar\s*\{[^}]*flex:\s*0 0 52px/s);
  assert.match(page, /\.animal-card-footer\s*\{[^}]*justify-content:\s*flex-start[^}]*flex-wrap:\s*wrap/s);
  assert.match(page, /\.animal-card-footer \.button\s*\{\s*flex:\s*0 0 auto/);
});

test("injected Genetics action opens the selected rabbit profile directly", () => {
  assert.match(genetics, /b\.type="button"/);
  assert.match(genetics, /b\.addEventListener\("click",event=>\{event\.preventDefault\(\);event\.stopPropagation\(\);profile\(a\.id\)\}\)/);
});

test("dark theme preserves contrast inside the light genetics dialog", () => {
  assert.match(intelligenceCss, /html\[data-theme="dark"\] \.hh-bi-modal\{color:#0d2540;color-scheme:light\}/);
  assert.match(intelligenceCss, /html\[data-theme="dark"\] \.hh-bi-modal \.hh-bi-kicker\{color:#17645f\}/);
  assert.match(intelligenceCss, /html\[data-theme="dark"\] \.hh-bi-modal p,[\s\S]*\.hh-bi-modal li\{color:#334b60\}/);
});
