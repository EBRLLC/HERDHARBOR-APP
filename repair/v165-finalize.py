from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Preserve aggregate-only filters separately from market-fact serialization.
market_path = "market-analytics-v1.6.5.js"
replace_once(
    market_path,
    '  const QUALIFYING_STATUS = "Completed";\n',
    '  const AGGREGATE_FILTER_FIELDS = Object.freeze([\n'
    '    "species", "breed", "sex", "age_bucket", "color_variety", "pedigree_status",\n'
    '    "registration_status", "region_country", "region_code", "broad_region",\n'
    '    "sale_month", "sale_year", "currency", "start", "end"\n'
    '  ]);\n'
    '  const QUALIFYING_STATUS = "Completed";\n'
)
replace_once(
    market_path,
    '  function getConsent(state = {}) {\n',
    '  function sanitizeAggregateFilters(input = {}) {\n'
    '    const output = {};\n'
    '    for (const field of AGGREGATE_FILTER_FIELDS) {\n'
    '      const value = input[field];\n'
    '      if (typeof value === "string" && value.trim()) output[field] = value.trim();\n'
    '      else if (typeof value === "number" && Number.isFinite(value)) output[field] = String(value);\n'
    '    }\n'
    '    return output;\n'
    '  }\n\n'
    '  function getConsent(state = {}) {\n'
)
replace_once(
    market_path,
    '    const result = await invoke({ action: "aggregate", filters: sanitizeMarketFact(filters) });\n',
    '    const result = await invoke({ action: "aggregate", filters: sanitizeAggregateFilters(filters) });\n'
)
replace_once(
    market_path,
    '    ALLOWED_FACT_FIELDS, PROHIBITED_FIELDS, QUALIFYING_STATUS, stableStringify,\n'
    '    fingerprint, sanitizeMarketFact, getConsent, contributionFingerprint, readQueue,\n',
    '    ALLOWED_FACT_FIELDS, PROHIBITED_FIELDS, AGGREGATE_FILTER_FIELDS, QUALIFYING_STATUS, stableStringify,\n'
    '    fingerprint, sanitizeMarketFact, sanitizeAggregateFilters, getConsent, contributionFingerprint, readQueue,\n'
)

