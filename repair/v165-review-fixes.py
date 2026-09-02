from pathlib import Path


def replace_once(path, old, new):
    text = Path(path).read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:100]!r}")
    Path(path).write_text(text.replace(old, new, 1))


analytics_path = "analytics-v1.6.1.js"
replace_once(
    analytics_path,
    '  function displayWeight(grams, unit = "lb", digits = 2) {\n    if (!Number.isFinite(Number(grams))) return "—";\n    const value = Number(grams);',
    '  function displayWeight(grams, unit = "lb", digits = 2) {\n    if (grams === null || grams === undefined || grams === "" || !Number.isFinite(Number(grams))) return "—";\n    const value = Number(grams);'
)
replace_once(
    analytics_path,
    '    const ageErrors = [];\n    const series = animals.map((record, index) => {',
    '    const ageErrors = [];\n    const visibleRowsByAnimal = new Map();\n    const series = animals.map((record, index) => {'
)
replace_once(
    analytics_path,
    '        if (filtered.error) ageErrors.push(`${record.name || "Unnamed animal"}: ${filtered.error}`);\n      }\n      return { name: record.name || "Unnamed animal", color: colorFor(`animal:${record.id}`, index), points: rows.map((row) => ({ xValue: ui.growthMode === "age" ? row.ageDays : day(row.date)?.getTime(), y: row.grams, label: ui.growthMode === "age" ? `${row.ageDays} days` : dateLabel(row.date), detail: displayWeight(row.grams, unit) })).filter((point) => point.xValue !== null && point.xValue !== undefined) };\n    });\n    const selectedRows = allRows.filter((row) => ui.animalIds.includes(row.animalId));',
    '        if (filtered.error) ageErrors.push(`${record.name || "Unnamed animal"}: ${filtered.error}`);\n      }\n      visibleRowsByAnimal.set(record.id, rows);\n      return { name: record.name || "Unnamed animal", color: colorFor(`animal:${record.id}`, index), points: rows.map((row) => ({ xValue: ui.growthMode === "age" ? row.ageDays : day(row.date)?.getTime(), y: row.grams, label: ui.growthMode === "age" ? `${row.ageDays} days` : dateLabel(row.date), detail: displayWeight(row.grams, unit) })).filter((point) => point.xValue !== null && point.xValue !== undefined) };\n    });\n    const selectedRows = animals.length === 1 ? (visibleRowsByAnimal.get(animals[0].id) || []) : [];'
)
replace_once(
    analytics_path,
    '      ui.market = await root.HerdHarborMarket.queryAggregate({ species: ui.species || undefined, start: context().start || undefined, end: context().end || undefined });',
    '      ui.market = await root.HerdHarborMarket.queryAggregate({ species: ui.species || undefined, currency: "USD", start: context().start || undefined, end: context().end || undefined });'
)

edge_path = "supabase/functions/market-contribution/index.ts"
replace_once(
    edge_path,
    '  "registration_status", "region_country", "region_code", "broad_region",\n  "sale_month", "sale_year"',
    '  "registration_status", "region_country", "region_code", "broad_region",\n  "sale_month", "sale_year", "currency", "start", "end"'
)

sql_path = "supabase/v1.6.5-market-analytics-foundation.sql"
sql = Path(sql_path).read_text()
old_decl = "  v_difference numeric;\n  v_currency text;\n  v_trend jsonb := '[]'::jsonb;\nbegin\n"
new_decl = "  v_difference numeric;\n  v_currency text;\n  v_currency_filter text;\n  v_start date;\n  v_end date;\n  v_trend jsonb := '[]'::jsonb;\nbegin\n  -- v1.6.5 personal and market currency display is USD. Keep aggregation currency-isolated\n  -- so future non-USD facts can never be averaged into a USD result.\n  v_currency_filter := upper(coalesce(nullif(btrim(p_filters ->> 'currency'), ''), 'USD'));\n  v_start := market_private.safe_date(p_filters ->> 'start');\n  v_end := market_private.safe_date(p_filters ->> 'end');\n"
if sql.count(old_decl) != 1:
    raise SystemExit("SQL aggregate declaration anchor mismatch")
sql = sql.replace(old_decl, new_decl, 1)
old_tail = "    and (coalesce(p_filters ->> 'sale_month', '') = '' or f.sale_month = (p_filters ->> 'sale_month')::smallint)\n    and (coalesce(p_filters ->> 'sale_year', '') = '' or f.sale_year = (p_filters ->> 'sale_year')::smallint)"
new_tail = old_tail + "\n    and f.currency = v_currency_filter\n    and (v_start is null or make_date(f.sale_year, f.sale_month, 1) >= date_trunc('month', v_start::timestamp)::date)\n    and (v_end is null or make_date(f.sale_year, f.sale_month, 1) <= date_trunc('month', v_end::timestamp)::date)"
if sql.count(old_tail) != 2:
    raise SystemExit(f"SQL aggregate filter anchor mismatch: {sql.count(old_tail)}")
sql = sql.replace(old_tail, new_tail, 2)
Path(sql_path).write_text(sql)

analytics_test = Path("tests/analytics-release-contract-v1.6.5.test.cjs")
text = analytics_test.read_text()
marker = 'test("review fixes keep missing weights missing and bind Growth summary/history to filtered chart rows"'
if marker not in text:
    text += '''\n\ntest("review fixes keep missing weights missing and bind Growth summary/history to filtered chart rows", () => {\n  assert.equal(analytics.displayWeight(null, "lb"), "—");\n  assert.equal(analytics.displayWeight(undefined, "lb"), "—");\n  assert.equal(analytics.displayWeight("", "lb"), "—");\n  const js = fs.readFileSync(path.join(root, "analytics-v1.6.1.js"), "utf8");\n  assert.match(js, /const visibleRowsByAnimal = new Map\\(\\)/);\n  assert.match(js, /visibleRowsByAnimal\\.set\\(record\\.id, rows\\)/);\n  assert.match(js, /const selectedRows = animals\\.length === 1 \\? \\(visibleRowsByAnimal\\.get\\(animals\\[0\\]\\.id\\) \\|\\| \\[\\]\\) : \\[\\]/);\n});\n'''
    analytics_test.write_text(text)

market_test = Path("tests/market-analytics-foundation-v1.6.5.test.cjs")
text = market_test.read_text()
marker = 'test("market aggregates are currency-isolated and honor the Analytics date range"'
if marker not in text:
    text += '''\n\ntest("market aggregates are currency-isolated and honor the Analytics date range", () => {\n  const sql = fs.readFileSync(path.join(root, "supabase/v1.6.5-market-analytics-foundation.sql"), "utf8");\n  const edge = fs.readFileSync(path.join(root, "supabase/functions/market-contribution/index.ts"), "utf8");\n  const analyticsSource = fs.readFileSync(path.join(root, "analytics-v1.6.1.js"), "utf8");\n  assert.match(edge, /"sale_month", "sale_year", "currency", "start", "end"/);\n  assert.match(sql, /v_currency_filter := upper\\(coalesce\\(nullif\\(btrim\\(p_filters ->> 'currency'\\), ''\\), 'USD'\\)\\)/);\n  assert.equal((sql.match(/f\\.currency = v_currency_filter/g) || []).length, 2);\n  assert.equal((sql.match(/make_date\\(f\\.sale_year, f\\.sale_month, 1\\)/g) || []).length, 4);\n  assert.match(analyticsSource, /queryAggregate\\(\\{ species: ui\\.species \\|\\| undefined, currency: "USD", start:/);\n});\n'''
    market_test.write_text(text)
