(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborProfitabilityAnalytics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.8.3";
  const BUILD_ID = "profitability-production-analytics-1";
  const array = (source, key) => Array.isArray(source?.[key]) ? source[key] : [];
  const num = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  const sum = (values) => values.reduce((total, value) => total + (num(value) || 0), 0);
  const inRange = (date, options = {}) => {
    const value = String(date || "").slice(0, 10);
    if (!value) return false;
    if (options.start && value < options.start) return false;
    if (options.end && value > options.end) return false;
    return true;
  };
  const animalMap = (state) => new Map(array(state, "animals").map((animal) => [String(animal.id), animal]));

  function rawOperatingExpenses(state, options = {}) {
    return array(state, "transactions").filter((row) => {
      if (String(row.type || "").toLowerCase() !== "expense") return false;
      if (String(row.classification || "Operating").toLowerCase() === "capital") return false;
      return inRange(row.date, options);
    });
  }

  function operatingExpenses(state, options = {}) {
    const animals = animalMap(state);
    return rawOperatingExpenses(state, options).filter((row) => {
      if (!options.species) return true;
      if (row.scope === "Operation") return false;
      if (row.scope === "Species") return String(row.species || "") === String(options.species);
      if (row.scope === "Animal") return String(animals.get(String(row.animalId))?.species || row.species || "") === String(options.species);
      return false;
    });
  }

  function completedSales(state, options = {}) {
    return array(state, "sales").filter((sale) => {
      if (String(sale.status || "").toLowerCase() !== "completed") return false;
      const date = sale.completedAt || sale.saleDate || sale.date;
      return inRange(date, options);
    });
  }

  function saleItemValue(item = {}) {
    const unit = num(item.salePrice) ?? num(item.unitPrice) ?? 0;
    const quantity = num(item.quantity) ?? 1;
    return Math.max(0, unit * quantity);
  }

  function saleInvoicedTotal(sale = {}) {
    return Math.max(0, sum(array(sale, "items").map(saleItemValue)) - (num(sale.discount) || 0) + (num(sale.tax) || 0));
  }

  function saleItems(state, options = {}) {
    const animals = animalMap(state);
    return completedSales(state, options).flatMap((sale) => array(sale, "items").map((item) => ({
      sale,
      item,
      animal: animals.get(String(item.animalId || "")) || null,
      animalId: String(item.animalId || ""),
      value: saleItemValue(item)
    }))).filter((row) => !options.species || String(row.item.species || row.animal?.species || "") === String(options.species));
  }

  function paymentAllocations(state, options = {}) {
    const sales = new Map(completedSales(state, options).map((sale) => [String(sale.id), sale]));
    const rows = [];
    array(state, "payments").forEach((payment) => {
      if (!inRange(payment.date, options)) return;
      const sale = sales.get(String(payment.saleId || ""));
      if (!sale) return;
      const amount = Math.max(0, num(payment.amount) || 0);
      let animalId = "";
      let allocation = "unallocated";
      if (payment.saleItemId) {
        const item = array(sale, "items").find((row) => String(row.id || "") === String(payment.saleItemId));
        if (item?.animalId) {
          animalId = String(item.animalId);
          allocation = "sale-item";
        }
      } else {
        const animalItems = array(sale, "items").filter((item) => item.animalId);
        if (animalItems.length === 1) {
          animalId = String(animalItems[0].animalId);
          allocation = "single-item-sale";
        }
      }
      rows.push({ payment, sale, amount, animalId, allocation });
    });
    return rows;
  }

  function operationSummary(state, options = {}) {
    const expenses = operatingExpenses(state, options);
    const payments = paymentAllocations(state, options);
    const sales = completedSales(state, options);
    const excludedOperationCosts = options.species
      ? sum(rawOperatingExpenses(state, options).filter((row) => row.scope === "Operation").map((row) => row.amount))
      : 0;
    const recordedCosts = sum(expenses.map((row) => row.amount));
    const receivedRevenue = sum(payments.map((row) => row.amount));
    const invoicedRevenue = sum(sales.map(saleInvoicedTotal));
    const allocatedPayments = payments.filter((row) => row.animalId);
    const unallocatedRevenue = sum(payments.filter((row) => !row.animalId).map((row) => row.amount));
    const scopedCosts = expenses.filter((row) => row.scope === "Animal");
    const sharedCosts = expenses.filter((row) => row.scope !== "Animal");
    return {
      recordedCosts,
      receivedRevenue,
      invoicedRevenue,
      recordedNet: receivedRevenue - recordedCosts,
      expenseCount: expenses.length,
      paymentCount: payments.length,
      allocatedPaymentCount: allocatedPayments.length,
      unallocatedRevenue,
      directAnimalCosts: sum(scopedCosts.map((row) => row.amount)),
      sharedCosts: sum(sharedCosts.map((row) => row.amount)),
      excludedOperationCosts,
      allocationComplete: sharedCosts.length === 0 && excludedOperationCosts === 0 && unallocatedRevenue === 0,
      note: "Recorded net uses recorded received payments minus recorded operating expenses. It does not assume missing costs or unpaid invoices are zero."
    };
  }

  function animalRows(state, options = {}) {
    const animals = animalMap(state);
    const expenses = operatingExpenses(state, options);
    const payments = paymentAllocations(state, options);
    const sharedCostTotal = sum(expenses.filter((row) => row.scope !== "Animal").map((row) => row.amount)) +
      (options.species ? sum(rawOperatingExpenses(state, options).filter((row) => row.scope === "Operation").map((row) => row.amount)) : 0);
    const unallocatedRevenue = sum(payments.filter((row) => !row.animalId).map((row) => row.amount));
    const ids = new Set([
      ...expenses.filter((row) => row.scope === "Animal" && row.animalId).map((row) => String(row.animalId)),
      ...payments.filter((row) => row.animalId).map((row) => String(row.animalId))
    ]);
    return [...ids].map((id) => {
      const animal = animals.get(id) || { id, name: "Unknown animal", species: "" };
      if (options.species && String(animal.species || "") !== String(options.species)) return null;
      const directCost = sum(expenses.filter((row) => row.scope === "Animal" && String(row.animalId) === id).map((row) => row.amount));
      const receivedRevenue = sum(payments.filter((row) => row.animalId === id).map((row) => row.amount));
      const complete = sharedCostTotal === 0 && unallocatedRevenue === 0;
      return {
        animalId: id,
        animalName: animal.name || "Unknown animal",
        species: animal.species || "",
        directCost,
        receivedRevenue,
        recordedMargin: complete ? receivedRevenue - directCost : null,
        dataStatus: complete ? "complete recorded allocation" : "partial allocation",
        excludedSharedCosts: sharedCostTotal,
        excludedUnallocatedRevenue: unallocatedRevenue
      };
    }).filter(Boolean).sort((a, b) => b.receivedRevenue - a.receivedRevenue || b.directCost - a.directCost);
  }

  function litterAnimals(state, litter = {}) {
    const linked = new Set(array(litter, "offspringIds").map(String));
    const rows = new Map();
    array(state, "animals").forEach((animal) => {
      const id = String(animal.id || "");
      if (!id) return;
      if (linked.has(id) || String(animal.sourceBirthId || "") === String(litter.id || "")) rows.set(id, animal);
    });
    return [...rows.values()];
  }

  function litterParents(state, litter = {}) {
    const breeding = array(state, "breedings").find((row) => String(row.id || "") === String(litter.breedingId || ""));
    return {
      damId: String(litter.damId || breeding?.femaleId || ""),
      sireId: String(litter.sireId || breeding?.maleId || "")
    };
  }

  function litterRows(state, options = {}) {
    const byAnimal = new Map(animalRows(state, options).map((row) => [row.animalId, row]));
    const allExpenses = operatingExpenses(state, options);
    const sharedCosts = sum(allExpenses.filter((row) => row.scope !== "Animal").map((row) => row.amount)) +
      (options.species ? sum(rawOperatingExpenses(state, options).filter((row) => row.scope === "Operation").map((row) => row.amount)) : 0);
    const allPayments = paymentAllocations(state, options);
    const unallocatedRevenue = sum(allPayments.filter((row) => !row.animalId).map((row) => row.amount));
    return array(state, "litters").filter((litter) => inRange(litter.birthDate || litter.date, options)).map((litter) => {
      const offspring = litterAnimals(state, litter);
      if (options.species && offspring.length && !offspring.some((animal) => animal.species === options.species)) return null;
      const childRows = offspring.map((animal) => byAnimal.get(String(animal.id))).filter(Boolean);
      const parents = litterParents(state, litter);
      const directCost = sum(childRows.map((row) => row.directCost));
      const receivedRevenue = sum(childRows.map((row) => row.receivedRevenue));
      const complete = sharedCosts === 0 && unallocatedRevenue === 0;
      return {
        litterId: String(litter.id || ""),
        birthDate: String(litter.birthDate || litter.date || ""),
        damId: parents.damId,
        sireId: parents.sireId,
        offspringCount: offspring.length,
        directCost,
        receivedRevenue,
        recordedMargin: complete ? receivedRevenue - directCost : null,
        dataStatus: complete ? "complete recorded allocation" : "partial allocation",
        excludedSharedCosts: sharedCosts,
        excludedUnallocatedRevenue: unallocatedRevenue
      };
    }).filter(Boolean);
  }

  function pairRows(state, options = {}) {
    const groups = new Map();
    litterRows(state, options).forEach((row) => {
      if (!row.damId && !row.sireId) return;
      const key = row.damId + "|" + row.sireId;
      if (!groups.has(key)) groups.set(key, { damId: row.damId, sireId: row.sireId, litters: [] });
      groups.get(key).litters.push(row);
    });
    return [...groups.values()].map((group) => {
      const complete = group.litters.every((row) => row.recordedMargin !== null);
      return {
        damId: group.damId,
        sireId: group.sireId,
        litterCount: group.litters.length,
        directCost: sum(group.litters.map((row) => row.directCost)),
        receivedRevenue: sum(group.litters.map((row) => row.receivedRevenue)),
        recordedMargin: complete ? sum(group.litters.map((row) => row.recordedMargin)) : null,
        dataStatus: complete ? "complete recorded allocation" : "partial allocation"
      };
    });
  }

  function productionRecordExpense(state, record, options = {}) {
    const rows = operatingExpenses(state, options).filter((expense) => {
      if (expense.product && String(expense.product) === String(record.product || "")) return true;
      if (expense.sourceId && String(expense.sourceId) === String(record.id || "")) return true;
      return false;
    });
    return { rows, total: sum(rows.map((row) => row.amount)) };
  }

  function productMargins(state, options = {}) {
    const groups = new Map();
    array(state, "productionRecords").filter((record) => inRange(record.date, options))
      .filter((record) => !options.product || String(record.product || "") === String(options.product))
      .filter((record) => !options.species || String(record.species || "") === String(options.species))
      .forEach((record) => {
        const product = String(record.product || "Other");
        if (!groups.has(product)) groups.set(product, { product, revenue: 0, linkedCost: 0, linkedCostRecords: 0, productionRecords: 0 });
        const group = groups.get(product);
        group.revenue += Math.max(0, num(record.saleAmount) || 0);
        const costs = productionRecordExpense(state, record, options);
        group.linkedCost += costs.total;
        group.linkedCostRecords += costs.rows.length;
        group.productionRecords += 1;
      });
    return [...groups.values()].map((row) => ({
      ...row,
      margin: row.linkedCostRecords > 0 ? row.revenue - row.linkedCost : null,
      dataStatus: row.linkedCostRecords > 0 ? "linked recorded costs only" : "cost data unavailable",
      note: row.linkedCostRecords > 0
        ? "Margin uses only costs explicitly linked by product/source."
        : "No product-linked cost records exist; margin is intentionally not calculated."
    })).sort((a, b) => b.revenue - a.revenue);
  }

  return Object.freeze({
    VERSION,
    BUILD_ID,
    rawOperatingExpenses,
    operatingExpenses,
    completedSales,
    saleItemValue,
    saleInvoicedTotal,
    saleItems,
    paymentAllocations,
    operationSummary,
    animalRows,
    litterRows,
    pairRows,
    productMargins
  });
});