# 2-4) Complete Market UI/filter refresh and real species-color persistence.
analytics_path = "analytics-v1.6.1.js"
replace_once(
    analytics_path,
    '    growthMode: "date", agePreset: "all", ageStart: "", ageEnd: "", animalIds: [],\n'
    '    market: null, marketLoading: false, marketError: ""\n',
    '    growthMode: "date", agePreset: "all", ageStart: "", ageEnd: "", animalIds: [],\n'
    '    market: null, marketLoading: false, marketError: "",\n'
    '    marketFilters: { breed: "", sex: "", age_bucket: "", color_variety: "", pedigree_status: "", registration_status: "", region_country: "", region_code: "", broad_region: "", sale_month: "", sale_year: "" }\n'
)
replace_once(
    analytics_path,
    '  const seriesColorControls = (items) => `<div class="analytics-color-row">${items.map((item, index) => seriesColorControl(item.key, item.label, item.index ?? index)).join("")}</div>`;\n\n'
    '  function overviewView() {\n',
    '  const seriesColorControls = (items) => `<div class="analytics-color-row">${items.map((item, index) => seriesColorControl(item.key, item.label, item.index ?? index)).join("")}</div>`;\n\n'
    '  function marketFilterPayload() {\n'
    '    return Object.fromEntries(Object.entries(ui.marketFilters || {}).filter(([, value]) => String(value || "").trim()).map(([key, value]) => [key, String(value).trim()]));\n'
    '  }\n\n'
    '  function marketFilterControls() {\n'
    '    const value = (key) => esc(ui.marketFilters?.[key] || "");\n'
    '    const selected = (key, option) => ui.marketFilters?.[key] === option ? "selected" : "";\n'
    '    return `<div class="analytics-module-controls analytics-market-filters">\n'
    '      <label>Breed<input data-market-filter="breed" value="${value("breed")}" placeholder="Holland Lop"></label>\n'
    '      <label>Sex<select data-market-filter="sex"><option value="">All</option><option value="Female" ${selected("sex", "Female")}>Female</option><option value="Male" ${selected("sex", "Male")}>Male</option><option value="Unknown" ${selected("sex", "Unknown")}>Unknown</option></select></label>\n'
    '      <label>Age at sale<select data-market-filter="age_bucket"><option value="">All ages</option><option value="Birth–8 weeks" ${selected("age_bucket", "Birth–8 weeks")}>Birth–8 weeks</option><option value="9–12 weeks" ${selected("age_bucket", "9–12 weeks")}>9–12 weeks</option><option value="3–6 months" ${selected("age_bucket", "3–6 months")}>3–6 months</option><option value="7–12 months" ${selected("age_bucket", "7–12 months")}>7–12 months</option><option value="1–2 years" ${selected("age_bucket", "1–2 years")}>1–2 years</option><option value="Over 2 years" ${selected("age_bucket", "Over 2 years")}>Over 2 years</option></select></label>\n'
    '      <label>Color / variety<input data-market-filter="color_variety" value="${value("color_variety")}" placeholder="Recorded value"></label>\n'
    '      <label>Pedigree status<input data-market-filter="pedigree_status" value="${value("pedigree_status")}" placeholder="Recorded value"></label>\n'
    '      <label>Registration status<input data-market-filter="registration_status" value="${value("registration_status")}" placeholder="Recorded value"></label>\n'
    '      <label>Country<input data-market-filter="region_country" maxlength="2" value="${value("region_country")}" placeholder="US"></label>\n'
    '      <label>State / large region<input data-market-filter="region_code" maxlength="32" value="${value("region_code")}" placeholder="KY"></label>\n'
    '      <label>Broad region<input data-market-filter="broad_region" maxlength="64" value="${value("broad_region")}" placeholder="Southeast"></label>\n'
    '      <label>Sale month<select data-market-filter="sale_month"><option value="">All months</option>${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${selected("sale_month", String(index + 1))}>${new Date(2000, index, 1).toLocaleString(undefined, { month: "long" })}</option>`).join("")}</select></label>\n'
    '      <label>Sale year<input data-market-filter="sale_year" type="number" min="1900" max="2200" value="${value("sale_year")}" placeholder="2026"></label>\n'
    '      <button type="button" class="button button-ghost" data-market-clear>Clear Market filters</button>\n'
    '    </div><p class="brand-file-note">Market filters are exact-match, privacy-safe aggregate filters. The five-observation minimum is applied after every filter.</p>`;\n'
    '  }\n\n'
    '  function overviewView() {\n'
)
replace_once(
    analytics_path,
    '    if (feed.rows.length) cards.push(stat("Feed costs", money(feed.total), `${feed.rows.length} expense records`));\n'
    '    return `<div class="stats-grid">${cards.join("")}</div>${section("Available personal analytics", `<div class="analytics-availability">${METRICS.map((metric) => `<div><strong>${esc(metric.name)}</strong><span>${esc(metric.category)} · ${esc(metric.visualizations.join(", "))} · ${esc(metric.source)}</span></div>`).join("")}</div>`, "Missing records are shown as no data, never as fabricated zero observations.")}`;\n',
    '    if (feed.rows.length) cards.push(stat("Feed costs", money(feed.total), `${feed.rows.length} expense records`));\n'
    '    const speciesCounts = groupBy(active, (record) => record.species || "Unknown", () => 1);\n'
    '    const speciesColors = speciesCounts.length ? seriesColorControls(speciesCounts.map((row, index) => ({ key: `species:${row.x}`, label: row.x, index }))) : "";\n'
    '    const speciesChart = speciesCounts.length ? section("Current animals by species", barChart(speciesCounts.map((row, index) => ({ ...row, colorKey: `species:${row.x}`, color: colorFor(`species:${row.x}`, index) })), { label: "Current animals by species" }), "Species colors persist in Analytics settings and are reused whenever species series are charted.") : "";\n'
    '    return `<div class="stats-grid">${cards.join("")}</div>${speciesColors}${speciesChart}${section("Available personal analytics", `<div class="analytics-availability">${METRICS.map((metric) => `<div><strong>${esc(metric.name)}</strong><span>${esc(metric.category)} · ${esc(metric.visualizations.join(", "))} · ${esc(metric.source)}</span></div>`).join("")}</div>`, "Missing records are shown as no data, never as fabricated zero observations.")}`;\n'
)
replace_once(
    analytics_path,
    '  function marketView() {\n'
    '    const consent = currentState()?.settings?.marketAnalyticsConsent;\n'
    '    if (!consent?.enabled) return empty("Market Analytics participation is off", "Enable the separate, optional Market Analytics setting to contribute future completed sales and view privacy-safe aggregate results.");\n'
    '    if (!root?.HerdHarborMarket) return empty("Market Analytics is unavailable", "Your private records are unchanged. Reopen HerdHarbor after the v1.6.5 update finishes.");\n'
    '    if (ui.marketLoading) return empty("Loading privacy-safe market results…", "Only groups meeting the minimum sample threshold can be returned.");\n'
    '    if (ui.marketError) return empty("Market results could not load", ui.marketError);\n'
    '    if (!ui.market?.available) return empty("Not enough market data yet", `At least ${ui.market?.minimumSampleSize || 5} matching opted-in observations are required. Current qualifying sample: ${ui.market?.sampleSize ?? "suppressed"}.`);\n'
    '    const result = ui.market;\n'
    '    return `<div class="stats-grid">${stat("Sample size", result.sampleSize)}${stat("Median sale price", money(result.medianSalePrice, result.currency || "USD"))}${stat("Average sale price", money(result.averageSalePrice, result.currency || "USD"))}${stat("Median listed price", money(result.medianListedPrice, result.currency || "USD"))}${stat("Average listed price", money(result.averageListedPrice, result.currency || "USD"))}${stat("Average asking vs. sale", money(result.averageAskingDifference, result.currency || "USD"))}${result.minimumSalePrice !== undefined ? stat("Minimum", money(result.minimumSalePrice, result.currency || "USD")) : ""}${result.maximumSalePrice !== undefined ? stat("Maximum", money(result.maximumSalePrice, result.currency || "USD")) : ""}</div>${section("Market trend", lineChart([{ name: "Market median", color: colorFor("metric:market-median", 1), points: sourceArray(result, "trend").map((point, index) => ({ xValue: index, y: point.medianSalePrice, label: point.period, detail: money(point.medianSalePrice, result.currency || "USD") })) }], { yLabel: (value) => money(value, result.currency || "USD"), label: "Privacy-safe market median over time" }), "Aggregated opted-in observations only. Raw breeder transactions are never returned.")}`;\n'
    '  }\n',
    '  function marketView() {\n'
    '    const consent = currentState()?.settings?.marketAnalyticsConsent;\n'
    '    if (!consent?.enabled) return empty("Market Analytics participation is off", "Enable the separate, optional Market Analytics setting to contribute future completed sales and view privacy-safe aggregate results.");\n'
    '    if (!root?.HerdHarborMarket) return empty("Market Analytics is unavailable", "Your private records are unchanged. Reopen HerdHarbor after the v1.6.5 update finishes.");\n'
    '    const controls = marketFilterControls();\n'
    '    if (ui.marketLoading) return `${controls}${empty("Loading privacy-safe market results…", "Only groups meeting the minimum sample threshold can be returned.")}`;\n'
    '    if (ui.marketError) return `${controls}${empty("Market results could not load", ui.marketError)}`;\n'
    '    if (!ui.market?.available) return `${controls}${empty("Not enough market data yet", `At least ${ui.market?.minimumSampleSize || 5} matching opted-in observations are required. Exact sub-threshold sample counts are suppressed.`)}`;\n'
    '    const result = ui.market;\n'
    '    return `${controls}<div class="stats-grid">${stat("Sample size", result.sampleSize)}${stat("Median sale price", money(result.medianSalePrice, result.currency || "USD"))}${stat("Average sale price", money(result.averageSalePrice, result.currency || "USD"))}${stat("Median listed price", money(result.medianListedPrice, result.currency || "USD"))}${stat("Average listed price", money(result.averageListedPrice, result.currency || "USD"))}${stat("Average asking vs. sale", money(result.averageAskingDifference, result.currency || "USD"))}${result.minimumSalePrice !== undefined ? stat("Minimum", money(result.minimumSalePrice, result.currency || "USD")) : ""}${result.maximumSalePrice !== undefined ? stat("Maximum", money(result.maximumSalePrice, result.currency || "USD")) : ""}</div>${section("Market trend", lineChart([{ name: "Market median", color: colorFor("metric:market-median", 1), points: sourceArray(result, "trend").map((point, index) => ({ xValue: index, y: point.medianSalePrice, label: point.period, detail: money(point.medianSalePrice, result.currency || "USD") })) }], { yLabel: (value) => money(value, result.currency || "USD"), label: "Privacy-safe market median over time" }), "Aggregated opted-in observations only. Raw breeder transactions are never returned.")}`;\n'
    '  }\n'
)
replace_once(
    analytics_path,
    '      ui.market = await root.HerdHarborMarket.queryAggregate({ species: ui.species || undefined, currency: "USD", start: context().start || undefined, end: context().end || undefined });\n',
    '      ui.market = await root.HerdHarborMarket.queryAggregate({ species: ui.species || undefined, ...marketFilterPayload(), currency: "USD", start: context().start || undefined, end: context().end || undefined });\n'
)
replace_once(
    analytics_path,
    '    container.querySelector("[data-analytics-start]")?.addEventListener("change", (event) => { ui.start = event.target.value; ui.market = null; render(host); });\n',
    '    container.querySelector("[data-analytics-start]")?.addEventListener("change", (event) => { ui.start = event.target.value; ui.market = null; render(host); if (ui.tab === "market") loadMarketAggregate(); });\n'
)
replace_once(
    analytics_path,
    '    container.querySelector("[data-production-product]")?.addEventListener("change", (event) => { ui.product = event.target.value; render(host); });\n'
    '    container.querySelectorAll("[data-series-color]").forEach((input) => input.addEventListener("input", () => {\n',
    '    container.querySelector("[data-production-product]")?.addEventListener("change", (event) => { ui.product = event.target.value; render(host); });\n'
    '    container.querySelectorAll("[data-market-filter]").forEach((input) => input.addEventListener("change", (event) => {\n'
    '      ui.marketFilters[event.target.dataset.marketFilter] = event.target.value;\n'
    '      ui.market = null;\n'
    '      render(host);\n'
    '      loadMarketAggregate();\n'
    '    }));\n'
    '    container.querySelector("[data-market-clear]")?.addEventListener("click", () => {\n'
    '      Object.keys(ui.marketFilters).forEach((key) => { ui.marketFilters[key] = ""; });\n'
    '      ui.market = null;\n'
    '      render(host);\n'
    '      loadMarketAggregate();\n'
    '    });\n'
    '    container.querySelectorAll("[data-series-color]").forEach((input) => input.addEventListener("input", () => {\n'
)

