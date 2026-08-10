const assert = require("node:assert/strict");
const fs = require("node:fs");

const JSZip = require("../vendor/jszip-3.10.1.min.js");
const ExcelJS = require("../vendor/exceljs-4.4.0.min.js");
global.window = { ExcelJS, JSZip };
require("../spreadsheet-import.js");

const {
  parseWorkbookBuffer, dateToISO, moneyNumber, issueAdvice,
  canonicalProductionProduct, productionDefaults, productFromSheetName,
  buildExportWorkbook, buildBreedingReportWorkbook, buildProductionReportWorkbook
} =
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
  assert.equal(canonicalProductionProduct("round hay bales"), "Hay");
  assert.deepEqual(productionDefaults("Hay"), { species: "", unit: "bales" });
  assert.equal(productFromSheetName("Hay Production"), "Hay");
  assert.match(issueAdvice("Production product is invalid."), /Eggs, Broilers, Milk, Hay/);
  assert.match(issueAdvice("Breeding status is not recognized."), /Confirmed pregnant/);
  assert.match(issueAdvice("Fostered-out young and losses cannot exceed the live young available."), /whole numbers/);

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
    ["Instructions", "Animals", "Customers", "Sales", "Payments", "Breeding", "Births", "Production", "Budgeting", "Annual Budget", "Medical"]
  );
  assert.equal(templateWorkbook.getWorksheet("Animals").getCell("A1").value, "Name");
  assert.equal(templateWorkbook.getWorksheet("Production").getCell("F1").value, "Group / Flock / Herd / Batch / Field Name");
  assert.equal(templateWorkbook.getWorksheet("Production").getCell("I1").value, "Total Produced");
  assert.equal(templateWorkbook.getWorksheet("Breeding").getCell("J1").value, "Expected Due Date");
  assert.equal(templateWorkbook.getWorksheet("Births").getCell("G1").value, "Born Alive");
  assert.equal(templateWorkbook.getWorksheet("Customers").getCell("B1").value, "Customer Name");
  assert.equal(templateWorkbook.getWorksheet("Sales").getCell("G1").value, "Item Price");
  assert.equal(templateWorkbook.getWorksheet("Payments").getCell("E1").value, "Amount Received");
  const productionValidations = JSON.stringify(
    templateWorkbook.getWorksheet("Production").dataValidations.model
  );
  assert.match(productionValidations, /Hay/, "template product choices include Hay");
  assert.match(productionValidations, /round bales/, "template units include common hay bale choices");
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
    }, {
      id: "animal_sire",
      name: "Atlas",
      tag: "R-10",
      species: "Rabbit",
      breed: "Holland Lop",
      sex: "Male",
      status: "Active",
      sireId: "",
      damId: "",
      notes: ""
    }, {
      id: "animal_offspring",
      name: "Willow offspring 1",
      tag: "L-1",
      species: "Rabbit",
      breed: "Holland Lop",
      sex: "Unknown",
      dob: "2026-08-05",
      status: "Growing",
      sireId: "animal_sire",
      damId: "animal_export",
      sourceBirthId: "birth_export",
      notes: ""
    }],
    breedings: [{
      id: "breeding_export",
      femaleId: "animal_export",
      maleId: "animal_sire",
      breedingDate: "2026-07-05",
      method: "Natural service",
      pregnancyCheckDate: "2026-07-19",
      pregnancyCheckStatus: "Positive",
      confirmedDate: "2026-07-19",
      nestBoxDate: "2026-08-02",
      dueDate: "2026-08-05",
      status: "Delivered",
      notes: "Successful pairing"
    }],
    litters: [{
      id: "birth_export",
      breedingId: "breeding_export",
      damId: "animal_export",
      sireId: "animal_sire",
      birthDate: "2026-08-05",
      birthType: "Unassisted",
      bornAlive: "6",
      stillborn: "1",
      fosteredIn: "0",
      fosteredOut: "0",
      lostBeforeWeaning: "0",
      weaned: "0",
      expectedWeanDate: "2026-09-16",
      offspringPrefix: "L",
      offspringIds: ["animal_offspring"],
      notes: "Healthy litter"
    }],
    customers: [{
      id: "customer_export", name: "Bluegrass Buyer", phone: "555-0100", email: "buyer@example.com", address: "Kentucky", notes: "Repeat buyer"
    }],
    sales: [{
      id: "sale_export", saleNumber: "HH-2026-TEST01", transferNumber: "TR-2026-TEST01", customerId: "customer_export",
      saleDate: "2026-07-30", dueDate: "2026-08-01", status: "Reserved",
      items: [{ id: "saleitem_export", animalId: "animal_export", quantity: "1", unitPrice: "100.00" }],
      discount: "5.00", tax: "6.00", terms: "Pickup after payment.", notes: "Excel sale"
    }],
    payments: [{
      id: "payment_export", saleId: "sale_export", date: "2026-07-30", type: "Deposit", amount: "25.00", method: "Cash",
      reference: "DEP-1", notes: "Deposit received", transactionId: "transaction_sale_payment_export"
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
      },
      {
        id: "transaction_sale_payment_export", date: "2026-07-30", type: "Income", classification: "", category: "Animal Sales",
        scope: "Animal", species: "Rabbit", animalId: "animal_export", amount: "25.00", party: "Bluegrass Buyer",
        description: "Deposit received for HH-2026-TEST01", notes: "Cash", sourceType: "sale-payment", sourceId: "payment_export", saleId: "sale_export"
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
    ["Overview", "Animals", "Customers", "Sales", "Payments", "Breeding", "Births", "Medical", "Production", "Budgeting", "Annual Budget"]
  );
  assert.equal(exportWorkbook.getWorksheet("Animals").getCell("A2").value, "Willow");
  assert.equal(exportWorkbook.getWorksheet("Animals").getCell("Q2").value, "=SUM(A1:A2)");
  assert.equal(
    exportWorkbook.getWorksheet("Animals").getCell("Q2").type,
    ExcelJS.ValueType.String,
    "formula-looking source text remains a non-executable Excel string"
  );
  assert.equal(exportWorkbook.getWorksheet("Breeding").getCell("A2").value, "breeding_export");
  assert.equal(exportWorkbook.getWorksheet("Births").getCell("G2").value, 6);
  assert.equal(exportWorkbook.getWorksheet("Customers").getCell("B2").value, "Bluegrass Buyer");
  assert.equal(exportWorkbook.getWorksheet("Sales").getCell("A2").value, "HH-2026-TEST01");
  assert.equal(exportWorkbook.getWorksheet("Payments").getCell("E2").value, 25);
  assert.equal(exportWorkbook.getWorksheet("Customers").pageSetup.fitToWidth, 1);
  assert.equal(exportWorkbook.getWorksheet("Sales").pageSetup.orientation, "landscape");
  assert.equal(exportWorkbook.getWorksheet("Payments").pageSetup.fitToPage, true);
  assert.equal(exportWorkbook.getWorksheet("Medical").getCell("M2").value, 4.2);
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("F2").value, "Layer flock A");
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("I2").value, 12);
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("J2").value, 8);
  assert.equal(exportWorkbook.getWorksheet("Production").getCell("P2").value, 24);
  assert.equal(exportWorkbook.getWorksheet("Budgeting").getCell("H2").value, 12.5);
  assert.equal(exportWorkbook.getWorksheet("Budgeting").rowCount, 2, "linked production income is not duplicated on the Budgeting sheet");
  assert.equal(exportWorkbook.getWorksheet("Annual Budget").getCell("D2").value, 100);

  const breedingReportWorkbook = buildBreedingReportWorkbook({
    breedings: exportState.breedings,
    litters: exportState.litters,
    animals: exportState.animals,
    report: {
      attempts: 1, positive: 1, negative: 0, conceptionRate: 1, delivered: 1, deliveryRate: 1,
      bornAlive: 6, stillborn: 1, lost: 0, weaned: 0, survivalRate: 0,
      performance: [{ name: "Willow", attempts: 1, positive: 1, births: 1, bornAlive: 6, weaned: 0, survivalRate: 0 }]
    }
  }, { operationName: "Harbor Test Farm", year: "2026" });
  assert.deepEqual(
    breedingReportWorkbook.worksheets.map((worksheet) => worksheet.name),
    ["Overview", "Dam Performance", "Breeding History", "Birth History"]
  );
  assert.equal(breedingReportWorkbook.getWorksheet("Overview").getCell("B7").value, 1);
  assert.equal(breedingReportWorkbook.getWorksheet("Dam Performance").getCell("A2").value, "Willow");
  assert.equal(breedingReportWorkbook.getWorksheet("Breeding History").getCell("K2").value, "Delivered");
  assert.equal(breedingReportWorkbook.getWorksheet("Birth History").getCell("F2").value, 6);
  if (process.env.HH_BREEDING_REPORT_QA_PATH) {
    const breedingReportBuffer = await breedingReportWorkbook.xlsx.writeBuffer();
    require("node:fs").writeFileSync(
      process.env.HH_BREEDING_REPORT_QA_PATH,
      Buffer.from(breedingReportBuffer)
    );
  }

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
  assert.equal(reportReload.getWorksheet("Overview").getCell("B12").value, "1.0.0");
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
    customers: [],
    sales: [],
    payments: [],
    health: [],
    annualBudgetPlans: [],
    transactions: [],
    defaultBudgetYear: 2026,
    fileName: "harbor-test-export.xlsx"
  });
  assert.equal(roundTrip.errorCount, 0, "the Excel export can be reviewed and imported again");
  assert.equal(roundTrip.records.animals.length, 3);
  assert.equal(roundTrip.records.breedings.length, 1);
  assert.equal(roundTrip.records.litters.length, 1);
  assert.equal(roundTrip.records.customers.length, 1);
  assert.equal(roundTrip.records.sales.length, 1);
  assert.equal(roundTrip.records.sales[0].items.length, 1);
  assert.equal(roundTrip.records.payments.length, 1);
  assert.equal(roundTrip.records.payments[0].saleId, roundTrip.records.sales[0].id);
  assert.equal(roundTrip.records.animals.find((animal) => animal.tag === "L-1").sourceBirthId, "birth_export");
  assert.deepEqual(roundTrip.records.litters[0].offspringIds, [roundTrip.records.animals.find((animal) => animal.tag === "L-1").id]);
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

  const invalidBirthWorkbook = new ExcelJS.Workbook();
  const invalidBirths = invalidBirthWorkbook.addWorksheet("Births");
  invalidBirths.addRow([
    "Birth Record ID", "Breeding Record ID", "Dam ID / Tag / Name", "Sire ID / Tag / Name",
    "Birth Date", "Birth Type", "Born Alive", "Stillborn", "Fostered In", "Fostered Out",
    "Lost Before Weaning", "Weaned"
  ]);
  invalidBirths.addRow(["birth_bad_parents", "breeding_validation", "D-1", "C-1", "2026-08-05", "Unassisted", 2, 0, 0, 0, 0, 0]);
  invalidBirths.addRow(["birth_bad_counts", "", "D-1", "S-1", "2026-08-06", "Unassisted", 1, 0, 0, 1, 1, 0]);
  const invalidBirthResult = await parseWorkbookBuffer(
    await invalidBirthWorkbook.xlsx.writeBuffer(),
    {
      ...context,
      animals: [
        { id: "dam_validation", name: "Willow", tag: "D-1", species: "Rabbit", sex: "Female" },
        { id: "sire_validation", name: "Atlas", tag: "S-1", species: "Rabbit", sex: "Male" },
        { id: "cattle_validation", name: "Bessie", tag: "C-1", species: "Cattle", sex: "Female" }
      ],
      breedings: [{ id: "breeding_validation", femaleId: "dam_validation", maleId: "sire_validation", breedingDate: "2026-07-05" }],
      litters: []
    }
  );
  assert.equal(invalidBirthResult.records.litters.length, 0);
  assert.equal(invalidBirthResult.errorCount, 2, "mismatched parents and impossible birth counts are rejected");

  const invalidSalesWorkbook = new ExcelJS.Workbook();
  const invalidCustomers = invalidSalesWorkbook.addWorksheet("Customers");
  invalidCustomers.addRow(["Customer Name", "Email"]);
  invalidCustomers.addRow(["Buyer One", "buyer@example.com"]);
  const invalidSales = invalidSalesWorkbook.addWorksheet("Sales");
  invalidSales.addRow(["Sale Number", "Sale Date", "Sale Status", "Customer ID or Name", "Animal ID / Tag / Name", "Item Price"]);
  invalidSales.addRow(["HH-2026-ONE", "2026-08-05", "Draft", "Buyer One", "S-1", 100]);
  invalidSales.addRow(["HH-2026-TWO", "2026-08-05", "Draft", "Buyer One", "S-1", 100]);
  const invalidPayments = invalidSalesWorkbook.addWorksheet("Payments");
  invalidPayments.addRow(["Sale Number", "Payment Date", "Payment Type", "Amount Received", "Payment Method"]);
  invalidPayments.addRow(["HH-2026-ONE", "2026-08-05", "Deposit", 125, "Cash"]);
  const invalidSalesResult = await parseWorkbookBuffer(
    await invalidSalesWorkbook.xlsx.writeBuffer(),
    {
      ...context,
      animals: [{ id: "sale_animal", name: "Willow", tag: "S-1", species: "Rabbit", sex: "Female", status: "For Sale" }],
      customers: [], sales: [], payments: [], transactions: []
    }
  );
  assert.equal(invalidSalesResult.records.customers.length, 1);
  assert.equal(invalidSalesResult.records.sales.length, 1, "one animal cannot appear on two active sales");
  assert.equal(invalidSalesResult.records.payments.length, 0, "payments above the invoice balance are rejected");
  assert.equal(invalidSalesResult.errorCount, 2);

  const realWorkbookPath = require("node:path").resolve(
    __dirname,
    "../../upload/HerdHarbor_100_Animal_Test_Data(1).xlsx"
  );
  if (fs.existsSync(realWorkbookPath)) {
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
  } else {
    console.log("optional external 100-animal QA fixture not present; core spreadsheet tests still passed");
  }

  console.log("spreadsheet importer tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
