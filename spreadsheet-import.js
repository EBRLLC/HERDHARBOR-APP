(() => {
  "use strict";

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_COMPAT_XML_BYTES = 50 * 1024 * 1024;
  const MAX_DATA_ROWS = 5000;
  const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm"];
  const RECORD_TYPES = [
    "Weight",
    "Treatment",
    "Medication",
    "Vaccination",
    "Observation",
    "Veterinary visit"
  ];
  const ANIMAL_STATUSES = [
    "Active",
    "Breeding",
    "Growing",
    "Retired",
    "For Sale",
    "Sold",
    "Deceased",
    "Ancestor Only"
  ];
  const ANNUAL_PLAN_FIELDS = [
    { field: "feedBudget", type: "Expense", category: "Feed" },
    { field: "housingBudget", type: "Expense", category: "Housing / Bedding" },
    { field: "medicalBudget", type: "Expense", category: "Routine Medical" },
    { field: "breedingBudget", type: "Expense", category: "Breeding" },
    { field: "otherCosts", type: "Expense", category: "Other Costs" },
    { field: "projectedSaleIncome", type: "Income", category: "Projected Sale Income" },
    { field: "productIncome", type: "Income", category: "Product Income" },
    { field: "offspringIncome", type: "Income", category: "Offspring Income" }
  ];

  const SCHEMAS = {
    animals: {
      sheetNames: [
        "animal",
        "animals",
        "livestock",
        "herd",
        "animal records",
        "rabbits",
        "chickens",
        "ducks",
        "turkeys",
        "dogs",
        "horses",
        "goats",
        "sheep",
        "cattle",
        "pigs"
      ],
      fields: {
        name: ["name", "animal name", "livestock name"],
        tag: ["id", "tag", "id or tag", "animal id", "animal tag", "ear tag", "tag microchip"],
        tattoo: ["tattoo", "ear number", "tattoo or ear number", "tattoo ear number"],
        registrationNumber: ["registration", "registration number", "registration no", "reg number", "reg no"],
        breeder: ["breeder", "breeder name", "seller", "source breeder"],
        species: ["species", "animal type", "livestock type"],
        breed: ["breed"],
        sex: ["sex", "gender"],
        dob: ["date of birth", "birth date", "dob", "born", "birthday"],
        color: ["color", "colour", "variety", "color or variety"],
        location: ["location", "cage", "pen", "stall", "location cage pen", "pen pasture"],
        status: ["status", "animal status"],
        weight: ["weight", "animal weight"],
        weightUnit: ["weight unit", "unit", "units"],
        acquisitionDate: ["acquisition date", "acquired date", "purchase date"],
        purchaseCost: ["purchase cost", "acquisition cost", "purchase price"],
        medicalStatus: ["medical status", "health status"],
        sireRef: ["sire", "sire id", "sire tag", "sire id tag name", "father", "father id", "father tag"],
        damRef: ["dam", "dam id", "dam tag", "dam id tag name", "mother", "mother id", "mother tag"],
        notes: ["notes", "comments", "description"]
      }
    },
    annualPlans: {
      sheetNames: [
        "annual budget",
        "annual budgets",
        "annual budget plan",
        "annual plan",
        "budget plan",
        "budget plans"
      ],
      fields: {
        year: ["year", "budget year", "plan year", "annual budget year"],
        animalRef: ["animal", "animal name", "animal id", "animal tag", "id or tag", "animal id tag name"],
        species: ["species", "animal type", "livestock type"],
        feedBudget: ["feed budget", "annual feed budget", "feed cost", "feed costs"],
        housingBudget: ["housing bedding", "housing and bedding", "housing bedding budget", "housing cost", "bedding cost"],
        medicalBudget: ["routine medical", "medical budget", "medical cost", "veterinary budget", "vet budget"],
        breedingBudget: ["breeding", "breeding budget", "breeding cost", "breeding costs"],
        otherCosts: ["other costs", "other cost", "other budget", "miscellaneous costs"],
        projectedSaleIncome: ["projected sale income", "sale income", "animal sale income"],
        productIncome: ["product income", "projected product income"],
        offspringIncome: ["offspring income", "projected offspring income"]
      }
    },
    transactions: {
      sheetNames: [
        "budget",
        "budgeting",
        "transaction",
        "transactions",
        "income expenses",
        "income and expenses",
        "finances",
        "financial"
      ],
      fields: {
        date: ["date", "transaction date"],
        type: ["type", "transaction type", "income expense", "income or expense"],
        classification: ["classification", "expense classification", "operating capital", "operating or capital"],
        category: ["category", "income category", "expense category"],
        scope: ["scope", "assign to", "assigned to", "allocation"],
        species: ["species", "animal type", "livestock type"],
        animalRef: ["animal", "animal name", "animal id", "animal tag", "id or tag", "animal id tag name"],
        amount: ["amount", "total", "cost", "price", "value"],
        party: ["vendor", "customer", "vendor customer", "vendor or customer", "payee", "payer", "party"],
        description: ["description", "item", "purchase", "sale", "details"],
        notes: ["notes", "comments"]
      }
    },
    production: {
      sheetNames: [
        "production",
        "production sales",
        "production and sales",
        "farm products",
        "egg production",
        "broiler production",
        "milk production",
        "dairy production"
      ],
      fields: {
        date: ["date", "production date", "collection date", "processing date", "milking date"],
        product: ["product", "product type", "production type", "item"],
        scope: ["scope", "assign to", "assigned to", "allocation"],
        species: ["species", "animal type", "livestock type"],
        animalRef: ["animal", "animal name", "animal id", "animal tag", "id or tag", "animal id tag name", "cow"],
        groupName: ["group name", "flock", "herd", "batch", "batch name", "flock herd batch", "group flock herd batch name"],
        session: ["session", "milking session", "shift"],
        unit: ["unit", "units", "production unit", "quantity unit"],
        quantity: ["total produced", "total collected", "quantity produced", "quantity collected", "production quantity", "total quantity", "quantity"],
        soldQuantity: ["quantity sold", "sold quantity", "sold"],
        householdQuantity: ["household use", "family use", "home use"],
        feedQuantity: ["fed to livestock calves", "fed to livestock", "calf feed", "fed to calves", "animal feed"],
        setAsideQuantity: ["stored set aside", "stored", "set aside", "hatching", "frozen"],
        donatedQuantity: ["donated", "donation quantity"],
        wasteQuantity: ["wasted discarded", "waste", "wasted", "discarded", "loss condemned", "condemned"],
        saleAmount: ["sale income", "sales income", "revenue", "income", "sale amount"],
        totalWeight: ["batch weight", "total weight", "processed weight"],
        weightUnit: ["weight unit", "batch weight unit"],
        customer: ["customer", "buyer"],
        wasteReason: ["waste discard reason", "waste reason", "discard reason", "loss reason"],
        notes: ["notes", "comments"]
      }
    },
    health: {
      sheetNames: [
        "medical",
        "medicine",
        "health",
        "health records",
        "medical records",
        "treatments",
        "weights"
      ],
      fields: {
        animalRef: ["animal", "animal name", "animal id", "animal tag", "id or tag", "animal id tag name"],
        date: ["date", "record date", "treatment date", "visit date"],
        type: ["type", "record type", "medical type", "health type"],
        details: ["details", "description", "observation"],
        condition: ["condition", "reason", "condition reason", "condition or reason"],
        treatment: ["treatment", "procedure", "treatment procedure", "treatment or procedure"],
        medication: ["medication", "medicine", "drug"],
        dose: ["dose", "dosage"],
        provider: ["provider", "veterinarian", "vet", "clinic"],
        cost: ["medical cost", "cost", "amount"],
        followUpStatus: ["follow up status", "followup status", "medical status"],
        notes: ["notes", "comments"],
        weight: ["weight", "animal weight"],
        weightUnit: ["weight unit", "unit", "units"],
        followUpDate: ["follow up date", "followup date", "follow up", "next date", "recheck date"]
      }
    }
  };

  const esc = (value = "") =>
    String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);

  const cleanText = (value) => String(value ?? "").trim();

  const normalize = (value) =>
    cleanText(value)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const uid = (prefix) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  function ensureStyles() {
    if (document.querySelector("#hh-spreadsheet-import-styles")) return;
    const style = document.createElement("style");
    style.id = "hh-spreadsheet-import-styles";
    style.textContent = `
      .hh-import-summary {
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
        gap:10px;
        margin:14px 0;
      }
      .hh-import-stat {
        padding:12px;
        border:1px solid var(--border);
        border-radius:14px;
        background:var(--cream-2);
      }
      .hh-import-stat strong,
      .hh-import-stat span { display:block; }
      .hh-import-stat strong { color:var(--navy); font-size:1.2rem; }
      .hh-import-stat span { color:var(--muted); font-size:.76rem; margin-top:2px; }
      .hh-import-sheet-list {
        display:flex;
        flex-wrap:wrap;
        gap:7px;
        margin:10px 0 16px;
      }
      .hh-import-issues {
        max-height:240px;
        overflow:auto;
        display:grid;
        gap:8px;
        margin:12px 0;
      }
      .hh-import-issue {
        padding:10px 12px;
        border:1px solid var(--border);
        border-left:4px solid var(--gold);
        border-radius:10px;
        background:var(--cream-2);
        font-size:.82rem;
      }
      .hh-import-issue small {
        display:block;
        margin-top:7px;
        color:var(--muted);
        font-size:.78rem;
        line-height:1.45;
      }
      .hh-import-issue.error { border-left-color:var(--danger); }
      .hh-import-issue.duplicate { border-left-color:var(--teal); }
      .hh-import-preview {
        margin-top:14px;
        max-height:260px;
        overflow:auto;
      }
      .hh-import-preview table { min-width:680px; }
      .hh-import-privacy {
        margin:12px 0 0;
        color:var(--muted);
        font-size:.78rem;
      }
      @media (max-width:700px) {
        .hh-import-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
      }
    `;
    document.head.appendChild(style);
  }

  function rawCellValue(cell) {
    const value = cell?.value;
    if (value == null) return "";
    if (value instanceof Date) return value;
    if (typeof value !== "object") return value;
    if (Object.prototype.hasOwnProperty.call(value, "result")) return value.result ?? "";
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text ?? "";
    return cell.text || "";
  }

  function valueForHeader(cell) {
    return cleanText(cell?.text || rawCellValue(cell));
  }

  function findHeaderRow(worksheet) {
    const lastRow = Math.min(worksheet.rowCount || 0, 15);
    for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = [];
      for (let column = 1; column <= Math.max(row.cellCount, 1); column += 1) {
        values.push(valueForHeader(row.getCell(column)));
      }
      const nonEmpty = values.filter(Boolean);
      if (nonEmpty.length >= 2) return { rowNumber, values };
    }
    return null;
  }

  function schemaHeaderMap(schema, headers) {
    const normalizedHeaders = headers.map(normalize);
    const map = {};
    Object.entries(schema.fields).forEach(([field, aliases]) => {
      const normalizedAliases = aliases.map(normalize);
      const index = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
      if (index >= 0) map[field] = index + 1;
    });
    return map;
  }

  function detectSheetType(worksheet, header) {
    const normalizedName = normalize(worksheet.name);
    if ([
      "instruction",
      "instructions",
      "read me",
      "readme",
      "list",
      "lists",
      "reference",
      "references",
      "dashboard",
      "summary"
    ].includes(normalizedName)) return "";
    const annualMap = schemaHeaderMap(SCHEMAS.annualPlans, header.values);
    const annualAmountFieldCount = ANNUAL_PLAN_FIELDS
      .filter(({ field }) => Boolean(annualMap[field]))
      .length;
    if (
      annualMap.animalRef &&
      (
        annualAmountFieldCount >= 2 ||
        SCHEMAS.annualPlans.sheetNames.some((name) => normalize(name) === normalizedName)
      )
    ) {
      return "annualPlans";
    }
    const byName = Object.entries(SCHEMAS).find(([, schema]) =>
      schema.sheetNames.some((name) => normalize(name) === normalizedName)
    );
    if (byName) return byName[0];
    const scored = Object.entries(SCHEMAS)
      .map(([type, schema]) => ({
        type,
        score: Object.keys(schemaHeaderMap(schema, header.values)).length
      }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.score >= 3 ? scored[0].type : "";
  }

  function worksheetRows(worksheet, header) {
    const rows = [];
    for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = {};
      let hasValue = false;
      for (let column = 1; column <= Math.max(row.cellCount, header.values.length); column += 1) {
        const value = rawCellValue(row.getCell(column));
        values[column] = value;
        if (cleanText(value)) hasValue = true;
      }
      if (hasValue) rows.push({ rowNumber, values });
    }
    return rows;
  }

  function fieldValue(row, map, field) {
    const column = map[field];
    return column ? row.values[column] : "";
  }

  function excelDateNumberToISO(value) {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return "";
    const milliseconds = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function dateToISO(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, "0");
      const day = String(value.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    if (typeof value === "number") return excelDateNumberToISO(value);

    const text = cleanText(value);
    if (!text) return "";
    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
      const [, year, month, day] = match;
      return validISODate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    }
    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (match) {
      let [, month, day, year] = match;
      if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
      return validISODate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return "";
    return dateToISO(parsed);
  }

  function validISODate(value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? value
      : "";
  }

  function moneyNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const text = cleanText(value);
    if (!text) return NaN;
    const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
    const number = Number(text.replace(/[$,\s()]/g, ""));
    if (!Number.isFinite(number)) return NaN;
    return negative ? -Math.abs(number) : number;
  }

  function canonicalFromList(value, choices, aliases = {}) {
    const normalized = normalize(value);
    if (!normalized) return "";
    if (aliases[normalized]) return aliases[normalized];
    return choices.find((choice) => normalize(choice) === normalized) || "";
  }

  function canonicalSpecies(value, speciesChoices) {
    const aliases = {
      rabbits: "Rabbit",
      bunny: "Rabbit",
      bunnies: "Rabbit",
      chickens: "Chicken",
      hen: "Chicken",
      rooster: "Chicken",
      ducks: "Duck",
      turkeys: "Turkey",
      dogs: "Dog",
      canine: "Dog",
      horses: "Horse",
      equine: "Horse",
      goats: "Goat",
      sheep: "Sheep",
      cattle: "Cattle",
      cow: "Cattle",
      cows: "Cattle",
      pigs: "Pig",
      swine: "Pig"
    };
    return canonicalFromList(value, speciesChoices, aliases);
  }

  function speciesFromSheetName(sheetName, speciesChoices) {
    const normalizedName = normalize(sheetName);
    const singular = normalizedName.endsWith("s")
      ? normalizedName.slice(0, -1)
      : normalizedName;
    return canonicalSpecies(singular, speciesChoices);
  }

  function canonicalSex(value) {
    const aliases = {
      f: "Female",
      doe: "Female",
      hen: "Female",
      mare: "Female",
      cow: "Female",
      ewe: "Female",
      sow: "Female",
      spayed: "Female",
      "spayed female": "Female",
      "neutered female": "Female",
      m: "Male",
      buck: "Male",
      rooster: "Male",
      ram: "Male",
      boar: "Male",
      bull: "Male",
      stallion: "Male",
      gelding: "Male",
      steer: "Male",
      wether: "Male",
      neutered: "Male",
      "neutered male": "Male",
      unknown: "Unknown",
      u: "Unknown"
    };
    return canonicalFromList(value, ["Female", "Male", "Unknown"], aliases);
  }

  function canonicalHealthType(value) {
    const aliases = {
      weigh: "Weight",
      weighing: "Weight",
      treatment: "Treatment",
      deworming: "Treatment",
      "hoof claw trim": "Treatment",
      "injury treatment": "Treatment",
      "parasite treatment": "Treatment",
      med: "Medication",
      medicine: "Medication",
      meds: "Medication",
      vaccine: "Vaccination",
      shot: "Vaccination",
      check: "Observation",
      note: "Observation",
      "pregnancy check": "Veterinary visit",
      "respiratory check": "Veterinary visit",
      "wellness exam": "Veterinary visit",
      vet: "Veterinary visit",
      veterinarian: "Veterinary visit",
      "vet visit": "Veterinary visit",
      "veterinary appointment": "Veterinary visit"
    };
    return canonicalFromList(value, RECORD_TYPES, aliases);
  }

  function canonicalTransactionType(value) {
    return canonicalFromList(value, ["Expense", "Income"], {
      cost: "Expense",
      purchase: "Expense",
      spent: "Expense",
      sale: "Income",
      revenue: "Income",
      received: "Income"
    });
  }

  function canonicalClassification(value, type) {
    if (type === "Income") return "";
    const normalized = normalize(value);
    if (!normalized) return "Operating";
    if (["capital", "capital purchase", "asset", "equipment purchase"].includes(normalized)) return "Capital";
    if (["operating", "operating expense", "expense"].includes(normalized)) return "Operating";
    return "";
  }

  function canonicalScope(value) {
    return canonicalFromList(value, ["Operation", "Species", "Animal"], {
      farm: "Operation",
      whole: "Operation",
      "whole operation": "Operation",
      herd: "Operation",
      livestock: "Species",
      individual: "Animal"
    });
  }

  function canonicalProductionProduct(value) {
    const text = cleanText(value);
    const normalized = normalize(text);
    const aliases = {
      egg: "Eggs",
      eggs: "Eggs",
      "table eggs": "Eggs",
      broiler: "Broilers",
      broilers: "Broilers",
      "broiler chicken": "Broilers",
      "broiler chickens": "Broilers",
      chicken: "Broilers",
      chickens: "Broilers",
      dairy: "Milk",
      milk: "Milk",
      "cow milk": "Milk",
      "goat milk": "Milk"
    };
    return aliases[normalized] || text;
  }

  function productionDefaults(product) {
    if (product === "Eggs") return { species: "Chicken", unit: "eggs" };
    if (product === "Broilers") return { species: "Chicken", unit: "birds" };
    if (product === "Milk") return { species: "Cattle", unit: "gallons" };
    return { species: "", unit: "units" };
  }

  function productFromSheetName(sheetName) {
    const normalizedName = normalize(sheetName);
    if (normalizedName.includes("egg")) return "Eggs";
    if (normalizedName.includes("broiler")) return "Broilers";
    if (normalizedName.includes("milk") || normalizedName.includes("dairy")) return "Milk";
    return "";
  }

  function animalReferenceKeys(animal) {
    return [
      animal.id ? `id:${normalize(animal.id)}` : "",
      animal.tag ? `tag:${normalize(animal.tag)}` : "",
      animal.tattoo ? `tattoo:${normalize(animal.tattoo)}` : "",
      animal.registrationNumber ? `registration:${normalize(animal.registrationNumber)}` : "",
      animal.name ? `name:${normalize(animal.name)}` : ""
    ].filter(Boolean);
  }

  function buildAnimalLookup(animals) {
    const lookup = new Map();
    animals.forEach((animal) => {
      animalReferenceKeys(animal).forEach((key) => {
        const matches = lookup.get(key) || [];
        matches.push(animal);
        lookup.set(key, matches);
      });
    });
    return lookup;
  }

  function resolveAnimal(reference, lookup) {
    const normalized = normalize(reference);
    if (!normalized) return { animal: null, reason: "blank" };
    const keys = [
      `id:${normalized}`,
      `tag:${normalized}`,
      `tattoo:${normalized}`,
      `registration:${normalized}`,
      `name:${normalized}`
    ];
    const unique = new Map();
    keys.forEach((key) => {
      (lookup.get(key) || []).forEach((animal) => unique.set(animal.id, animal));
    });
    const matches = [...unique.values()];
    if (matches.length === 1) return { animal: matches[0], reason: "" };
    return { animal: null, reason: matches.length > 1 ? "ambiguous" : "missing" };
  }

  function animalDuplicateKey(animal) {
    const identifiers = [
      animal.registrationNumber ? `registration:${normalize(animal.registrationNumber)}` : "",
      animal.tattoo ? `tattoo:${normalize(animal.tattoo)}` : "",
      animal.tag ? `tag:${normalize(animal.tag)}` : ""
    ].filter(Boolean);
    if (identifiers.length) return identifiers;
    if (animal.name && animal.species && animal.dob) {
      return [`identity:${normalize(animal.name)}:${normalize(animal.species)}:${animal.dob}`];
    }
    return [];
  }

  function issueAdvice(message, level = "error") {
    const normalizedMessage = normalize(message);
    if (level === "duplicate") {
      return "No action is required if this record is already in HerdHarbor. Change its unique ID, tag, date, or amount only if it is a different record.";
    }
    if (normalizedMessage.includes("date") && normalizedMessage.includes("invalid")) {
      return "Use a real Excel date or type the date as YYYY-MM-DD, such as 2026-07-31.";
    }
    if (
      normalizedMessage.includes("animal") &&
      (
        normalizedMessage.includes("not found") ||
        normalizedMessage.includes("was not found") ||
        normalizedMessage.includes("matches more than one") ||
        normalizedMessage.includes("matched uniquely")
      )
    ) {
      return "Identify the animal with a unique ID/tag, tattoo, registration number, or an exact name that is used by only one animal.";
    }
    if (normalizedMessage.includes("species")) {
      return "Use one of the species shown in HerdHarbor Settings, or add the species to the workspace before importing.";
    }
    if (normalizedMessage.includes("sex")) {
      return "Use Female, Male, Unknown, Doe, Buck, Hen, Rooster, Mare, Stallion, Gelding, or another recognized sex label.";
    }
    if (normalizedMessage.includes("status")) {
      return `Use one of these statuses: ${ANIMAL_STATUSES.join(", ")}.`;
    }
    if (normalizedMessage.includes("amount") || normalizedMessage.includes("cost")) {
      return "Enter a number without extra words. Actual transactions must be greater than zero; annual planned amounts may be zero or greater.";
    }
    if (normalizedMessage.includes("quantity")) {
      return "Enter numeric quantities only. Total production must be greater than zero, and sold, used, stored, donated, and wasted quantities cannot exceed that total.";
    }
    if (normalizedMessage.includes("product")) {
      return "Enter Eggs, Broilers, Milk, or a clear name for another farm product.";
    }
    if (normalizedMessage.includes("weight")) {
      return "Enter a numeric weight and use lb, oz, kg, or g for the unit.";
    }
    if (normalizedMessage.includes("record type") || normalizedMessage.includes("medical type")) {
      return `Use a common medical label; HerdHarbor maps it to ${RECORD_TYPES.join(", ")}.`;
    }
    if (normalizedMessage.includes("required") || normalizedMessage.includes("blank")) {
      return "Fill in the named cell on this row, then upload the corrected workbook again.";
    }
    if (level === "warning") {
      return "Review this row. It can still import, but part of the source information may need a manual correction afterward.";
    }
    return "Correct the named value on this workbook row, save the file as .xlsx, and upload it again.";
  }

  function issue(result, source, message, level = "error") {
    result.issues.push({
      level,
      sheet: source.sheet,
      row: source.row,
      message,
      advice: issueAdvice(message, level)
    });
    if (level === "error") result.errorCount += 1;
    if (level === "duplicate") result.duplicateCount += 1;
    if (level === "warning") result.warningCount += 1;
  }

  function sourceFor(sheet, row) {
    return { sheet: sheet.name, row: row.rowNumber };
  }

  function stageAnimals(sheets, context, result) {
    const existingKeys = new Set(context.animals.flatMap(animalDuplicateKey));
    const stagedKeys = new Set();
    const pendingParents = [];

    sheets.forEach(({ worksheet, header, map }) => {
      worksheetRows(worksheet, header).forEach((row) => {
        const source = sourceFor(worksheet, row);
        const name = cleanText(fieldValue(row, map, "name"));
        const speciesRaw = cleanText(fieldValue(row, map, "species")) ||
          speciesFromSheetName(worksheet.name, context.species);
        const species = canonicalSpecies(speciesRaw, context.species);
        const sexRaw = cleanText(fieldValue(row, map, "sex"));
        const sex = sexRaw ? canonicalSex(sexRaw) : "Unknown";
        const statusRaw = cleanText(fieldValue(row, map, "status"));
        const status = statusRaw
          ? canonicalFromList(statusRaw, ANIMAL_STATUSES, {
            alive: "Active",
            available: "For Sale",
            dead: "Deceased",
            ancestor: "Ancestor Only"
          })
          : "Active";
        const dobRaw = fieldValue(row, map, "dob");
        const dob = dateToISO(dobRaw);

        if (!name) {
          issue(result, source, "Animal name is required.");
          return;
        }
        if (!species) {
          issue(result, source, speciesRaw
            ? `Species “${speciesRaw}” is not supported in this workspace.`
            : "Species is required.");
          return;
        }
        if (!sex) {
          issue(result, source, `Sex “${sexRaw}” must be Female, Male, or Unknown.`);
          return;
        }
        if (!status) {
          issue(result, source, `Status “${statusRaw}” is not recognized.`);
          return;
        }
        if (cleanText(dobRaw) && !dob) {
          issue(result, source, `Date of birth “${cleanText(dobRaw)}” is invalid.`);
          return;
        }

        const existingNotes = cleanText(fieldValue(row, map, "notes"));
        const importedWeight = cleanText(fieldValue(row, map, "weight"));
        const importedWeightUnit = cleanText(fieldValue(row, map, "weightUnit"));
        const acquisitionDateRaw = fieldValue(row, map, "acquisitionDate");
        const acquisitionDate = dateToISO(acquisitionDateRaw);
        const purchaseCostRaw = fieldValue(row, map, "purchaseCost");
        const purchaseCost = cleanText(purchaseCostRaw) ? moneyNumber(purchaseCostRaw) : NaN;
        const medicalStatus = cleanText(fieldValue(row, map, "medicalStatus"));
        const preservedNotes = [
          existingNotes,
          sexRaw && normalize(sexRaw) !== normalize(sex)
            ? `Imported sex: ${sexRaw}`
            : "",
          importedWeight
            ? `Imported weight: ${importedWeight}${importedWeightUnit ? ` ${importedWeightUnit}` : ""}`
            : "",
          cleanText(acquisitionDateRaw)
            ? `Acquisition date: ${acquisitionDate || cleanText(acquisitionDateRaw)}`
            : "",
          cleanText(purchaseCostRaw)
            ? `Purchase cost: ${Number.isFinite(purchaseCost) ? `$${purchaseCost.toFixed(2)}` : cleanText(purchaseCostRaw)}`
            : "",
          medicalStatus ? `Medical status: ${medicalStatus}` : ""
        ].filter(Boolean).join("\n");

        const animal = {
          id: uid("animal"),
          name,
          tag: cleanText(fieldValue(row, map, "tag")),
          tattoo: cleanText(fieldValue(row, map, "tattoo")),
          registrationNumber: cleanText(fieldValue(row, map, "registrationNumber")),
          breeder: cleanText(fieldValue(row, map, "breeder")),
          species,
          breed: cleanText(fieldValue(row, map, "breed")),
          sex,
          dob,
          color: cleanText(fieldValue(row, map, "color")),
          location: cleanText(fieldValue(row, map, "location")),
          status,
          sireId: "",
          damId: "",
          notes: preservedNotes,
          importSource: {
            type: "Excel spreadsheet",
            fileName: context.fileName || "",
            sheet: worksheet.name,
            row: row.rowNumber
          },
          createdAt: new Date().toISOString()
        };

        const keys = animalDuplicateKey(animal);
        if (keys.some((key) => existingKeys.has(key) || stagedKeys.has(key))) {
          issue(result, source, `${name} matches an existing or earlier spreadsheet animal and will be skipped.`, "duplicate");
          return;
        }
        keys.forEach((key) => stagedKeys.add(key));
        result.records.animals.push(animal);
        pendingParents.push({
          animal,
          sireRef: cleanText(fieldValue(row, map, "sireRef")),
          damRef: cleanText(fieldValue(row, map, "damRef")),
          source
        });
      });
    });

    const lookup = buildAnimalLookup([...context.animals, ...result.records.animals]);
    pendingParents.forEach(({ animal, sireRef, damRef, source }) => {
      [
        ["sireId", sireRef, "sire"],
        ["damId", damRef, "dam"]
      ].forEach(([field, reference, label]) => {
        if (!reference) return;
        const resolved = resolveAnimal(reference, lookup);
        if (resolved.animal) {
          animal[field] = resolved.animal.id;
        } else {
          issue(
            result,
            source,
            `${animal.name}'s ${label} “${reference}” could not be matched uniquely; the animal will import without that parent link.`,
            "warning"
          );
        }
      });
    });
  }

  function stageHealth(sheets, context, result) {
    const lookup = buildAnimalLookup([...context.animals, ...result.records.animals]);
    const duplicateKeys = new Set(
      context.health.map((record) =>
        [
          record.animalId,
          record.date,
          normalize(record.type),
          cleanText(record.weight),
          normalize(record.details)
        ].join("|")
      )
    );

    sheets.forEach(({ worksheet, header, map }) => {
      worksheetRows(worksheet, header).forEach((row) => {
        const source = sourceFor(worksheet, row);
        const animalRef = cleanText(fieldValue(row, map, "animalRef"));
        const resolved = resolveAnimal(animalRef, lookup);
        const dateRaw = fieldValue(row, map, "date");
        const date = dateToISO(dateRaw);
        const typeRaw = cleanText(fieldValue(row, map, "type"));
        const weightRaw = fieldValue(row, map, "weight");
        const weightNumber = cleanText(weightRaw) ? moneyNumber(weightRaw) : NaN;
        const weight = Number.isFinite(weightNumber) && weightNumber >= 0
          ? String(weightNumber)
          : "";
        const type = canonicalHealthType(typeRaw) ||
          (!typeRaw && (normalize(worksheet.name) === "weights" || weight) ? "Weight" : "");
        const unitRaw = cleanText(fieldValue(row, map, "weightUnit"));
        const weightUnit = canonicalFromList(unitRaw || "lb", ["lb", "oz", "kg", "g"]);
        const followUpRaw = fieldValue(row, map, "followUpDate");
        const followUpDate = dateToISO(followUpRaw);

        if (!animalRef || !resolved.animal) {
          const reason = resolved.reason === "ambiguous" ? "matches more than one animal" : "was not found";
          issue(result, source, `Animal “${animalRef || "(blank)"}” ${reason}.`);
          return;
        }
        if (!date) {
          issue(result, source, `Medical date “${cleanText(dateRaw) || "(blank)"}” is invalid.`);
          return;
        }
        if (!type) {
          issue(result, source, `Medical record type “${typeRaw || "(blank)"}” is not recognized.`);
          return;
        }
        if (cleanText(weightRaw) && !Number.isFinite(weightNumber)) {
          issue(result, source, `Weight “${cleanText(weightRaw)}” is invalid.`);
          return;
        }
        if (type === "Weight" && !weight) {
          issue(result, source, "A Weight record requires a numeric weight.");
          return;
        }
        if (unitRaw && !weightUnit) {
          issue(result, source, `Weight unit “${unitRaw}” must be lb, oz, kg, or g.`);
          return;
        }
        if (cleanText(followUpRaw) && !followUpDate) {
          issue(result, source, `Follow-up date “${cleanText(followUpRaw)}” is invalid.`);
          return;
        }

        const medicalCostRaw = fieldValue(row, map, "cost");
        const medicalCost = cleanText(medicalCostRaw) ? moneyNumber(medicalCostRaw) : NaN;
        if (cleanText(medicalCostRaw) && (!Number.isFinite(medicalCost) || medicalCost < 0)) {
          issue(result, source, `Medical cost “${cleanText(medicalCostRaw)}” is invalid.`);
          return;
        }
        const medication = cleanText(fieldValue(row, map, "medication"));
        const dose = cleanText(fieldValue(row, map, "dose"));
        const detailParts = [
          typeRaw && normalize(typeRaw) !== normalize(type)
            ? `Original record type: ${typeRaw}`
            : "",
          cleanText(fieldValue(row, map, "details")),
          cleanText(fieldValue(row, map, "condition"))
            ? `Condition / reason: ${cleanText(fieldValue(row, map, "condition"))}`
            : "",
          cleanText(fieldValue(row, map, "treatment"))
            ? `Treatment / procedure: ${cleanText(fieldValue(row, map, "treatment"))}`
            : "",
          medication
            ? `Medication: ${medication}${dose ? ` · Dose: ${dose}` : ""}`
            : dose
              ? `Dose: ${dose}`
              : "",
          cleanText(fieldValue(row, map, "provider"))
            ? `Provider: ${cleanText(fieldValue(row, map, "provider"))}`
            : "",
          Number.isFinite(medicalCost)
            ? `Medical cost: $${medicalCost.toFixed(2)}`
            : "",
          cleanText(fieldValue(row, map, "followUpStatus"))
            ? `Follow-up status: ${cleanText(fieldValue(row, map, "followUpStatus"))}`
            : "",
          cleanText(fieldValue(row, map, "notes"))
        ].filter(Boolean);
        const details = detailParts.length
          ? detailParts.join("\n")
          : `${type} imported from spreadsheet.`;
        const record = {
          id: uid("health"),
          animalId: resolved.animal.id,
          date,
          type,
          details,
          weight,
          weightUnit: weightUnit || "lb",
          followUpDate,
          importSource: {
            type: "Excel spreadsheet",
            fileName: context.fileName || "",
            sheet: worksheet.name,
            row: row.rowNumber
          },
          createdAt: new Date().toISOString()
        };
        const duplicateKey = [
          record.animalId,
          record.date,
          normalize(record.type),
          record.weight,
          normalize(record.details)
        ].join("|");
        if (duplicateKeys.has(duplicateKey)) {
          issue(result, source, `Medical record for ${resolved.animal.name} on ${date} already exists and will be skipped.`, "duplicate");
          return;
        }
        duplicateKeys.add(duplicateKey);
        result.records.health.push(record);
      });
    });
  }

  function annualPlanDuplicateKey(record) {
    return [
      String(record.year || ""),
      normalize(record.type),
      normalize(record.category),
      record.animalId || normalize(record.species)
    ].join("|");
  }

  function stageAnnualPlans(sheets, context, result) {
    const lookup = buildAnimalLookup([...context.animals, ...result.records.animals]);
    const duplicateKeys = new Set(
      (context.annualBudgetPlans || []).map(annualPlanDuplicateKey)
    );

    sheets.forEach(({ worksheet, header, map }) => {
      const usesDefaultYear = !map.year;
      if (usesDefaultYear) {
        issue(
          result,
          { sheet: worksheet.name, row: header.rowNumber },
          `No budget year column was found. Annual plans will use ${context.defaultBudgetYear}.`,
          "warning"
        );
      }

      worksheetRows(worksheet, header).forEach((row) => {
        const source = sourceFor(worksheet, row);
        const animalRef = cleanText(fieldValue(row, map, "animalRef"));
        const resolved = resolveAnimal(animalRef, lookup);
        const yearRaw = cleanText(fieldValue(row, map, "year"));
        const year = yearRaw ? Number(yearRaw) : context.defaultBudgetYear;

        if (!animalRef || !resolved.animal) {
          const reason = resolved.reason === "ambiguous" ? "matches more than one animal" : "was not found";
          issue(result, source, `Annual budget animal “${animalRef || "(blank)"}” ${reason}.`);
          return;
        }
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          issue(result, source, `Annual budget year “${yearRaw || "(blank)"}” is invalid.`);
          return;
        }

        let recognizedAmounts = 0;
        let addedAmounts = 0;
        const duplicateCategories = [];
        const invalidCategories = [];

        ANNUAL_PLAN_FIELDS.forEach(({ field, type, category }) => {
          const rawAmount = fieldValue(row, map, field);
          if (!cleanText(rawAmount)) return;
          recognizedAmounts += 1;
          const amount = moneyNumber(rawAmount);
          if (!Number.isFinite(amount) || amount < 0) {
            invalidCategories.push(category);
            return;
          }
          if (amount === 0) return;

          const record = {
            id: uid("annual_budget"),
            year,
            type,
            category,
            scope: "Animal",
            species: resolved.animal.species || "",
            animalId: resolved.animal.id,
            amount: amount.toFixed(2),
            importSource: {
              type: "Excel spreadsheet",
              fileName: context.fileName || "",
              sheet: worksheet.name,
              row: row.rowNumber,
              column: field
            },
            createdAt: new Date().toISOString()
          };
          const duplicateKey = annualPlanDuplicateKey(record);
          if (duplicateKeys.has(duplicateKey)) {
            duplicateCategories.push(category);
            return;
          }
          duplicateKeys.add(duplicateKey);
          result.records.annualBudgetPlans.push(record);
          addedAmounts += 1;
        });

        if (!recognizedAmounts) {
          issue(result, source, "No recognized annual budget amounts were found on this row.");
          return;
        }
        if (invalidCategories.length) {
          issue(
            result,
            source,
            `Invalid annual amount${invalidCategories.length === 1 ? "" : "s"}: ${invalidCategories.join(", ")}.`
          );
        }
        if (duplicateCategories.length) {
          issue(
            result,
            source,
            `${duplicateCategories.join(", ")} already ${duplicateCategories.length === 1 ? "has" : "have"} an annual plan for ${year} and will be skipped.`,
            "duplicate"
          );
        }
        if (!addedAmounts && !invalidCategories.length && !duplicateCategories.length) {
          issue(result, source, "Annual budget amounts are all zero; no plan records will be added.", "warning");
        }
      });
    });
  }

  function stageTransactions(sheets, context, result) {
    const lookup = buildAnimalLookup([...context.animals, ...result.records.animals]);
    const duplicateKeys = new Set(
      context.transactions.map((record) => [
        record.date,
        normalize(record.type),
        Number(record.amount || 0).toFixed(2),
        normalize(record.category),
        normalize(record.scope),
        record.animalId || normalize(record.species),
        normalize(record.description),
        normalize(record.party)
      ].join("|"))
    );

    sheets.forEach(({ worksheet, header, map }) => {
      worksheetRows(worksheet, header).forEach((row) => {
        const source = sourceFor(worksheet, row);
        const dateRaw = fieldValue(row, map, "date");
        const date = dateToISO(dateRaw);
        const typeRaw = cleanText(fieldValue(row, map, "type"));
        const type = canonicalTransactionType(typeRaw);
        const amountRaw = fieldValue(row, map, "amount");
        const parsedAmount = moneyNumber(amountRaw);
        const amount = Number.isFinite(parsedAmount) ? Math.abs(parsedAmount) : NaN;
        const classificationRaw = cleanText(fieldValue(row, map, "classification"));
        const classification = canonicalClassification(classificationRaw, type);
        const animalRef = cleanText(fieldValue(row, map, "animalRef"));
        const speciesRaw = cleanText(fieldValue(row, map, "species"));
        const species = speciesRaw ? canonicalSpecies(speciesRaw, context.species) : "";
        const scopeRaw = cleanText(fieldValue(row, map, "scope"));
        let scope = scopeRaw ? canonicalScope(scopeRaw) : "";
        if (!scope) scope = animalRef ? "Animal" : species ? "Species" : "Operation";
        const resolved = animalRef ? resolveAnimal(animalRef, lookup) : { animal: null, reason: "blank" };

        if (!date) {
          issue(result, source, `Transaction date “${cleanText(dateRaw) || "(blank)"}” is invalid.`);
          return;
        }
        if (!type) {
          issue(result, source, `Transaction type “${typeRaw || "(blank)"}” must be Income or Expense.`);
          return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          issue(result, source, `Amount “${cleanText(amountRaw) || "(blank)"}” must be greater than zero.`);
          return;
        }
        if (type === "Expense" && !classification) {
          issue(result, source, `Expense classification “${classificationRaw}” must be Operating or Capital.`);
          return;
        }
        if (scopeRaw && !canonicalScope(scopeRaw)) {
          issue(result, source, `Scope “${scopeRaw}” must be Operation, Species, or Animal.`);
          return;
        }
        if (scope === "Animal" && !resolved.animal) {
          const reason = resolved.reason === "ambiguous" ? "matches more than one animal" : "was not found";
          issue(result, source, `Animal “${animalRef || "(blank)"}” ${reason}.`);
          return;
        }
        if (scope === "Species" && !species) {
          issue(result, source, speciesRaw
            ? `Species “${speciesRaw}” is not supported in this workspace.`
            : "A species-assigned transaction requires a species.");
          return;
        }

        const category = cleanText(fieldValue(row, map, "category")) ||
          (type === "Income" ? "Other Income" : "Other Expense");
        const record = {
          id: uid("transaction"),
          date,
          type,
          classification: type === "Income" ? "" : classification,
          category,
          scope,
          species: scope === "Animal"
            ? resolved.animal.species || ""
            : scope === "Species"
              ? species
              : "",
          animalId: scope === "Animal" ? resolved.animal.id : "",
          amount: amount.toFixed(2),
          party: cleanText(fieldValue(row, map, "party")),
          description: cleanText(fieldValue(row, map, "description")),
          notes: cleanText(fieldValue(row, map, "notes")),
          importSource: {
            type: "Excel spreadsheet",
            fileName: context.fileName || "",
            sheet: worksheet.name,
            row: row.rowNumber
          },
          createdAt: new Date().toISOString()
        };
        const duplicateKey = [
          record.date,
          normalize(record.type),
          record.amount,
          normalize(record.category),
          normalize(record.scope),
          record.animalId || normalize(record.species),
          normalize(record.description),
          normalize(record.party)
        ].join("|");
        if (duplicateKeys.has(duplicateKey)) {
          issue(result, source, `${type} transaction on ${date} for $${record.amount} already exists and will be skipped.`, "duplicate");
          return;
        }
        duplicateKeys.add(duplicateKey);
        result.records.transactions.push(record);
      });
    });
  }

  function stageProduction(sheets, context, result) {
    const lookup = buildAnimalLookup([...context.animals, ...result.records.animals]);
    const duplicateKeys = new Set(
      (context.productionRecords || []).map((record) => [
        record.date,
        normalize(record.product),
        normalize(record.unit),
        Number(record.quantity || 0).toFixed(2),
        Number(record.soldQuantity || 0).toFixed(2),
        normalize(record.scope),
        record.animalId || normalize(record.species),
        normalize(record.groupName),
        Number(record.saleAmount || 0).toFixed(2)
      ].join("|"))
    );

    sheets.forEach(({ worksheet, header, map }) => {
      worksheetRows(worksheet, header).forEach((row) => {
        const source = sourceFor(worksheet, row);
        const dateRaw = fieldValue(row, map, "date");
        const date = dateToISO(dateRaw);
        const product = canonicalProductionProduct(fieldValue(row, map, "product")) ||
          productFromSheetName(worksheet.name);
        const defaults = productionDefaults(product);
        const unit = cleanText(fieldValue(row, map, "unit")) || defaults.unit;
        const quantityRaw = fieldValue(row, map, "quantity");
        const quantity = moneyNumber(quantityRaw);
        const animalRef = cleanText(fieldValue(row, map, "animalRef"));
        const speciesRaw = cleanText(fieldValue(row, map, "species"));
        const defaultSpecies = defaults.species
          ? canonicalSpecies(defaults.species, context.species)
          : "";
        const species = speciesRaw
          ? canonicalSpecies(speciesRaw, context.species)
          : defaultSpecies;
        const scopeRaw = cleanText(fieldValue(row, map, "scope"));
        let scope = scopeRaw ? canonicalScope(scopeRaw) : "";
        if (!scope) scope = animalRef ? "Animal" : species ? "Species" : "Operation";
        const resolved = animalRef ? resolveAnimal(animalRef, lookup) : { animal: null, reason: "blank" };
        const numericFields = [
          "soldQuantity", "householdQuantity", "feedQuantity", "setAsideQuantity",
          "donatedQuantity", "wasteQuantity", "saleAmount", "totalWeight"
        ];
        const numbers = {};
        let invalidNumericField = "";
        numericFields.forEach((fieldName) => {
          const raw = fieldValue(row, map, fieldName);
          if (!cleanText(raw)) {
            numbers[fieldName] = 0;
            return;
          }
          const parsed = moneyNumber(raw);
          if (!Number.isFinite(parsed) || parsed < 0) invalidNumericField ||= fieldName;
          numbers[fieldName] = parsed;
        });

        if (!date) {
          issue(result, source, `Production date “${cleanText(dateRaw) || "(blank)"}” is invalid.`);
          return;
        }
        if (!product) {
          issue(result, source, "Production product is blank.");
          return;
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          issue(result, source, `Production quantity “${cleanText(quantityRaw) || "(blank)"}” must be greater than zero.`);
          return;
        }
        if (!unit) {
          issue(result, source, "Production unit is blank.");
          return;
        }
        if (invalidNumericField) {
          issue(result, source, `${invalidNumericField} must be zero or greater.`);
          return;
        }
        if (scopeRaw && !canonicalScope(scopeRaw)) {
          issue(result, source, `Scope “${scopeRaw}” must be Operation, Species, or Animal.`);
          return;
        }
        if (scope === "Animal" && !resolved.animal) {
          const reason = resolved.reason === "ambiguous" ? "matches more than one animal" : "was not found";
          issue(result, source, `Production animal “${animalRef || "(blank)"}” ${reason}.`);
          return;
        }
        if (scope === "Species" && !species) {
          issue(result, source, speciesRaw
            ? `Species “${speciesRaw}” is not supported in this workspace.`
            : "A species-assigned production record requires a species.");
          return;
        }
        const allocated = numbers.soldQuantity + numbers.householdQuantity + numbers.feedQuantity +
          numbers.setAsideQuantity + numbers.donatedQuantity + numbers.wasteQuantity;
        if (allocated > quantity + 0.0001) {
          issue(result, source, `Allocated production quantity ${allocated} is greater than total production ${quantity}.`);
          return;
        }
        if (numbers.saleAmount > 0 && !(numbers.soldQuantity > 0)) {
          issue(result, source, "Sale income requires a quantity sold greater than zero.");
          return;
        }

        const record = {
          id: uid("production"),
          date,
          product,
          scope,
          species: scope === "Animal"
            ? resolved.animal.species || ""
            : scope === "Species"
              ? species
              : "",
          animalId: scope === "Animal" ? resolved.animal.id : "",
          groupName: cleanText(fieldValue(row, map, "groupName")),
          session: product === "Milk" ? cleanText(fieldValue(row, map, "session")) : "",
          unit,
          quantity: String(quantity),
          soldQuantity: String(numbers.soldQuantity),
          householdQuantity: String(numbers.householdQuantity),
          feedQuantity: String(numbers.feedQuantity),
          setAsideQuantity: String(numbers.setAsideQuantity),
          donatedQuantity: String(numbers.donatedQuantity),
          wasteQuantity: String(numbers.wasteQuantity),
          saleAmount: Number(numbers.saleAmount || 0).toFixed(2),
          totalWeight: numbers.totalWeight > 0 ? String(numbers.totalWeight) : "",
          weightUnit: numbers.totalWeight > 0
            ? cleanText(fieldValue(row, map, "weightUnit")) || "lb"
            : "",
          customer: cleanText(fieldValue(row, map, "customer")),
          wasteReason: cleanText(fieldValue(row, map, "wasteReason")),
          notes: cleanText(fieldValue(row, map, "notes")),
          transactionId: "",
          importSource: {
            type: "Excel spreadsheet",
            fileName: context.fileName || "",
            sheet: worksheet.name,
            row: row.rowNumber
          },
          createdAt: new Date().toISOString()
        };
        const duplicateKey = [
          record.date,
          normalize(record.product),
          normalize(record.unit),
          Number(record.quantity).toFixed(2),
          Number(record.soldQuantity).toFixed(2),
          normalize(record.scope),
          record.animalId || normalize(record.species),
          normalize(record.groupName),
          Number(record.saleAmount).toFixed(2)
        ].join("|");
        if (duplicateKeys.has(duplicateKey)) {
          issue(result, source, `${record.product} production on ${date} already exists and will be skipped.`, "duplicate");
          return;
        }
        duplicateKeys.add(duplicateKey);
        result.records.productionRecords.push(record);
      });
    });
  }

  function requiredFieldsPresent(type, map, worksheet, context) {
    const required = {
      animals: ["name", "species"],
      health: ["animalRef", "date", "type"],
      annualPlans: ["animalRef"],
      transactions: ["date", "type", "amount"],
      production: ["date", "product", "quantity"]
    }[type];
    return required.filter((field) => {
      if (map[field]) return false;
      if (type === "animals" && field === "species" &&
        speciesFromSheetName(worksheet.name, context.species)) return false;
      if (type === "health" && field === "type" &&
        (normalize(worksheet.name) === "weights" || map.weight)) return false;
      if (type === "production" && field === "product" && productFromSheetName(worksheet.name)) return false;
      return true;
    });
  }

  async function normalizePrefixedWorkbook(buffer) {
    if (!window.JSZip?.loadAsync) {
      throw new Error("The Excel compatibility reader did not load. Close and reopen HerdHarbor, then try again.");
    }
    const zip = await window.JSZip.loadAsync(buffer);
    const workbookEntry = zip.file("xl/workbook.xml");
    if (!workbookEntry) throw new Error("This file does not contain a readable Excel workbook.");
    const workbookXml = await workbookEntry.async("string");
    if (!/<\/?x:/.test(workbookXml)) return buffer;

    let xmlBytes = 0;
    const xmlEntries = Object.values(zip.files).filter(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml")
    );
    for (const entry of xmlEntries) {
      const xml = await entry.async("string");
      xmlBytes += xml.length;
      if (xmlBytes > MAX_COMPAT_XML_BYTES) {
        throw new Error("This workbook expands beyond the safe import limit. Split it into smaller files.");
      }
      const normalizedXml = xml
        .replace(/<x:tableParts\b[\s\S]*?<\/x:tableParts>/g, "")
        .replace(/(<\/?)x:/g, "$1");
      if (normalizedXml !== xml) zip.file(entry.name, normalizedXml);
    }
    return zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
  }

  async function loadCompatibleWorkbook(buffer) {
    const workbook = new window.ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
      return workbook;
    } catch (originalError) {
      const normalizedBuffer = await normalizePrefixedWorkbook(buffer);
      if (normalizedBuffer === buffer) throw originalError;
      const compatibleWorkbook = new window.ExcelJS.Workbook();
      await compatibleWorkbook.xlsx.load(normalizedBuffer);
      return compatibleWorkbook;
    }
  }

  async function parseWorkbookBuffer(buffer, context) {
    if (!window.ExcelJS?.Workbook) {
      throw new Error("The Excel reader did not load. Close and reopen HerdHarbor, then try again.");
    }

    const workbook = await loadCompatibleWorkbook(buffer);
    const result = {
      records: { animals: [], transactions: [], productionRecords: [], annualBudgetPlans: [], health: [] },
      issues: [],
      parsedSheets: [],
      ignoredSheets: [],
      errorCount: 0,
      warningCount: 0,
      duplicateCount: 0,
      totalRows: 0
    };
    const sheetsByType = { animals: [], transactions: [], production: [], annualPlans: [], health: [] };

    workbook.eachSheet((worksheet) => {
      const header = findHeaderRow(worksheet);
      if (!header) {
        result.ignoredSheets.push(worksheet.name);
        return;
      }
      const type = detectSheetType(worksheet, header);
      if (!type) {
        result.ignoredSheets.push(worksheet.name);
        return;
      }
      const map = schemaHeaderMap(SCHEMAS[type], header.values);
      const missing = requiredFieldsPresent(type, map, worksheet, context);
      if (missing.length) {
        result.parsedSheets.push({ name: worksheet.name, type, rows: 0 });
        issue(
          result,
          { sheet: worksheet.name, row: header.rowNumber },
          `Required column${missing.length === 1 ? "" : "s"} not found: ${missing.join(", ")}.`
        );
        return;
      }
      const rows = worksheetRows(worksheet, header);
      result.totalRows += rows.length;
      result.parsedSheets.push({ name: worksheet.name, type, rows: rows.length });
      sheetsByType[type].push({ worksheet, header, map });
    });

    if (!result.parsedSheets.length) {
      throw new Error("No Animals, Production, Budgeting, Annual Budget, or Medical sheet could be recognized.");
    }
    if (result.totalRows > MAX_DATA_ROWS) {
      throw new Error(`This workbook has ${result.totalRows.toLocaleString()} data rows. The current limit is ${MAX_DATA_ROWS.toLocaleString()}.`);
    }

    stageAnimals(sheetsByType.animals, context, result);
    stageHealth(sheetsByType.health, context, result);
    stageTransactions(sheetsByType.transactions, context, result);
    stageProduction(sheetsByType.production, context, result);
    stageAnnualPlans(sheetsByType.annualPlans, context, result);
    return result;
  }

  function summaryCount(result) {
    return result.records.animals.length +
      result.records.transactions.length +
      result.records.productionRecords.length +
      result.records.annualBudgetPlans.length +
      result.records.health.length;
  }

  function previewRows(result, context) {
    const animalById = new Map(
      [...(context.state?.animals || []), ...result.records.animals].map((animal) => [animal.id, animal])
    );
    return [
      ...result.records.animals.map((record) => ({
        area: "Animal",
        date: record.dob || "—",
        subject: record.name,
        details: [record.species, record.breed, record.tag].filter(Boolean).join(" · ") || "Animal record"
      })),
      ...result.records.transactions.map((record) => ({
        area: "Budgeting",
        date: record.date,
        subject: `${record.type} · $${record.amount}`,
        details: [record.category, record.description || record.party].filter(Boolean).join(" · ")
      })),
      ...result.records.productionRecords.map((record) => ({
        area: "Production",
        date: record.date,
        subject: `${record.product} · ${record.quantity} ${record.unit}`,
        details: [
          record.soldQuantity > 0 ? `${record.soldQuantity} sold` : "",
          record.wasteQuantity > 0 ? `${record.wasteQuantity} wasted` : "",
          record.saleAmount > 0 ? `$${record.saleAmount} income` : ""
        ].filter(Boolean).join(" · ") || "Production record"
      })),
      ...result.records.annualBudgetPlans.map((record) => ({
        area: "Annual plan",
        date: String(record.year),
        subject: `${record.type} · $${record.amount}`,
        details: [animalById.get(record.animalId)?.name, record.category].filter(Boolean).join(" · ")
      })),
      ...result.records.health.map((record) => ({
        area: "Medical",
        date: record.date,
        subject: animalById.get(record.animalId)?.name || "Animal",
        details: [record.type, record.weight ? `${record.weight} ${record.weightUnit}` : "", record.details]
          .filter(Boolean)
          .join(" · ")
      }))
    ].slice(0, 12);
  }

  function csvCell(value) {
    const rawText = String(value ?? "");
    const text = /^[=+\-@]/.test(rawText.trimStart()) ? `'${rawText}` : rawText;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadIssueReport(file, result) {
    const rows = [
      ["Workbook", "Sheet", "Row", "Level", "Problem", "How to fix"],
      ...result.issues.map((item) => [
        file.name,
        item.sheet,
        item.row,
        item.level,
        item.message,
        item.advice || issueAdvice(item.message, item.level)
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file.name.replace(/\.[^.]+$/, "")}-HerdHarbor-import-issues.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showReview(file, result, api) {
    ensureStyles();
    const validCount = summaryCount(result);
    const preview = previewRows(result, api);
    const issueLimit = 40;
    const shownIssues = result.issues.slice(0, issueLimit);
    const extraIssues = result.issues.length - shownIssues.length;

    api.openModal("Review Excel import", `
      <p><strong>${esc(file.name)}</strong> was read on this device. Review the results before anything is added.</p>
      <div class="hh-import-sheet-list">
        ${result.parsedSheets.map((sheet) =>
          `<span class="badge">${esc(sheet.name)} · ${sheet.rows} row${sheet.rows === 1 ? "" : "s"}</span>`
        ).join("")}
      </div>
      <div class="hh-import-summary">
        <div class="hh-import-stat"><strong>${result.records.animals.length}</strong><span>Animals ready</span></div>
        <div class="hh-import-stat"><strong>${result.records.transactions.length}</strong><span>Transactions ready</span></div>
        <div class="hh-import-stat"><strong>${result.records.productionRecords.length}</strong><span>Production ready</span></div>
        <div class="hh-import-stat"><strong>${result.records.annualBudgetPlans.length}</strong><span>Annual plans ready</span></div>
        <div class="hh-import-stat"><strong>${result.records.health.length}</strong><span>Medical records ready</span></div>
        <div class="hh-import-stat"><strong>${result.duplicateCount + result.errorCount}</strong><span>Rows skipped</span></div>
      </div>
      ${shownIssues.length ? `
        <h3>Rows needing attention</h3>
        <div class="hh-import-issues">
          ${shownIssues.map((item) => `
            <div class="hh-import-issue ${esc(item.level)}">
              <strong>${esc(item.sheet)} · row ${item.row}</strong><br>
              ${esc(item.message)}
              <small><strong>How to fix:</strong> ${esc(item.advice || issueAdvice(item.message, item.level))}</small>
            </div>
          `).join("")}
          ${extraIssues > 0
            ? `<div class="hh-import-issue">Plus ${extraIssues} additional issue${extraIssues === 1 ? "" : "s"}.</div>`
            : ""}
        </div>
      ` : ""}
      ${preview.length ? `
        <h3>Preview</h3>
        <div class="hh-import-preview data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Area</th><th>Date</th><th>Animal / amount</th><th>Details</th></tr></thead>
            <tbody>${preview.map((item) => `
              <tr>
                <td><span class="badge">${esc(item.area)}</span></td>
                <td>${esc(item.date)}</td>
                <td><strong>${esc(item.subject)}</strong></td>
                <td>${esc(item.details)}</td>
              </tr>
            `).join("")}</tbody>
          </table>
        </div>
      ` : ""}
      <p class="hh-import-privacy">
        Import is additive: existing farm records are not replaced. Duplicate and invalid rows shown above will be skipped.
        The workbook stays on this device and is not uploaded to HerdHarbor servers.
      </p>
      <div class="modal-actions">
        <button type="button" class="button button-ghost" id="hh-cancel-spreadsheet-import">Cancel</button>
        ${result.issues.length
          ? '<button type="button" class="button button-ghost" id="hh-download-import-issues">Download issue report</button>'
          : ""}
        <button type="button" class="button button-primary" id="hh-confirm-spreadsheet-import" ${validCount ? "" : "disabled"}>
          Import ${validCount} record${validCount === 1 ? "" : "s"}
        </button>
      </div>
    `, "Excel spreadsheet import");

    document.querySelector("#hh-cancel-spreadsheet-import")
      ?.addEventListener("click", api.closeModal);
    document.querySelector("#hh-download-import-issues")
      ?.addEventListener("click", () => downloadIssueReport(file, result));
    document.querySelector("#hh-confirm-spreadsheet-import")
      ?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Protecting and importing…";
        try {
          await api.commit(result.records, {
            fileName: file.name,
            parsedSheets: result.parsedSheets,
            duplicateCount: result.duplicateCount,
            errorCount: result.errorCount,
            warningCount: result.warningCount
          });
        } catch (error) {
          button.disabled = false;
          button.textContent = `Import ${validCount} record${validCount === 1 ? "" : "s"}`;
          api.toast(error.message || "The spreadsheet could not be imported.", "error");
        }
      });
  }

  async function openImport(options) {
    const { file } = options;
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      throw new Error("Save the spreadsheet as an .xlsx file, then try again.");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("This workbook is larger than 10 MB. Split it into smaller files before importing.");
    }

    const result = await parseWorkbookBuffer(await file.arrayBuffer(), {
      animals: Array.isArray(options.state.animals) ? options.state.animals : [],
      transactions: Array.isArray(options.state.transactions) ? options.state.transactions : [],
      productionRecords: Array.isArray(options.state.productionRecords) ? options.state.productionRecords : [],
      health: Array.isArray(options.state.health) ? options.state.health : [],
      annualBudgetPlans: Array.isArray(options.state.annualBudgetPlans)
        ? options.state.annualBudgetPlans
        : [],
      species: options.species || [],
      fileName: file.name,
      defaultBudgetYear: new Date().getFullYear()
    });
    showReview(file, result, options);
    return result;
  }

  function styleTemplateSheet(worksheet, widths) {
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D2540" }
    };
    worksheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
    worksheet.getRow(1).height = 32;
    worksheet.columns.forEach((column, index) => {
      column.width = widths[index] || 18;
    });
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount }
    };
  }

  function safeExcelText(value) {
    const text = cleanText(value);
    if (!text) return null;
    return text;
  }

  function dateOnlyValue(value) {
    const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return safeExcelText(value);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  }

  function numericExcelValue(value) {
    if (!cleanText(value)) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function animalExportReference(animal) {
    return safeExcelText(
      animal?.tag ||
      animal?.tattoo ||
      animal?.registrationNumber ||
      animal?.name ||
      ""
    );
  }

  function styleExportSheet(worksheet, widths, options = {}) {
    styleTemplateSheet(worksheet, widths);
    (options.dateColumns || []).forEach((columnNumber) => {
      worksheet.getColumn(columnNumber).numFmt = "yyyy-mm-dd";
    });
    (options.currencyColumns || []).forEach((columnNumber) => {
      worksheet.getColumn(columnNumber).numFmt = "$#,##0.00";
    });
    (options.numberColumns || []).forEach((columnNumber) => {
      worksheet.getColumn(columnNumber).numFmt = "0.00";
    });
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      row.alignment = { vertical: "top", wrapText: true };
      if (rowNumber % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF7F3EA" }
        };
      }
    }
  }

  function buildExportWorkbook(state = {}, options = {}) {
    if (!window.ExcelJS?.Workbook) {
      throw new Error("The Excel export tool did not load. Close and reopen HerdHarbor, then try again.");
    }

    const animals = Array.isArray(state.animals) ? state.animals : [];
    const health = Array.isArray(state.health) ? state.health : [];
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];
    const productionRecords = Array.isArray(state.productionRecords) ? state.productionRecords : [];
    const standaloneTransactions = transactions.filter((record) => record.sourceType !== "production");
    const annualBudgetPlans = Array.isArray(state.annualBudgetPlans) ? state.annualBudgetPlans : [];
    const animalById = new Map(animals.map((animal) => [animal.id, animal]));
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = "HerdHarbor";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = `${options.operationName || state.profile?.operationName || "HerdHarbor"} farm records`;

    const overview = workbook.addWorksheet("Overview");
    overview.addRows([
      ["HerdHarbor Farm Records Export", ""],
      ["Operation", safeExcelText(options.operationName || state.profile?.operationName || "HerdHarbor")],
      ["Exported", new Date()],
      ["App version", "0.3.07"],
      ["Animals", animals.length],
      ["Medical records", health.length],
      ["Actual transactions", transactions.length],
      ["Production records", productionRecords.length],
      ["Annual plan entries", annualBudgetPlans.length],
      ["Safety note", "This workbook is a readable record export. Production-linked sale income appears on the Production sheet and is recreated on import instead of being duplicated on Budgeting. Keep the JSON safety backup for complete HerdHarbor restoration."]
    ]);
    overview.mergeCells("A1:B1");
    overview.getRow(1).height = 34;
    overview.getRow(1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    overview.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D2540" }
    };
    overview.getColumn(1).width = 24;
    overview.getColumn(2).width = 56;
    overview.getColumn(2).alignment = { vertical: "top", wrapText: true };
    overview.getCell("B3").numFmt = "yyyy-mm-dd h:mm AM/PM";
    overview.getRow(10).height = 56;
    overview.getRow(10).alignment = { vertical: "top", wrapText: true };
    overview.views = [{ state: "frozen", ySplit: 1 }];

    const animalSheet = workbook.addWorksheet("Animals");
    animalSheet.addRow([
      "Name",
      "ID or Tag",
      "Tattoo / Ear Number",
      "Registration Number",
      "Breeder Name",
      "Species",
      "Breed",
      "Sex",
      "Date of Birth",
      "Color or Variety",
      "Location / Cage / Pen",
      "Status",
      "Sire ID / Tag / Name",
      "Dam ID / Tag / Name",
      "Notes"
    ]);
    animals.forEach((animal) => {
      animalSheet.addRow([
        safeExcelText(animal.name),
        safeExcelText(animal.tag),
        safeExcelText(animal.tattoo),
        safeExcelText(animal.registrationNumber),
        safeExcelText(animal.breeder),
        safeExcelText(animal.species),
        safeExcelText(animal.breed),
        safeExcelText(animal.sex),
        dateOnlyValue(animal.dob),
        safeExcelText(animal.color),
        safeExcelText(animal.location),
        safeExcelText(animal.status),
        animalExportReference(animalById.get(animal.sireId)),
        animalExportReference(animalById.get(animal.damId)),
        safeExcelText(animal.notes)
      ]);
    });
    styleExportSheet(
      animalSheet,
      [24, 16, 20, 20, 22, 14, 22, 14, 16, 20, 22, 16, 24, 24, 38],
      { dateColumns: [9] }
    );

    const medicalSheet = workbook.addWorksheet("Medical");
    medicalSheet.addRow([
      "Animal ID / Tag / Name",
      "Date",
      "Record Type",
      "Details",
      "Condition / Reason",
      "Treatment / Procedure",
      "Medication",
      "Dose",
      "Provider",
      "Medical Cost",
      "Follow Up Status",
      "Notes",
      "Weight",
      "Weight Unit",
      "Follow-up Date"
    ]);
    health.forEach((record) => {
      medicalSheet.addRow([
        animalExportReference(animalById.get(record.animalId)),
        dateOnlyValue(record.date),
        safeExcelText(record.type),
        safeExcelText(record.details),
        safeExcelText(record.condition),
        safeExcelText(record.treatment),
        safeExcelText(record.medication),
        safeExcelText(record.dose),
        safeExcelText(record.provider),
        numericExcelValue(record.cost),
        safeExcelText(record.followUpStatus),
        safeExcelText(record.notes),
        numericExcelValue(record.weight),
        safeExcelText(record.weightUnit),
        dateOnlyValue(record.followUpDate)
      ]);
    });
    styleExportSheet(
      medicalSheet,
      [28, 16, 20, 42, 24, 26, 22, 16, 24, 16, 20, 36, 14, 14, 18],
      { dateColumns: [2, 15], currencyColumns: [10] }
    );

    const productionSheet = workbook.addWorksheet("Production");
    productionSheet.addRow([
      "Date",
      "Product",
      "Scope",
      "Species",
      "Animal ID / Tag / Name",
      "Group / Flock / Herd / Batch Name",
      "Milking Session",
      "Unit",
      "Total Produced",
      "Quantity Sold",
      "Household Use",
      "Fed to Livestock / Calves",
      "Stored / Set Aside",
      "Donated",
      "Wasted / Discarded",
      "Sale Income",
      "Total Weight",
      "Weight Unit",
      "Customer",
      "Waste / Discard Reason",
      "Notes"
    ]);
    productionRecords.forEach((record) => {
      productionSheet.addRow([
        dateOnlyValue(record.date),
        safeExcelText(record.product),
        safeExcelText(record.scope),
        safeExcelText(record.species),
        animalExportReference(animalById.get(record.animalId)),
        safeExcelText(record.groupName),
        safeExcelText(record.session),
        safeExcelText(record.unit),
        numericExcelValue(record.quantity),
        numericExcelValue(record.soldQuantity),
        numericExcelValue(record.householdQuantity),
        numericExcelValue(record.feedQuantity),
        numericExcelValue(record.setAsideQuantity),
        numericExcelValue(record.donatedQuantity),
        numericExcelValue(record.wasteQuantity),
        numericExcelValue(record.saleAmount),
        numericExcelValue(record.totalWeight),
        safeExcelText(record.weightUnit),
        safeExcelText(record.customer),
        safeExcelText(record.wasteReason),
        safeExcelText(record.notes)
      ]);
    });
    styleExportSheet(
      productionSheet,
      [16, 18, 14, 14, 28, 28, 18, 14, 16, 16, 16, 24, 20, 14, 20, 16, 16, 14, 24, 30, 38],
      { dateColumns: [1], currencyColumns: [16], numberColumns: [9, 10, 11, 12, 13, 14, 15, 17] }
    );

    const budgetSheet = workbook.addWorksheet("Budgeting");
    budgetSheet.addRow([
      "Date",
      "Type",
      "Classification",
      "Category",
      "Scope",
      "Species",
      "Animal ID / Tag / Name",
      "Amount",
      "Vendor or Customer",
      "Description",
      "Notes"
    ]);
    standaloneTransactions.forEach((record) => {
      budgetSheet.addRow([
        dateOnlyValue(record.date),
        safeExcelText(record.type),
        safeExcelText(record.classification),
        safeExcelText(record.category),
        safeExcelText(record.scope),
        safeExcelText(record.species),
        animalExportReference(animalById.get(record.animalId)),
        numericExcelValue(record.amount),
        safeExcelText(record.party),
        safeExcelText(record.description),
        safeExcelText(record.notes)
      ]);
    });
    styleExportSheet(
      budgetSheet,
      [16, 14, 18, 22, 14, 14, 28, 14, 24, 30, 38],
      { dateColumns: [1], currencyColumns: [8] }
    );

    const annualColumns = [
      { header: "Feed Budget", type: "Expense", category: "Feed" },
      { header: "Housing / Bedding", type: "Expense", category: "Housing / Bedding" },
      { header: "Routine Medical", type: "Expense", category: "Routine Medical" },
      { header: "Breeding", type: "Expense", category: "Breeding" },
      { header: "Other Costs", type: "Expense", category: "Other Costs" },
      { header: "Projected Sale Income", type: "Income", category: "Projected Sale Income" },
      { header: "Product Income", type: "Income", category: "Product Income" },
      { header: "Offspring Income", type: "Income", category: "Offspring Income" }
    ];
    const annualGroups = new Map();
    annualBudgetPlans.forEach((record) => {
      const key = [record.year, record.animalId || "", record.species || ""].join("|");
      if (!annualGroups.has(key)) {
        annualGroups.set(key, {
          year: Number(record.year) || "",
          animalId: record.animalId || "",
          species: record.species || "",
          amounts: new Map()
        });
      }
      const group = annualGroups.get(key);
      const amountKey = `${normalize(record.type)}|${normalize(record.category)}`;
      group.amounts.set(amountKey, (group.amounts.get(amountKey) || 0) + Number(record.amount || 0));
    });

    const annualSheet = workbook.addWorksheet("Annual Budget");
    annualSheet.addRow([
      "Year",
      "Animal ID / Tag / Name",
      "Species",
      ...annualColumns.map((column) => column.header)
    ]);
    [...annualGroups.values()]
      .sort((left, right) =>
        Number(left.year || 0) - Number(right.year || 0) ||
        String(animalExportReference(animalById.get(left.animalId)) || "")
          .localeCompare(String(animalExportReference(animalById.get(right.animalId)) || ""))
      )
      .forEach((group) => {
        annualSheet.addRow([
          group.year,
          animalExportReference(animalById.get(group.animalId)),
          safeExcelText(group.species || animalById.get(group.animalId)?.species),
          ...annualColumns.map((column) =>
            group.amounts.get(`${normalize(column.type)}|${normalize(column.category)}`) || 0
          )
        ]);
      });
    styleExportSheet(
      annualSheet,
      [12, 28, 14, 16, 20, 18, 16, 16, 22, 18, 18],
      { currencyColumns: [4, 5, 6, 7, 8, 9, 10, 11] }
    );

    return workbook;
  }

  function buildProductionReportWorkbook(data = {}, options = {}) {
    if (!window.ExcelJS?.Workbook) {
      throw new Error("The Excel report tool did not load. Close and reopen HerdHarbor, then try again.");
    }
    const records = Array.isArray(data.records) ? data.records : [];
    const summaryRows = Array.isArray(data.summaryRows) ? data.summaryRows : [];
    const timelineRows = Array.isArray(data.timelineRows) ? data.timelineRows : [];
    const comparisonRows = Array.isArray(data.comparisonRows) ? data.comparisonRows : [];
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const animalById = new Map((Array.isArray(data.animals) ? data.animals : []).map((animal) => [animal.id, animal]));
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = "HerdHarbor";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = `${options.operationName || "HerdHarbor"} production and sales report`;
    const setReportPrintLayout = (worksheet, orientation = "landscape") => {
      worksheet.pageSetup = {
        paperSize: 1,
        orientation,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true
      };
      worksheet.pageMargins = {
        left: 0.25,
        right: 0.25,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2
      };
      worksheet.headerFooter = { oddFooter: "HerdHarbor Production & Sales · Page &P of &N" };
    };

    const overview = workbook.addWorksheet("Overview");
    const totalRevenue = summaryRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    overview.addRows([
      ["HerdHarbor Production & Sales Report", null],
      ["Operation", safeExcelText(options.operationName || "HerdHarbor")],
      ["Report period", safeExcelText(options.rangeLabel || "All recorded dates")],
      ["Product filter", safeExcelText(options.product || "All products")],
      ["Species filter", safeExcelText(options.species || "All species")],
      ["Animal filter", safeExcelText(options.animal || "All animals and groups")],
      ["Totals grouped by", safeExcelText(options.groupBy || "Day")],
      ["Production records", records.length],
      ["Sale revenue", totalRevenue],
      ["Warnings", warnings.length],
      ["Exported", new Date()],
      ["App version", "0.3.07"],
      ["Quantity note", "Quantities stay separated by product and unit so eggs, dozens, gallons, birds, pounds, and custom units are never combined into a misleading total."]
    ]);
    overview.mergeCells("A1:B1");
    overview.getRow(1).height = 34;
    overview.getRow(1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    overview.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2540" } };
    overview.getColumn(1).width = 24;
    overview.getColumn(2).width = 62;
    overview.getColumn(2).alignment = { vertical: "top", wrapText: true };
    overview.getCell("B9").numFmt = "$#,##0.00";
    overview.getCell("B11").numFmt = "yyyy-mm-dd h:mm AM/PM";
    overview.getRow(13).height = 58;
    overview.views = [{ state: "frozen", ySplit: 1 }];
    setReportPrintLayout(overview, "portrait");

    const totals = workbook.addWorksheet("Product Totals");
    totals.addRow(["Product", "Unit", "Produced", "Sold", "Used on Farm / Stored", "Donated", "Waste", "Waste %", "Average Sale Price", "Revenue", "Records"]);
    summaryRows.forEach((row) => totals.addRow([
      safeExcelText(row.product), safeExcelText(row.unit), numericExcelValue(row.produced), numericExcelValue(row.sold),
      numericExcelValue(row.farmUse), numericExcelValue(row.donated), numericExcelValue(row.waste), Number(row.wasteRate || 0),
      numericExcelValue(row.averagePrice), numericExcelValue(row.revenue), Number(row.recordCount || 0)
    ]));
    styleExportSheet(totals, [20, 14, 14, 14, 22, 14, 14, 14, 20, 16, 12], { currencyColumns: [9, 10], numberColumns: [3, 4, 5, 6, 7] });
    totals.getColumn(8).numFmt = "0.0%";
    setReportPrintLayout(totals);

    const timeline = workbook.addWorksheet("Period Totals");
    timeline.addRow(["Period", "Product", "Unit", "Produced", "Sold", "Used on Farm / Stored", "Donated", "Waste", "Waste %", "Average Sale Price", "Revenue"]);
    timelineRows.forEach((row) => timeline.addRow([
      safeExcelText(row.label), safeExcelText(row.product), safeExcelText(row.unit), numericExcelValue(row.produced),
      numericExcelValue(row.sold), numericExcelValue(row.farmUse), numericExcelValue(row.donated), numericExcelValue(row.waste),
      Number(row.wasteRate || 0), numericExcelValue(row.averagePrice), numericExcelValue(row.revenue)
    ]));
    styleExportSheet(timeline, [24, 20, 14, 14, 14, 22, 14, 14, 14, 20, 16], { currencyColumns: [10, 11], numberColumns: [4, 5, 6, 7, 8] });
    timeline.getColumn(9).numFmt = "0.0%";
    setReportPrintLayout(timeline);

    const comparisons = workbook.addWorksheet("Comparisons");
    comparisons.addRow(["Animal / Group", "Type", "Product", "Unit", "Produced", "Sold", "Used on Farm / Stored", "Waste", "Waste %", "Average Sale Price", "Revenue"]);
    comparisonRows.forEach((row) => comparisons.addRow([
      safeExcelText(row.label), safeExcelText(row.kind), safeExcelText(row.product), safeExcelText(row.unit),
      numericExcelValue(row.produced), numericExcelValue(row.sold), numericExcelValue(row.farmUse), numericExcelValue(row.waste),
      Number(row.wasteRate || 0), numericExcelValue(row.averagePrice), numericExcelValue(row.revenue)
    ]));
    styleExportSheet(comparisons, [28, 14, 20, 14, 14, 14, 22, 14, 14, 20, 16], { currencyColumns: [10, 11], numberColumns: [5, 6, 7, 8] });
    comparisons.getColumn(9).numFmt = "0.0%";
    setReportPrintLayout(comparisons);

    const history = workbook.addWorksheet("Production History");
    history.addRow([
      "Date", "Product", "Scope", "Species", "Animal", "Group / Flock / Herd / Batch", "Milking Session", "Unit",
      "Produced", "Sold", "Household Use", "Fed to Livestock / Calves", "Stored / Set Aside", "Donated",
      "Waste", "Waste %", "Average Sale Price", "Sale Revenue", "Customer", "Waste / Discard Reason", "Notes"
    ]);
    records.forEach((record) => {
      const quantity = Number(record.quantity || 0);
      const waste = Number(record.wasteQuantity || 0);
      const sold = Number(record.soldQuantity || 0);
      const revenue = Number(record.saleAmount || 0);
      history.addRow([
        dateOnlyValue(record.date), safeExcelText(record.product), safeExcelText(record.scope), safeExcelText(record.species),
        safeExcelText(animalById.get(record.animalId)?.name), safeExcelText(record.groupName), safeExcelText(record.session), safeExcelText(record.unit),
        numericExcelValue(record.quantity), numericExcelValue(record.soldQuantity), numericExcelValue(record.householdQuantity),
        numericExcelValue(record.feedQuantity), numericExcelValue(record.setAsideQuantity), numericExcelValue(record.donatedQuantity),
        numericExcelValue(record.wasteQuantity), quantity > 0 ? waste / quantity : 0, sold > 0 ? revenue / sold : null,
        numericExcelValue(record.saleAmount), safeExcelText(record.customer), safeExcelText(record.wasteReason), safeExcelText(record.notes)
      ]);
    });
    styleExportSheet(
      history,
      [16, 18, 14, 14, 24, 28, 18, 14, 14, 14, 18, 24, 20, 14, 14, 14, 20, 16, 24, 30, 38],
      { dateColumns: [1], currencyColumns: [17, 18], numberColumns: [9, 10, 11, 12, 13, 14, 15] }
    );
    history.getColumn(16).numFmt = "0.0%";
    setReportPrintLayout(history);
    history.pageSetup.fitToWidth = 2;

    const warningSheet = workbook.addWorksheet("Warnings");
    warningSheet.addRow(["Level", "Type", "Message"]);
    if (warnings.length) {
      warnings.forEach((warning) => warningSheet.addRow([
        safeExcelText(warning.severity === "danger" ? "High" : "Review"),
        safeExcelText(warning.type),
        safeExcelText(warning.message)
      ]));
    } else {
      warningSheet.addRow(["Information", "None", "No basic production-drop or high-waste warnings were found for this report period."]);
    }
    styleExportSheet(warningSheet, [14, 18, 80]);
    setReportPrintLayout(warningSheet);

    return workbook;
  }

  async function downloadProductionReport(data, options = {}) {
    const workbook = buildProductionReportWorkbook(data, options);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const operationSlug = cleanText(options.operationName || "herdharbor")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "herdharbor";
    const rangeSlug = cleanText(options.start || "all-dates").replace(/[^0-9a-z-]+/gi, "-").toLowerCase();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${operationSlug}-production-report-${rangeSlug}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadExport(state, options = {}) {
    const workbook = buildExportWorkbook(state, options);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    );
    const operationSlug = cleanText(options.operationName || state.profile?.operationName || "herdharbor")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "herdharbor";
    const exportedDate = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${operationSlug}-herdharbor-records-${exportedDate}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadTemplate() {
    if (!window.ExcelJS?.Workbook) {
      throw new Error("The Excel template tool did not load. Close and reopen HerdHarbor, then try again.");
    }
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = "HerdHarbor";
    workbook.created = new Date();

    const instructions = workbook.addWorksheet("Instructions");
    instructions.addRows([
      ["HerdHarbor Excel Import Template", ""],
      ["How to use", "Enter records in any or all of the Animals, Production, Budgeting, Annual Budget, and Medical sheets. Keep the header row unchanged."],
      ["Review first", "HerdHarbor previews valid records and flags duplicate or invalid rows before import."],
      ["Existing data", "Spreadsheet imports add records. They do not replace current farm records."],
      ["Animal matching", "Medical, production, and animal-assigned budget rows can match an animal by ID/tag, tattoo, registration number, or unique name."],
      ["Dates", "Use Excel dates or YYYY-MM-DD."],
      ["Production", "Total Produced must be greater than zero and must cover all sold, household, feed, stored, donated, and wasted quantities. Sale Income becomes one linked Budgeting transaction."],
      ["Money", "Transaction amounts must be greater than zero. Annual Budget values remain yearly planned figures and never become actual transactions."],
      ["Supported files", "Save as .xlsx. Legacy .xls files must be resaved as .xlsx before upload."]
    ]);
    instructions.mergeCells("A1:B1");
    instructions.getColumn(1).width = 22;
    instructions.getColumn(2).width = 86;
    instructions.getRow(1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    instructions.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D2540" }
    };
    instructions.getColumn(2).alignment = { wrapText: true, vertical: "top" };

    const animals = workbook.addWorksheet("Animals");
    animals.addRow([
      "Name",
      "ID or Tag",
      "Tattoo / Ear Number",
      "Registration Number",
      "Breeder Name",
      "Species",
      "Breed",
      "Sex",
      "Date of Birth",
      "Color or Variety",
      "Location / Cage / Pen",
      "Status",
      "Sire ID / Tag / Name",
      "Dam ID / Tag / Name",
      "Notes"
    ]);
    styleTemplateSheet(animals, [24, 16, 20, 20, 22, 14, 22, 12, 16, 20, 22, 16, 24, 24, 36]);
    animals.dataValidations.add("F2:F5000", {
      type: "list",
      allowBlank: false,
      formulae: ['"Rabbit,Chicken,Duck,Turkey,Dog,Horse,Goat,Sheep,Cattle,Pig,Other"']
    });
    animals.dataValidations.add("H2:H5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Female,Male,Unknown"']
    });
    animals.dataValidations.add("L2:L5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Active,For Sale,Sold,Deceased,Ancestor Only"']
    });

    const production = workbook.addWorksheet("Production");
    production.addRow([
      "Date",
      "Product",
      "Scope",
      "Species",
      "Animal ID / Tag / Name",
      "Group / Flock / Herd / Batch Name",
      "Milking Session",
      "Unit",
      "Total Produced",
      "Quantity Sold",
      "Household Use",
      "Fed to Livestock / Calves",
      "Stored / Set Aside",
      "Donated",
      "Wasted / Discarded",
      "Sale Income",
      "Total Weight",
      "Weight Unit",
      "Customer",
      "Waste / Discard Reason",
      "Notes"
    ]);
    styleTemplateSheet(
      production,
      [16, 18, 14, 14, 28, 28, 18, 14, 16, 16, 16, 24, 20, 14, 20, 16, 16, 14, 24, 30, 38]
    );
    production.dataValidations.add("B2:B5000", {
      type: "list",
      allowBlank: false,
      formulae: ['"Eggs,Broilers,Milk,Other"']
    });
    production.dataValidations.add("C2:C5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Operation,Species,Animal"']
    });
    production.dataValidations.add("D2:D5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Rabbit,Chicken,Duck,Turkey,Dog,Horse,Goat,Sheep,Cattle,Pig,Other"']
    });
    production.dataValidations.add("G2:G5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Morning,Evening,Combined,Other"']
    });
    production.dataValidations.add("H2:H5000", {
      type: "list",
      allowBlank: false,
      formulae: ['"eggs,dozen,cartons,birds,lb,kg,gallons,quarts,liters,pints,other"']
    });
    production.dataValidations.add("R2:R5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"lb,kg"']
    });

    const budgeting = workbook.addWorksheet("Budgeting");
    budgeting.addRow([
      "Date",
      "Type",
      "Classification",
      "Category",
      "Scope",
      "Species",
      "Animal ID / Tag / Name",
      "Amount",
      "Vendor or Customer",
      "Description",
      "Notes"
    ]);
    styleTemplateSheet(budgeting, [16, 14, 18, 22, 14, 14, 26, 14, 24, 30, 36]);
    budgeting.dataValidations.add("B2:B5000", {
      type: "list",
      allowBlank: false,
      formulae: ['"Expense,Income"']
    });
    budgeting.dataValidations.add("C2:C5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Operating,Capital"']
    });
    budgeting.dataValidations.add("E2:E5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Operation,Species,Animal"']
    });

    const annualBudget = workbook.addWorksheet("Annual Budget");
    annualBudget.addRow([
      "Year",
      "Animal ID / Tag / Name",
      "Species",
      "Feed Budget",
      "Housing / Bedding",
      "Routine Medical",
      "Breeding",
      "Other Costs",
      "Projected Sale Income",
      "Product Income",
      "Offspring Income"
    ]);
    styleTemplateSheet(annualBudget, [12, 28, 14, 16, 20, 18, 16, 16, 22, 18, 18]);
    annualBudget.dataValidations.add("C2:C5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"Rabbit,Chicken,Duck,Turkey,Dog,Horse,Goat,Sheep,Cattle,Pig,Other"']
    });

    const medical = workbook.addWorksheet("Medical");
    medical.addRow([
      "Animal ID / Tag / Name",
      "Date",
      "Record Type",
      "Details",
      "Weight",
      "Weight Unit",
      "Follow-up Date"
    ]);
    styleTemplateSheet(medical, [28, 16, 20, 42, 14, 14, 18]);
    medical.dataValidations.add("C2:C5000", {
      type: "list",
      allowBlank: false,
      formulae: ['"Weight,Treatment,Medication,Vaccination,Observation,Veterinary visit"']
    });
    medical.dataValidations.add("F2:F5000", {
      type: "list",
      allowBlank: true,
      formulae: ['"lb,oz,kg,g"']
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "HerdHarbor-Excel-Import-Template.xlsx";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.HerdHarborSpreadsheet = {
    openImport,
    downloadTemplate,
    downloadExport,
    downloadProductionReport,
    __test: {
      parseWorkbookBuffer,
      dateToISO,
      moneyNumber,
      normalize,
      issueAdvice,
      buildExportWorkbook,
      buildProductionReportWorkbook
    }
  };
})();