# Responsive styling for the expanded Market filter controls.
css_path = "analytics-v1.6.1.css"
replace_once(
    css_path,
    '.analytics-module-controls select { display: block; width: 100%; margin-top: 5px; }\n',
    '.analytics-module-controls select,\n.analytics-module-controls input { display: block; width: 100%; margin-top: 5px; }\n.analytics-market-filters { padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--white); }\nhtml[data-theme="dark"] .analytics-market-filters { background: #172738; }\n'
)
replace_once(
    css_path,
    '  .analytics-two-column { grid-template-columns: 1fr; }\n',
    '  .analytics-two-column { grid-template-columns: 1fr; }\n  .analytics-market-filters label { flex: 1 1 42%; min-width: 150px; }\n'
)
replace_once(
    css_path,
    '  .analytics-tabs .button { min-height: 44px; }\n',
    '  .analytics-tabs .button { min-height: 44px; }\n  .analytics-market-filters label { flex-basis: 100%; }\n'
)

# 2) Below-threshold responses must not disclose exact sparse-cell counts.
sql_path = "supabase/v1.6.5-market-analytics-foundation.sql"
replace_once(
    sql_path,
    "    return jsonb_build_object(\n      'available', false,\n      'sampleSize', v_count,\n      'minimumSampleSize', v_threshold\n    );\n",
    "    return jsonb_build_object(\n      'available', false,\n      'minimumSampleSize', v_threshold\n    );\n"
)

