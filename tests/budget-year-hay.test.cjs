const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const firstStart = html.indexOf("  function currentMonthKey()");
const firstEnd = html.indexOf("  function daysFromNow", firstStart);
assert.ok(firstStart >= 0 && firstEnd > firstStart, "budget-period helpers are present");

const state = {
  animals: [
    { id: "cow-1", name: "Bessie", species: "Cattle", status: "Active" },
    { id: "hen-1", name: "Layer", species: "Chicken", status: "Active" }
  ],
  transactions: [
    { id: "jan-income", date: "2026-01-10", type: "Income", amount: "100", scope: "Operation" },
    { id: "aug-income", date: "2026-08-10", type: "Income", amount: "250", scope: "Operation" },
    { id: "aug-feed", date: "2026-08-11", type: "Expense", classification: "Operating", amount: "60", scope: "Species", species: "Chicken" },
    { id: "aug-capital", date: "2026-08-12", type: "Expense", classification: "Capital", amount: "40", scope: "Operation" },
    { id: "old-income", date: "2025-12-31", type: "Income", amount: "999", scope: "Operation" }
  ],
  budgetMonthSettings: {
    "2026-01": { averageHeadCount: "10" },
    "2026-08": { averageHeadCount: "14" },
    "2025-12": { averageHeadCount: "99" }
  },
  budgetPlans: [
    { id: "jan-feed", month: "2026-01", species: "", category: "Feed", amount: "50" },
    { id: "aug-feed", month: "2026-08", species: "", category: "Feed", amount: "75" },
    { id: "old-feed", month: "2025-12", species: "", category: "Feed", amount: "500" }
  ],
  annualBudgetPlans: [{ id: "annual", year: 2026, type: "Expense", category: "Feed", amount: "125" }]
};

const firstHelpers = new Function(
  "state",
  "todayISO",
  `${html.slice(firstStart, firstEnd)}\nreturn {
    monthTransactions, budgetSummary, effectiveHeadCount, budgetPeriodLabel
  };`
)(state, () => "2026-08-05");

assert.equal(firstHelpers.monthTransactions("2026").length, 4, "full-year view includes every 2026 transaction");
assert.equal(firstHelpers.monthTransactions("2026-08").length, 3, "monthly view remains available");
assert.equal(firstHelpers.budgetSummary("2026").income, 350);
assert.equal(firstHelpers.budgetSummary("2026").operating, 60);
assert.equal(firstHelpers.budgetSummary("2026").capital, 40);
assert.equal(firstHelpers.budgetSummary("2026").net, 250);
assert.equal(firstHelpers.effectiveHeadCount("2026"), 12, "year view averages available monthly head-count overrides");
assert.equal(firstHelpers.budgetPeriodLabel("2026"), "Full year 2026");

const secondStart = html.indexOf("  function budgetPlansFor(");
const secondEnd = html.indexOf("  function allocatedExpenseAmount", secondStart);
assert.ok(secondStart >= 0 && secondEnd > secondStart, "yearly budget helpers are present");
const budgetView = { year: 2026 };
const secondHelpers = new Function(
  "state",
  "budgetView",
  "budgetSummary",
  `${html.slice(secondStart, secondEnd)}\nreturn { budgetPlansFor, budgetYears, yearlyActualRows };`
)(state, budgetView, firstHelpers.budgetSummary);

assert.equal(secondHelpers.budgetPlansFor("2026").length, 2, "year view combines all monthly plans in that year");
assert.ok(secondHelpers.budgetYears().includes(2026));
assert.ok(secondHelpers.budgetYears().includes(2025));
assert.ok(secondHelpers.budgetYears().includes(new Date().getFullYear() + 1), "next year is available for advance planning");
const months = secondHelpers.yearlyActualRows(2026);
assert.equal(months.length, 12, "full-year breakdown always displays all twelve months");
assert.equal(months[0].income, 100);
assert.equal(months[7].income, 250);
assert.equal(months[11].income, 0);

assert.match(html, /id="budget-period"/);
assert.match(html, />Full year</);
assert.match(html, /id="budget-year"/);
assert.match(html, /data-quick-production="Hay"/);
assert.match(html, /Hay: \{ species: "", unit: "bales"/);
assert.match(html, /"square bales", "round bales", "tons"/);

console.log("full-year budget and hay product tests passed");
