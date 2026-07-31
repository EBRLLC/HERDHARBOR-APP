const assert = require("node:assert/strict");
const fs = require("node:fs");

const JSZip = require("../vendor/jszip-3.10.1.min.js");
const ExcelJS = require("../vendor/exceljs-4.4.0.min.js");
global.window = { ExcelJS, JSZip };
require("../spreadsheet-import.js");

const { parseWorkbookBuffer, dateToISO, moneyNumber } =
  global.window.HerdHarborSpreadsheet.__test;

async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();

  const animals = workbook.addWorksheet("Animals");
  animals.addRow([
    "Animal Name",
    "ID",
    "Species",
    "Breed",
    "Sex",
    "DOB",
    "Status",
    "Sire",
    "Notes"
  ]);
  animals.addRow([
    "Atlas",
    "A-1",
    "Rabbit",
    "Holland Lop",
    "Male",
    new Date(2025, 0, 15),
    "Active",
    "R-1",
    "Imported animal"
  ]);
  animals.addRow([
    "Clover duplicate",
    "R-1",
    "Rabbit",
    "Holland Lop",
    "Female",
    "2024-02-10",
    "Active",
    "",
    ""
  ]);
  animals.addRow([
    "Unsupported",
    "X-1",
    "Alpaca",
    "",
    "Female",
    "2024-02-10",
    "Active",
    "",
    ""
  ]);

  const medical = workbook.addWorksheet("Medical Records");
  medical.addRow([
    "Animal ID",
    "Record Date",
    "Medical Type",
    "Description",
    "Animal Weight",
    "Unit",
    "Recheck Date"
  ]);
  medical.addRow(["A-1", "2026-07-30", "weighing", "", 4.2, "lb", "2026-08-30"]);
  medical.addRow(["Missing animal", "2026-07-30", "Medication", "Test", "", "", ""]);

  const budget = workbook.addWorksheet("Income and Expenses");
  budget.addRow([
    "Transaction Date",
    "Income or Expense",
    "Operating or Capital",
    "Category",
    "Assigned To",
    "Animal Tag",
    "Amount",
    "Vendor",
    "Description",
    "Notes"
  ]);
  budget.addRow([
    "2026-07-30",
    "Expense",
    "Operating",
    "Feed",
    "Animal",
    "A-1",
    "$12.50",
    "Farm Store",
    "Pellets",
    ""
  ]);
  budget.addRow([
    "2026-07-30",
    "Income",
    "",
    "Egg Sales",
    "Operation",
    "",
    25,
    "Customer",
    "Eggs",
    ""
  ]);
  budget.addRow([
    "2026-07-01",
    "Expense",
    "Operating",
    "Feed",
    "Operation",
    "",
    10,
    "Store",
    "Existing transaction",
    ""
  ]);

  const annualBudget = workbook.addWorksheet("Annual Budget");
  annualBudget.addRow([
    "Year",
    "Animal ID / Tag / Name",
    "Feed Budget",
    "Housing / Bedding",
    "Routine Medical",
    "Breeding",
    "Other Costs",
    "Projected Sale Income",
    "Product Income",
    "Offspring Income"
  ]);
  annualBudget.addRow([2026, "A-1", 100, 50, 25, 10, 15, 200, 75, 50]);

  return workbook.xlsx.writeBuffer();
}

