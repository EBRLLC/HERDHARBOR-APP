(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborAnalytics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.6.0-phase1";
  const DAY_MS = 86400000;
  const PALETTE = ["#6f42c1", "#2e7d7b", "#d97706", "#2563eb", "#dc2626", "#0891b2", "#65a30d", "#be185d"];
  const POULTRY = new Set(["Chicken", "Duck", "Turkey", "Goose", "Quail", "Poultry"]);
  const METRICS = Object.freeze([
    { id: "weight", name: "Weight", category: "growth", source: "health", unit: "weight", aggregation: "latest", timeDimension: "date", comparisonDimensions: ["animal", "species", "breed"], visualizations: ["line", "summary"] },
    { id: "litter-size", name: "Litter Size", category: "breeding", source: "litters", unit: "offspring", aggregation: "mean", timeDimension: "birthDate", comparisonDimensions: ["dam", "sire", "pairing"], visualizations: ["bar", "summary"] },
    { id: "show-results", name: "Show Results", category: "shows", source: "showResults", unit: "results", aggregation: "count", timeDimension: "showDate", comparisonDimensions: ["animal", "breed", "variety"], visualizations: ["bar", "summary"] },
    { id: "sale-price", name: "Sale Price", category: "sales", source: "sales", unit: "currency", aggregation: "mean", timeDimension: "saleDate", comparisonDimensions: ["species", "breed"], visualizations: ["bar", "summary"] },
    { id: "revenue", name: "Recorded Revenue", category: "revenue", source: "payments", unit: "currency", aggregation: "sum", timeDimension: "date", comparisonDimensions: ["month", "species", "breed"], visualizations: ["line", "bar", "summary"] },
    { id: "production", name: "Production", category: "production", source: "productionRecords", unit: "record-unit", aggregation: "sum", timeDimension: "date", comparisonDimensions: ["product", "species", "scope"], visualizations: ["line", "bar", "summary"] },
    { id: "feed-cost", name: "Feed Cost", category: "feed", source: "transactions", unit: "currency", aggregation: "sum", timeDimension: "date", comparisonDimensions: ["species", "scope"], visualizations: ["line", "summary"] }
  ]);

  const ui = { tab: "overview", range: "all", start: "", end: "", species: "", growthMode: "date", animalIds: [] };
  let host = null;
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const sum = (rows) => rows.reduce((total, value) => total + (num(value) || 0), 0);
  const mean = (rows) => rows.length ? sum(rows) / rows.length : null;
  const median = (rows) => {
    const values = rows.map(num).filter((value) => value !== null).sort((a, b) => a - b);
    if (!values.length) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const day = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(value || ""))) return null;
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const daysBetween = (first, last) => {
    const start = day(first), end = day(last);
    return start && end ? Math.round((end - start) / DAY_MS) : null;
  };
  const dateLabel = (value) => day(value)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) || "—";
  const money = (value) => value === null || value === undefined ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  const decimal = (value, digits = 1) => value === null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
  const state = () => host?.state || {};
  const array = (key) => Array.isArray(state()[key]) ? state()[key] : [];
  const animal = (id) => array("animals").find((record) => record.id === id);
  const animalName = (id) => animal(id)?.name || animal(id)?.animalName || "Unknown animal";
  const speciesForAnimal = (id) => animal(id)?.species || "";
  const dateInRange = (value, range = ui) => {
    if (!value) return false;
    const iso = String(value).slice(0, 10);
    const bounds = rangeBounds(range.range, range.start, range.end);
    return (!bounds.start || iso >= bounds.start) && (!bounds.end || iso <= bounds.end);
  };
  function rangeBounds(range, customStart = "", customEnd = "", todayValue = new Date().toISOString().slice(0, 10)) {
    if (range === "all") return { start: "", end: "" };
    if (range === "custom") return { start: customStart || "", end: customEnd || "" };
    const days = { "30d": 30, "3m": 91, "6m": 183, "12m": 365 }[range];
    const end = day(todayValue);
    if (!days || !end) return { start: "", end: "" };
    return { start: new Date(end.getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10), end: todayValue };
  }
  function normalizeWeight(value, unit = "lb") {
    const amount = num(value);
    if (amount === null) return null;
    const factors = { lb: 453.59237, oz: 28.349523125, kg: 1000, g: 1 };
    return factors[String(unit).toLowerCase()] ? amount * factors[String(unit).toLowerCase()] : null;
  }
  function displayWeight(grams, unit = "lb", digits = 2) {
    if (!Number.isFinite(grams)) return "—";
    const factors = { lb: 453.59237, oz: 28.349523125, kg: 1000, g: 1 };
    const factor = factors[String(unit).toLowerCase()] || factors.lb;
    return `${decimal(grams / factor, digits)} ${unit}`;
  }
  function weightRows(source = state()) {
    const animals = new Map((source.animals || []).map((record) => [record.id, record]));
    return (source.health || []).flatMap((record) => {
      const grams = normalizeWeight(record.weight, record.weightUnit || "lb");
      const date = String(record.date || "").slice(0, 10);
      if (grams === null || !day(date)) return [];
      const subject = animals.get(record.animalId) || {};
      return [{ id: record.id, animalId: record.animalId, animalName: subject.name || "Unknown animal", species: subject.species || "", breed: subject.breed || "", dob: subject.dob || "", date, grams, recordedValue: num(record.weight), recordedUnit: record.weightUnit || "lb" }];
    }).sort((left, right) => left.date.localeCompare(right.date));
  }
  function growthSummary(rows) {
    const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
    if (!sorted.length) return { count: 0, first: null, latest: null, gainGrams: null, days: null, dailyGainGrams: null, weeklyGainGrams: null, previousGainGrams: null };
    const first = sorted[0], latest = sorted[sorted.length - 1];
    const elapsed = daysBetween(first.date, latest.date);
    const gain = latest.grams - first.grams;
    return { count: sorted.length, first, latest, gainGrams: gain, days: elapsed, dailyGainGrams: elapsed > 0 ? gain / elapsed : null, weeklyGainGrams: elapsed > 0 ? gain / elapsed * 7 : null, previousGainGrams: sorted.length > 1 ? latest.grams - sorted[sorted.length - 2].grams : null };
  }
  function litterAnalytics(source = state()) {
    const litters = (source.litters || []).filter((record) => dateInRange(record.birthDate));
    const values = (key) => litters.map((record) => num(record[key])).filter((value) => value !== null);
    const born = values("bornAlive"), stillborn = values("stillborn"), weaned = values("weaned");
    const totalBorn = sum(born), totalWeaned = sum(weaned);
    return { litters, totalLitters: litters.length, totalBorn, stillborn: sum(stillborn), weaned: totalWeaned, averageLitter: mean(born), largestLitter: born.length ? Math.max(...born) : null, survival: totalBorn > 0 && weaned.length ? totalWeaned / totalBorn * 100 : null };
  }
  function breedingAnalytics(source = state()) {
    const rows = (source.breedings || []).filter((record) => dateInRange(record.breedingDate));
    const status = (record) => String(record.status || "").toLowerCase();
    const success = rows.filter((record) => status(record) === "delivered" || (source.litters || []).some((litter) => litter.breedingId === record.id));
    const failed = rows.filter((record) => ["not pregnant", "cancelled"].includes(status(record)));
    const pending = rows.filter((record) => !success.includes(record) && !failed.includes(record));
    const resolved = success.length + failed.length;
    return { rows, success, failed, pending, rate: resolved ? success.length / resolved * 100 : null };
  }
  function saleTotal(sale) {
    return Math.max(0, sum((sale.items || []).map((item) => (num(item.quantity) || 1) * (num(item.unitPrice) || 0))) - (num(sale.discount) || 0) + (num(sale.tax) || 0));
  }
  function salesAnalytics(source = state()) {
    const sales = (source.sales || []).filter((sale) => sale.status === "Completed" && dateInRange(sale.saleDate));
    const itemRows = sales.flatMap((sale) => (sale.items || []).map((item) => ({ sale, item, animal: (source.animals || []).find((record) => record.id === item.animalId), price: (num(item.quantity) || 1) * (num(item.unitPrice) || 0) })));
    const prices = itemRows.map((row) => row.price);
    const payments = (source.payments || []).filter((payment) => dateInRange(payment.date) && sales.some((sale) => sale.id === payment.saleId));
    return { sales, itemRows, count: itemRows.length, average: mean(prices), median: median(prices), highest: prices.length ? Math.max(...prices) : null, lowest: prices.length ? Math.min(...prices) : null, invoiced: sum(sales.map(saleTotal)), revenue: sum(payments.map((payment) => payment.amount)), payments };
  }
  function showAnalytics(source = state()) {
    const entries = source.showEntries || [], results = source.showResults || [], awards = source.showAwards || [];
    const showMap = new Map((source.shows || []).map((show) => [show.id, show]));
    const visibleEntries = entries.filter((entry) => {
      const show = showMap.get(entry.showId) || {};
      const date = show.startDate || show.date || show.endDate;
      return (!ui.species || speciesForAnimal(entry.animalId) === ui.species) && dateInRange(date);
    });
    const ids = new Set(visibleEntries.map((entry) => entry.id));
    const visibleResults = results.filter((result) => ids.has(result.entryId));
    const resultIds = new Set(visibleResults.map((result) => result.id));
    const visibleAwards = awards.filter((award) => ids.has(award.entryId) || resultIds.has(award.resultId));
    const firsts = visibleResults.filter((result) => result.placement === "1st" || num(result.placementNumber) === 1);
    return { shows: new Set(visibleEntries.map((entry) => entry.showId)).size, entries: visibleEntries.length, results: visibleResults.length, firsts: firsts.length, awards: visibleAwards.length, bestOfBreed: visibleAwards.filter((award) => /best of breed/i.test(String(award.awardType || award.customAward || ""))).length };
  }
  function productionRows(product = "") {
    return array("productionRecords").filter((record) => (!product || record.product === product) && (!ui.species || productionSpecies(record) === ui.species) && dateInRange(record.date));
  }
  function productionSpecies(record) { return record.species || (record.animalId ? speciesForAnimal(record.animalId) : ""); }
  function metricAvailable(metricId, source = state(), selectedSpecies = ui.species) {
    const species = new Set(selectedSpecies ? [selectedSpecies] : (source.animals || []).map((record) => record.species).filter(Boolean));
    if (metricId === "eggs" && selectedSpecies && !POULTRY.has(selectedSpecies)) return false;
    if (metricId === "eggs" && !selectedSpecies && ![...species].some((value) => POULTRY.has(value))) return false;
    if (metricId === "milk") return (source.productionRecords || []).some((record) => record.product === "Milk" && (!selectedSpecies || productionSpecies(record) === selectedSpecies));
    if (metricId === "eggs") return (source.productionRecords || []).some((record) => record.product === "Eggs" && (!selectedSpecies || productionSpecies(record) === selectedSpecies));
    return true;
  }
  function groupByMonth(rows, dateKey, value) {
    const groups = new Map();
    rows.forEach((record) => {
      const key = String(record[dateKey] || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) return;
      groups.set(key, (groups.get(key) || 0) + (num(value(record)) || 0));
    });
    return [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([key, total]) => ({ x: key, y: total }));
  }
  function selectedAnimals() {
    const available = array("animals").filter((record) => !ui.species || record.species === ui.species);
    const ids = ui.animalIds.filter((id) => available.some((record) => record.id === id));
    if (!ids.length) ui.animalIds = available.slice(0, 3).map((record) => record.id);
    return available.filter((record) => ui.animalIds.includes(record.id));
  }
  function colorFor(id, index = 0) { return state().settings?.analyticsColors?.[id] || PALETTE[index % PALETTE.length]; }
  function lineChart(series, options = {}) {
    const width = 900, height = 330, pad = { left: 58, right: 20, top: 24, bottom: 48 };
    const points = series.flatMap((entry) => entry.points.map((point) => ({ ...point, series: entry })));
    if (!points.length) return empty("No data in this range", options.empty || "Add records or choose a wider date range.");
    const xValues = points.map((point) => point.xValue), yValues = points.map((point) => point.y);
    let minX = Math.min(...xValues), maxX = Math.max(...xValues), minY = Math.min(...yValues), maxY = Math.max(...yValues);
    if (minX === maxX) maxX += 1;
    if (minY === maxY) { minY = Math.max(0, minY - 1); maxY += 1; }
    const x = (value) => pad.left + (value - minX) / (maxX - minX) * (width - pad.left - pad.right);
    const y = (value) => height - pad.bottom - (value - minY) / (maxY - minY) * (height - pad.top - pad.bottom);
    const grid = [0, .25, .5, .75, 1].map((ratio) => { const value = minY + (maxY - minY) * ratio; const py = y(value); return `<line x1="${pad.left}" y1="${py}" x2="${width-pad.right}" y2="${py}"/><text x="${pad.left-10}" y="${py+4}" text-anchor="end">${esc(options.yLabel ? options.yLabel(value) : decimal(value, 1))}</text>`; }).join("");
    const drawings = series.map((entry) => {
      const sorted = [...entry.points].sort((left, right) => left.xValue - right.xValue);
      const path = sorted.map((point, index) => `${index ? "L" : "M"}${x(point.xValue).toFixed(1)},${y(point.y).toFixed(1)}`).join(" ");
      const dots = sorted.map((point) => `<circle cx="${x(point.xValue)}" cy="${y(point.y)}" r="5"><title>${esc(`${entry.name} · ${point.label} · ${point.detail || decimal(point.y, 2)}`)}</title></circle>`).join("");
      return `<g style="--series:${esc(entry.color)}"><path class="analytics-line" d="${path}"/>${dots}</g>`;
    }).join("");
    const firstLabel = points.reduce((left, right) => left.xValue <= right.xValue ? left : right).label;
    const lastLabel = points.reduce((left, right) => left.xValue >= right.xValue ? left : right).label;
    return `<div class="analytics-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label || "Analytics chart")}"><g class="analytics-grid">${grid}</g>${drawings}<text x="${pad.left}" y="${height-14}">${esc(firstLabel)}</text><text x="${width-pad.right}" y="${height-14}" text-anchor="end">${esc(lastLabel)}</text></svg><div class="analytics-legend">${series.map((entry) => `<span><i style="background:${esc(entry.color)}"></i>${esc(entry.name)}</span>`).join("")}</div></div>`;
  }
  const stat = (label, value, note = "") => `<article class="stat-card"><span class="label">${esc(label)}</span><strong class="value">${esc(value)}</strong>${note ? `<span class="note">${esc(note)}</span>` : ""}</article>`;
  const empty = (title, text) => `<div class="analytics-empty"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const section = (title, body, subtitle = "") => `<section class="panel analytics-panel"><div class="panel-header"><div><h3>${esc(title)}</h3>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</div></div>${body}</section>`;
  function header() {
    const species = [...new Set(array("animals").map((record) => record.species).filter(Boolean))].sort();
    return `<div class="page-header"><div><p class="eyebrow">HerdHarbor Alpha v1.6.1 · Phase 1</p><h2>Analytics</h2><p>Charts and summaries calculated from your existing HerdHarbor records.</p></div></div><div class="analytics-toolbar"><label>Farm view<select data-analytics-species><option value="">All farm</option>${species.map((value) => `<option value="${esc(value)}" ${ui.species === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label><label>Date range<select data-analytics-range><option value="all">All time</option><option value="12m">12 months</option><option value="6m">6 months</option><option value="3m">3 months</option><option value="30d">30 days</option><option value="custom">Custom range</option></select></label><label class="analytics-custom ${ui.range === "custom" ? "" : "hidden"}">Start<input data-analytics-start type="date" value="${esc(ui.start)}"></label><label class="analytics-custom ${ui.range === "custom" ? "" : "hidden"}">End<input data-analytics-end type="date" value="${esc(ui.end)}"></label></div>`;
  }
  function tabs() {
    const candidates = [
      ["overview", "Overview", true], ["growth", "Growth", weightRows().length], ["breeding", "Breeding", array("breedings").length || array("litters").length], ["shows", "Shows", array("showEntries").length], ["sales", "Sales", array("sales").length], ["revenue", "Revenue", array("payments").length], ["feed", "Feed", array("transactions").some((record) => record.category === "Feed")], ["production", "Production", array("productionRecords").length], ["health", "Health measurements", weightRows().length]
    ].filter((entry) => entry[2]);
    if (!candidates.some(([id]) => id === ui.tab)) ui.tab = "overview";
    return `<div class="analytics-tabs" role="tablist">${candidates.map(([id, label]) => `<button class="button ${ui.tab === id ? "button-primary" : "button-ghost"}" data-analytics-tab="${id}">${label}</button>`).join("")}</div>`;
  }
  function overviewView() {
    const active = array("animals").filter((record) => !["Sold", "Deceased", "Archived", "Ancestor Only"].includes(record.status));
    const weights = weightRows().filter((record) => (!ui.species || record.species === ui.species) && dateInRange(record.date));
    const litter = litterAnalytics(), breeding = breedingAnalytics(), sales = salesAnalytics(), shows = showAnalytics();
    const cards = [stat("Current animals", ui.species ? active.filter((record) => record.species === ui.species).length : active.length, ui.species || "All species")];
    if (weights.length) cards.push(stat("Weight records", weights.length, `${new Set(weights.map((row) => row.animalId)).size} animals`));
    if (breeding.rows.length) cards.push(stat("Recorded breedings", breeding.rows.length, `${breeding.pending.length} pending or incomplete`));
    if (litter.totalLitters) cards.push(stat("Litters", litter.totalLitters, `${litter.totalBorn} born alive`));
    if (shows.shows) cards.push(stat("Shows entered", shows.shows, `${shows.awards} awards`));
    if (sales.count) cards.push(stat("Animals sold", sales.count, `Average ${money(sales.average)}`));
    if (sales.payments.length) cards.push(stat("Recorded revenue", money(sales.revenue), `${sales.payments.length} payments`));
    return `<div class="stats-grid">${cards.join("")}</div>${section("What analytics are available?", `<div class="analytics-availability">${METRICS.map((metric) => `<div><strong>${esc(metric.name)}</strong><span>${esc(metric.category)} · ${esc(metric.aggregation)} · source: ${esc(metric.source)}</span></div>`).join("")}</div>`, "Only structured operational records are used; missing data is never treated as zero.")}`;
  }
  function growthView() {
    const animals = selectedAnimals();
    const allRows = weightRows();
    const series = animals.map((record, index) => {
      const rows = allRows.filter((row) => row.animalId === record.id && dateInRange(row.date) && (ui.growthMode === "date" || record.dob));
      return { name: record.name || "Unnamed animal", color: colorFor(record.id, index), points: rows.map((row) => {
        const ageDays = daysBetween(record.dob, row.date);
        return { xValue: ui.growthMode === "age" ? ageDays : day(row.date).getTime(), y: row.grams, label: ui.growthMode === "age" ? `${ageDays} days` : dateLabel(row.date), detail: `${row.recordedValue} ${row.recordedUnit}` };
      }).filter((point) => point.xValue !== null && point.xValue >= 0) };
    });
    const selectedRows = allRows.filter((row) => ui.animalIds.includes(row.animalId) && dateInRange(row.date));
    const primary = animals.length === 1 ? growthSummary(selectedRows) : null;
    const primaryUnit = primary?.latest?.recordedUnit || selectedRows.at(-1)?.recordedUnit || "lb";
    const cards = primary ? `<div class="stats-grid">${stat("First recorded weight", displayWeight(primary.first.grams, primaryUnit))}${stat("Latest weight", displayWeight(primary.latest.grams, primaryUnit))}${stat("Total gain", displayWeight(primary.gainGrams, primaryUnit), `${primary.days || 0} days tracked`)}${stat("Average daily gain", primary.dailyGainGrams === null ? "—" : displayWeight(primary.dailyGainGrams, primaryUnit))}${stat("Average weekly gain", primary.weeklyGainGrams === null ? "—" : displayWeight(primary.weeklyGainGrams, primaryUnit))}${stat("Since previous", primary.previousGainGrams === null ? "—" : displayWeight(primary.previousGainGrams, primaryUnit))}</div>` : "";
    return `<div class="analytics-growth-controls"><label>Chart axis<select data-growth-mode><option value="date" ${ui.growthMode === "date" ? "selected" : ""}>Date vs. weight</option><option value="age" ${ui.growthMode === "age" ? "selected" : ""}>Age vs. weight</option></select></label><fieldset><legend>Compare animals</legend>${array("animals").filter((record) => !ui.species || record.species === ui.species).map((record, index) => `<label><input type="checkbox" data-growth-animal value="${esc(record.id)}" ${ui.animalIds.includes(record.id) ? "checked" : ""}><input type="color" data-animal-color="${esc(record.id)}" value="${esc(colorFor(record.id, index))}" aria-label="Chart color for ${esc(record.name)}"><span>${esc(record.name || "Unnamed animal")}</span></label>`).join("")}</fieldset></div>${cards}${section(ui.growthMode === "age" ? "Age vs. Weight" : "Weight Over Time", lineChart(series, { label: "Animal weight chart", yLabel: (grams) => `${decimal(grams / 453.59237, 1)} lb`, empty: ui.growthMode === "age" ? "Date of birth and weight records are required for age comparison." : "Add weight records to begin tracking growth." }), "Every point is an actual recorded measurement; lines only connect those records.")}`;
  }
  function breedingView() {
    const breeding = breedingAnalytics(), litter = litterAnalytics();
    if (!breeding.rows.length && !litter.litters.length) return empty("No breeding data recorded yet", "Record breedings and litters to begin tracking reproductive performance.");
    const pairs = new Map();
    litter.litters.forEach((record) => {
      const key = `${record.sireId || "unknown"}|${record.damId || "unknown"}`;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(record);
    });
    const pairRows = [...pairs.entries()].map(([key, rows]) => { const [sireId, damId] = key.split("|"); return `<tr><td>${esc(animalName(sireId))} × ${esc(animalName(damId))}</td><td>${rows.length}</td><td>${decimal(mean(rows.map((record) => record.bornAlive).map(num).filter((value) => value !== null)), 1)}</td><td>${decimal(mean(rows.map((record) => record.weaned).map(num).filter((value) => value !== null)), 1)}</td><td>${esc(dateLabel(rows.sort((a,b) => String(b.birthDate).localeCompare(String(a.birthDate)))[0]?.birthDate))}</td></tr>`; }).join("");
    return `<div class="stats-grid">${stat("Recorded breedings", breeding.rows.length)}${stat("Successful", breeding.success.length)}${stat("Pending / incomplete", breeding.pending.length)}${stat("Failed / cancelled", breeding.failed.length)}${stat("Success rate", breeding.rate === null ? "—" : `${decimal(breeding.rate, 1)}%`, "Resolved outcomes only")}${stat("Average litter size", decimal(litter.averageLitter, 1))}${stat("Largest litter", litter.largestLitter ?? "—")}${stat("Survival to weaning", litter.survival === null ? "—" : `${decimal(litter.survival, 1)}%`)}</div>${pairRows ? section("Pairing history", `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Pairing</th><th>Litters</th><th>Avg. born</th><th>Avg. weaned</th><th>Most recent</th></tr></thead><tbody>${pairRows}</tbody></table></div>`, "Historical outcomes only—no genetic pair analysis.") : ""}`;
  }
  function showsView() {
    const values = showAnalytics();
    if (!values.entries) return empty("No show results recorded", "Results will appear here after show entries and placements are recorded.");
    return `<div class="stats-grid">${stat("Shows entered", values.shows)}${stat("Entries", values.entries)}${stat("Results recorded", values.results)}${stat("First-place finishes", values.firsts)}${stat("Awards", values.awards)}${stat("Best of Breed", values.bestOfBreed)}</div>`;
  }
  function salesView(revenueOnly = false) {
    const values = salesAnalytics();
    if (revenueOnly && !values.payments.length) return empty("No recorded revenue yet", "Revenue appears after payments are recorded against completed sales.");
    if (!revenueOnly && !values.sales.length) return empty("No completed sales recorded", "Complete a sale to begin sale-price analytics.");
    if (revenueOnly) {
      const chart = groupByMonth(values.payments, "date", (payment) => payment.amount);
      return `<div class="stats-grid">${stat("Recorded revenue", money(values.revenue))}${stat("Payments", values.payments.length)}${stat("Invoiced sales", money(values.invoiced), "Separate from received revenue")}</div>${section("Monthly revenue", lineChart([{ name: "Revenue", color: PALETTE[1], points: chart.map((point, index) => ({ xValue: index, y: point.y, label: point.x, detail: money(point.y) })) }], { yLabel: money }), "Calculated from actual recorded payments.")}`;
    }
    return `<div class="stats-grid">${stat("Animals sold", values.count)}${stat("Average sale price", money(values.average))}${stat("Median sale price", money(values.median))}${stat("Highest recorded sale", money(values.highest))}${stat("Lowest recorded sale", money(values.lowest))}</div>`;
  }
  function feedView() {
    const rows = array("transactions").filter((record) => record.type === "Expense" && record.category === "Feed" && (!ui.species || record.species === ui.species) && dateInRange(record.date));
    if (!rows.length) return empty("No feed records in this view", "Record feed expenses to begin tracking feed costs. Individual consumption is not inferred from group expenses.");
    const chart = groupByMonth(rows, "date", (record) => record.amount);
    return `<div class="stats-grid">${stat("Recorded feed cost", money(sum(rows.map((record) => record.amount))))}${stat("Feed expense records", rows.length)}</div>${section("Feed cost over time", lineChart([{ name: "Feed cost", color: PALETTE[2], points: chart.map((point, index) => ({ xValue: index, y: point.y, label: point.x, detail: money(point.y) })) }], { yLabel: money }), "Scope remains exactly as recorded; no individual feed use is fabricated.")}`;
  }
  function productionView() {
    const rows = productionRows();
    if (!rows.length) return empty("No production data recorded yet", "Add production records to see species-aware totals and trends.");
    const groups = new Map();
    rows.forEach((record) => { const key = `${record.product || "Other"}|${record.unit || "units"}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(record); });
    const cards = [...groups.entries()].map(([key, records]) => { const [product, unit] = key.split("|"); return stat(product, `${decimal(sum(records.map((record) => record.quantity)), 2)} ${unit}`, `${records.length} records`); }).join("");
    const notices = [metricAvailable("eggs") ? "Egg production available" : "Egg production hidden: no applicable structured records", metricAvailable("milk") ? "Milk production available" : "Milk production hidden: no structured milk records"].map((text) => `<li>${esc(text)}</li>`).join("");
    return `<div class="stats-grid">${cards}</div>${section("Production relevance", `<ul>${notices}</ul>`, "Incompatible products and units remain separate.")}`;
  }
  function healthView() {
    const rows = weightRows().filter((record) => (!ui.species || record.species === ui.species) && dateInRange(record.date));
    if (!rows.length) return empty("No numeric health measurements yet", "Add weight records to begin tracking numeric health measurements.");
    return `<div class="stats-grid">${stat("Numeric measurements", rows.length)}${stat("Animals measured", new Set(rows.map((record) => record.animalId)).size)}</div>${section("Supported measurements", "<p>Weight is currently the only structured numeric Health field. Free-text medical notes are intentionally excluded and no diagnosis is generated.</p>")}`;
  }
  function content() {
    if (ui.tab === "growth") return growthView();
    if (ui.tab === "breeding") return breedingView();
    if (ui.tab === "shows") return showsView();
    if (ui.tab === "sales") return salesView(false);
    if (ui.tab === "revenue") return salesView(true);
    if (ui.tab === "feed") return feedView();
    if (ui.tab === "production") return productionView();
    if (ui.tab === "health") return healthView();
    return overviewView();
  }
  function bind(root) {
    root.querySelector("[data-analytics-range]").value = ui.range;
    root.querySelector("[data-analytics-species]").addEventListener("change", (event) => { ui.species = event.target.value; ui.animalIds = []; render(host); });
    root.querySelector("[data-analytics-range]").addEventListener("change", (event) => { ui.range = event.target.value; render(host); });
    root.querySelector("[data-analytics-start]")?.addEventListener("change", (event) => { ui.start = event.target.value; render(host); });
    root.querySelector("[data-analytics-end]")?.addEventListener("change", (event) => { ui.end = event.target.value; render(host); });
    root.querySelectorAll("[data-analytics-tab]").forEach((button) => button.addEventListener("click", () => { ui.tab = button.dataset.analyticsTab; render(host); }));
    root.querySelector("[data-growth-mode]")?.addEventListener("change", (event) => { ui.growthMode = event.target.value; render(host); });
    root.querySelectorAll("[data-growth-animal]").forEach((input) => input.addEventListener("change", () => { ui.animalIds = [...root.querySelectorAll("[data-growth-animal]:checked")].map((item) => item.value); render(host); }));
    root.querySelectorAll("[data-animal-color]").forEach((input) => input.addEventListener("input", () => {
      state().settings = state().settings || {};
      state().settings.analyticsColors = state().settings.analyticsColors || {};
      state().settings.analyticsColors[input.dataset.animalColor] = input.value;
      host.saveState?.("Chart color saved.");
      render(host);
    }));
  }
  function render(options) {
    host = options?.state ? options : host;
    const root = typeof document !== "undefined" ? document.querySelector("#view-analytics") : null;
    if (!root || !host) return;
    try {
      root.innerHTML = `<div class="analytics-shell">${header()}${tabs()}${content()}</div>`;
      bind(root);
    } catch (error) {
      root.innerHTML = `<div class="page-header"><div><h2>Analytics</h2></div></div>${empty("Analytics could not load", "Your records are unchanged. Try reopening Analytics.")}`;
      if (typeof window !== "undefined") window.HerdHarborMonitoring?.captureException?.(error, { module: "analytics", version: VERSION, route: "analytics" });
    }
  }
  function openAnimal(animalId) {
    ui.tab = "growth";
    ui.animalIds = animalId ? [animalId] : [];
    ui.species = animal(animalId)?.species || "";
  }
  return { VERSION, METRICS, normalizeWeight, displayWeight, rangeBounds, dateInRange, weightRows, growthSummary, litterAnalytics, breedingAnalytics, saleTotal, salesAnalytics, metricAvailable, median, openAnimal, render };
});
