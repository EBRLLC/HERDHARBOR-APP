(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborProductionReportingRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";

  const EXPENSE_CATEGORIES = [
    "Feed", "Hay / Fodder", "Bedding", "Veterinary", "Medication",
    "Breeding Fees", "Registration", "Show Expenses", "Equipment",
    "Utilities", "Housing / Cages", "Supplies", "Processing",
    "Transportation", "Other Expense"
  ];
  const INCOME_CATEGORIES = [
    "Animal Sales", "Stud Fees", "Meat Sales", "Egg Sales",
    "Milk / Fiber", "Show Winnings", "Other Income"
  ];
  const PRODUCTION_PRODUCTS = ["Eggs", "Broilers", "Milk", "Hay", "Other"];
  const PRODUCTION_UNITS = [
    "eggs", "dozen", "cartons", "birds", "lb", "kg",
    "gallons", "quarts", "liters", "pints", "bales",
    "square bales", "round bales", "tons", "other"
  ];
  const PRODUCTION_DEFAULTS = {
    Eggs: { species: "Chicken", unit: "eggs", category: "Egg Sales" },
    Broilers: { species: "Chicken", unit: "birds", category: "Meat Sales" },
    Milk: { species: "Cattle", unit: "gallons", category: "Milk / Fiber" },
    Hay: { species: "", unit: "bales", category: "Other Income" },
    Other: { species: "", unit: "other", category: "Other Income" }
  };
  

  function create(deps = {}) {
    const required = [
      "getState", "replaceState", "$", "$$", "esc", "headerHtml", "statCard", "emptyState",
      "field", "textareaField", "selectField", "formatDate", "formatMoney", "toast",
      "currentMonthKey", "budgetPeriodLabel", "budgetSummary", "activeAnimals",
      "effectiveHeadCount", "monthLabel", "monthTransactions", "operatingExpenseTransactions",
      "transactionSpecies", "transactionScopeLabel", "animalName", "todayISO", "uid",
      "recordActivity", "saveState", "openModal", "closeModal", "renderCurrentView",
      "ensureSpreadsheetToolsReady", "openPaymentForm"
    ];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error(`Production/Reporting runtime requires ${name}().`);
    }

    const {
      replaceState, $, $$, esc, headerHtml, statCard, emptyState, field, textareaField,
      selectField, formatDate, formatMoney, toast, currentMonthKey, budgetPeriodLabel,
      budgetSummary, activeAnimals, effectiveHeadCount, monthLabel, monthTransactions,
      operatingExpenseTransactions, transactionSpecies, transactionScopeLabel, animalName,
      todayISO, uid, recordActivity, saveState, openModal, closeModal, renderCurrentView,
      ensureSpreadsheetToolsReady, openPaymentForm
    } = deps;
    const stateNow = () => deps.getState() || {};
    const confirm = typeof root?.confirm === "function" ? root.confirm.bind(root) : () => false;

    let budgetView = {
      period: "Month",
      month: new Date().toISOString().slice(0, 7),
      year: new Date().getFullYear(),
      species: "",
      expenseView: "All"
    };
    const initialProductionRange = productionPeriodRange("Month", new Date().toISOString().slice(0, 10));
    let productionReportView = {
      period: "Month",
      groupBy: "Day",
      start: initialProductionRange.start,
      end: initialProductionRange.end,
      product: "",
      species: "",
      animalId: ""
    };

    function budgetPlansFor(monthKey, speciesFilter = "") {
      const key = String(monthKey || "");
      const isYear = /^\d{4}$/.test(key);
      return stateNow().budgetPlans.filter((plan) =>
        (isYear ? String(plan.month || "").startsWith(`${key}-`) : plan.month === key) &&
        (plan.species || "") === speciesFilter
      );
    }
    
    function annualBudgetYears() {
      return [...new Set([
        new Date().getFullYear(),
        ...stateNow().annualBudgetPlans.map((plan) => Number(plan.year)).filter(Number.isInteger)
      ])].sort((a, b) => b - a);
    }
    
    function budgetYears() {
      const currentYear = new Date().getFullYear();
      return [...new Set([
        currentYear - 1,
        currentYear,
        currentYear + 1,
        Number(budgetView.year),
        ...stateNow().transactions.map((transaction) => Number(String(transaction.date || "").slice(0, 4))),
        ...stateNow().budgetPlans.map((plan) => Number(String(plan.month || "").slice(0, 4))),
        ...stateNow().annualBudgetPlans.map((plan) => Number(plan.year))
      ].filter(Number.isInteger))].sort((a, b) => b - a);
    }
    
    function annualBudgetPlansFor(year, speciesFilter = "") {
      return stateNow().annualBudgetPlans.filter((plan) => {
        if (Number(plan.year) !== Number(year)) return false;
        if (!speciesFilter) return true;
        if (plan.species === speciesFilter) return true;
        return stateNow().animals.find((animal) => animal.id === plan.animalId)?.species === speciesFilter;
      });
    }
    
    function annualPlanSummary(plans) {
      const expenses = plans
        .filter((plan) => plan.type === "Expense")
        .reduce((sum, plan) => sum + Number(plan.amount || 0), 0);
      const income = plans
        .filter((plan) => plan.type === "Income")
        .reduce((sum, plan) => sum + Number(plan.amount || 0), 0);
      return { expenses, income, net: income - expenses };
    }
    
    function yearlyActualRows(year, speciesFilter = "") {
      return Array.from({ length: 12 }, (_, index) => {
        const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
        return { monthKey, ...budgetSummary(monthKey, speciesFilter) };
      });
    }
    
    function allocatedExpenseAmount(transaction, speciesFilter = "") {
      const amount = Number(transaction.amount || 0);
      if (!speciesFilter) return amount;
    
      const animals = activeAnimals();
      const totalCount = animals.length;
      const speciesCount = animals.filter((animal) => animal.species === speciesFilter).length;
    
      if (transaction.scope === "Operation") {
        return totalCount > 0 ? amount * (speciesCount / totalCount) : 0;
      }
    
      return transactionSpecies(transaction) === speciesFilter ? amount : 0;
    }
    
    function budgetActualByCategory(monthKey, speciesFilter = "") {
      const totals = {};
      operatingExpenseTransactions(monthKey).forEach((transaction) => {
        const amount = allocatedExpenseAmount(transaction, speciesFilter);
        if (amount <= 0) return;
        const category = transaction.category || "Other Expense";
        totals[category] = (totals[category] || 0) + amount;
      });
      return totals;
    }
    
    function speciesCostRows(monthKey) {
      const animals = activeAnimals();
      const totalCount = animals.length;
      const operationExpenses = operatingExpenseTransactions(monthKey)
        .filter((transaction) => transaction.scope === "Operation")
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    
      return [...new Set(animals.map((animal) => animal.species).filter(Boolean))]
        .sort()
        .map((species) => {
          const count = animals.filter((animal) => animal.species === species).length;
          const direct = operatingExpenseTransactions(monthKey)
            .filter((transaction) =>
              transaction.scope !== "Operation" && transactionSpecies(transaction) === species
            )
            .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
          const allocated = totalCount > 0 ? operationExpenses * (count / totalCount) : 0;
          const total = direct + allocated;
          return {
            species,
            count,
            direct,
            allocated,
            total,
            perHead: count > 0 ? total / count : 0
          };
        })
        .sort((a, b) => b.total - a.total);
    }
    
    function animalCostRows(monthKey, speciesFilter = "") {
      const animals = activeAnimals().filter((animal) =>
        !speciesFilter || animal.species === speciesFilter
      );
      const allActive = activeAnimals();
      const totalCount = allActive.length;
      const operationExpenses = operatingExpenseTransactions(monthKey)
        .filter((transaction) => transaction.scope === "Operation")
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    
      const speciesExpenseTotals = {};
      operatingExpenseTransactions(monthKey)
        .filter((transaction) => transaction.scope === "Species")
        .forEach((transaction) => {
          const species = transactionSpecies(transaction);
          speciesExpenseTotals[species] = (speciesExpenseTotals[species] || 0) + Number(transaction.amount || 0);
        });
    
      return animals.map((animal) => {
        const speciesCount = allActive.filter((item) => item.species === animal.species).length;
        const direct = operatingExpenseTransactions(monthKey)
          .filter((transaction) =>
            transaction.scope === "Animal" && transaction.animalId === animal.id
          )
          .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
        const operationShare = totalCount > 0 ? operationExpenses / totalCount : 0;
        const speciesShare = speciesCount > 0
          ? Number(speciesExpenseTotals[animal.species] || 0) / speciesCount
          : 0;
        return {
          animal,
          direct,
          allocated: operationShare + speciesShare,
          total: direct + operationShare + speciesShare
        };
      }).sort((a, b) => b.total - a.total);
    }
    
    function productionSpecies(record) {
      if (record.species) return record.species;
      if (record.animalId) {
        return stateNow().animals.find((animal) => animal.id === record.animalId)?.species || "";
      }
      return "";
    }
    
    function productionScopeLabel(record) {
      if (record.scope === "Animal") return animalName(record.animalId);
      if (record.scope === "Species") return record.species || "Species";
      return "Whole operation";
    }
    
    function formatQuantity(value, unit = "") {
      const number = Number(value || 0);
      const formatted = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2
      }).format(Number.isFinite(number) ? number : 0);
      return `${formatted}${unit ? ` ${unit}` : ""}`;
    }
    
    function productionFarmUse(record) {
      return [
        record.householdQuantity,
        record.feedQuantity,
        record.setAsideQuantity
      ].reduce((sum, value) => sum + Number(value || 0), 0);
    }
    
    function localISODate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    
    function productionPeriodRange(period = "Month", anchor = "") {
      const anchorMatch = String(anchor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const date = anchorMatch
        ? new Date(Number(anchorMatch[1]), Number(anchorMatch[2]) - 1, Number(anchorMatch[3]), 12)
        : new Date();
      const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
      let start = new Date(validDate);
      let end = new Date(validDate);
    
      if (period === "Week") {
        const mondayOffset = (validDate.getDay() + 6) % 7;
        start.setDate(validDate.getDate() - mondayOffset);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
      } else if (period === "Month") {
        start = new Date(validDate.getFullYear(), validDate.getMonth(), 1, 12);
        end = new Date(validDate.getFullYear(), validDate.getMonth() + 1, 0, 12);
      } else if (period === "Year") {
        start = new Date(validDate.getFullYear(), 0, 1, 12);
        end = new Date(validDate.getFullYear(), 11, 31, 12);
      }
    
      return { start: localISODate(start), end: localISODate(end) };
    }
    
    function filterProductionRecords(records, filters = {}) {
      return (records || []).filter((record) => {
        const date = String(record.date || "");
        if (filters.start && date < filters.start) return false;
        if (filters.end && date > filters.end) return false;
        if (filters.product && record.product !== filters.product) return false;
        if (filters.species && productionSpecies(record) !== filters.species) return false;
        if (filters.animalId && record.animalId !== filters.animalId) return false;
        return true;
      });
    }
    
    function productionSummaryRows(records) {
      const groups = new Map();
      records.forEach((record) => {
        const product = record.product || "Other";
        const unit = record.unit || "units";
        const key = `${product}|${unit}`;
        if (!groups.has(key)) {
          groups.set(key, {
            product,
            unit,
            produced: 0,
            sold: 0,
            farmUse: 0,
            donated: 0,
            waste: 0,
            revenue: 0,
            recordCount: 0
          });
        }
        const row = groups.get(key);
        row.produced += Number(record.quantity || 0);
        row.sold += Number(record.soldQuantity || 0);
        row.farmUse += productionFarmUse(record);
        row.donated += Number(record.donatedQuantity || 0);
        row.waste += Number(record.wasteQuantity || 0);
        row.revenue += Number(record.saleAmount || 0);
        row.recordCount += 1;
      });
      return [...groups.values()].map((row) => ({
        ...row,
        averagePrice: row.sold > 0 ? row.revenue / row.sold : 0,
        wasteRate: row.produced > 0 ? row.waste / row.produced : 0
      })).sort((left, right) =>
        left.product.localeCompare(right.product) || left.unit.localeCompare(right.unit)
      );
    }
    
    function productionTimelineBucket(date, groupBy = "Day") {
      const value = String(date || "");
      if (groupBy === "Year") return value.slice(0, 4);
      if (groupBy === "Month") return value.slice(0, 7);
      if (groupBy === "Week") return productionPeriodRange("Week", value).start;
      return value;
    }
    
    function productionTimelineLabel(bucket, groupBy = "Day") {
      if (groupBy === "Year") return bucket;
      if (groupBy === "Month") return monthLabel(bucket);
      if (groupBy === "Week") {
        const end = productionPeriodRange("Week", bucket).end;
        return `${formatDate(bucket)} – ${formatDate(end)}`;
      }
      return formatDate(bucket);
    }
    
    function productionTimelineRows(records, groupBy = "Day") {
      const groups = new Map();
      (records || []).forEach((record) => {
        const bucket = productionTimelineBucket(record.date, groupBy);
        const key = `${bucket}|${record.product || "Other"}|${record.unit || "units"}`;
        if (!groups.has(key)) groups.set(key, { bucket, records: [] });
        groups.get(key).records.push(record);
      });
      return [...groups.values()].map((group) => ({
        bucket: group.bucket,
        label: productionTimelineLabel(group.bucket, groupBy),
        ...productionSummaryRows(group.records)[0]
      })).sort((left, right) =>
        right.bucket.localeCompare(left.bucket) || left.product.localeCompare(right.product)
      );
    }
    
    function productionComparisonIdentity(record) {
      if (record.animalId) {
        return {
          key: `animal:${record.animalId}`,
          label: animalName(record.animalId),
          kind: "Animal",
          animalId: record.animalId
        };
      }
      if (String(record.groupName || "").trim()) {
        return {
          key: `group:${String(record.groupName).trim().toLowerCase()}`,
          label: String(record.groupName).trim(),
          kind: record.product === "Broilers" ? "Batch" : record.product === "Eggs" ? "Flock" : record.product === "Milk" ? "Herd" : record.product === "Hay" ? "Field / Cutting" : "Group",
          animalId: ""
        };
      }
      if (record.scope === "Species" || productionSpecies(record)) {
        return {
          key: `species:${productionSpecies(record) || "unknown"}`,
          label: productionSpecies(record) || "Species",
          kind: "Species",
          animalId: ""
        };
      }
      return { key: "operation", label: "Whole operation", kind: "Operation", animalId: "" };
    }
    
    function productionComparisonRows(records) {
      const groups = new Map();
      (records || []).forEach((record) => {
        const product = record.product || "Other";
        const unit = record.unit || "units";
        const identities = [productionComparisonIdentity(record)];
        const groupName = String(record.groupName || "").trim();
        if (record.animalId && groupName) {
          identities.push({
            key: `group:${groupName.toLowerCase()}`,
            label: groupName,
            kind: record.product === "Broilers" ? "Batch" : record.product === "Eggs" ? "Flock" : record.product === "Milk" ? "Herd" : record.product === "Hay" ? "Field / Cutting" : "Group",
            animalId: ""
          });
        }
        identities.forEach((identity) => {
          const key = `${identity.key}|${product}|${unit}`;
          if (!groups.has(key)) groups.set(key, { ...identity, records: [] });
          groups.get(key).records.push(record);
        });
      });
      return [...groups.values()].map((group) => ({
        key: group.key,
        label: group.label,
        kind: group.kind,
        animalId: group.animalId,
        ...productionSummaryRows(group.records)[0]
      })).sort((left, right) =>
        left.product.localeCompare(right.product) || right.produced - left.produced || left.label.localeCompare(right.label)
      );
    }
    
    function productionSeriesKey(record) {
      const identity = productionComparisonIdentity(record);
      return `${record.product || "Other"}|${record.unit || "units"}|${identity.key}`;
    }
    
    function productionWarnings(records, allRecords = stateNow().productionRecords) {
      const warnings = productionSummaryRows(records)
        .filter((row) => row.produced > 0 && row.wasteRate >= 0.1)
        .map((row) => ({
          type: "waste",
          severity: row.wasteRate >= 0.2 ? "danger" : "warning",
          message: `${row.product} waste is ${(row.wasteRate * 100).toFixed(1)}% for this report period (${formatQuantity(row.waste, row.unit)} of ${formatQuantity(row.produced, row.unit)}).`
        }));
    
      const selectedLatest = new Map();
      (records || []).forEach((record) => {
        const key = productionSeriesKey(record);
        if (!selectedLatest.has(key) || String(record.date) > selectedLatest.get(key)) {
          selectedLatest.set(key, String(record.date));
        }
      });
    
      const dailySeries = new Map();
      (allRecords || []).forEach((record) => {
        const key = productionSeriesKey(record);
        const date = String(record.date || "");
        if (!dailySeries.has(key)) dailySeries.set(key, new Map());
        const daily = dailySeries.get(key);
        daily.set(date, (daily.get(date) || 0) + Number(record.quantity || 0));
      });
    
      selectedLatest.forEach((currentDate, key) => {
        const daily = dailySeries.get(key);
        const current = Number(daily?.get(currentDate) || 0);
        const prior = [...(daily?.entries() || [])]
          .filter(([date]) => date < currentDate)
          .sort((left, right) => right[0].localeCompare(left[0]))
          .slice(0, 7)
          .map(([, quantity]) => quantity);
        if (prior.length < 3) return;
        const average = prior.reduce((sum, quantity) => sum + quantity, 0) / prior.length;
        if (!(average > 0) || current >= average * 0.75) return;
        const sampleRecord = (records || []).find((record) =>
          productionSeriesKey(record) === key && record.date === currentDate
        );
        const identity = sampleRecord ? productionComparisonIdentity(sampleRecord) : { label: "This group" };
        const drop = ((average - current) / average) * 100;
        warnings.push({
          type: "drop",
          severity: drop >= 40 ? "danger" : "warning",
          message: `${sampleRecord?.product || "Production"} for ${identity.label} is ${drop.toFixed(0)}% below its previous ${prior.length}-entry daily average.`
        });
      });
    
      return warnings.slice(0, 8);
    }
    
    function productionRangeLabel(filters = productionReportView) {
      if (!filters.start && !filters.end) return "All recorded dates";
      if (filters.start && !filters.end) return `From ${formatDate(filters.start)}`;
      if (!filters.start && filters.end) return `Through ${formatDate(filters.end)}`;
      if (filters.start === filters.end) return formatDate(filters.start);
      return `${formatDate(filters.start)} – ${formatDate(filters.end)}`;
    }
    
    function latestProductionRecord() {
      return [...stateNow().productionRecords].sort((left, right) =>
        String(right.updatedAt || right.createdAt || right.date || "").localeCompare(
          String(left.updatedAt || left.createdAt || left.date || "")
        )
      )[0] || null;
    }
    
    function productionDraft(product = "Eggs", sourceRecord = null) {
      const defaults = PRODUCTION_DEFAULTS[product] || PRODUCTION_DEFAULTS.Other;
      if (sourceRecord) {
        const draft = structuredClone(sourceRecord);
        delete draft.id;
        delete draft.transactionId;
        delete draft.createdAt;
        delete draft.updatedAt;
        delete draft.importSource;
        draft.date = todayISO();
        return draft;
      }
      return {
        date: todayISO(),
        product,
        scope: defaults.species ? "Species" : "Operation",
        species: defaults.species,
        animalId: "",
        groupName: "",
        unit: defaults.unit,
        quantity: "",
        soldQuantity: "",
        householdQuantity: "",
        feedQuantity: "",
        setAsideQuantity: "",
        donatedQuantity: "",
        wasteQuantity: "",
        saleAmount: ""
      };
    }
    
    function productionIncomeCategory(product = "") {
      if (product === "Eggs") return "Egg Sales";
      if (product === "Broilers") return "Meat Sales";
      if (product === "Milk") return "Milk / Fiber";
      return "Other Income";
    }
    
    function syncProductionIncome(record) {
      const existing = stateNow().transactions.find((transaction) =>
        transaction.id === record.transactionId ||
        (transaction.sourceType === "production" && transaction.sourceId === record.id)
      );
      const amount = Number(record.saleAmount || 0);
    
      if (!(amount > 0)) {
        if (existing) {
          stateNow().transactions = stateNow().transactions.filter((transaction) => transaction.id !== existing.id);
        }
        record.transactionId = "";
        return;
      }
    
      const now = new Date().toISOString();
      const linked = {
        date: record.date,
        type: "Income",
        classification: "",
        category: productionIncomeCategory(record.product),
        scope: record.scope || "Operation",
        species: record.scope === "Operation" ? "" : productionSpecies(record),
        animalId: record.scope === "Animal" ? record.animalId || "" : "",
        amount: amount.toFixed(2),
        party: record.customer || "",
        description: `${record.product || "Farm product"}: ${formatQuantity(record.soldQuantity, record.unit)} sold`,
        notes: record.notes || "",
        sourceType: "production",
        sourceId: record.id
      };
    
      if (existing) {
        Object.assign(existing, linked, { updatedAt: now });
        record.transactionId = existing.id;
      } else {
        const transaction = {
          id: uid("transaction"),
          ...linked,
          createdAt: now
        };
        stateNow().transactions.push(transaction);
        record.transactionId = transaction.id;
      }
    }
    
    function renderBudget() {
      const monthKey = budgetView.month || currentMonthKey();
      const annualYear = Number(budgetView.year) || new Date().getFullYear();
      const isYearView = budgetView.period === "Year";
      const periodKey = isYearView ? String(annualYear) : monthKey;
      const periodLabel = budgetPeriodLabel(periodKey);
      const speciesFilter = budgetView.species || "";
      const summary = budgetSummary(periodKey, speciesFilter);
      const allActive = activeAnimals();
      const selectedActive = speciesFilter
        ? allActive.filter((animal) => animal.species === speciesFilter)
        : allActive;
      const headCount = speciesFilter
        ? selectedActive.length
        : effectiveHeadCount(periodKey);
      const costPerHead = headCount > 0 ? summary.operating / headCount : 0;
      const plans = budgetPlansFor(periodKey, speciesFilter);
      const annualPlans = annualBudgetPlansFor(annualYear, speciesFilter);
      const annualSummary = annualPlanSummary(annualPlans);
      const annualByCategory = {};
      annualPlans.forEach((plan) => {
        const key = `${plan.type || "Expense"}|${plan.category || "Other"}`;
        annualByCategory[key] = (annualByCategory[key] || 0) + Number(plan.amount || 0);
      });
      const annualCategoryRows = Object.entries(annualByCategory)
        .map(([key, amount]) => {
          const [type, category] = key.split("|");
          return { type, category, amount };
        })
        .sort((a, b) => a.type.localeCompare(b.type) || b.amount - a.amount);
      const plannedTotal = plans.reduce((sum, plan) => sum + Number(plan.amount || 0), 0);
      const actualByCategory = budgetActualByCategory(periodKey, speciesFilter);
      const planByCategory = {};
      plans.forEach((plan) => {
        planByCategory[plan.category] = (planByCategory[plan.category] || 0) + Number(plan.amount || 0);
      });
      const categories = [...new Set([
        ...Object.keys(planByCategory),
        ...Object.keys(actualByCategory)
      ])].sort();
    
      const transactions = monthTransactions(periodKey)
        .filter((transaction) => {
          if (speciesFilter) {
            const contributes = transaction.scope === "Operation" ||
              transactionSpecies(transaction) === speciesFilter;
            if (!contributes) return false;
          }
          if (budgetView.expenseView === "Income") return transaction.type === "Income";
          if (budgetView.expenseView === "Operating") {
            return transaction.type === "Expense" && transaction.classification !== "Capital";
          }
          if (budgetView.expenseView === "Capital") {
            return transaction.type === "Expense" && transaction.classification === "Capital";
          }
          return true;
        })
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    
      const productionRecords = filterProductionRecords(stateNow().productionRecords, productionReportView)
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const productionRows = productionSummaryRows(productionRecords);
      const productionTimeline = productionTimelineRows(productionRecords, productionReportView.groupBy);
      const productionComparisons = productionComparisonRows(productionRecords);
      const productionAlerts = productionWarnings(productionRecords);
      const productionRevenue = productionRows.reduce((sum, row) => sum + row.revenue, 0);
      const productionProducts = [...new Set(stateNow().productionRecords.map((record) => record.product).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
      const productionSpeciesOptions = [...new Set([
        ...stateNow().settings.species,
        ...stateNow().productionRecords.map((record) => productionSpecies(record)).filter(Boolean)
      ])].sort((left, right) => left.localeCompare(right));
      const productionAnimals = stateNow().animals
        .filter((animal) => stateNow().productionRecords.some((record) => record.animalId === animal.id) || animal.status === "Active")
        .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
      const lastProductionRecord = latestProductionRecord();
    
      const speciesRows = speciesCostRows(periodKey);
      const animalRows = animalCostRows(periodKey, speciesFilter).slice(0, 12);
      const yearlyRows = isYearView ? yearlyActualRows(annualYear, speciesFilter) : [];
      const monthSetting = stateNow().budgetMonthSettings?.[monthKey] || {};
      const yearlyHeadCountOverrideCount = isYearView
        ? Object.entries(stateNow().budgetMonthSettings || {}).filter(([key, setting]) =>
            key.startsWith(`${annualYear}-`) && Number(setting?.averageHeadCount || 0) > 0
          ).length
        : 0;
      const progressPercent = plannedTotal > 0 ? Math.min(100, (summary.operating / plannedTotal) * 100) : 0;
    
      $("#view-budget").innerHTML = `
        ${headerHtml(
          "Budget and cost per head",
          "Track production, received sale payments, income, expenses, and what each animal costs.",
          `<button class="button button-ghost" id="set-budget-plan">Set budget</button>
           <button class="button button-ghost" id="add-production">+ Production</button>
           <button class="button button-secondary" id="add-income">+ Income</button>
           <button class="button button-primary" id="add-expense">+ Expense</button>`
        )}
    
        <div class="budget-filters">
          <label>Budget view
            <select id="budget-period">
              <option value="Month" ${isYearView ? "" : "selected"}>Monthly</option>
              <option value="Year" ${isYearView ? "selected" : ""}>Full year</option>
            </select>
          </label>
          <label>${isYearView ? "Year" : "Month"}
            ${isYearView ? `
              <select id="budget-year">
                ${budgetYears().map((year) =>
                  `<option value="${year}" ${year === annualYear ? "selected" : ""}>${year}</option>`
                ).join("")}
              </select>
            ` : `<input type="month" id="budget-month" value="${esc(monthKey)}">`}
          </label>
          <label>Species
            <select id="budget-species">
              <option value="">Whole operation</option>
              ${stateNow().settings.species.map((species) =>
                `<option value="${esc(species)}" ${species === speciesFilter ? "selected" : ""}>${esc(species)}</option>`
              ).join("")}
            </select>
          </label>
          <label>Transactions
            <select id="budget-view">
              ${["All", "Income", "Operating", "Capital"].map((value) =>
                `<option value="${value}" ${budgetView.expenseView === value ? "selected" : ""}>${
                  value === "Operating" ? "Operating expenses" :
                  value === "Capital" ? "Capital expenses" : value
                }</option>`
              ).join("")}
            </select>
          </label>
          <button class="button button-ghost" id="export-budget-csv">Export CSV</button>
        </div>
    
        <div class="stats-grid">
          ${statCard("Income", formatMoney(summary.income), periodLabel)}
          ${statCard("Operating expenses", formatMoney(summary.operating), "Used for cost per head")}
          ${statCard("Net", formatMoney(summary.net), `${formatMoney(summary.capital)} capital expenses`)}
          ${statCard("Cost per head", formatMoney(costPerHead), `${headCount} ${speciesFilter ? speciesFilter.toLowerCase() : "average active"} head`)}
        </div>
    
        <section class="panel" style="margin-bottom:18px">
          <div class="panel-header">
            <div>
              <h3>Production &amp; sales</h3>
              <small>${productionRangeLabel()} · ${productionRecords.length} record${productionRecords.length === 1 ? "" : "s"}</small>
            </div>
            <div class="header-actions">
              <button class="button button-ghost button-small" id="print-production-report">Print report</button>
              <button class="button button-ghost button-small" id="download-production-report">Download Excel</button>
              <button class="button button-primary button-small" id="add-production-panel">Add record</button>
            </div>
          </div>
    
          <div class="production-quick-bar">
            <span class="production-quick-label">Quick entry</span>
            <button class="button button-ghost button-small" data-quick-production="Eggs">Eggs</button>
            <button class="button button-ghost button-small" data-quick-production="Milk">Milk</button>
            <button class="button button-ghost button-small" data-quick-production="Broilers">Broilers</button>
            <button class="button button-ghost button-small" data-quick-production="Hay">Hay</button>
            <button class="button button-ghost button-small" data-quick-production="Other">Custom product</button>
            <button class="button button-secondary button-small" id="repeat-last-production" ${lastProductionRecord ? "" : "disabled"}>Repeat last entry</button>
          </div>
    
          <div class="production-report-filters">
            <label>From
              <input type="date" id="production-report-start" value="${esc(productionReportView.start)}">
            </label>
            <label>To
              <input type="date" id="production-report-end" value="${esc(productionReportView.end)}">
            </label>
            <label>Product
              <select id="production-report-product">
                <option value="">All products</option>
                ${productionProducts.map((product) => `<option value="${esc(product)}" ${product === productionReportView.product ? "selected" : ""}>${esc(product)}</option>`).join("")}
              </select>
            </label>
            <label>Species
              <select id="production-report-species">
                <option value="">All species</option>
                ${productionSpeciesOptions.map((species) => `<option value="${esc(species)}" ${species === productionReportView.species ? "selected" : ""}>${esc(species)}</option>`).join("")}
              </select>
            </label>
            <label>Animal
              <select id="production-report-animal">
                <option value="">All animals and groups</option>
                ${productionAnimals.map((animal) => `<option value="${animal.id}" ${animal.id === productionReportView.animalId ? "selected" : ""}>${esc(animal.name)} · ${esc(animal.species || "")}</option>`).join("")}
              </select>
            </label>
            <label>Totals by
              <select id="production-report-group">
                ${["Day", "Week", "Month", "Year"].map((value) => `<option value="${value}" ${value === productionReportView.groupBy ? "selected" : ""}>${value}</option>`).join("")}
              </select>
            </label>
          </div>
    
          <div class="production-period-bar">
            ${["Day", "Week", "Month", "Year"].map((period) => `
              <button class="button button-ghost button-small ${productionReportView.period === period ? "active" : ""}" data-production-period="${period}">${period === "Day" ? "Today" : `This ${period.toLowerCase()}`}</button>
            `).join("")}
            <button class="button button-ghost button-small ${productionReportView.period === "All" ? "active" : ""}" data-production-period="All">All records</button>
            <button class="button button-ghost button-small" id="clear-production-filters">Clear product filters</button>
          </div>
    
          <div class="stats-grid production-stat-grid">
            ${statCard("Sale revenue", formatMoney(productionRevenue), productionRangeLabel())}
            ${statCard("Production entries", productionRecords.length.toLocaleString(), `${productionProducts.length} recorded product${productionProducts.length === 1 ? "" : "s"}`)}
            ${statCard("Product / unit totals", productionRows.length.toLocaleString(), "Exact quantities stay separated by unit")}
            ${statCard("Needs attention", productionAlerts.length.toLocaleString(), productionAlerts.length ? "Production drop or waste warning" : "No basic warnings in this range")}
          </div>
    
          ${productionAlerts.length ? `<div class="production-alerts">${productionAlerts.map((alert) => `
            <div class="production-alert ${alert.severity === "danger" ? "danger" : ""}">${esc(alert.message)}</div>
          `).join("")}</div>` : ""}
    
          ${productionRows.length ? `
            <div class="production-report-section">
              <h4>Product totals</h4>
              <p>Quantities stay separated by product and unit so eggs, dozens, gallons, birds, and pounds are never mixed.</p>
              <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>Product</th><th>Produced</th><th>Sold</th><th>Used on farm / stored</th><th>Donated</th><th>Waste</th><th>Avg. sale price</th><th>Revenue</th></tr></thead>
                <tbody>${productionRows.map((row) => `
                  <tr>
                    <td><strong>${esc(row.product)}</strong></td>
                    <td>${formatQuantity(row.produced, row.unit)}</td>
                    <td>${formatQuantity(row.sold, row.unit)}</td>
                    <td>${formatQuantity(row.farmUse, row.unit)}</td>
                    <td>${formatQuantity(row.donated, row.unit)}</td>
                    <td>${formatQuantity(row.waste, row.unit)} · ${(row.wasteRate * 100).toFixed(1)}%</td>
                    <td>${row.sold > 0 ? `${formatMoney(row.averagePrice)} / ${esc(row.unit)}` : "—"}</td>
                    <td class="transaction-amount income">${formatMoney(row.revenue)}</td>
                  </tr>`).join("")}</tbody>
              </table>
              </div>
            </div>
    
            <div class="production-report-section">
              <h4>${esc(productionReportView.groupBy)} totals</h4>
              <p>Change “Totals by” above to review daily, weekly, monthly, or yearly output.</p>
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead><tr><th>Period</th><th>Product</th><th>Produced</th><th>Sold</th><th>Used on farm / stored</th><th>Waste</th><th>Revenue</th></tr></thead>
                  <tbody>${productionTimeline.map((row) => `
                    <tr>
                      <td><strong>${esc(row.label)}</strong></td>
                      <td>${esc(row.product)} · ${esc(row.unit)}</td>
                      <td>${formatQuantity(row.produced, row.unit)}</td>
                      <td>${formatQuantity(row.sold, row.unit)}</td>
                      <td>${formatQuantity(row.farmUse, row.unit)}</td>
                      <td>${formatQuantity(row.waste, row.unit)} · ${(row.wasteRate * 100).toFixed(1)}%</td>
                      <td class="transaction-amount income">${formatMoney(row.revenue)}</td>
                    </tr>`).join("")}</tbody>
                </table>
              </div>
            </div>
    
            <div class="production-report-section">
              <h4>Animal, flock, herd, and batch comparison</h4>
              <p>Use an animal or the new group / batch name on an entry to compare production sources.</p>
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead><tr><th>Animal / group</th><th>Product</th><th>Produced</th><th>Sold</th><th>Waste</th><th>Avg. sale price</th><th>Revenue</th><th></th></tr></thead>
                  <tbody>${productionComparisons.map((row) => `
                    <tr>
                      <td><strong>${esc(row.label)}</strong><br><small>${esc(row.kind)}</small></td>
                      <td>${esc(row.product)} · ${esc(row.unit)}</td>
                      <td>${formatQuantity(row.produced, row.unit)}</td>
                      <td>${formatQuantity(row.sold, row.unit)}</td>
                      <td>${formatQuantity(row.waste, row.unit)} · ${(row.wasteRate * 100).toFixed(1)}%</td>
                      <td>${row.sold > 0 ? `${formatMoney(row.averagePrice)} / ${esc(row.unit)}` : "—"}</td>
                      <td class="transaction-amount income">${formatMoney(row.revenue)}</td>
                      <td>${row.animalId ? `<button class="button button-ghost button-small" data-production-history="${row.animalId}" data-production-history-product="${esc(row.product)}">History</button>` : ""}</td>
                    </tr>`).join("")}</tbody>
                </table>
              </div>
            </div>
    
            <div class="production-report-section">
              <h4>Production history</h4>
              <p>${productionReportView.animalId ? `Showing the selected animal’s history for ${productionRangeLabel()}.` : "Filter by an animal or use History above for an individual dairy cow or other animal."}</p>
              <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>Date</th><th>Product</th><th>Animal / group</th><th>Produced</th><th>Sold</th><th>Used on farm</th><th>Waste</th><th>Sale income</th><th></th></tr></thead>
                <tbody>${productionRecords.map((record) => `
                  <tr>
                    <td>${formatDate(record.date)}</td>
                    <td><strong>${esc(record.product || "Other")}</strong>${record.session ? `<br><small>${esc(record.session)}</small>` : ""}</td>
                    <td>${esc(record.groupName || productionScopeLabel(record))}${record.groupName ? `<br><small>${esc(productionScopeLabel(record))}</small>` : ""}</td>
                    <td>${formatQuantity(record.quantity, record.unit)}</td>
                    <td>${formatQuantity(record.soldQuantity, record.unit)}</td>
                    <td>${formatQuantity(productionFarmUse(record), record.unit)}</td>
                    <td>${formatQuantity(record.wasteQuantity, record.unit)}</td>
                    <td>${Number(record.saleAmount || 0) > 0 ? formatMoney(record.saleAmount) : "—"}</td>
                    <td><div class="header-actions"><button class="button button-ghost button-small" data-repeat-production="${record.id}">Repeat</button><button class="button button-ghost button-small" data-edit-production="${record.id}">Edit</button></div></td>
                  </tr>`).join("")}</tbody>
              </table>
              </div>
            </div>
            <p class="budget-note">Sale income is linked to Budgeting automatically. Editing one production record updates its linked income instead of creating a duplicate.</p>
          ` : emptyState("No production matches these report filters.", "Change the date or product filters, or add an egg, milk, broiler, hay, or custom-product record.")}
        </section>
    
        <section class="panel" style="margin-bottom:18px">
          <div class="panel-header">
            <div>
              <h3>Annual planned budget</h3>
              <small>${annualYear}${speciesFilter ? ` · ${esc(speciesFilter)}` : ""} · separate from actual transactions</small>
            </div>
            <div class="action-row">
              <span class="badge">${annualPlans.length} plan record${annualPlans.length === 1 ? "" : "s"}</span>
              ${annualPlans.length
                ? '<button class="button button-ghost button-small" id="clear-annual-budget">Remove shown plan</button>'
                : ""}
            </div>
          </div>
          ${annualPlans.length ? `
            <div class="stats-grid" style="margin-bottom:14px">
              ${statCard("Planned expenses", formatMoney(annualSummary.expenses), `${annualYear} annual`)}
              ${statCard("Projected income", formatMoney(annualSummary.income), `${annualYear} annual`)}
              ${statCard("Projected net", formatMoney(annualSummary.net), "Income minus planned expenses")}
            </div>
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>Type</th><th>Category</th><th>Planned amount</th></tr></thead>
                <tbody>${annualCategoryRows.map((row) => `
                  <tr>
                    <td><span class="badge ${row.type === "Income" ? "green" : ""}">${esc(row.type)}</span></td>
                    <td>${esc(row.category)}</td>
                    <td><strong>${formatMoney(row.amount)}</strong></td>
                  </tr>`).join("")}</tbody>
              </table>
            </div>
            <p class="budget-note">These figures are annual plans only. They do not create dated income or expense transactions and do not affect actual results or cost per head.</p>
          ` : emptyState(`No annual plan for ${annualYear}.`, "Import an Annual Budget sheet from Settings to add yearly planned figures.")}
        </section>
    
        <div class="budget-layout">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h3>${isYearView ? "Yearly budget" : "Monthly budget"}</h3>
                <small>${periodLabel}${speciesFilter ? ` · ${esc(speciesFilter)}` : ""}</small>
              </div>
              <span class="badge ${plannedTotal > 0 && summary.operating > plannedTotal ? "danger" : "green"}">
                ${plannedTotal > 0 ? `${formatMoney(summary.operating)} of ${formatMoney(plannedTotal)}` : "No plan set"}
              </span>
            </div>
    
            <div class="budget-meter" aria-label="${isYearView ? "Yearly" : "Monthly"} budget progress">
              <span class="${plannedTotal > 0 && summary.operating > plannedTotal ? "over" : ""}" style="width:${progressPercent}%"></span>
            </div>
    
            <p class="budget-note">
              ${plannedTotal > 0
                ? `${formatMoney(Math.abs(plannedTotal - summary.operating))} ${summary.operating > plannedTotal ? "over" : "remaining in"} the operating budget.`
                : "Set category budgets to compare planned and actual operating expenses."}
              ${isYearView ? " Yearly planned totals are the sum of the monthly budgets entered for this year." : ""}
              ${!speciesFilter && isYearView && yearlyHeadCountOverrideCount
                ? ` Cost per head uses the average of ${yearlyHeadCountOverrideCount} monthly head-count override${yearlyHeadCountOverrideCount === 1 ? "" : "s"}.`
                : !speciesFilter && monthSetting.averageHeadCount
                  ? ` Cost per head uses an average head-count override of ${esc(monthSetting.averageHeadCount)}.`
                : !speciesFilter
                  ? ` Cost per head currently uses the active animal count; ${isYearView ? "monthly head-count overrides can be added under Set budget and will be averaged for the year" : "an average monthly head count can be entered under Set budget"}.`
                  : ""}
            </p>
    
            <div class="budget-progress-card" style="margin-top:14px">
              ${categories.length ? categories.map((category) => {
                const planned = Number(planByCategory[category] || 0);
                const actual = Number(actualByCategory[category] || 0);
                const percent = planned > 0 ? Math.min(100, (actual / planned) * 100) : (actual > 0 ? 100 : 0);
                const matchingPlans = plans.filter((plan) => plan.category === category);
                return `
                  <div class="budget-progress-row">
                    <div class="budget-progress-meta">
                      <strong>${esc(category)}</strong>
                      <span>${planned > 0 ? `${formatMoney(planned - actual)} variance` : "No category budget"}</span>
                    </div>
                    <div class="budget-meter">
                      <span class="${planned > 0 && actual > planned ? "over" : ""}" style="width:${percent}%"></span>
                    </div>
                    <div class="budget-progress-value">
                      ${formatMoney(actual)} / ${formatMoney(planned)}
                      ${matchingPlans.length && !isYearView ? `<button class="button button-ghost button-small" data-delete-budget-plan="${matchingPlans[0].id}" title="Remove budget">×</button>` : ""}
                    </div>
                  </div>`;
              }).join("") : emptyState("No budget activity yet.", "Set a budget or add an operating expense.")}
            </div>
          </section>
    
          <section class="panel">
            <div class="panel-header">
              <div>
                <h3>Cost per head by species</h3>
                <small>Operating expenses only</small>
              </div>
            </div>
            ${speciesRows.length ? `
              <div class="cost-table">
                <div class="cost-row header"><span>Species</span><span>Head</span><span>Total cost</span><span>Per head</span></div>
                ${speciesRows.map((row) => `
                  <div class="cost-row">
                    <strong>${esc(row.species)}</strong>
                    <span>${row.count}</span>
                    <span>${formatMoney(row.total)}</span>
                    <span><strong>${formatMoney(row.perHead)}</strong></span>
                  </div>`).join("")}
              </div>
              <p class="budget-note">Whole-operation costs are allocated by current head count. Species and animal expenses are allocated directly.</p>
            ` : emptyState("No active livestock found.", "Add active animals to calculate cost per head.")}
          </section>
        </div>
    
        ${isYearView ? `
          <section class="panel" style="margin-bottom:18px">
            <div class="panel-header">
              <div>
                <h3>${annualYear} monthly breakdown</h3>
                <small>January through December actual results${speciesFilter ? ` · ${esc(speciesFilter)}` : ""}</small>
              </div>
            </div>
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>Month</th><th>Income</th><th>Operating expenses</th><th>Capital expenses</th><th>Net</th></tr></thead>
                <tbody>${yearlyRows.map((row) => `
                  <tr>
                    <td><strong>${monthLabel(row.monthKey)}</strong></td>
                    <td class="transaction-amount income">${formatMoney(row.income)}</td>
                    <td class="transaction-amount expense">${formatMoney(row.operating)}</td>
                    <td>${formatMoney(row.capital)}</td>
                    <td class="transaction-amount ${row.net >= 0 ? "income" : "expense"}">${formatMoney(row.net)}</td>
                  </tr>`).join("")}</tbody>
              </table>
            </div>
          </section>
        ` : ""}
    
        <section class="panel" style="margin-bottom:18px">
          <div class="panel-header">
            <div>
              <h3>Estimated cost by animal</h3>
              <small>Direct costs plus allocated operation and species costs</small>
            </div>
          </div>
          ${animalRows.length ? `
            <div class="cost-table">
              <div class="cost-row header"><span>Animal</span><span>Direct</span><span>Allocated</span><span>Total</span></div>
              ${animalRows.map((row) => `
                <div class="cost-row">
                  <strong>${esc(row.animal.name)}</strong>
                  <span>${formatMoney(row.direct)}</span>
                  <span>${formatMoney(row.allocated)}</span>
                  <span><strong>${formatMoney(row.total)}</strong></span>
                </div>`).join("")}
            </div>
            <p class="budget-note">These are management estimates, not tax accounting. Capital purchases are excluded from cost-per-head calculations.</p>
          ` : emptyState("No animals to calculate.", "Add active animals and expenses to see estimated costs.")}
        </section>
    
        <section class="panel">
          <div class="panel-header">
            <div>
              <h3>Transactions</h3>
              <small>${transactions.length} record${transactions.length === 1 ? "" : "s"}</small>
            </div>
          </div>
          ${transactions.length ? `
            ${speciesFilter ? '<p class="budget-note">Whole-operation transactions show their original amount below; summary calculations allocate them by active head count.</p>' : ""}
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Assigned to</th><th>Description</th><th>Amount</th><th></th></tr></thead>
                <tbody>${transactions.map((transaction) => `
                  <tr>
                    <td>${formatDate(transaction.date)}</td>
                    <td><span class="badge ${transaction.type === "Income" ? "green" : transaction.classification === "Capital" ? "warning" : ""}">${esc(transaction.type)}${transaction.classification === "Capital" ? " · Capital" : ""}</span></td>
                    <td>${esc(transaction.category || "—")}</td>
                    <td>${esc(transactionScopeLabel(transaction))}</td>
                    <td>${esc(transaction.description || transaction.party || "—")}</td>
                    <td class="transaction-amount ${transaction.type === "Income" ? "income" : "expense"}">${transaction.type === "Income" ? "+" : "−"}${formatMoney(transaction.amount)}</td>
                    <td><button class="button button-ghost button-small" data-edit-transaction="${transaction.id}">Edit</button></td>
                  </tr>`).join("")}</tbody>
              </table>
            </div>
          ` : emptyState("No matching transactions.", `Add income or expenses for ${isYearView ? "this year" : "this month"}.`)}
        </section>
      `;
    
      $("#budget-period").addEventListener("change", (event) => {
        budgetView.period = event.target.value === "Year" ? "Year" : "Month";
        if (budgetView.period === "Year") {
          budgetView.year = Number(String(budgetView.month || currentMonthKey()).slice(0, 4)) || budgetView.year;
        }
        const anchor = budgetView.period === "Year"
          ? `${budgetView.year}-07-01`
          : `${budgetView.month}-15`;
        const range = productionPeriodRange(budgetView.period, anchor);
        productionReportView.period = budgetView.period;
        productionReportView.start = range.start;
        productionReportView.end = range.end;
        renderBudget();
      });
      $("#budget-month")?.addEventListener("change", (event) => {
        budgetView.month = event.target.value || currentMonthKey();
        budgetView.year = Number(budgetView.month.slice(0, 4)) || budgetView.year;
        if (productionReportView.period === "Month") {
          const range = productionPeriodRange("Month", `${budgetView.month}-15`);
          productionReportView.start = range.start;
          productionReportView.end = range.end;
        }
        renderBudget();
      });
      $("#budget-year")?.addEventListener("change", (event) => {
        budgetView.year = Number(event.target.value) || new Date().getFullYear();
        const month = String(budgetView.month || currentMonthKey()).slice(5, 7) || "01";
        budgetView.month = `${budgetView.year}-${month}`;
        const range = productionPeriodRange("Year", `${budgetView.year}-07-01`);
        productionReportView.period = "Year";
        productionReportView.start = range.start;
        productionReportView.end = range.end;
        renderBudget();
      });
      $("#budget-species").addEventListener("change", (event) => {
        budgetView.species = event.target.value;
        renderBudget();
      });
      $("#budget-view").addEventListener("change", (event) => {
        budgetView.expenseView = event.target.value;
        renderBudget();
      });
      $("#add-expense").addEventListener("click", () => openTransactionForm("", "Expense"));
      $("#add-income").addEventListener("click", () => openTransactionForm("", "Income"));
      $("#add-production").addEventListener("click", () => openProductionForm());
      $("#add-production-panel").addEventListener("click", () => openProductionForm());
      $$('[data-quick-production]', $("#view-budget")).forEach((button) =>
        button.addEventListener("click", () => openProductionForm("", { product: button.dataset.quickProduction })));
      $("#repeat-last-production").addEventListener("click", () => {
        const latest = latestProductionRecord();
        if (latest) openProductionForm("", { repeatId: latest.id });
      });
      $$('[data-production-period]', $("#view-budget")).forEach((button) =>
        button.addEventListener("click", () => {
          const period = button.dataset.productionPeriod;
          productionReportView.period = period;
          if (period === "All") {
            productionReportView.start = "";
            productionReportView.end = "";
          } else {
            const range = productionPeriodRange(period, todayISO());
            productionReportView.start = range.start;
            productionReportView.end = range.end;
          }
          renderBudget();
        }));
      $("#production-report-start").addEventListener("change", (event) => {
        productionReportView.start = event.target.value;
        if (productionReportView.end && productionReportView.start > productionReportView.end) {
          productionReportView.end = productionReportView.start;
        }
        productionReportView.period = "Custom";
        renderBudget();
      });
      $("#production-report-end").addEventListener("change", (event) => {
        productionReportView.end = event.target.value;
        if (productionReportView.start && productionReportView.end < productionReportView.start) {
          productionReportView.start = productionReportView.end;
        }
        productionReportView.period = "Custom";
        renderBudget();
      });
      $("#production-report-product").addEventListener("change", (event) => {
        productionReportView.product = event.target.value;
        renderBudget();
      });
      $("#production-report-species").addEventListener("change", (event) => {
        productionReportView.species = event.target.value;
        if (productionReportView.animalId) {
          const selectedAnimal = stateNow().animals.find((animal) => animal.id === productionReportView.animalId);
          if (selectedAnimal?.species !== productionReportView.species) productionReportView.animalId = "";
        }
        renderBudget();
      });
      $("#production-report-animal").addEventListener("change", (event) => {
        productionReportView.animalId = event.target.value;
        const selectedAnimal = stateNow().animals.find((animal) => animal.id === event.target.value);
        if (selectedAnimal) productionReportView.species = selectedAnimal.species || productionReportView.species;
        renderBudget();
      });
      $("#production-report-group").addEventListener("change", (event) => {
        productionReportView.groupBy = event.target.value;
        renderBudget();
      });
      $("#clear-production-filters").addEventListener("click", () => {
        productionReportView.product = "";
        productionReportView.species = "";
        productionReportView.animalId = "";
        renderBudget();
      });
      $("#print-production-report").addEventListener("click", () => printProductionReport(productionRecords));
      $("#download-production-report").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Preparing Excel…";
        try {
          const spreadsheet = await ensureSpreadsheetToolsReady();
          await spreadsheet.downloadProductionReport({
            records: productionRecords,
            summaryRows: productionRows,
            timelineRows: productionTimeline,
            comparisonRows: productionComparisons,
            warnings: productionAlerts,
            animals: stateNow().animals
          }, {
            operationName: stateNow().profile?.operationName || "HerdHarbor",
            start: productionReportView.start,
            end: productionReportView.end,
            rangeLabel: productionRangeLabel(),
            groupBy: productionReportView.groupBy,
            product: productionReportView.product,
            species: productionReportView.species,
            animal: productionReportView.animalId ? animalName(productionReportView.animalId) : ""
          });
          toast("Production report downloaded.", "success");
        } catch (error) {
          toast(error?.message || "The production report could not be downloaded.", "error");
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
      $("#set-budget-plan").addEventListener("click", () => openBudgetPlanForm(monthKey, speciesFilter));
      $("#export-budget-csv").addEventListener("click", () => exportBudgetCsv(periodKey, speciesFilter));
      $("#clear-annual-budget")?.addEventListener("click", () => {
        const selectedIds = new Set(annualPlans.map((plan) => plan.id));
        if (!confirm(
          `Remove ${annualPlans.length} annual plan record${annualPlans.length === 1 ? "" : "s"} for ${annualYear}` +
          `${speciesFilter ? ` and ${speciesFilter}` : ""}? Actual transactions will not be changed.`
        )) return;
        stateNow().annualBudgetPlans = stateNow().annualBudgetPlans.filter((plan) => !selectedIds.has(plan.id));
        saveState("Annual plan removed.");
        renderBudget();
      });
      $$("[data-edit-transaction]", $("#view-budget")).forEach((button) =>
        button.addEventListener("click", () => openTransactionForm(button.dataset.editTransaction)));
      $$("[data-edit-production]", $("#view-budget")).forEach((button) =>
        button.addEventListener("click", () => openProductionForm(button.dataset.editProduction)));
      $$("[data-repeat-production]", $("#view-budget")).forEach((button) =>
        button.addEventListener("click", () => openProductionForm("", { repeatId: button.dataset.repeatProduction })));
      $$("[data-production-history]", $("#view-budget")).forEach((button) =>
        button.addEventListener("click", () => {
          productionReportView.animalId = button.dataset.productionHistory;
          productionReportView.product = button.dataset.productionHistoryProduct || "";
          const animal = stateNow().animals.find((item) => item.id === productionReportView.animalId);
          productionReportView.species = animal?.species || "";
          renderBudget();
        }));
      $$("[data-delete-budget-plan]", $("#view-budget")).forEach((button) =>
        button.addEventListener("click", () => {
          if (!confirm("Remove this category budget?")) return;
          stateNow().budgetPlans = stateNow().budgetPlans.filter((plan) => plan.id !== button.dataset.deleteBudgetPlan);
          saveState("Budget removed.");
          renderBudget();
        }));
    }
    
    function transactionCategoryOptions(type, selected = "") {
      const categories = type === "Income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      const choices = selected && !categories.some((category) => category === selected)
        ? [...categories, selected]
        : categories;
      return choices.map((category) =>
        `<option value="${esc(category)}" ${category === selected ? "selected" : ""}>${esc(category)}</option>`
      ).join("");
    }
    
    function openProductionForm(id = "", options = {}) {
      const existingRecord = stateNow().productionRecords.find((item) => item.id === id);
      if (id && !existingRecord) {
        toast("The source production record could not be found. The income transaction was not changed.", "error");
        return;
      }
      const repeatSource = options.repeatId
        ? stateNow().productionRecords.find((item) => item.id === options.repeatId)
        : null;
      if (options.repeatId && !repeatSource) {
        toast("The production entry to repeat could not be found.", "error");
        return;
      }
      const record = existingRecord || productionDraft(options.product || "Eggs", repeatSource);
      const productKind = PRODUCTION_PRODUCTS.includes(record.product) ? record.product : "Other";
      const customProduct = productKind === "Other" && record.product !== "Other" ? record.product : "";
    
      const numberField = (label, name, value = "", idAttribute = "") => `
        <label ${idAttribute ? `id="${idAttribute}"` : ""}>${esc(label)}
          <input type="number" name="${name}" value="${esc(value ?? "")}" min="0" step="0.01">
        </label>`;
    
      openModal(id ? "Edit production record" : repeatSource ? "Repeat production entry" : "Add production record", `
        <form id="production-form">
          <div class="form-grid two">
            ${field("Date", "date", record.date || todayISO(), true, "date")}
            <label>Product
              <select name="productKind" id="production-product" required>
                ${PRODUCTION_PRODUCTS.map((product) =>
                  `<option value="${product}" ${product === productKind ? "selected" : ""}>${product}</option>`
                ).join("")}
              </select>
            </label>
            <label id="production-custom-product">Product name
              <input type="text" name="customProduct" value="${esc(customProduct)}" placeholder="Honey, fiber, produce, or another product">
            </label>
            ${selectField("Assign to", "scope", ["Operation", "Species", "Animal"], record.scope || "Species", true)}
            <label id="production-species-field">Species
              <select name="species" id="production-species">
                <option value="">Choose species</option>
                ${stateNow().settings.species.map((species) =>
                  `<option value="${esc(species)}" ${species === record.species ? "selected" : ""}>${esc(species)}</option>`
                ).join("")}
              </select>
            </label>
            <label id="production-animal-field">Animal
              <select name="animalId" id="production-animal">
                <option value="">Choose animal</option>
                ${activeAnimals().map((animal) =>
                  `<option value="${animal.id}" data-species="${esc(animal.species || "")}" ${animal.id === record.animalId ? "selected" : ""}>${esc(animal.name)} · ${esc(animal.species || "")}</option>`
                ).join("")}
              </select>
            </label>
            <label>Group / flock / herd / batch / field name
              <input type="text" name="groupName" value="${esc(record.groupName || "")}" placeholder="Layer flock, Jersey herd, Broiler batch 4, or North hay field">
            </label>
            <label id="production-session-field">Milking session
              <select name="session">
                ${["", "Morning", "Evening", "Combined", "Other"].map((session) =>
                  `<option value="${session}" ${session === (record.session || "") ? "selected" : ""}>${session || "Not specified"}</option>`
                ).join("")}
              </select>
            </label>
            <label>Unit
              <select name="unit" id="production-unit" required>
                ${PRODUCTION_UNITS.map((unit) =>
                  `<option value="${unit}" ${unit === (record.unit || "") ? "selected" : ""}>${unit}</option>`
                ).join("")}
              </select>
            </label>
            ${numberField("Total produced / collected", "quantity", record.quantity, "production-total-label")}
            ${numberField("Quantity sold", "soldQuantity", record.soldQuantity)}
            ${numberField("Household use", "householdQuantity", record.householdQuantity)}
            ${numberField("Fed to livestock / calves", "feedQuantity", record.feedQuantity)}
            ${numberField("Stored / set aside", "setAsideQuantity", record.setAsideQuantity, "production-set-aside-label")}
            ${numberField("Donated", "donatedQuantity", record.donatedQuantity)}
            ${numberField("Wasted / discarded", "wasteQuantity", record.wasteQuantity, "production-waste-label")}
            ${numberField("Sale income", "saleAmount", record.saleAmount)}
            <label id="production-weight-field">Broiler batch weight
              <input type="number" name="totalWeight" value="${esc(record.totalWeight ?? "")}" min="0" step="0.01">
            </label>
            <label id="production-weight-unit-field">Weight unit
              <select name="weightUnit">
                ${["lb", "kg"].map((unit) => `<option value="${unit}" ${unit === (record.weightUnit || "lb") ? "selected" : ""}>${unit}</option>`).join("")}
              </select>
            </label>
            ${field("Customer", "customer", record.customer)}
            ${field("Waste / discard reason", "wasteReason", record.wasteReason)}
          </div>
          ${textareaField("Notes", "notes", record.notes)}
          <p class="budget-note" id="production-help">Enter the total collected, then show how much was sold, used, stored, donated, or wasted. Unallocated production is allowed. Sale income creates one linked Budgeting transaction.</p>
          <div class="modal-actions">
            ${id ? `<button type="button" class="button button-danger" id="delete-production">Delete</button>` : ""}
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">${id ? "Save changes" : "Add production"}</button>
          </div>
        </form>
      `, "Farm production and sales");
    
      const form = $("#production-form");
      const productInput = $("#production-product");
      const customProductField = $("#production-custom-product");
      const scopeInput = $('[name="scope"]', form);
      const speciesInput = $("#production-species");
      const speciesField = $("#production-species-field");
      const animalInput = $("#production-animal");
      const animalField = $("#production-animal-field");
      const sessionField = $("#production-session-field");
      const weightField = $("#production-weight-field");
      const weightUnitField = $("#production-weight-unit-field");
      const unitInput = $("#production-unit");
      let unitWasChanged = Boolean(id || repeatSource);
      let speciesWasChanged = Boolean(id || repeatSource);
    
      const refreshAnimalOptions = () => {
        const desiredSpecies = speciesInput.value;
        [...animalInput.options].forEach((option, index) => {
          if (index === 0) return;
          option.hidden = Boolean(desiredSpecies) && option.dataset.species !== desiredSpecies;
        });
        const selected = animalInput.selectedOptions[0];
        if (selected?.hidden) animalInput.value = "";
      };
    
      const refreshProductionFields = (applyDefaults = false) => {
        const product = productInput.value;
        const defaults = PRODUCTION_DEFAULTS[product] || PRODUCTION_DEFAULTS.Other;
        customProductField.classList.toggle("hidden", product !== "Other");
        sessionField.classList.toggle("hidden", product !== "Milk");
        weightField.classList.toggle("hidden", product !== "Broilers");
        weightUnitField.classList.toggle("hidden", product !== "Broilers");
        if (applyDefaults && !unitWasChanged) unitInput.value = defaults.unit;
        if (applyDefaults && !speciesWasChanged && defaults.species) speciesInput.value = defaults.species;
        $("#production-total-label").firstChild.textContent = product === "Milk"
          ? "Total milk produced"
          : product === "Eggs"
            ? "Total eggs collected"
            : product === "Broilers"
              ? "Total birds processed / available"
              : product === "Hay"
                ? "Total hay harvested / available"
              : "Total produced / collected";
        $("#production-set-aside-label").firstChild.textContent = product === "Eggs"
          ? "Hatching / set aside"
          : product === "Broilers"
            ? "Frozen / stored"
            : product === "Hay"
              ? "Baled / stored"
            : "Stored / set aside";
        $("#production-waste-label").firstChild.textContent = product === "Broilers"
          ? "Loss / condemned"
          : product === "Hay"
            ? "Spoiled / damaged"
          : "Wasted / discarded";
        refreshAnimalOptions();
      };
    
      const refreshScopeFields = () => {
        speciesField.classList.toggle("hidden", scopeInput.value === "Operation");
        animalField.classList.toggle("hidden", scopeInput.value !== "Animal");
        refreshAnimalOptions();
      };
    
      productInput.addEventListener("change", () => refreshProductionFields(true));
      unitInput.addEventListener("change", () => { unitWasChanged = true; });
      speciesInput.addEventListener("change", () => {
        speciesWasChanged = true;
        refreshAnimalOptions();
      });
      scopeInput.addEventListener("change", refreshScopeFields);
      refreshProductionFields(false);
      refreshScopeFields();
    
      $("#cancel-modal").addEventListener("click", closeModal);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const numericFields = [
          "quantity", "soldQuantity", "householdQuantity", "feedQuantity",
          "setAsideQuantity", "donatedQuantity", "wasteQuantity", "saleAmount", "totalWeight"
        ];
        const numbers = {};
        for (const fieldName of numericFields) {
          const value = data[fieldName] === "" ? 0 : Number(data[fieldName]);
          if (!Number.isFinite(value) || value < 0) {
            toast("Production quantities and sale income cannot be negative.", "error");
            return;
          }
          numbers[fieldName] = value;
        }
        if (!(numbers.quantity > 0)) {
          toast("Enter a total produced or collected greater than zero.", "error");
          return;
        }
        const allocated = numbers.soldQuantity + numbers.householdQuantity + numbers.feedQuantity +
          numbers.setAsideQuantity + numbers.donatedQuantity + numbers.wasteQuantity;
        if (allocated > numbers.quantity + 0.0001) {
          toast(`Allocated quantities total ${formatQuantity(allocated, data.unit)}, which is more than the ${formatQuantity(numbers.quantity, data.unit)} produced.`, "error");
          return;
        }
        if (numbers.saleAmount > 0 && !(numbers.soldQuantity > 0)) {
          toast("Enter a quantity sold before adding sale income.", "error");
          return;
        }
        if (data.productKind === "Other" && !String(data.customProduct || "").trim()) {
          toast("Enter the farm product name.", "error");
          return;
        }
        if (data.scope === "Animal" && !data.animalId) {
          toast("Choose an animal for this production record.", "error");
          return;
        }
        if (data.scope !== "Operation" && !data.species) {
          toast("Choose a species for this production record.", "error");
          return;
        }
    
        const previousState = structuredClone(stateNow());
        const now = new Date().toISOString();
        const savedRecord = {
          ...(existingRecord || {}),
          id: existingRecord?.id || uid("production"),
          date: data.date,
          product: data.productKind === "Other" ? String(data.customProduct).trim() : data.productKind,
          scope: data.scope,
          species: data.scope === "Operation"
            ? ""
            : data.scope === "Animal"
              ? stateNow().animals.find((animal) => animal.id === data.animalId)?.species || data.species
              : data.species,
          animalId: data.scope === "Animal" ? data.animalId : "",
          groupName: String(data.groupName || "").trim(),
          session: data.productKind === "Milk" ? data.session || "" : "",
          unit: data.unit,
          quantity: String(numbers.quantity),
          soldQuantity: String(numbers.soldQuantity),
          householdQuantity: String(numbers.householdQuantity),
          feedQuantity: String(numbers.feedQuantity),
          setAsideQuantity: String(numbers.setAsideQuantity),
          donatedQuantity: String(numbers.donatedQuantity),
          wasteQuantity: String(numbers.wasteQuantity),
          saleAmount: numbers.saleAmount.toFixed(2),
          totalWeight: data.productKind === "Broilers" && numbers.totalWeight > 0 ? String(numbers.totalWeight) : "",
          weightUnit: data.productKind === "Broilers" && numbers.totalWeight > 0 ? data.weightUnit || "lb" : "",
          customer: String(data.customer || "").trim(),
          wasteReason: String(data.wasteReason || "").trim(),
          notes: String(data.notes || "").trim(),
          createdAt: existingRecord?.createdAt || now,
          updatedAt: now
        };
    
        const persistedRecord = existingRecord
          ? Object.assign(existingRecord, savedRecord)
          : savedRecord;
        if (!existingRecord) stateNow().productionRecords.push(persistedRecord);
        syncProductionIncome(persistedRecord);
        recordActivity(
          `${id ? "Updated" : "Added"} ${persistedRecord.product} production: ${formatQuantity(persistedRecord.quantity, persistedRecord.unit)}.`,
          "production"
        );
        if (!saveState(id ? "Production record updated." : "Production record added.")) {
          replaceState(previousState);
          return;
        }
        closeModal();
        renderBudget();
      });
    
      $("#delete-production")?.addEventListener("click", () => {
        if (!confirm("Delete this production record and its linked sale income, if any?")) return;
        const previousState = structuredClone(stateNow());
        stateNow().productionRecords = stateNow().productionRecords.filter((item) => item.id !== id);
        stateNow().transactions = stateNow().transactions.filter((transaction) =>
          transaction.id !== record.transactionId &&
          !(transaction.sourceType === "production" && transaction.sourceId === id)
        );
        if (!saveState("Production record deleted.")) {
          replaceState(previousState);
          return;
        }
        closeModal();
        renderBudget();
      });
    }
    
    function openTransactionForm(id = "", defaultType = "Expense") {
      const existingTransaction = stateNow().transactions.find((item) => item.id === id);
      if (existingTransaction?.sourceType === "production" && existingTransaction.sourceId) {
        openProductionForm(existingTransaction.sourceId);
        return;
      }
      if (existingTransaction?.sourceType === "sale-payment" && existingTransaction.sourceId) {
        const payment = stateNow().payments.find((record) => record.id === existingTransaction.sourceId);
        if (payment) openPaymentForm(payment.saleId, payment.id);
        else toast("The linked sale payment could not be found.", "error");
        return;
      }
      const transaction = existingTransaction || {
        type: defaultType,
        date: todayISO(),
        classification: "Operating",
        scope: "Operation",
        amount: "",
        category: defaultType === "Income" ? "Animal Sales" : "Feed"
      };
    
      openModal(id ? "Edit transaction" : `Add ${defaultType.toLowerCase()}`, `
        <form id="transaction-form">
          <div class="form-grid two">
            ${selectField("Type", "type", ["Expense", "Income"], transaction.type || defaultType, true)}
            ${field("Date", "date", transaction.date || todayISO(), true, "date")}
            ${field("Amount", "amount", transaction.amount, true, "number")}
            <label>Category
              <select name="category" id="transaction-category" required>
                ${transactionCategoryOptions(transaction.type || defaultType, transaction.category)}
              </select>
            </label>
            <label id="classification-field">Expense classification
              <select name="classification">
                <option value="Operating" ${transaction.classification !== "Capital" ? "selected" : ""}>Operating expense</option>
                <option value="Capital" ${transaction.classification === "Capital" ? "selected" : ""}>Capital purchase</option>
              </select>
            </label>
            ${selectField("Assign to", "scope", ["Operation", "Species", "Animal"], transaction.scope || "Operation", true)}
            <label id="transaction-species-field">Species
              <select name="species">
                <option value="">Choose species</option>
                ${stateNow().settings.species.map((species) =>
                  `<option value="${esc(species)}" ${species === transaction.species ? "selected" : ""}>${esc(species)}</option>`
                ).join("")}
              </select>
            </label>
            <label id="transaction-animal-field">Animal
              <select name="animalId">
                <option value="">Choose animal</option>
                ${activeAnimals().map((animal) =>
                  `<option value="${animal.id}" ${animal.id === transaction.animalId ? "selected" : ""}>${esc(animal.name)} · ${esc(animal.species || "")}</option>`
                ).join("")}
              </select>
            </label>
            ${field("Vendor / customer", "party", transaction.party)}
            ${field("Description", "description", transaction.description)}
          </div>
          ${textareaField("Notes", "notes", transaction.notes)}
          <p class="budget-note">Operating expenses affect cost per head. Capital purchases are tracked in net results but excluded from cost-per-head calculations.</p>
          <div class="modal-actions">
            ${id ? `<button type="button" class="button button-danger" id="delete-transaction">Delete</button>` : ""}
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">${id ? "Save changes" : "Add transaction"}</button>
          </div>
        </form>
      `, "Budget record");
    
      const typeInput = $('[name="type"]');
      const categoryInput = $("#transaction-category");
      const classificationField = $("#classification-field");
      const scopeInput = $('[name="scope"]');
      const speciesField = $("#transaction-species-field");
      const animalField = $("#transaction-animal-field");
    
      const refreshTypeFields = () => {
        const type = typeInput.value;
        const currentCategory = categoryInput.value;
        categoryInput.innerHTML = transactionCategoryOptions(type, currentCategory);
        classificationField.classList.toggle("hidden", type === "Income");
      };
    
      const refreshScopeFields = () => {
        speciesField.classList.toggle("hidden", scopeInput.value !== "Species");
        animalField.classList.toggle("hidden", scopeInput.value !== "Animal");
      };
    
      typeInput.addEventListener("change", refreshTypeFields);
      scopeInput.addEventListener("change", refreshScopeFields);
      refreshTypeFields();
      refreshScopeFields();
    
      $("#cancel-modal").addEventListener("click", closeModal);
      $("#transaction-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const amount = Number(data.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast("Enter an amount greater than zero.", "error");
          return;
        }
    
        data.amount = amount.toFixed(2);
        if (data.type === "Income") data.classification = "";
        if (data.scope !== "Species") data.species = "";
        if (data.scope !== "Animal") data.animalId = "";
        if (data.scope === "Animal" && !data.animalId) {
          toast("Choose an animal for an animal-assigned transaction.", "error");
          return;
        }
        if (data.scope === "Species" && !data.species) {
          toast("Choose a species for a species-assigned transaction.", "error");
          return;
        }
        if (data.scope === "Animal") {
          data.species = stateNow().animals.find((animal) => animal.id === data.animalId)?.species || "";
        }
    
        if (id) Object.assign(transaction, data, { updatedAt: new Date().toISOString() });
        else stateNow().transactions.push({ id: uid("transaction"), ...data, createdAt: new Date().toISOString() });
    
        recordActivity(`${id ? "Updated" : "Added"} ${data.type.toLowerCase()}: ${data.category} ${formatMoney(data.amount)}.`, "budget");
        saveState(id ? "Transaction updated." : "Transaction added.");
        closeModal();
        renderCurrentView();
      });
    
      $("#delete-transaction")?.addEventListener("click", () => {
        if (!confirm("Delete this transaction?")) return;
        stateNow().transactions = stateNow().transactions.filter((item) => item.id !== id);
        saveState("Transaction deleted.");
        closeModal();
        renderCurrentView();
      });
    }
    
    function openBudgetPlanForm(monthKey = currentMonthKey(), speciesFilter = "") {
      const setting = stateNow().budgetMonthSettings?.[monthKey] || {};
      openModal("Set monthly budget", `
        <form id="budget-plan-form">
          <div class="form-grid two">
            <label>Month
              <input type="month" name="month" value="${esc(monthKey)}" required>
            </label>
            <label>Species budget
              <select name="species">
                <option value="">Whole operation</option>
                ${stateNow().settings.species.map((species) =>
                  `<option value="${esc(species)}" ${species === speciesFilter ? "selected" : ""}>${esc(species)}</option>`
                ).join("")}
              </select>
            </label>
            <label>Expense category
              <select name="category" required>
                ${EXPENSE_CATEGORIES.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}
              </select>
            </label>
            ${field("Planned amount", "amount", "", true, "number")}
            ${field("Average total active head count (whole operation only)", "averageHeadCount", setting.averageHeadCount || "", false, "number")}
          </div>
          <p class="budget-note">Entering the same month, species, and category again updates that budget. The optional head count affects whole-operation cost per head for the selected month.</p>
          <div class="modal-actions">
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">Save budget</button>
          </div>
        </form>
      `, "Monthly planning");
    
      $("#cancel-modal").addEventListener("click", closeModal);
      $("#budget-plan-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const amount = Number(data.amount);
        if (!Number.isFinite(amount) || amount < 0) {
          toast("Enter a valid planned amount.", "error");
          return;
        }
    
        const existing = stateNow().budgetPlans.find((plan) =>
          plan.month === data.month &&
          plan.species === data.species &&
          plan.category === data.category
        );
        if (existing) {
          existing.amount = amount.toFixed(2);
          existing.updatedAt = new Date().toISOString();
        } else {
          stateNow().budgetPlans.push({
            id: uid("budget"),
            month: data.month,
            species: data.species,
            category: data.category,
            amount: amount.toFixed(2),
            createdAt: new Date().toISOString()
          });
        }
    
        const averageHeadCount = Number(data.averageHeadCount || 0);
        if (!data.species) {
          stateNow().budgetMonthSettings[data.month] = {
            ...(stateNow().budgetMonthSettings[data.month] || {}),
            averageHeadCount: averageHeadCount > 0 ? averageHeadCount : ""
          };
        }
    
        budgetView.month = data.month;
        budgetView.species = data.species;
        recordActivity(`Set ${data.category} budget for ${monthLabel(data.month)}.`, "budget");
        saveState("Budget saved.");
        closeModal();
        renderBudget();
      });
    }
    
    function printProductionReport(records) {
      const summaryRows = productionSummaryRows(records);
      const comparisonRows = productionComparisonRows(records);
      const warnings = productionWarnings(records);
      const reportWindow = root.open("", "_blank");
      if (!reportWindow) {
        toast("Allow pop-ups for HerdHarbor to print this report.", "error");
        return;
      }
      reportWindow.opener = null;
      const operationName = stateNow().profile?.operationName || "HerdHarbor";
      const filterNotes = [
        productionReportView.product && `Product: ${productionReportView.product}`,
        productionReportView.species && `Species: ${productionReportView.species}`,
        productionReportView.animalId && `Animal: ${animalName(productionReportView.animalId)}`
      ].filter(Boolean).join(" · ");
      reportWindow.document.write(`<!doctype html>
        <html lang="en"><head><meta charset="utf-8"><title>${esc(operationName)} Production Report</title>
        <style>
          body{margin:32px;color:#182536;font-family:Arial,sans-serif}h1{margin:0;color:#0D2540}p{color:#647181}
          .meta{margin:8px 0 22px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
          .metric{padding:12px;border:1px solid #d6dde1;border-radius:10px}.metric strong,.metric span{display:block}.metric span{margin-top:4px;font-size:20px;color:#0D2540}
          table{width:100%;margin:12px 0 24px;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #d6dde1;text-align:left;font-size:12px;vertical-align:top}
          th{color:#647181;font-size:10px;text-transform:uppercase}.warning{margin:8px 0;padding:10px;background:#f7e9cf;border:1px solid #e4c78f;border-radius:8px;font-size:12px}
          @media print{body{margin:12mm}.no-print{display:none}tr{break-inside:avoid}}
        </style></head><body>
        <h1>${esc(operationName)} Production &amp; Sales</h1>
        <p class="meta">${esc(productionRangeLabel())}${filterNotes ? ` · ${esc(filterNotes)}` : ""}<br>Prepared ${esc(new Date().toLocaleString())}</p>
        <div class="metrics">
          <div class="metric"><strong>Records</strong><span>${records.length.toLocaleString()}</span></div>
          <div class="metric"><strong>Revenue</strong><span>${esc(formatMoney(summaryRows.reduce((sum, row) => sum + row.revenue, 0)))}</span></div>
          <div class="metric"><strong>Warnings</strong><span>${warnings.length.toLocaleString()}</span></div>
        </div>
        ${warnings.map((warning) => `<div class="warning">${esc(warning.message)}</div>`).join("")}
        <h2>Product totals</h2>
        <table><thead><tr><th>Product</th><th>Produced</th><th>Sold</th><th>Used on farm / stored</th><th>Donated</th><th>Waste</th><th>Average price</th><th>Revenue</th></tr></thead>
        <tbody>${summaryRows.map((row) => `<tr><td>${esc(row.product)}</td><td>${esc(formatQuantity(row.produced,row.unit))}</td><td>${esc(formatQuantity(row.sold,row.unit))}</td><td>${esc(formatQuantity(row.farmUse,row.unit))}</td><td>${esc(formatQuantity(row.donated,row.unit))}</td><td>${esc(formatQuantity(row.waste,row.unit))} · ${(row.wasteRate*100).toFixed(1)}%</td><td>${row.sold>0?`${esc(formatMoney(row.averagePrice))} / ${esc(row.unit)}`:"—"}</td><td>${esc(formatMoney(row.revenue))}</td></tr>`).join("")}</tbody></table>
        <h2>Animal, flock, herd, and batch comparison</h2>
        <table><thead><tr><th>Animal / group</th><th>Type</th><th>Product</th><th>Produced</th><th>Sold</th><th>Waste</th><th>Revenue</th></tr></thead>
        <tbody>${comparisonRows.map((row) => `<tr><td>${esc(row.label)}</td><td>${esc(row.kind)}</td><td>${esc(row.product)} · ${esc(row.unit)}</td><td>${esc(formatQuantity(row.produced,row.unit))}</td><td>${esc(formatQuantity(row.sold,row.unit))}</td><td>${esc(formatQuantity(row.waste,row.unit))} · ${(row.wasteRate*100).toFixed(1)}%</td><td>${esc(formatMoney(row.revenue))}</td></tr>`).join("")}</tbody></table>
        <h2>Detailed history</h2>
        <table><thead><tr><th>Date</th><th>Product</th><th>Animal / group</th><th>Produced</th><th>Sold</th><th>Used on farm</th><th>Waste</th><th>Revenue</th></tr></thead>
        <tbody>${records.map((record) => `<tr><td>${esc(formatDate(record.date))}</td><td>${esc(record.product||"Other")}</td><td>${esc(record.groupName||productionScopeLabel(record))}</td><td>${esc(formatQuantity(record.quantity,record.unit))}</td><td>${esc(formatQuantity(record.soldQuantity,record.unit))}</td><td>${esc(formatQuantity(productionFarmUse(record),record.unit))}</td><td>${esc(formatQuantity(record.wasteQuantity,record.unit))}</td><td>${Number(record.saleAmount||0)>0?esc(formatMoney(record.saleAmount)):"—"}</td></tr>`).join("")}</tbody></table>
        </body></html>`);
      reportWindow.document.close();
      reportWindow.focus();
      setTimeout(() => reportWindow.print(), 250);
    }
    
    function exportBudgetCsv(monthKey, speciesFilter = "") {
      const rows = monthTransactions(monthKey).filter((transaction) =>
        !speciesFilter || transaction.scope === "Operation" || transactionSpecies(transaction) === speciesFilter
      );
      const headers = [
        "Date", "Type", "Classification", "Category", "Scope", "Species",
        "Animal", "Product", "Quantity Sold", "Unit", "Vendor or Customer",
        "Description", "Amount", "Notes"
      ];
      const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [
        headers.map(csvEscape).join(","),
        ...rows.map((transaction) => {
          const production = transaction.sourceType === "production"
            ? stateNow().productionRecords.find((record) => record.id === transaction.sourceId)
            : null;
          return [
            transaction.date,
            transaction.type,
            transaction.classification,
            transaction.category,
            transaction.scope,
            transactionSpecies(transaction),
            transaction.animalId ? animalName(transaction.animalId) : "",
            production?.product || "",
            production?.soldQuantity || "",
            production?.unit || "",
            transaction.party,
            transaction.description,
            Number(transaction.amount || 0).toFixed(2),
            transaction.notes
          ].map(csvEscape).join(",");
        })
      ].join("\n");
    
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = root.document.createElement("a");
      link.href = url;
      link.download = `herdharbor-budget-${monthKey}${speciesFilter ? `-${speciesFilter.toLowerCase().replaceAll(" ", "-")}` : ""}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast("Budget CSV downloaded.", "success");
    }
    
    

    return Object.freeze({
      VERSION,
      renderBudget,
      openProductionForm,
      openTransactionForm,
      syncProductionIncome,
      budgetPlansFor,
      budgetYears,
      yearlyActualRows,
      productionSpecies,
      productionFarmUse,
      productionPeriodRange,
      productionSummaryRows,
      productionTimelineRows,
      productionComparisonRows,
      productionWarnings,
      filterProductionRecords,
      latestProductionRecord,
      productionDraft,
      productionIncomeCategory,
      printProductionReport,
      exportBudgetCsv,
      getBudgetView: () => ({ ...budgetView }),
      getProductionReportView: () => ({ ...productionReportView })
    });
  }

  return Object.freeze({
    VERSION,
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    PRODUCTION_PRODUCTS,
    PRODUCTION_UNITS,
    PRODUCTION_DEFAULTS,
    create
  });
});