# Release-contract tests for all five final fixes.
market_test = Path("tests/market-analytics-foundation-v1.6.5.test.cjs")
text = market_test.read_text()
old = '''test("privacy threshold contract suppresses four and permits five while retaining median-first metrics", () => {\n  const sql = fs.readFileSync(path.join(root, "supabase/v1.6.5-market-analytics-foundation.sql"), "utf8");\n  assert.match(sql, /values \\('minimum_sample_size', '5'::jsonb\\)/);\n  assert.match(sql, /'available', false,[\\s\\S]*'sampleSize', v_count/);\n  assert.match(sql, /'available', true,[\\s\\S]*'medianSalePrice'/);\n'''
new = '''test("privacy threshold contract suppresses four and permits five while retaining median-first metrics", () => {\n  const sql = fs.readFileSync(path.join(root, "supabase/v1.6.5-market-analytics-foundation.sql"), "utf8");\n  assert.match(sql, /values \\('minimum_sample_size', '5'::jsonb\\)/);\n  const suppressed = sql.slice(sql.indexOf("if v_count < v_threshold then"), sql.indexOf("end if;", sql.indexOf("if v_count < v_threshold then")));\n  assert.match(suppressed, /'available', false/);\n  assert.doesNotMatch(suppressed, /sampleSize/);\n  assert.match(sql, /'available', true,[\\s\\S]*'medianSalePrice'/);\n'''
if text.count(old) != 1:
    raise SystemExit("market threshold test anchor mismatch")
