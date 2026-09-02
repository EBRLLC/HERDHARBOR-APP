(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborAnalytics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  // The filename is intentionally stable for the consolidated runtime. VERSION is authoritative.
  const VERSION = "1.6.5";
  const DAY_MS = 86400000;
  const LB_GRAMS = 453.59237;
  const OZ_GRAMS = 28.349523125;
  const PALETTE = ["#2e7d7b", "#6f42c1", "#d97706", "#2563eb", "#dc2626", "#0891b2", "#65a30d", "#be185d"];
  const POULTRY = new Set(["Chicken", "Duck", "Turkey", "Goose", "Quail", "Poultry"]);
  const TABS = Object.freeze([
    ["overview", "Overview"], ["growth", "Growth"], ["breeding", "Breeding"],
    ["litters", "Litters"], ["production", "Production"], ["eggs", "Eggs"],
    ["milk", "Milk"], ["shows", "Shows"], ["sales", "Sales"],
    ["revenue", "Revenue"], ["feed", "Feed"], ["health", "Health"], ["market", "Market"]
  ]);
  const METRICS = Object.freeze([
    { id: "weight", name: "Weight", category: "growth", source: "health + animal birth weight", visualizations: ["line", "summary", "table"] },
    { id: "litter-size", name: "Litter Size", category: "breeding", source: "litters", visualizations: ["line", "bar", "summary", "table"] },
    { id: "show-results", name: "Show Results", category: "shows", source: "showEntries + showResults + showAwards", visualizations: ["line", "bar", "summary"] },
    { id: "sale-price", name: "Sale Price", category: "sales", source: "completed sale items", visualizations: ["line", "bar", "summary"] },
    { id: "revenue", name: "Recorded Revenue", category: "revenue", source: "payments", visualizations: ["line", "bar", "summary"] },
    { id: "production", name: "Production", category: "production", source: "productionRecords", visualizations: ["line", "bar", "summary", "table"] },
    { id: "feed-cost", name: "Feed Cost", category: "feed", source: "transactions", visualizations: ["line", "bar", "summary"] }
  ]);

  const ui = {
    tab: "overview", range: "all", start: "", end: "", species: "", product: "",
    growthMode: "date", agePreset: "all", ageStart: "", ageEnd: "", animalIds: [],
    market: null, marketLoading: false, marketError: ""
  };
  let host = null;

  const num = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  const sum = (values) => values.reduce((total, value) => total + (num(value) || 0), 0);
  const mean = (values) => {
    const valid = values.map(num).filter((value) => value !== null);
    return valid.length ? sum(valid) / valid.length : null;
  };
  const median = (values) => {
    const valid = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
    if (!valid.length) return null;
    const middle = Math.floor(valid.length / 2);
    return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  };
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const day = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(value || ""))) return null;
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const isoDate = (value) => day(value)?.toISOString().slice(0, 10) || "";
  const daysBetween = (first, last) => {
    const start = day(first), end = day(last);
    return start && end ? Math.round((end - start) / DAY_MS) : null;
  };
  const dateLabel = (value) => day(value)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) || "—";
  const money = (value, currency = "USD") => value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
  const decimal = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number(value));
  const sourceArray = (source, key) => Array.isArray(source?.[key]) ? source[key] : [];
  const currentState = () => host?.state || {};
  const array = (key) => sourceArray(currentState(), key);

  function rangeBounds(range, customStart = "", customEnd = "", todayValue = new Date().toISOString().slice(0, 10)) {
    if (range === "all" || !range) return { start: "", end: "" };
    if (range === "custom") return { start: isoDate(customStart), end: isoDate(customEnd) };
    const days = { "30d": 30, "3m": 91, "6m": 183, "12m": 365 }[range];
    const end = day(todayValue);
    if (!days || !end) return { start: "", end: "" };
    return { start: new Date(end.getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10), end: isoDate(todayValue) };
  }

  function context(options = {}) {
    const bounds = rangeBounds(options.range ?? ui.range, options.start ?? ui.start, options.end ?? ui.end, options.today);
    return { species: options.species ?? ui.species, start: options.range === "all" ? "" : (options.start ?? bounds.start), end: options.range === "all" ? "" : (options.end ?? bounds.end) };
  }

  function dateInRange(value, options = {}) {
    const date = isoDate(value);
    if (!date) return false;
    const filters = context(options);
    return (!filters.start || date >= filters.start) && (!filters.end || date <= filters.end);
  }

  function normalizeWeight(value, unit = "lb", ounces = 0) {
    let amount = num(value);
    let extraOunces = num(ounces) || 0;
    const canonical = String(unit || "lb").trim().toLowerCase().replace(/\s+/g, "");
    if ((canonical === "lb+oz" || canonical === "lboz") && typeof value === "string") {
      const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:lb|lbs)?(?:\s+|\s*,\s*)(\d+(?:\.\d+)?)\s*oz\s*$/i);
      if (match) { amount = Number(match[1]); extraOunces = Number(match[2]); }
    }
    if (amount === null) return null;
    if (canonical === "lb+oz" || canonical === "lboz") return amount * LB_GRAMS + extraOunces * OZ_GRAMS;
    const factors = { lb: LB_GRAMS, lbs: LB_GRAMS, oz: OZ_GRAMS, kg: 1000, g: 1 };
    return factors[canonical] ? amount * factors[canonical] : null;
  }

  function displayWeight(grams, unit = "lb", digits = 2) {
    if (grams === null || grams === undefined || grams === "" || !Number.isFinite(Number(grams))) return "—";
    const value = Number(grams);
    const canonical = String(unit || "lb").trim().toLowerCase().replace(/\s+/g, "");
    if (canonical === "lb+oz" || canonical === "lboz") {
      const sign = value < 0 ? "−" : "";
      const totalOunces = Math.abs(value) / OZ_GRAMS;
      const pounds = Math.floor(totalOunces / 16);
      const ounces = Math.round((totalOunces - pounds * 16) * 10) / 10;
      return `${sign}${pounds} lb ${decimal(ounces, 1)} oz`;
    }
    const factors = { lb: LB_GRAMS, oz: OZ_GRAMS, kg: 1000, g: 1 };
    const chosen = factors[canonical] ? canonical : "lb";
    return `${decimal(value / factors[chosen], digits)} ${chosen}`;
  }

  const preferredWeightUnit = (source = currentState()) => source?.settings?.preferredWeightDisplay || "lb";
  const animalMap = (source) => new Map(sourceArray(source, "animals").map((record) => [record.id, record]));
  const animalFor = (source, id) => animalMap(source).get(id);
  const animalName = (source, id) => animalFor(source, id)?.name || animalFor(source, id)?.animalName || "Unknown animal";
  const speciesForAnimal = (source, id) => animalFor(source, id)?.species || "";

  function birthWeightRow(record) {
    if (!record?.dob || num(record.birthWeight) === null) return null;
    const grams = normalizeWeight(record.birthWeight, record.birthWeightUnit || "lb", record.birthWeightOunces);
    if (grams === null) return null;
    return {
      id: `birth:${record.id}`, animalId: record.id, animalName: record.name || "Unknown animal",
      species: record.species || "", breed: record.breed || "", dob: isoDate(record.dob),
      date: isoDate(record.dob), grams, recordedValue: num(record.birthWeight),
      recordedOunces: num(record.birthWeightOunces), recordedUnit: record.birthWeightUnit || "lb",
      isBirth: true, ageDays: 0
    };
  }

  function weightRows(source = currentState(), options = {}) {
    const animals = animalMap(source);
    const filters = context(options);
    const includeBirth = options.includeBirth !== false;
    const rows = [];
    if (includeBirth) {
      for (const record of animals.values()) {
        const birth = birthWeightRow(record);
        if (birth && (!filters.species || birth.species === filters.species) && dateInRange(birth.date, options)) rows.push(birth);
      }
    }
    for (const record of sourceArray(source, "health")) {
      if (num(record.weight) === null) continue;
      const subject = animals.get(record.animalId) || {};
      const date = isoDate(record.date);
      const grams = normalizeWeight(record.weight, record.weightUnit || "lb", record.weightOunces);
      if (!date || grams === null || (filters.species && subject.species !== filters.species) || !dateInRange(date, options)) continue;
      rows.push({
        id: record.id, animalId: record.animalId, animalName: subject.name || "Unknown animal",
        species: subject.species || "", breed: subject.breed || "", dob: isoDate(subject.dob), date, grams,
        recordedValue: num(record.weight), recordedOunces: num(record.weightOunces),
        recordedUnit: record.weightUnit || "lb", isBirth: false,
        ageDays: subject.dob ? daysBetween(subject.dob, date) : null
      });
    }
    return rows.sort((left, right) => left.date.localeCompare(right.date) || Number(right.isBirth) - Number(left.isBirth));
  }

  function growthSummary(rows) {
    const sorted = [...rows].filter((row) => Number.isFinite(Number(row.grams)) && day(row.date)).sort((a, b) => a.date.localeCompare(b.date) || Number(b.isBirth) - Number(a.isBirth));
    if (!sorted.length) return { count: 0, measurementCount: 0, birth: null, first: null, firstRecorded: null, latest: null, highest: null, lowest: null, gainGrams: null, days: null, dailyGainGrams: null, weeklyGainGrams: null, previousGainGrams: null, trend: "Insufficient measurements" };
    const birth = sorted.find((row) => row.isBirth) || null;
    const measured = sorted.filter((row) => !row.isBirth);
    const firstRecorded = measured[0] || null;
    const baseline = birth || firstRecorded || sorted[0];
    const latest = measured.at(-1) || sorted.at(-1);
    const highest = sorted.reduce((best, row) => !best || row.grams > best.grams ? row : best, null);
    const lowest = sorted.reduce((best, row) => !best || row.grams < best.grams ? row : best, null);
    const elapsed = daysBetween(baseline.date, latest.date);
    const gain = latest.grams - baseline.grams;
    const previous = measured.length > 1 ? measured.at(-2) : (birth && measured.length ? birth : null);
    const previousGain = previous ? latest.grams - previous.grams : null;
    const trend = previousGain === null ? "Insufficient measurements" : previousGain > 0 ? `+${previousGain}` : previousGain < 0 ? `${previousGain}` : "No change";
    return {
      count: sorted.length, measurementCount: measured.length, birth, first: baseline, firstRecorded, latest, highest, lowest,
      gainGrams: gain, days: elapsed, dailyGainGrams: elapsed > 0 ? gain / elapsed : null,
      weeklyGainGrams: elapsed > 0 ? gain / elapsed * 7 : null, previousGainGrams: previousGain, trend
    };
  }

  function ageRangeBounds(preset, customStart = "", customEnd = "") {
    if (!preset || preset === "all") return { start: null, end: null };
    if (preset === "8w") return { start: 0, end: 56 };
    if (preset === "12w") return { start: 0, end: 84 };
    if (preset === "6m") return { start: 0, end: 183 };
    if (preset === "custom") return { start: Math.max(0, num(customStart) || 0), end: num(customEnd) };
    return { start: null, end: null };
  }

  function filterGrowthByAge(rows, preset = "all", customStart = "", customEnd = "") {
    if (preset === "all") return { rows: [...rows], error: "" };
    if (rows.some((row) => !row.dob && row.ageDays === null)) return { rows: [], error: "Date of birth is required for age-based filtering." };
    const bounds = ageRangeBounds(preset, customStart, customEnd);
    return { rows: rows.filter((row) => row.ageDays !== null && row.ageDays >= (bounds.start ?? 0) && (bounds.end === null || row.ageDays <= bounds.end)), error: "" };
  }

  function weightHistory(rows, preferredUnit = "lb") {
    let previous = null;
    return [...rows].sort((a, b) => a.date.localeCompare(b.date)).map((row) => {
      const changeGrams = previous ? row.grams - previous.grams : null;
      const result = { ...row, changeGrams, preferredWeight: displayWeight(row.grams, preferredUnit), age: row.ageDays === null ? "DOB required" : row.ageDays === 0 ? "Birth" : `${row.ageDays} days` };
      previous = row;
      return result;
    });
  }

  function recordSpecies(source, record, parentKeys = ["animalId"]) {
    if (record?.species) return record.species;
    for (const key of parentKeys) {
      const species = speciesForAnimal(source, record?.[key]);
      if (species) return species;
    }
    return "";
  }

  function breedingSpecies(source, record) {
    return recordSpecies(source, record, ["damId", "sireId", "animalId"]);
  }

  function litterSpecies(source, record) {
    if (record.species) return record.species;
    const breeding = sourceArray(source, "breedings").find((item) => item.id === record.breedingId);
    return breeding ? breedingSpecies(source, breeding) : recordSpecies(source, record, ["damId", "sireId"]);
  }

  function breedingAnalytics(source = currentState(), options = {}) {
    const filters = context(options);
    const rows = sourceArray(source, "breedings").filter((record) => (!filters.species || breedingSpecies(source, record) === filters.species) && dateInRange(record.breedingDate || record.date, options));
    const litters = sourceArray(source, "litters");
    const status = (record) => String(record.status || "").trim().toLowerCase();
    const success = rows.filter((record) => status(record) === "delivered" || litters.some((litter) => litter.breedingId === record.id));
    const failed = rows.filter((record) => ["not pregnant", "cancelled"].includes(status(record)));
    const successIds = new Set(success.map((record) => record.id));
    const failedIds = new Set(failed.map((record) => record.id));
    const pending = rows.filter((record) => !successIds.has(record.id) && !failedIds.has(record.id));
    const resolved = success.length + failed.length;
    return { rows, success, failed, pending, rate: resolved ? success.length / resolved * 100 : null };
  }

  function litterAnalytics(source = currentState(), options = {}) {
    const filters = context(options);
    const litters = sourceArray(source, "litters").filter((record) => (!filters.species || litterSpecies(source, record) === filters.species) && dateInRange(record.birthDate || record.date, options));
    const values = (key) => litters.map((record) => num(record[key])).filter((value) => value !== null);
    const born = values("bornAlive"), stillborn = values("stillborn"), weaned = values("weaned");
    const totalBorn = sum(born), totalWeaned = sum(weaned);
    const resolvedForWeaning = litters.filter((record) => num(record.bornAlive) !== null && num(record.weaned) !== null);
    const resolvedBorn = sum(resolvedForWeaning.map((record) => record.bornAlive));
    const resolvedWeaned = sum(resolvedForWeaning.map((record) => record.weaned));
    return { litters, totalLitters: litters.length, totalBorn, stillborn: sum(stillborn), weaned: totalWeaned, averageLitter: mean(born), largestLitter: born.length ? Math.max(...born) : null, survival: resolvedBorn > 0 ? resolvedWeaned / resolvedBorn * 100 : null };
  }

  function saleItemPrice(item) {
    const unit = num(item.salePrice ?? item.unitPrice) || 0;
    return Math.max(0, (num(item.quantity) || 1) * unit);
  }

  function saleTotal(sale) {
    return Math.max(0, sum(sourceArray(sale, "items").map(saleItemPrice)) - (num(sale.discount) || 0) + (num(sale.tax) || 0));
  }

  function saleDate(sale) { return sale.completedAt || sale.saleDate || sale.date; }

  function saleItemRows(source, options = {}) {
    const filters = context(options);
    const animals = animalMap(source);
    return sourceArray(source, "sales").filter((sale) => sale.status === "Completed" && dateInRange(saleDate(sale), options)).flatMap((sale) => sourceArray(sale, "items").flatMap((item) => {
      const subject = animals.get(item.animalId) || {};
      const species = item.species || subject.species || "";
      if (filters.species && species !== filters.species) return [];
      return [{ sale, item, animal: subject, species, breed: item.breed || subject.breed || "", price: saleItemPrice(item), date: isoDate(saleDate(sale)) }];
    }));
  }

  function paymentAllocation(source, payment) {
    if (payment.species) return { species: payment.species, allocated: true };
    const sale = sourceArray(source, "sales").find((record) => record.id === payment.saleId);
    if (!sale || sale.status !== "Completed") return { species: "", allocated: false };
    if (payment.saleItemId) {
      const item = sourceArray(sale, "items").find((record) => record.id === payment.saleItemId);
      return item ? { species: item.species || speciesForAnimal(source, item.animalId), allocated: true } : { species: "", allocated: false };
    }
    const species = new Set(sourceArray(sale, "items").map((item) => item.species || speciesForAnimal(source, item.animalId)).filter(Boolean));
    return species.size === 1 ? { species: [...species][0], allocated: true } : { species: "Mixed / Unallocated", allocated: false };
  }

  function revenueAnalytics(source = currentState(), options = {}) {
    const filters = context(options);
    const completed = new Set(sourceArray(source, "sales").filter((sale) => sale.status === "Completed").map((sale) => sale.id));
    const all = sourceArray(source, "payments").filter((payment) => completed.has(payment.saleId) && dateInRange(payment.date, options)).map((payment) => ({ ...payment, allocation: paymentAllocation(source, payment) }));
    const mixedUnallocated = all.filter((payment) => payment.allocation.species === "Mixed / Unallocated");
    const payments = filters.species ? all.filter((payment) => payment.allocation.allocated && payment.allocation.species === filters.species) : all;
    return { payments, allPayments: all, revenue: sum(payments.map((payment) => payment.amount)), mixedUnallocated, mixedUnallocatedRevenue: sum(mixedUnallocated.map((payment) => payment.amount)) };
  }

  function salesAnalytics(source = currentState(), options = {}) {
    const itemRows = saleItemRows(source, options);
    const sales = [...new Map(itemRows.map((row) => [row.sale.id, row.sale])).values()];
    const prices = itemRows.map((row) => row.price);
    const revenue = revenueAnalytics(source, options);
    const filteredSpecies = context(options).species;
    const invoiced = filteredSpecies ? sum(prices) : sum(sales.map(saleTotal));
    return { sales, itemRows, count: itemRows.length, average: mean(prices), median: median(prices), highest: prices.length ? Math.max(...prices) : null, lowest: prices.length ? Math.min(...prices) : null, invoiced, revenue: revenue.revenue, payments: revenue.payments, mixedUnallocated: revenue.mixedUnallocated };
  }

  function showAnalytics(source = currentState(), options = {}) {
    const filters = context(options);
    const showMap = new Map(sourceArray(source, "shows").map((show) => [show.id, show]));
    const entries = sourceArray(source, "showEntries").filter((entry) => {
      const show = showMap.get(entry.showId) || {};
      const species = entry.species || speciesForAnimal(source, entry.animalId);
      return (!filters.species || species === filters.species) && dateInRange(show.startDate || show.date || show.endDate || entry.date, options);
    });
    const entryIds = new Set(entries.map((entry) => entry.id));
    const results = sourceArray(source, "showResults").filter((result) => entryIds.has(result.entryId));
    const resultIds = new Set(results.map((result) => result.id));
    const awards = sourceArray(source, "showAwards").filter((award) => entryIds.has(award.entryId) || resultIds.has(award.resultId));
    const firsts = results.filter((result) => String(result.placement || "").toLowerCase() === "1st" || num(result.placementNumber) === 1);
    return { entriesData: entries, resultsData: results, awardsData: awards, shows: new Set(entries.map((entry) => entry.showId)).size, entries: entries.length, results: results.length, firsts: firsts.length, awards: awards.length, bestOfBreed: awards.filter((award) => /best of breed/i.test(String(award.awardType || award.customAward || ""))).length };
  }

  function productionSpecies(source, record) {
    return record.species || (record.animalId ? speciesForAnimal(source, record.animalId) : "");
  }

  function productionRows(source = currentState(), options = {}) {
    const filters = context(options);
    const product = options.product ?? ui.product;
    return sourceArray(source, "productionRecords").filter((record) => (!product || record.product === product) && (!filters.species || productionSpecies(source, record) === filters.species) && dateInRange(record.date, options));
  }

  const canonicalUnit = (unit) => String(unit || "units").trim().toLowerCase();
  function normalizedProductionValue(record) {
    const quantity = num(record.quantity);
    if (quantity === null) return null;
    const product = String(record.product || "").toLowerCase();
    const unit = canonicalUnit(record.unit);
    if (product === "eggs") {
      if (unit === "egg" || unit === "eggs") return { value: quantity, unit: "eggs", convertible: true };
      if (unit === "dozen" || unit === "dozens") return { value: quantity * 12, unit: "eggs", convertible: true };
      return { value: quantity, unit, convertible: false };
    }
    if (product === "milk") {
      const liters = { gallon: 3.785411784, gallons: 3.785411784, quart: 0.946352946, quarts: 0.946352946, pint: 0.473176473, pints: 0.473176473, liter: 1, liters: 1, litre: 1, litres: 1 }[unit];
      return liters ? { value: quantity * liters, unit: "liters", convertible: true } : { value: quantity, unit, convertible: false };
    }
    return { value: quantity, unit, convertible: false };
  }

  function productionAnalytics(source = currentState(), options = {}) {
    const rows = productionRows(source, options);
    const groups = new Map();
    rows.forEach((record) => {
      const normalized = normalizedProductionValue(record);
      if (!normalized) return;
      const key = `${record.product || "Other"}|${normalized.unit}`;
      if (!groups.has(key)) groups.set(key, { product: record.product || "Other", unit: normalized.unit, total: 0, records: [], convertible: normalized.convertible });
      const group = groups.get(key);
      group.total += normalized.value;
      group.records.push(record);
    });
    return { rows, groups: [...groups.values()] };
  }

  function eggAnalytics(source = currentState(), options = {}) {
    const rows = productionRows(source, { ...options, product: "Eggs" });
    const convertible = [], separate = new Map();
    rows.forEach((record) => {
      const normalized = normalizedProductionValue(record);
      if (!normalized) return;
      if (normalized.convertible) convertible.push({ ...record, normalized: normalized.value });
      else {
        if (!separate.has(normalized.unit)) separate.set(normalized.unit, []);
        separate.get(normalized.unit).push(record);
      }
    });
    return { rows, convertible, totalEggs: convertible.length ? sum(convertible.map((record) => record.normalized)) : null, averageEggs: convertible.length ? mean(convertible.map((record) => record.normalized)) : null, separate };
  }

  function milkAnalytics(source = currentState(), options = {}) {
    const rows = productionRows(source, { ...options, product: "Milk" });
    const convertible = [], separate = new Map();
    rows.forEach((record) => {
      const normalized = normalizedProductionValue(record);
      if (!normalized) return;
      if (normalized.convertible) convertible.push({ ...record, normalized: normalized.value });
      else {
        if (!separate.has(normalized.unit)) separate.set(normalized.unit, []);
        separate.get(normalized.unit).push(record);
      }
    });
    return { rows, convertible, totalLiters: convertible.length ? sum(convertible.map((record) => record.normalized)) : null, averageLiters: convertible.length ? mean(convertible.map((record) => record.normalized)) : null, separate };
  }

  function feedAnalytics(source = currentState(), options = {}) {
    const filters = context(options);
    const all = sourceArray(source, "transactions").filter((record) => String(record.type || "").toLowerCase() === "expense" && String(record.category || "").toLowerCase() === "feed" && dateInRange(record.date, options));
    const operationWide = all.filter((record) => !record.species || /operation|farm|all/i.test(String(record.scope || "")));
    const rows = filters.species ? all.filter((record) => record.species === filters.species && !/operation|farm|all/i.test(String(record.scope || ""))) : all;
    return { rows, total: sum(rows.map((record) => record.amount)), operationWide, operationWideTotal: sum(operationWide.map((record) => record.amount)) };
  }

  function healthAnalytics(source = currentState(), options = {}) {
    const rows = weightRows(source, { ...options, includeBirth: false });
    return { rows, count: rows.length, animals: new Set(rows.map((row) => row.animalId)).size, supportedMetrics: ["Weight"] };
  }

  function metricAvailable(metricId, source = currentState(), selectedSpecies = ui.species) {
    const options = { species: selectedSpecies, range: "all", product: metricId === "eggs" ? "Eggs" : metricId === "milk" ? "Milk" : "" };
    if (metricId === "eggs" && selectedSpecies && !POULTRY.has(selectedSpecies)) return false;
    if (metricId === "eggs") return eggAnalytics(source, options).rows.length > 0;
    if (metricId === "milk") return milkAnalytics(source, options).rows.length > 0;
    return true;
  }

  function groupBy(rows, keyFn, valueFn = () => 1) {
    const groups = new Map();
    rows.forEach((record) => {
      const key = keyFn(record);
      if (!key) return;
      groups.set(key, (groups.get(key) || 0) + (num(valueFn(record)) || 0));
    });
    return [...groups].sort(([left], [right]) => String(left).localeCompare(String(right))).map(([x, y]) => ({ x, y }));
  }

  const groupByMonth = (rows, dateFn, valueFn) => groupBy(rows, (record) => isoDate(dateFn(record)).slice(0, 7), valueFn);
  function colorFor(key, index = 0, source = currentState()) {
    return source?.settings?.analyticsColors?.[key] || source?.settings?.analyticsColors?.[String(key).replace(/^[^:]+:/, "")] || PALETTE[index % PALETTE.length];
  }

  function lineChart(series, options = {}) {
    const width = 900, height = 330, pad = { left: 64, right: 20, top: 24, bottom: 50 };
    const points = series.flatMap((entry) => sourceArray(entry, "points").filter((point) => Number.isFinite(point.xValue) && Number.isFinite(point.y)).map((point) => ({ ...point, series: entry })));
    if (!points.length) return empty(options.emptyTitle || "No data in this range", options.empty || "Add records or choose a wider date range.");
    let minX = Math.min(...points.map((point) => point.xValue)), maxX = Math.max(...points.map((point) => point.xValue));
    let minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
    if (minX === maxX) maxX += 1;
    if (minY === maxY) { minY = Math.min(0, minY - 1); maxY += 1; }
    const x = (value) => pad.left + (value - minX) / (maxX - minX) * (width - pad.left - pad.right);
    const y = (value) => height - pad.bottom - (value - minY) / (maxY - minY) * (height - pad.top - pad.bottom);
    const grid = [0, .25, .5, .75, 1].map((ratio) => {
      const value = minY + (maxY - minY) * ratio, py = y(value);
      return `<line x1="${pad.left}" y1="${py}" x2="${width - pad.right}" y2="${py}"/><text x="${pad.left - 10}" y="${py + 4}" text-anchor="end">${esc(options.yLabel ? options.yLabel(value) : decimal(value, 1))}</text>`;
    }).join("");
    const drawings = series.map((entry) => {
      const sorted = sourceArray(entry, "points").filter((point) => Number.isFinite(point.xValue) && Number.isFinite(point.y)).sort((a, b) => a.xValue - b.xValue);
      const path = sorted.map((point, index) => `${index ? "L" : "M"}${x(point.xValue).toFixed(1)},${y(point.y).toFixed(1)}`).join(" ");
      const dots = sorted.map((point) => `<circle cx="${x(point.xValue)}" cy="${y(point.y)}" r="5"><title>${esc(`${entry.name} · ${point.label} · ${point.detail || decimal(point.y, 2)}`)}</title></circle>`).join("");
      return `<g style="--series:${esc(entry.color)}"><path class="analytics-line" d="${path}"/>${dots}</g>`;
    }).join("");
    const ordered = [...points].sort((a, b) => a.xValue - b.xValue);
    return `<div class="analytics-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label || "Analytics line chart")}"><g class="analytics-grid">${grid}</g>${drawings}<text x="${pad.left}" y="${height - 14}">${esc(ordered[0].label)}</text><text x="${width - pad.right}" y="${height - 14}" text-anchor="end">${esc(ordered.at(-1).label)}</text></svg>${legend(series)}</div>`;
  }

  function barChart(rows, options = {}) {
    const data = rows.filter((row) => Number.isFinite(Number(row.y)));
    if (!data.length) return empty(options.emptyTitle || "No data in this range", options.empty || "Add records or choose a wider date range.");
    const width = 900, height = 330, pad = { left: 64, right: 20, top: 24, bottom: 76 };
    const max = Math.max(...data.map((row) => Number(row.y)), 1);
    const slot = (width - pad.left - pad.right) / data.length;
    const barWidth = Math.max(10, Math.min(64, slot * .7));
    const y = (value) => height - pad.bottom - Number(value) / max * (height - pad.top - pad.bottom);
    const grid = [0, .25, .5, .75, 1].map((ratio) => {
      const value = max * ratio, py = y(value);
      return `<line x1="${pad.left}" y1="${py}" x2="${width - pad.right}" y2="${py}"/><text x="${pad.left - 10}" y="${py + 4}" text-anchor="end">${esc(options.yLabel ? options.yLabel(value) : decimal(value, 1))}</text>`;
    }).join("");
    const bars = data.map((row, index) => {
      const px = pad.left + index * slot + (slot - barWidth) / 2, py = y(row.y), color = row.color || colorFor(row.colorKey || `metric:${row.x}`, index);
      return `<g style="--series:${esc(color)}"><rect class="analytics-bar" x="${px}" y="${py}" width="${barWidth}" height="${height - pad.bottom - py}" rx="5"><title>${esc(`${row.x} · ${row.detail || decimal(row.y, 2)}`)}</title></rect><text class="analytics-bar-label" x="${px + barWidth / 2}" y="${height - pad.bottom + 18}" text-anchor="end" transform="rotate(-35 ${px + barWidth / 2} ${height - pad.bottom + 18})">${esc(row.x)}</text></g>`;
    }).join("");
    return `<div class="analytics-chart analytics-bar-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label || "Analytics bar chart")}"><g class="analytics-grid">${grid}</g>${bars}</svg></div>`;
  }

  const legend = (series) => `<div class="analytics-legend">${series.map((entry) => `<span><i style="background:${esc(entry.color)}"></i>${esc(entry.name)}</span>`).join("")}</div>`;
  const stat = (label, value, note = "") => `<article class="stat-card"><span class="label">${esc(label)}</span><strong class="value">${esc(value)}</strong>${note ? `<span class="note">${esc(note)}</span>` : ""}</article>`;
  const empty = (title, text) => `<div class="analytics-empty"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const section = (title, body, subtitle = "") => `<section class="panel analytics-panel"><div class="panel-header"><div><h3>${esc(title)}</h3>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</div></div>${body}</section>`;
  const table = (headers, rows) => `<div class="data-table-wrap analytics-table-wrap"><table class="data-table"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const optionsForSpecies = () => [...new Set(array("animals").map((record) => record.species).filter(Boolean))].sort();

  function header() {
    const species = optionsForSpecies();
    return `<div class="page-header"><div><p class="eyebrow">HerdHarbor Alpha v${VERSION} · Analytics Completion</p><h2>Analytics</h2><p>Private farm analytics are calculated from your canonical HerdHarbor records. Market results are separate, aggregate, and opt-in.</p></div></div><div class="analytics-toolbar"><label>Farm view<select data-analytics-species><option value="">All farm</option>${species.map((value) => `<option value="${esc(value)}" ${ui.species === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label><label>Date range<select data-analytics-range><option value="all">All time</option><option value="12m">12 months</option><option value="6m">6 months</option><option value="3m">3 months</option><option value="30d">30 days</option><option value="custom">Custom range</option></select></label><label class="analytics-custom ${ui.range === "custom" ? "" : "hidden"}">Start<input data-analytics-start type="date" value="${esc(ui.start)}"></label><label class="analytics-custom ${ui.range === "custom" ? "" : "hidden"}">End<input data-analytics-end type="date" value="${esc(ui.end)}"></label></div>`;
  }

  function tabs() {
    return `<div class="analytics-tabs" role="tablist" aria-label="Analytics modules">${TABS.map(([id, label]) => `<button class="button ${ui.tab === id ? "button-primary" : "button-ghost"}" role="tab" aria-selected="${ui.tab === id}" data-analytics-tab="${id}">${label}</button>`).join("")}</div>`;
  }

  function seriesColorControl(key, label, index = 0) {
    return `<label class="analytics-color-control"><input type="color" data-series-color="${esc(key)}" value="${esc(colorFor(key, index))}" aria-label="Chart color for ${esc(label)}"><span>${esc(label)}</span></label>`;
  }

  const seriesColorControls = (items) => `<div class="analytics-color-row">${items.map((item, index) => seriesColorControl(item.key, item.label, item.index ?? index)).join("")}</div>`;

  function overviewView() {
    const active = array("animals").filter((record) => !["Sold", "Deceased", "Archived", "Ancestor Only"].includes(record.status) && (!ui.species || record.species === ui.species));
    const weights = weightRows().filter((record) => !record.isBirth);
    const breeding = breedingAnalytics(), litter = litterAnalytics(), production = productionAnalytics(), shows = showAnalytics(), sales = salesAnalytics(), revenue = revenueAnalytics(), feed = feedAnalytics();
    const cards = [stat("Current animals", active.length, ui.species || "All species")];
    if (weights.length) cards.push(stat("Weight records", weights.length, `${new Set(weights.map((row) => row.animalId)).size} animals`));
    if (breeding.rows.length) cards.push(stat("Recorded breedings", breeding.rows.length, `${breeding.pending.length} pending / incomplete`));
    if (litter.totalLitters) cards.push(stat("Litters", litter.totalLitters, `${litter.totalBorn} born alive`));
    if (production.rows.length) cards.push(stat("Production records", production.rows.length, `${production.groups.length} compatible product / unit totals`));
    if (shows.shows) cards.push(stat("Shows entered", shows.shows, `${shows.awards} awards`));
    if (sales.count) cards.push(stat("Animals sold", sales.count, `Median ${money(sales.median)}`));
    if (revenue.payments.length) cards.push(stat("Recorded revenue", money(revenue.revenue), `${revenue.payments.length} payments`));
    if (feed.rows.length) cards.push(stat("Feed costs", money(feed.total), `${feed.rows.length} expense records`));
    return `<div class="stats-grid">${cards.join("")}</div>${section("Available personal analytics", `<div class="analytics-availability">${METRICS.map((metric) => `<div><strong>${esc(metric.name)}</strong><span>${esc(metric.category)} · ${esc(metric.visualizations.join(", "))} · ${esc(metric.source)}</span></div>`).join("")}</div>`, "Missing records are shown as no data, never as fabricated zero observations.")}`;
  }

  function selectedAnimals() {
    const available = array("animals").filter((record) => !ui.species || record.species === ui.species);
    ui.animalIds = ui.animalIds.filter((id) => available.some((record) => record.id === id));
    if (!ui.animalIds.length) ui.animalIds = available.slice(0, 3).map((record) => record.id);
    return available.filter((record) => ui.animalIds.includes(record.id));
  }

  function growthView() {
    const animals = selectedAnimals(), unit = preferredWeightUnit(), allRows = weightRows(currentState(), { range: "all" });
    const ageErrors = [];
    const visibleRowsByAnimal = new Map();
    const series = animals.map((record, index) => {
      let rows = allRows.filter((row) => row.animalId === record.id && dateInRange(row.date));
      if (ui.growthMode === "age") {
        const filtered = filterGrowthByAge(rows, ui.agePreset, ui.ageStart, ui.ageEnd);
        rows = filtered.rows;
        if (filtered.error) ageErrors.push(`${record.name || "Unnamed animal"}: ${filtered.error}`);
      }
      visibleRowsByAnimal.set(record.id, rows);
      return { name: record.name || "Unnamed animal", color: colorFor(`animal:${record.id}`, index), points: rows.map((row) => ({ xValue: ui.growthMode === "age" ? row.ageDays : day(row.date)?.getTime(), y: row.grams, label: ui.growthMode === "age" ? `${row.ageDays} days` : dateLabel(row.date), detail: displayWeight(row.grams, unit) })).filter((point) => point.xValue !== null && point.xValue !== undefined) };
    });
    const selectedRows = animals.length === 1 ? (visibleRowsByAnimal.get(animals[0].id) || []) : [];
    const primary = animals.length === 1 ? growthSummary(selectedRows) : null;
    const cards = primary ? `<div class="stats-grid">${stat("Birth weight", primary.birth ? displayWeight(primary.birth.grams, unit) : "Not recorded")}${stat("First recorded weight", primary.firstRecorded ? displayWeight(primary.firstRecorded.grams, unit) : "Not recorded")}${stat("Latest weight", displayWeight(primary.latest?.grams, unit))}${stat("Highest recorded", displayWeight(primary.highest?.grams, unit))}${stat("Lowest recorded", displayWeight(primary.lowest?.grams, unit))}${stat("Total gain", displayWeight(primary.gainGrams, unit), `${primary.days ?? 0} days tracked`)}${stat("Average daily gain", displayWeight(primary.dailyGainGrams, unit))}${stat("Average weekly gain", displayWeight(primary.weeklyGainGrams, unit))}${stat("Since previous", primary.previousGainGrams === null ? "Insufficient measurements" : primary.previousGainGrams === 0 ? "No change" : `${primary.previousGainGrams > 0 ? "+" : ""}${displayWeight(primary.previousGainGrams, unit)}`)}${stat("Measurements", primary.measurementCount, primary.birth ? "plus birth weight" : "birth weight not recorded")}</div>` : "";
    const historyRows = animals.length === 1 ? weightHistory(selectedRows, unit).map((row) => [esc(dateLabel(row.date)), esc(row.age), esc(row.isBirth ? `${row.recordedValue} ${row.recordedUnit}${row.recordedOunces !== null ? ` ${row.recordedOunces} oz` : ""}` : `${row.recordedValue} ${row.recordedUnit}${row.recordedOunces !== null ? ` ${row.recordedOunces} oz` : ""}`), esc(row.preferredWeight), esc(row.changeGrams === null ? "—" : row.changeGrams === 0 ? "No change" : `${row.changeGrams > 0 ? "+" : ""}${displayWeight(row.changeGrams, unit)}`)]) : [];
    return `<div class="analytics-growth-controls"><label>Chart axis<select data-growth-mode><option value="date" ${ui.growthMode === "date" ? "selected" : ""}>Date vs. weight</option><option value="age" ${ui.growthMode === "age" ? "selected" : ""}>Age vs. weight</option></select></label><label class="${ui.growthMode === "age" ? "" : "hidden"}">Age range<select data-growth-age><option value="all">All ages</option><option value="8w">Birth → 8 weeks</option><option value="12w">Birth → 12 weeks</option><option value="6m">Birth → 6 months</option><option value="custom">Custom age range</option></select></label><label class="analytics-custom ${ui.growthMode === "age" && ui.agePreset === "custom" ? "" : "hidden"}">Start age (days)<input data-growth-age-start type="number" min="0" value="${esc(ui.ageStart)}"></label><label class="analytics-custom ${ui.growthMode === "age" && ui.agePreset === "custom" ? "" : "hidden"}">End age (days)<input data-growth-age-end type="number" min="0" value="${esc(ui.ageEnd)}"></label><fieldset><legend>Compare animals and choose stable colors</legend>${array("animals").filter((record) => !ui.species || record.species === ui.species).map((record, index) => `<label><input type="checkbox" data-growth-animal value="${esc(record.id)}" ${ui.animalIds.includes(record.id) ? "checked" : ""}>${seriesColorControl(`animal:${record.id}`, record.name || "Unnamed animal", index)}</label>`).join("")}</fieldset></div>${ageErrors.length ? `<div class="analytics-notice">${esc([...new Set(ageErrors)].join(" "))}</div>` : ""}${cards}${section(ui.growthMode === "age" ? "Age vs. Weight" : "Weight Over Time", lineChart(series, { label: "Animal weight chart", yLabel: (grams) => displayWeight(grams, unit), empty: ui.growthMode === "age" ? "Date of birth and actual weight records are required for age comparison." : "Add weight records to begin tracking growth." }), "Every point is an actual birth or Health weight record; no weights are interpolated.")}${historyRows.length ? section("Weight history", table(["Date", "Age", "Recorded Weight", `Preferred (${unit})`, "Change From Previous"], historyRows), "Editing or deleting the canonical Health record immediately changes this table.") : ""}`;
  }

  function breedingView() {
    const breeding = breedingAnalytics(), litter = litterAnalytics();
    if (!breeding.rows.length && !litter.litters.length) return empty(ui.species ? `No breeding records for ${ui.species}` : "No breeding data recorded yet", "Record breedings and litters to track reproductive performance.");
    const outcome = [{ x: "Successful", y: breeding.success.length, colorKey: "metric:breeding-success" }, { x: "Failed", y: breeding.failed.length, colorKey: "metric:breeding-failed" }, { x: "Pending", y: breeding.pending.length, colorKey: "metric:breeding-pending" }];
    const trends = litter.litters.sort((a, b) => String(a.birthDate).localeCompare(String(b.birthDate))).map((record, index) => ({ xValue: index, y: num(record.bornAlive) || 0, label: dateLabel(record.birthDate), detail: `${num(record.bornAlive) || 0} born alive` }));
    const pairs = new Map();
    litter.litters.forEach((record) => {
      const key = `${record.sireId || "unknown"}|${record.damId || "unknown"}`;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(record);
    });
    const pairBars = [...pairs].map(([key, rows], index) => {
      const [sireId, damId] = key.split("|");
      return { x: `${animalName(currentState(), sireId)} × ${animalName(currentState(), damId)}`, y: mean(rows.map((record) => record.bornAlive)), detail: `${rows.length} litters`, color: colorFor(`metric:pair:${key}`, index) };
    });
    return `<div class="stats-grid">${stat("Recorded breedings", breeding.rows.length)}${stat("Successful", breeding.success.length)}${stat("Pending / incomplete", breeding.pending.length)}${stat("Failed / cancelled", breeding.failed.length)}${stat("Success rate", breeding.rate === null ? "—" : `${decimal(breeding.rate, 1)}%`, "Resolved outcomes only")}</div>${seriesColorControls([{ key: "metric:breeding-success", label: "Successful", index: 0 }, { key: "metric:breeding-failed", label: "Failed", index: 4 }, { key: "metric:breeding-pending", label: "Pending", index: 2 }, { key: "metric:born-alive", label: "Born alive", index: 0 }])}<div class="analytics-two-column">${section("Breeding outcomes", barChart(outcome, { label: "Breeding outcomes" }), "Pending records are not counted as failures.")}${section("Litter size trend", lineChart([{ name: "Born alive", color: colorFor("metric:born-alive", 0), points: trends }], { label: "Litter size over time" }), "Historical reproductive performance, separate from Genetics Pair Analysis.")}</div>${pairBars.length ? section("Pairing-history comparison", barChart(pairBars, { label: "Average litter size by historical pairing" }), "Actual historical litters only; this is not a Genetics Pair Analysis prediction.") : ""}`;
  }

  function litterView() {
    const values = litterAnalytics();
    if (!values.litters.length) return empty(ui.species ? `No litter records for ${ui.species}` : "No litters recorded yet", "Record a litter to begin litter analytics.");
    const ordered = values.litters.sort((a, b) => String(a.birthDate).localeCompare(String(b.birthDate)));
    const born = ordered.map((record, index) => ({ xValue: index, y: num(record.bornAlive) || 0, label: dateLabel(record.birthDate), detail: `${num(record.bornAlive) || 0} born` }));
    const weaned = ordered.flatMap((record, index) => num(record.weaned) === null ? [] : [{ xValue: index, y: num(record.weaned), label: dateLabel(record.birthDate), detail: `${num(record.weaned)} weaned` }]);
    return `<div class="stats-grid">${stat("Total litters", values.totalLitters)}${stat("Born alive", values.totalBorn)}${stat("Stillborn", values.stillborn)}${stat("Total weaned", values.weaned)}${stat("Average litter", decimal(values.averageLitter, 1))}${stat("Largest litter", values.largestLitter ?? "—")}${stat("Survival to weaning", values.survival === null ? "—" : `${decimal(values.survival, 1)}%`, "Only litters with weaned counts")}</div>${seriesColorControls([{ key: "metric:born-alive", label: "Born alive" }, { key: "metric:weaned", label: "Weaned" }])}${section("Born vs. weaned", lineChart([{ name: "Born alive", color: colorFor("metric:born-alive", 0), points: born }, { name: "Weaned", color: colorFor("metric:weaned", 1), points: weaned }], { label: "Born alive and weaned over time" }), "Incomplete weaning records are omitted, not treated as losses.")}`;
  }

  function productionView() {
    const values = productionAnalytics();
    const products = [...new Set(array("productionRecords").map((record) => record.product).filter(Boolean))].sort();
    const controls = `<div class="analytics-module-controls"><label>Product<select data-production-product><option value="">All products</option>${products.map((product) => `<option value="${esc(product)}" ${ui.product === product ? "selected" : ""}>${esc(product)}</option>`).join("")}</select></label></div>`;
    if (!values.rows.length) return `${controls}${empty(ui.species ? `No production records for ${ui.species}` : "No production data recorded yet", "Add production records or choose a wider filter.")}`;
    const cards = values.groups.map((group) => stat(group.product, `${decimal(group.total, 2)} ${group.unit}`, `${group.records.length} records · compatible units only`)).join("");
    const trends = values.groups.map((group, index) => ({ name: `${group.product} (${group.unit})`, color: colorFor(`product:${group.product}:${group.unit}`, index), points: groupByMonth(group.records, (record) => record.date, (record) => normalizedProductionValue(record)?.value).map((point, pointIndex) => ({ xValue: pointIndex, y: point.y, label: point.x, detail: `${decimal(point.y, 2)} ${group.unit}` })) }));
    return `${controls}<div class="stats-grid">${cards}</div>${seriesColorControls(values.groups.map((group) => ({ key: `product:${group.product}:${group.unit}`, label: `${group.product} (${group.unit})` })))}${section("Production over time", lineChart(trends, { label: "Production trends" }), "Products and incompatible units remain separate; totals are never added across unrelated products.")}`;
  }

  function eggsView() {
    const values = eggAnalytics();
    if (!values.rows.length) return empty(ui.species ? `No egg production recorded for ${ui.species}` : "No egg production recorded yet", "Eggs and dozens are converted only by their known relationship; carton size is never assumed.");
    const chartRows = groupBy(values.convertible, (record) => record.date, (record) => record.normalized);
    const separate = [...values.separate].map(([unit, rows]) => stat(`Separate ${unit}`, `${decimal(sum(rows.map((record) => record.quantity)), 2)} ${unit}`, "Not converted because carton/unit size is unknown")).join("");
    return `<div class="stats-grid">${values.totalEggs === null ? "" : stat("Total eggs", decimal(values.totalEggs, 0), `${values.convertible.length} convertible records`)}${stat("Egg production records", values.rows.length)}${values.averageEggs === null ? "" : stat("Average recorded interval", `${decimal(values.averageEggs, 1)} eggs`)}${separate}</div>${seriesColorControls([{ key: "product:Eggs", label: "Eggs", index: 2 }])}${section("Eggs over time", lineChart([{ name: "Eggs", color: colorFor("product:Eggs", 2), points: chartRows.map((point) => ({ xValue: day(point.x)?.getTime(), y: point.y, label: dateLabel(point.x), detail: `${decimal(point.y, 0)} eggs` })) }], { label: "Egg production over time", yLabel: (value) => `${decimal(value, 0)} eggs` }), "Only explicit eggs and dozen conversions are combined.")}`;
  }

  function milkView() {
    const values = milkAnalytics();
    if (!values.rows.length) return empty(ui.species ? `No milk production recorded for ${ui.species}` : "No milk production recorded yet", "Record milk production in gallons, quarts, pints, or liters.");
    const chartRows = groupBy(values.convertible, (record) => record.date, (record) => record.normalized);
    const separate = [...values.separate].map(([unit, rows]) => stat(`Separate ${unit}`, `${decimal(sum(rows.map((record) => record.quantity)), 2)} ${unit}`, "Unsupported units stay separate")).join("");
    return `<div class="stats-grid">${values.totalLiters === null ? "" : stat("Total milk", `${decimal(values.totalLiters, 2)} liters`, `${values.convertible.length} convertible records`)}${stat("Milk production records", values.rows.length)}${values.averageLiters === null ? "" : stat("Average recorded production", `${decimal(values.averageLiters, 2)} liters`)}${separate}</div>${seriesColorControls([{ key: "product:Milk", label: "Milk", index: 3 }])}${section("Milk over time", lineChart([{ name: "Milk", color: colorFor("product:Milk", 3), points: chartRows.map((point) => ({ xValue: day(point.x)?.getTime(), y: point.y, label: dateLabel(point.x), detail: `${decimal(point.y, 2)} liters` })) }], { label: "Milk production over time", yLabel: (value) => `${decimal(value, 1)} L` }), "Gallon, quart, pint, and liter records use exact mathematical conversions.")}`;
  }

  function showsView() {
    const values = showAnalytics();
    if (!values.entries) return empty(ui.species ? `No show results for ${ui.species}` : "No show results recorded", "Results appear after show entries and placements are recorded.");
    const placements = groupBy(values.resultsData, (record) => String(record.placement || record.placementNumber || "Unplaced"), () => 1);
    const showMap = new Map(array("shows").map((record) => [record.id, record]));
    const overTime = groupByMonth(values.entriesData, (entry) => showMap.get(entry.showId)?.startDate || entry.date, () => 1);
    const byAnimal = groupBy(values.entriesData, (entry) => animalName(currentState(), entry.animalId), () => 1);
    const byBreed = groupBy(values.entriesData, (entry) => animalFor(currentState(), entry.animalId)?.breed || "Unknown breed", () => 1);
    return `<div class="stats-grid">${stat("Shows entered", values.shows)}${stat("Entries", values.entries)}${stat("Results recorded", values.results)}${stat("First-place finishes", values.firsts)}${stat("Awards", values.awards)}${stat("Best of Breed", values.bestOfBreed)}</div>${seriesColorControls([{ key: "metric:show-entries", label: "Show entries", index: 3 }])}<div class="analytics-two-column">${section("Results by placement", barChart(placements.map((row, index) => ({ ...row, colorKey: `metric:placement:${row.x}`, color: colorFor(`metric:placement:${row.x}`, index) })), { label: "Show results by placement" }))}${section("Entries over time", lineChart([{ name: "Entries", color: colorFor("metric:show-entries", 3), points: overTime.map((point, index) => ({ xValue: index, y: point.y, label: point.x, detail: `${point.y} entries` })) }], { label: "Show entries over time" }))}${section("Animal comparison", barChart(byAnimal, { label: "Show entries by animal" }))}${section("Breed comparison", barChart(byBreed, { label: "Show entries by breed" }))}</div>`;
  }

  function salesView() {
    const values = salesAnalytics();
    if (!values.count) return empty(ui.species ? `No completed sales for ${ui.species}` : "No completed sales recorded", "Draft, Reserved, Pending, and Cancelled sales do not contribute.");
    const prices = groupByMonth(values.itemRows, (row) => row.date, (row) => row.price);
    const counts = groupByMonth(values.itemRows, (row) => row.date, () => 1);
    const breeds = groupBy(values.itemRows, (row) => row.breed || "Unknown breed", (row) => row.price).map((row) => ({ ...row, detail: money(row.y) }));
    return `<div class="stats-grid">${stat("Animals sold", values.count)}${stat("Average sale price", money(values.average))}${stat("Median sale price", money(values.median))}${stat("Highest recorded sale", money(values.highest))}${stat("Lowest recorded sale", money(values.lowest))}</div>${seriesColorControls([{ key: "metric:sale-price", label: "Sale price", index: 1 }, { key: "metric:sales-count", label: "Sales count", index: 0 }])}<div class="analytics-two-column">${section("Sale price over time", lineChart([{ name: "Completed sale value", color: colorFor("metric:sale-price", 1), points: prices.map((point, index) => ({ xValue: index, y: point.y, label: point.x, detail: money(point.y) })) }], { yLabel: money, label: "Completed sale price over time" }), "Calculated at sale-item level.")}${section("Sales count over time", barChart(counts.map((row) => ({ ...row, colorKey: "metric:sales-count" })), { label: "Completed sales count" }))}</div>${section("Recorded value by breed", barChart(breeds, { yLabel: money, label: "Sale value by breed" }), "Totals are based only on qualifying completed sale items.")}`;
  }

  function revenueView() {
    const values = revenueAnalytics(), sales = salesAnalytics();
    if (!values.payments.length) return empty(ui.species ? `No allocatable recorded revenue for ${ui.species}` : "No recorded revenue yet", "Revenue appears only after payments are recorded against completed sales.");
    const trend = groupByMonth(values.payments, (record) => record.date, (record) => record.amount);
    return `<div class="stats-grid">${stat("Recorded revenue", money(values.revenue))}${stat("Payments", values.payments.length)}${stat("Invoiced completed sales", money(sales.invoiced), "Separate from received revenue")}${!ui.species && values.mixedUnallocated.length ? stat("Mixed / Unallocated", money(values.mixedUnallocatedRevenue), `${values.mixedUnallocated.length} payments`) : ""}</div>${seriesColorControls([{ key: "metric:revenue", label: "Received revenue" }])}${section("Revenue over time", lineChart([{ name: "Received payments", color: colorFor("metric:revenue", 0), points: trend.map((point, index) => ({ xValue: index, y: point.y, label: point.x, detail: money(point.y) })) }], { yLabel: money, label: "Received revenue over time" }), ui.species ? "Only payments that can be accurately allocated to this species are included." : "Actual received payments only; multi-species payments remain Mixed / Unallocated.")}`;
  }

  function feedView() {
    const values = feedAnalytics();
    if (!values.rows.length) return empty(ui.species ? `No species-scoped feed costs for ${ui.species}` : "No feed records in this view", "Record Feed expenses to track costs. Consumption is never inferred from expense data.");
    const trend = groupByMonth(values.rows, (record) => record.date, (record) => record.amount);
    return `<div class="stats-grid">${stat("Recorded feed cost", money(values.total))}${stat("Feed expense records", values.rows.length)}${!ui.species && values.operationWide.length ? stat("Operation-wide feed", money(values.operationWideTotal), "Not allocated to a species") : ""}</div>${seriesColorControls([{ key: "metric:feed-cost", label: "Feed cost", index: 2 }])}${section("Feed cost over time", lineChart([{ name: "Feed cost", color: colorFor("metric:feed-cost", 2), points: trend.map((point, index) => ({ xValue: index, y: point.y, label: point.x, detail: money(point.y) })) }], { yLabel: money, label: "Feed cost over time" }), "Feed Cost Analytics only. Individual consumption is not inferred.")}`;
  }

  function healthView() {
    const values = healthAnalytics(), unit = preferredWeightUnit();
    if (!values.rows.length) return empty(ui.species ? `No numeric Health records for ${ui.species}` : "No numeric Health measurements yet", "Weight is currently the only structured numeric Health field.");
    const series = [...new Set(values.rows.map((row) => row.animalId))].slice(0, 8).map((id, index) => ({ name: animalName(currentState(), id), color: colorFor(`animal:${id}`, index), points: values.rows.filter((row) => row.animalId === id).map((row) => ({ xValue: day(row.date).getTime(), y: row.grams, label: dateLabel(row.date), detail: displayWeight(row.grams, unit) })) }));
    return `<div class="stats-grid">${stat("Numeric measurements", values.count)}${stat("Animals measured", values.animals)}${stat("Structured fields used", values.supportedMetrics.join(", "), "Free-text notes are excluded")}</div>${seriesColorControls(series.map((entry, index) => ({ key: `animal:${[...new Set(values.rows.map((row) => row.animalId))][index]}`, label: entry.name, index })))}${section("Structured Health trends", lineChart(series, { yLabel: (grams) => displayWeight(grams, unit), label: "Structured Health weight trends" }), "No medical notes are parsed and no diagnosis is generated.")}`;
  }

  function marketView() {
    const consent = currentState()?.settings?.marketAnalyticsConsent;
    if (!consent?.enabled) return empty("Market Analytics participation is off", "Enable the separate, optional Market Analytics setting to contribute future completed sales and view privacy-safe aggregate results.");
    if (!root?.HerdHarborMarket) return empty("Market Analytics is unavailable", "Your private records are unchanged. Reopen HerdHarbor after the v1.6.5 update finishes.");
    if (ui.marketLoading) return empty("Loading privacy-safe market results…", "Only groups meeting the minimum sample threshold can be returned.");
    if (ui.marketError) return empty("Market results could not load", ui.marketError);
    if (!ui.market?.available) return empty("Not enough market data yet", `At least ${ui.market?.minimumSampleSize || 5} matching opted-in observations are required. Current qualifying sample: ${ui.market?.sampleSize ?? "suppressed"}.`);
    const result = ui.market;
    return `<div class="stats-grid">${stat("Sample size", result.sampleSize)}${stat("Median sale price", money(result.medianSalePrice, result.currency || "USD"))}${stat("Average sale price", money(result.averageSalePrice, result.currency || "USD"))}${stat("Median listed price", money(result.medianListedPrice, result.currency || "USD"))}${stat("Average listed price", money(result.averageListedPrice, result.currency || "USD"))}${stat("Average asking vs. sale", money(result.averageAskingDifference, result.currency || "USD"))}${result.minimumSalePrice !== undefined ? stat("Minimum", money(result.minimumSalePrice, result.currency || "USD")) : ""}${result.maximumSalePrice !== undefined ? stat("Maximum", money(result.maximumSalePrice, result.currency || "USD")) : ""}</div>${section("Market trend", lineChart([{ name: "Market median", color: colorFor("metric:market-median", 1), points: sourceArray(result, "trend").map((point, index) => ({ xValue: index, y: point.medianSalePrice, label: point.period, detail: money(point.medianSalePrice, result.currency || "USD") })) }], { yLabel: (value) => money(value, result.currency || "USD"), label: "Privacy-safe market median over time" }), "Aggregated opted-in observations only. Raw breeder transactions are never returned.")}`;
  }

  function content() {
    return ({ overview: overviewView, growth: growthView, breeding: breedingView, litters: litterView, production: productionView, eggs: eggsView, milk: milkView, shows: showsView, sales: salesView, revenue: revenueView, feed: feedView, health: healthView, market: marketView }[ui.tab] || overviewView)();
  }

  async function loadMarketAggregate() {
    if (ui.tab !== "market" || !currentState()?.settings?.marketAnalyticsConsent?.enabled || !root?.HerdHarborMarket?.queryAggregate || ui.marketLoading) return;
    ui.marketLoading = true;
    ui.marketError = "";
    render(host);
    try {
      ui.market = await root.HerdHarborMarket.queryAggregate({ species: ui.species || undefined, currency: "USD", start: context().start || undefined, end: context().end || undefined });
    } catch (error) {
      ui.marketError = error?.message || "The aggregate service is temporarily unavailable.";
    } finally {
      ui.marketLoading = false;
      render(host);
    }
  }

  function bind(container) {
    const range = container.querySelector("[data-analytics-range]");
    if (range) range.value = ui.range;
    const age = container.querySelector("[data-growth-age]");
    if (age) age.value = ui.agePreset;
    container.querySelector("[data-analytics-species]")?.addEventListener("change", (event) => { ui.species = event.target.value; ui.animalIds = []; ui.market = null; render(host); if (ui.tab === "market") loadMarketAggregate(); });
    range?.addEventListener("change", (event) => { ui.range = event.target.value; ui.market = null; render(host); if (ui.tab === "market") loadMarketAggregate(); });
    container.querySelector("[data-analytics-start]")?.addEventListener("change", (event) => { ui.start = event.target.value; ui.market = null; render(host); });
    container.querySelector("[data-analytics-end]")?.addEventListener("change", (event) => { ui.end = event.target.value; ui.market = null; render(host); if (ui.tab === "market") loadMarketAggregate(); });
    container.querySelectorAll("[data-analytics-tab]").forEach((button) => button.addEventListener("click", () => { ui.tab = button.dataset.analyticsTab; render(host); if (ui.tab === "market" && !ui.market) loadMarketAggregate(); }));
    container.querySelector("[data-growth-mode]")?.addEventListener("change", (event) => { ui.growthMode = event.target.value; render(host); });
    age?.addEventListener("change", (event) => { ui.agePreset = event.target.value; render(host); });
    container.querySelector("[data-growth-age-start]")?.addEventListener("change", (event) => { ui.ageStart = event.target.value; render(host); });
    container.querySelector("[data-growth-age-end]")?.addEventListener("change", (event) => { ui.ageEnd = event.target.value; render(host); });
    container.querySelectorAll("[data-growth-animal]").forEach((input) => input.addEventListener("change", () => { ui.animalIds = [...container.querySelectorAll("[data-growth-animal]:checked")].map((item) => item.value); render(host); }));
    container.querySelector("[data-production-product]")?.addEventListener("change", (event) => { ui.product = event.target.value; render(host); });
    container.querySelectorAll("[data-series-color]").forEach((input) => input.addEventListener("input", () => {
      currentState().settings = currentState().settings || {};
      currentState().settings.analyticsColors = currentState().settings.analyticsColors || {};
      currentState().settings.analyticsColors[input.dataset.seriesColor] = input.value;
      host.saveState?.("Chart color saved.");
      render(host);
    }));
  }

  function render(options) {
    host = options?.state ? options : host;
    const container = typeof document !== "undefined" ? document.querySelector("#view-analytics") : null;
    if (!container || !host) return;
    try {
      container.innerHTML = `<div class="analytics-shell">${header()}${tabs()}${content()}</div>`;
      bind(container);
    } catch (error) {
      container.innerHTML = `<div class="page-header"><div><h2>Analytics</h2></div></div>${empty("Analytics could not load", "Your canonical records are unchanged. Try reopening Analytics.")}`;
      root?.HerdHarborMonitoring?.captureException?.(error, { module: "analytics", version: VERSION, route: "analytics" });
    }
  }

  function openAnimal(animalId) {
    ui.tab = "growth";
    ui.animalIds = animalId ? [animalId] : [];
    ui.species = animalFor(currentState(), animalId)?.species || "";
  }

  return {
    VERSION, METRICS, TABS, normalizeWeight, displayWeight, preferredWeightUnit,
    rangeBounds, dateInRange, daysBetween, weightRows, birthWeightRow, growthSummary,
    ageRangeBounds, filterGrowthByAge, weightHistory, breedingSpecies, litterSpecies,
    litterAnalytics, breedingAnalytics, saleItemPrice, saleTotal, saleItemRows,
    paymentAllocation, revenueAnalytics, salesAnalytics, showAnalytics, productionSpecies,
    productionRows, normalizedProductionValue, productionAnalytics, eggAnalytics,
    milkAnalytics, feedAnalytics, healthAnalytics, metricAvailable, groupBy, groupByMonth,
    colorFor, lineChart, barChart, openAnimal, render
  };
});
