(() => {
  "use strict";

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
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
  const ANIMAL_STATUSES = ["Active", "For Sale", "Sold", "Deceased", "Ancestor Only"];

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
        tag: ["id", "tag", "id or tag", "animal id", "animal tag", "ear tag"],
        tattoo: ["tattoo", "ear number", "tattoo or ear number", "tattoo ear number"],
        registrationNumber: ["registration", "registration number", "registration no", "reg number", "reg no"],
        breeder: ["breeder", "breeder name", "seller", "source breeder"],
        species: ["species", "animal type", "livestock type"],
        breed: ["breed"],
        sex: ["sex", "gender"],
        dob: ["date of birth", "birth date", "dob", "born", "birthday"],
        color: ["color", "colour", "variety", "color or variety"],
        location: ["location", "cage", "pen", "stall", "location cage pen"],
        status: ["status", "animal status"],
        sireRef: ["sire", "sire id", "sire tag", "father", "father id", "father tag"],
        damRef: ["dam", "dam id", "dam tag", "mother", "mother id", "mother tag"],
        notes: ["notes", "comments", "description"]
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
        animalRef: ["animal", "animal name", "animal id", "animal tag", "id or tag"],
        amount: ["amount", "total", "cost", "price", "value"],
        party: ["vendor", "customer", "vendor customer", "vendor or customer", "payee", "payer", "party"],
        description: ["description", "item", "purchase", "sale", "details"],
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
        animalRef: ["animal", "animal name", "animal id", "animal tag", "id or tag"],
        date: ["date", "record date", "treatment date", "visit date"],
        type: ["type", "record type", "medical type", "health type"],
        details: ["details", "description", "treatment", "medication", "observation", "notes"],
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
        grid-template-columns:repeat(4,minmax(0,1fr));
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
    const byName = Object.entries(SCHEMAS).find(([, schema]) =>
      schema.sheetNames.some((name) => normalize(name) === normalizedName)
    );
    if (byName) return byName[0];
    if (["instruction", "instructions", "read me", "readme"].includes(normalizedName)) return "";

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
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
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
      m: "Male",
      buck: "Male",
      rooster: "Male",
      ram: "Male",
      boar: "Male",
      bull: "Male",
      stallion: "Male",
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
      med: "Medication",
      medicine: "Medication",
      meds: "Medication",
      vaccine: "Vaccination",
      shot: "Vaccination",
      check: "Observation",
      note: "Observation",
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

  function issue(result, source, message, level = "error") {
    result.issues.push({
      level,
      sheet: source.sheet,
      row: source.row,
      message
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
          notes: cleanText(fieldValue(row, map, "notes")),
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

        const details = cleanText(fieldValue(row, map, "details")) ||
          `${type} imported from spreadsheet.`;
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

  function requiredFieldsPresent(type, map, worksheet, context) {
    const required = {
      animals: ["name", "species"],
      health: ["animalRef", "date", "type"],
      transactions: ["date", "type", "amount"]
    }[type];
    return required.filter((field) => {
      if (map[field]) return false;
      if (type === "animals" && field === "species" &&
        speciesFromSheetName(worksheet.name, context.species)) return false;
      if (type === "health" && field === "type" &&
        (normalize(worksheet.name) === "weights" || map.weight)) return false;
      return true;
    });
  }

  async function parseWorkbookBuffer(buffer, context) {
    if (!window.ExcelJS?.Workbook) {
      throw new Error("The Excel reader did not load. Close and reopen HerdHarbor, then try again.");
    }

    const workbook = new window.ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const result = {
      records: { animals: [], transactions: [], health: [] },
      issues: [],
      parsedSheets: [],
      ignoredSheets: [],
      errorCount: 0,
      warningCount: 0,
      duplicateCount: 0,
      totalRows: 0
    };
    const sheetsByType = { animals: [], transactions: [], health: [] };

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
      throw new Error("No Animals, Budgeting, or Medical sheet could be recognized.");
    }
    if (result.totalRows > MAX_DATA_ROWS) {
      throw new Error(`This workbook has ${result.totalRows.toLocaleString()} data rows. The current limit is ${MAX_DATA_ROWS.toLocaleString()}.`);
    }

    stageAnimals(sheetsByType.animals, context, result);
    stageHealth(sheetsByType.health, context, result);
    stageTransactions(sheetsByType.transactions, context, result);
    return result;
  }

  function summaryCount(result) {
    return result.records.animals.length +
      result.records.transactions.length +
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
        <div class="hh-import-stat"><strong>${result.records.transactions.length}</strong><span>Budget records ready</span></div>
        <div class="hh-import-stat"><strong>${result.records.health.length}</strong><span>Medical records ready</span></div>
        <div class="hh-import-stat"><strong>${result.duplicateCount + result.errorCount}</strong><span>Rows skipped</span></div>
      </div>
      ${shownIssues.length ? `
        <h3>Rows needing attention</h3>
        <div class="hh-import-issues">
          ${shownIssues.map((item) => `
            <div class="hh-import-issue ${esc(item.level)}">
              <strong>${esc(item.sheet)} · row ${item.row}</strong><br>${esc(item.message)}
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
        <button type="button" class="button button-primary" id="hh-confirm-spreadsheet-import" ${validCount ? "" : "disabled"}>
          Import ${validCount} record${validCount === 1 ? "" : "s"}
        </button>
      </div>
    `, "Excel spreadsheet import");

    document.querySelector("#hh-cancel-spreadsheet-import")
      ?.addEventListener("click", api.closeModal);
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
      health: Array.isArray(options.state.health) ? options.state.health : [],
      species: options.species || [],
      fileName: file.name
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
      ["How to use", "Enter records in any or all of the Animals, Budgeting, and Medical sheets. Keep the header row unchanged."],
      ["Review first", "HerdHarbor previews valid records and flags duplicate or invalid rows before import."],
      ["Existing data", "Spreadsheet imports add records. They do not replace current farm records."],
      ["Animal matching", "Medical and animal-assigned budget rows can match an animal by ID/tag, tattoo, registration number, or unique name."],
      ["Dates", "Use Excel dates or YYYY-MM-DD."],
      ["Money", "Amounts must be greater than zero. Use the Type column to identify Income or Expense."],
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
    __test: {
      parseWorkbookBuffer,
      dateToISO,
      moneyNumber,
      normalize
    }
  };
})();
