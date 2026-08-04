const assert = require("node:assert/strict");
const fs = require("node:fs");

const JSZip = require("../vendor/jszip-3.10.1.min.js");
const ExcelJS = require("../vendor/exceljs-4.4.0.min.js");
global.window = { ExcelJS, JSZip };
require("../spreadsheet-import.js");

const { parseWorkbookBuffer, dateToISO, moneyNumber, issueAdvice, buildExportWorkbook, buildProductionReportWorkbook } =
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
    ["Instructions", "Animals", "Production", "Budgeting", "Annual Budget", "Medical"]
  );
  assert.equal(templateWorkbook.getWorksheet("Animals").getCell("A1").value, "Name");
  assert.equal(templateWorkbook.getWorksheet("Production").getCell("F1").value, "Group / Flock / Herd / Batch Name");
  assert.equal(templateWorkbook.getWorksheet("Production").getCell("I1").value, "Total Produced");
  assert.equal(templateWorkbook.getWorksheet("Budgeting").getCell("H1").value, "Amount");
  assert.equal(templateWorkbook.getWorksheet("Annual Budget").getCell("D1").value, "Feed Budget");
  assert.equal(templateWorkbook.getWorksheet("Medical").getCell("C1").value, "Record Type");
  if (process.env.HH_TEMPLATE_QA_PATH) {
    require("node:fs").writeFileSync(
      process.env.HH_TEMPLATE_QA_PATH,
      Buffer.from(await downloadedBlob.arrayBuffer())
    );
  }

  assert.match(
    issueAdvice("Medical date “tomorrow” is invalid."),
    /YYYY-MM-DD/,
    "date errors include a concrete correction"
  );
  assert.match(
    issueAdvice("Animal “Clover” matches more than one animal."),
    /unique ID\/tag/,
    "animal matching errors explain how to resolve ambiguity"
  );

  const exportState = {
    profile: { operationName: "Harbor Test Farm" },
    animals: [{
      id: "animal_export",
      name: "Willow",
      tag: "R-20",
      tattoo: "",
      registrationNumber: "",
      breeder: "Harbor Test Farm",
      species: "Rabbit",
      breed: "Holland Lop",
      sex: "Female",
      dob: "2025-04-15",
      color: "Tort",
      location: "Barn A",
      status: "Active",
      sireId: "",
      damId: "",
      notes: "=SUM(A1:A2)"
    }],
    health: [{
      id: "health_export",
      animalId: "animal_export",
      date: "2026-07-30",
      type: "Weight",
      details: "Monthly weight",
      weight: "4.2",
      weightUnit: "lb",
      followUpDate: "2026-08-30"
    }],
    transactions: [
      {
        id: "transaction_export",
        date: "2026-07-30",
        type: "Expense",
        classification: "Operating",
        category: "Feed",
        scope: "Animal",
        species: "Rabbit",
        animalId: "animal_export",
        amount: "12.50",
        party: "Farm Store",
        description: "Pellets",
        notes: ""
      },
      {
        id: "transaction_production_export",
        date: "2026-07-30",
        type: "Income",
        classification: "",
        category: "Egg Sales",
        scope: "Species",
        species: "Chicken",
        animalId: "",
        amount: "24.00",
        party: "Farm stand",
        description: "Eggs: 8 dozen sold",
        notes: "",
        sourceType: "production",
        sourceId: "production_export"
      }
    ],
    productionRecords: [{
      id: "production_export",
      date: "2026-07-30",
      product: "Eggs",
      scope: "Species",
      species: "Chicken",
      animalId: "",
      groupName: "Layer flock A",
      session: "",
      unit: "dozen",
      quantity: "12",
      soldQuantity: "8",
      householdQuantity: "1",
      feedQuantity: "0",
      setAsideQuantity: "2",
      donatedQuantity: "0",
      wasteQuantity: "1",
      saleAmount: "24.00",
      totalWeight: "",
      weightUnit: "",
      customer: "Farm stand",
      wasteReason: "Cracked",
      notes: "Friday collection",
      transactionId: "transaction_production_export"
    }],
    annualBudgetPlans: [
      ["Expense", "Feed", "100.00"],
      ["Expense", "Housing / Bedding", "50.00"],
      ["Expense", "Routine Medical", "25.00"],
      ["Expense", "Breeding", "10.00"],
      ["Expense", "Other Costs", "15.00"],
      ["Income", "Projected Sale Income", "200.00"],
      ["Income", "Product Income", "75.00"],
      ["Income", "Offspring Income", "50.00"]
    ].map(([type, category, amount], index) => ({
      id: `annual_export_${index}`,
      year: 2026,
      type,
      category,
      scope: "Animal",
      species: "Rabbit",
      animalId: "animal_export",
      amount
    }))
  };
  const exportWorkbook = buildExportWorkbook(exportState, { operationName: "Harbor Test Farm" });
  assert.deepEqual(
    exportWorkbook.worksheets.map((worksheet) => worksheet.name),
    ["Overview", "Animals", "Medical", "Production", "Budgeting", "Annual Budget"]
  );
  assert.equal(exportWorkbook.getWorksheet("Animals").getCell("A2").value, "Willow");
  assert.equal(exportWorkbook.getWorksheet("Animals").getCell("O2").value, "=SUM(A1:A2)");
  assert.equal(
    exportWorkbook.getWorksheet("Animals").getCell("O2").type,
    ExcelJS.ValueType.String,
    "formula-looking source text remains a non-executable Excel string"
  );
  assert.equal(exportWorkbook.getWorksheet("Medical").getCell("M2").value, 4.2);
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("F2").value, "Layer flock A");
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("I2").value, 12);
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("J2").value, 8);
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("P2").value, 24);
  assert.equal(exportWorkbook.getWorksheet("Budgeting").getCell("H2").value, 12.5);
  assert.equal(exportWorkbook.getWorksheet("Budgeting").rowCount, 2, "linked production income is not duplicated on the Budgeting sheet");
  assert.equal(exportWorkbook.getWorksheet("Annual Budget").getCell("D2").value, 100);

  const reportWorkbook = buildProductionReportWorkbook({
    records: exportState.productionRecords,
    animals: exportState.animals,
    summaryRows: [{
      product: "Eggs", unit: "dozen", produced: 12, sold: 8, farmUse: 3,
      donated: 0, waste: 1, wasteRate: 1 / 12, averagePrice: 3, revenue: 24, recordCount: 1
    }],
    timelineRows: [{
      label: "Jul 30, 2026", product: "Eggs", unit: "dozen", produced: 12, sold: 8,
      farmUse: 3, donated: 0, waste: 1, wasteRate: 1 / 12, averagePrice: 3, revenue: 24
    }],
    comparisonRows: [{
      label: "Layer flock A", kind: "Group", product: "Eggs", unit: "dozen", produced: 12,
      sold: 8, farmUse: 3, waste: 1, wasteRate: 1 / 12, averagePrice: 3, revenue: 24
    }],
    warnings: [{ type: "waste", severity: "warning", message: "Egg waste is above the review threshold." }]
  }, {
    operationName: "Harbor Test Farm",
    rangeLabel: "Jul 1, 2026 – Jul 31, 2026",
    groupBy: "Day"
  });
  assert.deepEqual(
    reportWorkbook.worksheets.map((worksheet) => worksheet.name),
    ["Overview", "Product Totals", "Period Totals", "Comparisons", "Production History", "Warnings"]
  );
  assert.equal(reportWorkbook.getWorksheet("Product Totals").getCell("C2").value, 12);
  assert.equal(reportWorkbook.getWorksheet("Product Totals").getCell("J2").value, 24);
  assert.equal(reportWorkbook.getWorksheet("Production History").getCell("F2").value, "Layer flock A");
  assert.equal(reportWorkbook.getWorksheet("Warnings").getCell("C2").value, "Egg waste is above the review threshold.");
  const reportBuffer = await reportWorkbook.xlsx.writeBuffer();
  const reportReload = new ExcelJS.Workbook();
  await reportReload.xlsx.load(reportBuffer);
  assert.equal(reportReload.getWorksheet("Overview").getCell("B12").value, "0.3.07");
  if (process.env.HH_PRODUCTION_REPORT_QA_PATH) {
    require("node:fs").writeFileSync(process.env.HH_PRODUCTION_REPORT_QA_PATH, Buffer.from(reportBuffer));
  }

  const exportBuffer = await exportWorkbook.xlsx.writeBuffer();
  if (process.env.HH_EXPORT_QA_PATH) {
    require("node:fs").writeFileSync(
      process.env.HH_EXPORT_QA_PATH,
      Buffer.from(exportBuffer)
    );
  }
  const roundTrip = await parseWorkbookBuffer(exportBuffer, {
    species: context.species,
    animals: [],
    health: [],
    annualBudgetPlans: [],
    transactions: [],
    defaultBudgetYear: 2026,
    fileName: "harbor-test-export.xlsx"
  });
  assert.equal(roundTrip.errorCount, 0, "the Excel export can be reviewed and imported again");
  assert.equal(roundTrip.records.animals.length, 1);
  assert.equal(roundTrip.records.health.length, 1);
  assert.equal(roundTrip.records.transactions.length, 1);
  assert.equal(roundTrip.records.productionRecords.length, 1);
  assert.equal(roundTrip.records.productionRecords[0].groupName, "Layer flock A");
  assert.equal(roundTrip.records.productionRecords[0].wasteQuantity, "1");
  assert.equal(roundTrip.records.productionRecords[0].saleAmount, "24.00");
  assert.equal(roundTrip.records.annualBudgetPlans.length, 8);

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

  const dairyWorkbook = new ExcelJS.Workbook();
  const milkProduction = dairyWorkbook.addWorksheet("Milk Production");
  milkProduction.addRow([
    "Date", "Scope", "Species", "Milking Session", "Unit", "Total Produced",
    "Quantity Sold", "Household Use", "Fed to Livestock / Calves",
    "Stored / Set Aside", "Wasted / Discarded", "Sale Income", "Waste / Discard Reason"
  ]);
  milkProduction.addRow([
    "2026-08-04", "Species", "Cattle", "Morning", "gallons", 6,
    2, 1, 1.5, 0.5, 1, 12, "Medication withdrawal"
  ]);
  const dairyResult = await parseWorkbookBuffer(
    await dairyWorkbook.xlsx.writeBuffer(),
    { ...context, productionRecords: [] }
  );
  assert.equal(dairyResult.errorCount, 0);
  assert.equal(dairyResult.records.productionRecords.length, 1);
  assert.equal(dairyResult.records.productionRecords[0].product, "Milk");
  assert.equal(dairyResult.records.productionRecords[0].feedQuantity, "1.5");
  assert.equal(dairyResult.records.productionRecords[0].wasteQuantity, "1");
  assert.equal(dairyResult.records.productionRecords[0].wasteReason, "Medication withdrawal");

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