text = text.replace(old, new, 1)
if 'aggregate filter serialization keeps date and advanced filters' not in text:
    text += '''\n\ntest("aggregate filter serialization keeps date and advanced filters without widening market fact fields", () => {\n  const filters = market.sanitizeAggregateFilters({\n    species: "Rabbit", breed: "Holland Lop", sex: "Female", age_bucket: "3–6 months",\n    color_variety: "Broken", pedigree_status: "Pedigreed", registration_status: "Registered",\n    region_country: "US", region_code: "KY", broad_region: "Southeast", sale_month: "6", sale_year: "2026",\n    currency: "USD", start: "2026-01-01", end: "2026-06-30", customer_name: "never", notes: "never"\n  });\n  assert.equal(filters.start, "2026-01-01");\n  assert.equal(filters.end, "2026-06-30");\n  assert.equal(filters.breed, "Holland Lop");\n  assert.equal(filters.sale_year, "2026");\n  assert.equal(filters.currency, "USD");\n  assert.equal(filters.customer_name, undefined);\n  assert.equal(filters.notes, undefined);\n});\n'''
market_test.write_text(text)

analytics_test = Path("tests/analytics-release-contract-v1.6.5.test.cjs")
text = analytics_test.read_text()
if 'final Market filters refresh correctly and species colors are real persisted series keys' not in text:
    text += '''\n\ntest("final Market filters refresh correctly and species colors are real persisted series keys", () => {\n  const js = fs.readFileSync(path.join(root, "analytics-v1.6.1.js"), "utf8");\n  for (const field of ["breed", "sex", "age_bucket", "color_variety", "pedigree_status", "registration_status", "region_country", "region_code", "broad_region", "sale_month", "sale_year"]) {\n    assert.ok(js.includes(`data-market-filter="${field}"`), `missing Market UI filter ${field}`);\n  }\n  assert.match(js, /queryAggregate\\(\\{ species: ui\\.species \\|\\| undefined, \\.\\.\\.marketFilterPayload\\(\\), currency: "USD", start:/);\n  const startHandler = js.slice(js.indexOf('container.querySelector("[data-analytics-start]")'), js.indexOf('container.querySelector("[data-analytics-end]")'));\n  assert.match(startHandler, /loadMarketAggregate\\(\\)/);\n  assert.match(js, /colorFor\\(`species:\\$\\{row\\.x\\}`/);\n  assert.match(js, /key: `species:\\$\\{row\\.x\\}`/);\n  assert.match(js, /Exact sub-threshold sample counts are suppressed/);\n});\n'''
analytics_test.write_text(text)

# 5) Rename the visible/current release-review workflow identity without renaming stable v1.6.1 runtime assets.
old_workflow = Path(".github/workflows/v1.6.1-monitoring-review.yml")
new_workflow = Path(".github/workflows/v1.6.5-release-review.yml")
workflow = old_workflow.read_text()
workflow = workflow.replace("name: Alpha v1.6.1 release review", "name: Alpha v1.6.5 release review", 1)
workflow = workflow.replace("branches: [agent/v1.6.1-crash-monitoring, agent/v1.6.1-admin-members]", "branches: [v1.6.5-analytics-market-foundation]", 1)
workflow = workflow.replace("herdharbor-v1.6.1-release-review-bundle", "herdharbor-v1.6.5-release-review-bundle")
workflow = workflow.replace("herdharbor-v1.6.1-release-review-unsigned-aab", "herdharbor-v1.6.5-release-review-unsigned-aab")
new_workflow.write_text(workflow)
old_workflow.unlink()

release_audit = Path("tests/current-release-reference-audit-v1.6.5.test.cjs")
text = release_audit.read_text()
if 'Alpha v1.6.5 release review' not in text:
    text += '''\n\nconst releaseWorkflow = read(".github/workflows/v1.6.5-release-review.yml");\nassert.match(releaseWorkflow, /name: Alpha v1\\.6\\.5 release review/);\nassert.ok(!fs.existsSync(path.join(root, ".github/workflows/v1.6.1-monitoring-review.yml")));\nassert.doesNotMatch(releaseWorkflow, /herdharbor-v1\\.6\\.1-release-review-(?:bundle|unsigned-aab)/);\n'''
release_audit.write_text(text)

# Remove one-time finalizer artifacts from the resulting product commit.
Path("repair/v165-finalize.py").unlink(missing_ok=True)
Path(".github/workflows/v1.6.5-finalize.yml").unlink(missing_ok=True)
