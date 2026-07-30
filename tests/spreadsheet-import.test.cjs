const assert = require("node:assert/strict");

const ExcelJS = require("../vendor/exceljs-4.4.0.min.js");
global.window = { ExcelJS };
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
    ["Instructions", "Animals", "Budgeting", "Medical"]
  );
  assert.equal(templateWorkbook.getWorksheet("Animals").getCell("A1").value, "Name");
  assert.equal(templateWorkbook.getWorksheet("Budgeting").getCell("H1").value, "Amount");
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

  console.log("spreadsheet importer tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
