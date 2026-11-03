"use strict";
// Local Chromium acceptance with synthetic records and all remote requests
// blocked. Supply Playwright via NODE_PATH (or HH_PLAYWRIGHT_MODULE) and a
// browser executable via HERDHARBOR_CHROME_PATH when it is not installed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.HH_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const fixture = {
  profile: { operationName: "Synthetic test farm", ownerName: "Test Owner" },
  animals: [
    { id: "sire", name: "Sire", species: "Rabbit", sex: "Male", color: "Black", genetics: { loci: { D: { alleles: ["D", "d"], status: "confirmed", source: "dna" } } } },
    { id: "dam", name: "Dam", species: "Rabbit", sex: "Female", color: "Blue", genetics: { loci: { D: { alleles: ["d", "d"], status: "confirmed", source: "dna" } } } },
    { id: "kit", name: "Kit", species: "Rabbit", sex: "Female", color: "Black", sireId: "sire", damId: "dam" },
    { id: "dog", name: "Dog", species: "Dog", sex: "Female", breed: "Golden Retriever", canine: {} }
  ], settings: { theme: "light" }
};
const routes = ["dashboard", "animals", "pedigrees", "breeding", "litters", "health", "tasks", "sales", "budget", "analytics", "settings"];
const cloudStub = "window.HerdHarborCloud={getSession:()=>null,getSyncStatus:()=>({online:false}),syncNow:async()=>false};";

async function main() {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://local").pathname;
    const file = path.resolve(root, pathname === "/" ? "index.html" : "." + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const type = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" }[path.extname(file)];
      res.setHeader("Content-Type", type || "application/octet-stream"); res.end(fs.readFileSync(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.HERDHARBOR_CHROME_PATH || undefined,
      headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname === "/herdharbor-cloud.js") return route.fulfill({ contentType: "text/javascript", body: cloudStub });
      return route.continue();
    });
    await page.addInitScript(value => localStorage.setItem("herdharbor_pre_alpha_v1", JSON.stringify(value)), fixture);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.HerdHarborApp && window.HerdHarborRabbitGenetics && window.HerdHarborSubscriptionEngine);
    await page.waitForFunction(() => window.HerdHarborApp.getState().animals[2].genetics?.loci?.D?.source === "family-inferred");
    let screens = 0, dialogs = 0;
    for (const width of [320, 375, 390, 412, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        for (const route of routes) {
          await page.locator(`.nav-item[data-route="${route}"]`).first().evaluate(node => node.click());
          await page.waitForFunction(route => !document.querySelector(`#view-${route}`)?.textContent.includes("Loading…"), route);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${route} overflows at ${width}/${theme}`);
          screens++;
        }
        await page.evaluate(() => window.HerdHarborSubscriptionEngine.open());
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `subscription overflows at ${width}/${theme}`);
        await page.evaluate(() => window.HerdHarborSubscriptionEngine.close());
        screens++;
        await page.evaluate(() => window.HerdHarborApp.openAnimalEditor("dog"));
        assert.equal(await page.evaluate(() => {
          const modal = document.querySelector(".modal");
          return document.body.classList.contains("modal-open") && modal.scrollWidth <= modal.clientWidth + 1;
        }), true, `animal editor overflows at ${width}/${theme}`);
        dialogs++;
        // Short viewport models the available space with a keyboard open;
        // it is not a physical iOS/Android keyboard certification.
        await page.setViewportSize({ width, height: 400 });
        const lastField = page.locator(".modal input:visible,.modal select:visible,.modal textarea:visible").last();
        await lastField.scrollIntoViewIfNeeded();
        const bounds = await lastField.boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 401, `field inaccessible in short viewport ${width}/${theme}`);
        await page.locator("#modal-close").click({ force: true });
        await page.setViewportSize({ width, height: 900 });
      }
    }
    assert.deepEqual(errors, [], "unexpected browser runtime exceptions");
    console.log(JSON.stringify({ screens, dialogs, shortViewportChecks: dialogs, widths: [320, 375, 390, 412, 768, 1440], themes: ["light", "dark"], runtimeErrors: errors.length }));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