async function run() {
  const context = {
    species: ["Rabbit", "Chicken", "Duck", "Turkey", "Dog", "Horse", "Goat", "Sheep", "Cattle", "Pig", "Other"],
    animals: [{
      id: "animal_existing",
      name: "Clover",
      tag: "R-1",
      tattoo: "",
      registrationNumber: "",
      species: "Rabbit",
      breed: "Holland Lop",
      sex: "Female",
      dob: "2024-02-10",
      status: "Active"
    }],
    health: [],
    annualBudgetPlans: [],
    defaultBudgetYear: 2026,
    transactions: [{
      id: "transaction_existing",
      date: "2026-07-01",
      type: "Expense",
      classification: "Operating",
      category: "Feed",
      scope: "Operation",
      species: "",
      animalId: "",
      amount: "10.00",
      party: "Store",
      description: "Existing transaction",
      notes: ""
    }]
  };
  const original = JSON.stringify(context);
  const result = await parseWorkbookBuffer(await buildWorkbook(), context);

  assert.equal(JSON.stringify(context), original, "preview parsing must not mutate current records");
  assert.equal(result.records.animals.length, 1);
  assert.equal(result.records.animals[0].name, "Atlas");
  assert.equal(result.records.animals[0].sireId, "animal_existing");
  assert.equal(result.records.health.length, 1);
  assert.equal(result.records.health[0].type, "Weight");
  assert.equal(result.records.health[0].weight, "4.2");
  assert.equal(result.records.health[0].animalId, result.records.animals[0].id);
  assert.equal(result.records.transactions.length, 2);
  assert.equal(result.records.transactions[0].animalId, result.records.animals[0].id);
  assert.equal(result.records.transactions[0].amount, "12.50");
  assert.equal(result.records.annualBudgetPlans.length, 8);
  assert.equal(result.records.annualBudgetPlans[0].year, 2026);
  assert.equal(result.records.annualBudgetPlans[0].animalId, result.records.animals[0].id);
  assert.equal(result.records.annualBudgetPlans[0].type, "Expense");
  assert.equal(result.records.annualBudgetPlans[5].type, "Income");
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.errorCount, 2);
  assert.equal(dateToISO("7/30/2026"), "2026-07-30");
  assert.equal(moneyNumber("($1,234.50)"), -1234.5);

  let downloadedBlob = null;
  global.document = {
    head: { appendChild() {} },
    querySelector() { return null; },
    createElement(tagName) {
      if (tagName === "a") {
        return {
          href: "",
          download: "",
          click() {}
        };
      }
      return { id: "", textContent: "" };
    }
  };
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    downloadedBlob = blob;
    return "blob:herdharbor-template";
  };
  URL.revokeObjectURL = () => {};
  await global.window.HerdHarborSpreadsheet.downloadTemplate();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;

  assert.ok(downloadedBlob, "template download should create an xlsx blob");
  const templateWorkbook = new ExcelJS.Workbook();
  await templateWorkbook.xlsx.load(await downloadedBlob.arrayBuffer());
  assert.deepEqual(
    templateWorkbook.worksheets.map((worksheet) => worksheet.name),
    ["Instructions", "Animals", "Budgeting", "Annual Budget", "Medical"]
  );
  assert.equal(templateWorkbook.getWorksheet("Animals").getCell("A1").value, "Name");
  assert.equal(templateWorkbook.getWorksheet("Budgeting").getCell("H1").value, "Amount");
  assert.equal(templateWorkbook.getWorksheet("Annual Budget").getCell("D1").value, "Feed Budget");
  assert.equal(templateWorkbook.getWorksheet("Medical").getCell("C1").value, "Record Type");
  if (process.env.HH_TEMPLATE_QA_PATH) {
    require("node:fs").writeFileSync(
      process.env.HH_TEMPLATE_QA_PATH,
      Buffer.from(await downloadedBlob.arrayBuffer())
    );
  }

  const flexibleWorkbook = new ExcelJS.Workbook();
  const rabbits = flexibleWorkbook.addWorksheet("Rabbits");
  rabbits.addRow(["Name", "Tag", "Sex"]);
  rabbits.addRow(["Willow", "R-2", "Doe"]);
  const weights = flexibleWorkbook.addWorksheet("Weights");
  weights.addRow(["Animal Tag", "Date", "Weight", "Unit"]);
  weights.addRow(["R-2", "2026-07-30", 3.8, "lb"]);
  const flexibleResult = await parseWorkbookBuffer(
    await flexibleWorkbook.xlsx.writeBuffer(),
    context
  );
  assert.equal(flexibleResult.errorCount, 0);
  assert.equal(flexibleResult.records.animals[0].species, "Rabbit");
  assert.equal(flexibleResult.records.animals[0].sex, "Female");
  assert.equal(flexibleResult.records.health[0].type, "Weight");
  assert.equal(flexibleResult.records.health[0].animalId, flexibleResult.records.animals[0].id);

  const realWorkbookPath = require("node:path").resolve(
    __dirname,
    "../../upload/HerdHarbor_100_Animal_Test_Data(1).xlsx"
  );
  const realContext = {
    species: context.species,
    animals: [],
    health: [],
    annualBudgetPlans: [],
    transactions: [],
    defaultBudgetYear: 2026,
    fileName: "HerdHarbor_100_Animal_Test_Data(1).xlsx"
  };
  const realOriginal = JSON.stringify(realContext);
  const realResult = await parseWorkbookBuffer(fs.readFileSync(realWorkbookPath), realContext);
  assert.equal(JSON.stringify(realContext), realOriginal, "real workbook preview must not mutate current records");
  assert.equal(realResult.errorCount, 0);
  assert.equal(realResult.records.animals.length, 100);
  assert.equal(realResult.records.health.length, 100);
  assert.equal(realResult.records.transactions.length, 0);
  assert.equal(realResult.records.annualBudgetPlans.length, 800);
  const plannedExpenseTotal = realResult.records.annualBudgetPlans
    .filter((plan) => plan.type === "Expense")
    .reduce((sum, plan) => sum + Number(plan.amount), 0);
  const projectedIncomeTotal = realResult.records.annualBudgetPlans
    .filter((plan) => plan.type === "Income")
    .reduce((sum, plan) => sum + Number(plan.amount), 0);
  assert.ok(Math.abs(plannedExpenseTotal - 96021.35) < 0.001);
  assert.ok(Math.abs(projectedIncomeTotal - 125381.9) < 0.001);
  assert.ok(Math.abs(projectedIncomeTotal - plannedExpenseTotal - 29360.55) < 0.001);
  assert.equal(realResult.records.animals[0].dob, "2024-06-05");
  assert.equal(realResult.records.animals[3].sex, "Male");
  assert.match(realResult.records.animals[3].notes, /Imported sex: Neutered Male/);
  assert.match(realResult.records.animals[0].notes, /Imported weight: 5\.5 lb/);
  assert.match(realResult.records.animals[0].notes, /Purchase cost: \$104\.38/);
  assert.equal(realResult.records.animals[2].status, "Breeding");
  assert.equal(realResult.records.health[0].date, "2026-04-29");
  assert.match(realResult.records.health[0].details, /Ivermectin/);
  assert.match(realResult.records.health[0].details, /County Mobile Vet/);
  assert.match(realResult.records.health[0].details, /Medical cost: \$111\.98/);
  assert.match(realResult.records.health[0].details, /Original record type: Deworming/);
  assert.equal(realResult.records.annualBudgetPlans[0].year, 2026);

  const reimportContext = {
    ...realContext,
    animals: realResult.records.animals,
    health: realResult.records.health,
    annualBudgetPlans: realResult.records.annualBudgetPlans
  };
  const reimportResult = await parseWorkbookBuffer(
    fs.readFileSync(realWorkbookPath),
    reimportContext
  );
  assert.equal(reimportResult.records.animals.length, 0);
  assert.equal(reimportResult.records.health.length, 0);
  assert.equal(reimportResult.records.annualBudgetPlans.length, 0);
  assert.equal(reimportResult.records.transactions.length, 0);

  console.log("spreadsheet importer tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
