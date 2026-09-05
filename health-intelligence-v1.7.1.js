(function (root) {
  "use strict";

  const VERSION = "1.7.1";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const HEALTH_KEY = "herdharbor_health_intelligence_v1";
  const INACTIVE = new Set(["sold", "deceased", "archived", "ancestor only", "ancestor-only", "ancestor_only"]);
  const TRIAGE = Object.freeze({
    EMERGENCY: "Emergency",
    URGENT: "Urgent",
    MONITOR: "Monitor closely",
    ROUTINE: "Routine / preventive"
  });

  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const clean = (value) => String(value == null ? "" : value).trim();
  const lower = (value) => clean(value).toLowerCase();

  function readFarmState() {
    try { return JSON.parse(root.localStorage?.getItem(STORAGE_KEY) || "{}") || {}; }
    catch { return {}; }
  }

  function defaultHealthState() {
    return { schemaVersion: 1, episodes: [], careRecords: [], groupRecords: [], updatedAt: "" };
  }

  function readHealthState() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(HEALTH_KEY) || "{}");
      return {
        ...defaultHealthState(),
        ...parsed,
        episodes: Array.isArray(parsed?.episodes) ? parsed.episodes : [],
        careRecords: Array.isArray(parsed?.careRecords) ? parsed.careRecords : [],
        groupRecords: Array.isArray(parsed?.groupRecords) ? parsed.groupRecords : []
      };
    } catch { return defaultHealthState(); }
  }

  function writeHealthState(next) {
    const value = { ...defaultHealthState(), ...next, updatedAt: new Date().toISOString() };
    root.localStorage?.setItem(HEALTH_KEY, JSON.stringify(value));
    root.dispatchEvent?.(new CustomEvent("herdharbor:health-intelligence-changed", { detail: { version: VERSION } }));
    return value;
  }

  function isActiveAnimal(animal) {
    if (!animal) return false;
    const contract = root.HerdHarborSpeciesContext;
    if (typeof contract?.isActiveAnimal === "function") {
      try { return Boolean(contract.isActiveAnimal(animal)); } catch {}
    }
    return !INACTIVE.has(lower(animal.status));
  }

  function canonicalSpecies(value) {
    const genetics = root.HerdHarborGeneticsPlatform;
    if (typeof genetics?.canonicalSpecies === "function") {
      try {
        const normalized = genetics.canonicalSpecies(value);
        if (normalized) return normalized;
      } catch {}
    }
    const raw = lower(value);
    const aliases = {
      cow: "cattle", cows: "cattle", bovine: "cattle",
      goats: "goat", sheep: "sheep",
      pigs: "swine", pig: "swine", hog: "swine", hogs: "swine",
      rabbits: "rabbit", bunny: "rabbit", bunnies: "rabbit",
      chickens: "chicken", hens: "chicken", rooster: "chicken",
      ducks: "duck", turkeys: "turkey", horses: "horse", dogs: "dog"
    };
    return aliases[raw] || raw.replace(/s$/, "");
  }

  function displaySpecies(value) {
    const id = canonicalSpecies(value);
    const labels = { cattle: "Cattle", goat: "Goat", sheep: "Sheep", swine: "Pig", rabbit: "Rabbit", chicken: "Chicken", duck: "Duck", turkey: "Turkey", poultry: "Poultry", horse: "Horse", dog: "Dog" };
    return labels[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Unknown");
  }

  function activeAnimals(state = readFarmState()) {
    return (Array.isArray(state.animals) ? state.animals : []).filter(isActiveAnimal);
  }

  function activeSpecies(state = readFarmState()) {
    const contract = root.HerdHarborSpeciesContext;
    if (typeof contract?.activeSpecies === "function") {
      try { return contract.activeSpecies(state).map(canonicalSpecies).filter(Boolean); } catch {}
    }
    return [...new Set(activeAnimals(state).map((animal) => canonicalSpecies(animal.species)).filter(Boolean))].sort();
  }

  function mapGuideUrgency(urgency) {
    if (urgency === "Emergency now") return TRIAGE.EMERGENCY;
    if (urgency === "Contact a vet soon") return TRIAGE.URGENT;
    if (urgency === "Monitor and call") return TRIAGE.MONITOR;
    return TRIAGE.MONITOR;
  }

  function emergencyFlags(input = {}) {
    const flags = [];
    const symptom = lower(input.symptom || input.concern);
    const breathing = lower(input.breathing);
    const activity = lower(input.activity);
    const manure = lower(input.manure);
    const appetite = lower(input.appetite);
    if (["labored", "open-mouth", "open mouth", "gasping", "blue/pale tissue"].some((x) => breathing.includes(x))) flags.push("breathing distress");
    if (/collapse|seizure|paralysis|unable to stand|unconscious/.test(`${symptom} ${activity}`)) flags.push("collapse or neurologic emergency");
    if (/severe bleeding|major wound|broken bone|fracture|poison|toxin/.test(symptom)) flags.push("major trauma or toxic exposure");
    if (/rapid.*bloat|severe colic|rapid belly swelling/.test(symptom)) flags.push("rapid abdominal emergency");
    if (canonicalSpecies(input.species) === "rabbit" && appetite === "none" && (manure === "none" || manure === "markedly reduced")) flags.push("rabbit not eating with absent/reduced droppings");
    if (Number(input.affectedCount || 0) > 1 && /sudden death|multiple deaths|rapid production drop/.test(symptom)) flags.push("possible group outbreak");
    return flags;
  }

  function assessEpisode(input = {}) {
    const flags = emergencyFlags(input);
    if (flags.length) {
      return {
        level: TRIAGE.EMERGENCY,
        reason: `Emergency warning sign${flags.length === 1 ? "" : "s"}: ${flags.join(", ")}.`,
        actions: [
          "Minimize unnecessary handling and stress.",
          "Use appropriate emergency veterinary or animal-health resources now.",
          "Record the timeline, recent feed/medications/exposures, and transport information while arranging care."
        ],
        escalate: []
      };
    }

    const symptom = lower(input.symptom || input.concern);
    const appetite = lower(input.appetite);
    const activity = lower(input.activity);
    const breathing = lower(input.breathing);
    const affectedCount = Number(input.affectedCount || 1);
    const urgent =
      appetite === "none" || activity === "very low" || activity === "unable to rise" ||
      breathing === "increased" || affectedCount > 1 ||
      /blood|persistent diarrhea|straining|not urinating|deep wound|swelling|fever|eye injury/.test(symptom);

    if (urgent) {
      return {
        level: TRIAGE.URGENT,
        reason: "The recorded signs justify prompt professional review or same-day consultation if they persist or worsen.",
        actions: [
          "Separate the animal from the group when contagious disease is possible and isolation is practical.",
          "Record appetite, water intake, manure/droppings, activity, breathing, temperature if safely measured, and how many animals are affected.",
          "Contact an appropriate veterinarian or animal-health professional promptly; escalate immediately if an emergency warning sign develops."
        ],
        escalate: ["breathing distress", "collapse", "severe pain", "rapid swelling", "major bleeding", "sudden worsening"]
      };
    }

    return {
      level: TRIAGE.MONITOR,
      reason: "No emergency flag is recorded. Structured observation and a defined recheck point are appropriate while watching for escalation signs.",
      actions: [
        "Check feed and water access, environment, manure/droppings, activity, breathing, and whether other animals are affected.",
        "Photograph or record visible changes and compare with the animal's recent weight and health history.",
        "Set a recheck time. Seek veterinary advice if the problem persists, spreads, becomes painful, affects eating/drinking, or worsens."
      ],
      escalate: ["stops eating or drinking", "breathing becomes labored", "collapse or inability to stand", "blood or severe pain", "multiple animals become sick"]
    };
  }

  function checklistFor(input = {}) {
    const symptom = lower(input.symptom || input.concern);
    if (/cough|sneez|nose|nasal|breath|respirat|eye discharge/.test(symptom)) {
      return ["Breathing effort and rate", "Nasal/eye discharge color and amount", "Appetite and water intake", "Dust/ammonia/ventilation", "Other animals affected"];
    }
    if (/diarr|manure|dropping|bloat|belly|appetite|not eating|constipat/.test(symptom)) {
      return ["Last normal meal", "Water intake", "Manure/dropping amount and appearance", "Abdominal swelling or pain", "Recent feed/treat/environment changes"];
    }
    if (/limp|lame|hoof|foot|leg|joint|mobility/.test(symptom)) {
      return ["Weight bearing", "Heat/swelling", "Visible wound or foreign object", "Recent trauma", "Whether movement is worsening the problem"];
    }
    if (/skin|itch|hair|feather|wool|rash|mite|lice|wound/.test(symptom)) {
      return ["Location and size", "Photo for comparison", "Parasites/crusts/discharge", "Other animals affected", "Housing/bedding/feed changes"];
    }
    return ["When it started", "Appetite", "Water intake", "Manure/droppings", "Activity", "Breathing", "Other animals affected"];
  }

  function normalizeEpisode(input = {}, farmState = readFarmState()) {
    const animal = activeAnimals(farmState).find((item) => String(item.id) === String(input.animalId));
    const species = canonicalSpecies(input.species || animal?.species);
    const base = {
      id: clean(input.id) || uid("episode"),
      animalId: clean(input.animalId),
      species,
      concern: clean(input.concern || input.symptom),
      startedDate: clean(input.startedDate) || today(),
      recheckDate: clean(input.recheckDate),
      appetite: clean(input.appetite) || "Normal",
      water: clean(input.water) || "Normal",
      manure: clean(input.manure) || "Normal",
      activity: clean(input.activity) || "Normal",
      breathing: clean(input.breathing) || "Normal",
      affectedCount: Math.max(1, Number(input.affectedCount || 1)),
      temperature: clean(input.temperature),
      pulse: clean(input.pulse),
      respiration: clean(input.respiration),
      bodyCondition: clean(input.bodyCondition),
      mobility: clean(input.mobility),
      productionChange: clean(input.productionChange),
      notes: clean(input.notes),
      healthStatus: clean(input.healthStatus) || "Monitor",
      quarantined: Boolean(input.quarantined),
      resolved: Boolean(input.resolved),
      resolvedDate: clean(input.resolvedDate),
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    base.assessment = assessEpisode({ ...base, symptom: base.concern });
    base.checklist = checklistFor({ ...base, symptom: base.concern });
    return base;
  }

  function normalizeCareRecord(input = {}, farmState = readFarmState()) {
    const animal = activeAnimals(farmState).find((item) => String(item.id) === String(input.animalId));
    return {
      id: clean(input.id) || uid("care"),
      animalId: clean(input.animalId),
      species: canonicalSpecies(input.species || animal?.species),
      type: clean(input.type) || "Treatment",
      date: clean(input.date) || today(),
      product: clean(input.product),
      reason: clean(input.reason),
      amountRecorded: clean(input.amountRecorded),
      route: clean(input.route),
      frequency: clean(input.frequency),
      startDate: clean(input.startDate),
      endDate: clean(input.endDate),
      prescribedBy: clean(input.prescribedBy),
      administeredBy: clean(input.administeredBy),
      lotNumber: clean(input.lotNumber),
      expirationDate: clean(input.expirationDate),
      boosterDueDate: clean(input.boosterDueDate),
      meatWithdrawalEnd: clean(input.meatWithdrawalEnd),
      milkWithdrawalEnd: clean(input.milkWithdrawalEnd),
      eggWithdrawalEnd: clean(input.eggWithdrawalEnd),
      outcome: clean(input.outcome),
      adverseReaction: clean(input.adverseReaction),
      notes: clean(input.notes),
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function withdrawalStatus(record, onDate = today()) {
    const dates = [
      ["Meat", record?.meatWithdrawalEnd],
      ["Milk", record?.milkWithdrawalEnd],
      ["Egg", record?.eggWithdrawalEnd]
    ].filter(([, date]) => clean(date));
    const active = dates.filter(([, date]) => date >= onDate);
    return { active: active.length > 0, active, all: dates };
  }

  function groupTargets(record, farmState = readFarmState()) {
    const animals = activeAnimals(farmState);
    const ids = Array.isArray(record?.animalIds) ? record.animalIds.map(String) : [];
    if (ids.length) return animals.filter((animal) => ids.includes(String(animal.id)));
    const species = canonicalSpecies(record?.species);
    return animals.filter((animal) => canonicalSpecies(animal.species) === species);
  }

  function buildInsights(farmState = readFarmState(), healthState = readHealthState(), nowDate = new Date()) {
    const insights = [];
    const openEpisodes = healthState.episodes.filter((episode) => !episode.resolved);
    const quarantine = openEpisodes.filter((episode) => episode.quarantined);
    if (quarantine.length) insights.push({ level: "warning", text: `${quarantine.length} animal${quarantine.length === 1 ? " is" : "s are"} currently marked quarantined.` });

    const byConcern = new Map();
    for (const episode of openEpisodes) {
      const key = `${canonicalSpecies(episode.species)}|${lower(episode.concern)}`;
      if (!key.endsWith("|")) byConcern.set(key, (byConcern.get(key) || 0) + 1);
    }
    for (const [key, count] of byConcern) {
      if (count < 2) continue;
      const [species, concern] = key.split("|");
      insights.push({ level: "warning", text: `${count} active ${displaySpecies(species).toLowerCase()} records share the concern “${concern}”. Consider this a group-level pattern, not just an isolated record.` });
    }

    const coreHealth = Array.isArray(farmState.health) ? farmState.health : [];
    const byAnimal = new Map();
    for (const row of coreHealth) {
      if (!row?.animalId || row?.type !== "Weight" || !row?.date || row?.weight === "" || row?.weight == null) continue;
      const n = Number(row.weight);
      if (!Number.isFinite(n)) continue;
      if (!byAnimal.has(row.animalId)) byAnimal.set(row.animalId, []);
      byAnimal.get(row.animalId).push({ date: row.date, weight: n, unit: row.weightUnit || "lb" });
    }
    for (const [animalId, rows] of byAnimal) {
      rows.sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length < 2) continue;
      const a = rows[rows.length - 2], b = rows[rows.length - 1];
      if (a.unit !== b.unit || a.weight <= 0) continue;
      const pct = ((b.weight - a.weight) / a.weight) * 100;
      if (pct <= -5) {
        const animal = (farmState.animals || []).find((item) => item.id === animalId);
        insights.push({ level: "info", text: `${animal?.name || "An animal"}'s two most recent recorded weights changed ${pct.toFixed(1)}%. Review the dates and health context; HerdHarbor is flagging the trend, not assigning a cause.` });
      }
    }

    const todayIso = nowDate.toISOString().slice(0, 10);
    const activeWithdrawals = healthState.careRecords.filter((record) => withdrawalStatus(record, todayIso).active);
    if (activeWithdrawals.length) insights.push({ level: "warning", text: `${activeWithdrawals.length} care record${activeWithdrawals.length === 1 ? " has" : "s have"} an active user-entered food-animal withdrawal date.` });
    return insights.slice(0, 8);
  }

  function saveEpisode(input) {
    const farm = readFarmState();
    const health = readHealthState();
    const episode = normalizeEpisode(input, farm);
    const index = health.episodes.findIndex((item) => item.id === episode.id);
    if (index >= 0) health.episodes[index] = episode; else health.episodes.push(episode);
    writeHealthState(health);
    return episode;
  }

  function resolveEpisode(id) {
    const health = readHealthState();
    const episode = health.episodes.find((item) => item.id === id);
    if (!episode) return null;
    episode.resolved = true;
    episode.resolvedDate = today();
    episode.healthStatus = "Recovering";
    episode.updatedAt = new Date().toISOString();
    writeHealthState(health);
    return episode;
  }

  function saveCareRecord(input) {
    const farm = readFarmState();
    const health = readHealthState();
    const record = normalizeCareRecord(input, farm);
    const index = health.careRecords.findIndex((item) => item.id === record.id);
    if (index >= 0) health.careRecords[index] = record; else health.careRecords.push(record);
    writeHealthState(health);
    return record;
  }

  function saveGroupRecord(input) {
    const farm = readFarmState();
    const health = readHealthState();
    const record = {
      id: clean(input.id) || uid("group"),
      species: canonicalSpecies(input.species),
      animalIds: Array.isArray(input.animalIds) ? input.animalIds.map(String) : [],
      type: clean(input.type) || "Preventive",
      date: clean(input.date) || today(),
      description: clean(input.description),
      product: clean(input.product),
      followUpDate: clean(input.followUpDate),
      notes: clean(input.notes),
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    record.targetCount = groupTargets(record, farm).length;
    const index = health.groupRecords.findIndex((item) => item.id === record.id);
    if (index >= 0) health.groupRecords[index] = record; else health.groupRecords.push(record);
    writeHealthState(health);
    return record;
  }

  function animalName(id, farm = readFarmState()) {
    return (farm.animals || []).find((animal) => String(animal.id) === String(id))?.name || "Unknown animal";
  }

  function field(label, name, value = "", type = "text", extra = "") {
    return `<label><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${extra}></label>`;
  }
  function select(label, name, options, value = "") {
    return `<label><span>${esc(label)}</span><select name="${esc(name)}">${options.map((option) => `<option value="${esc(option)}" ${String(option) === String(value) ? "selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
  }

  function showModal(title, body) {
    root.document?.querySelector("#hh-health-intelligence-modal")?.remove();
    const overlay = root.document.createElement("div");
    overlay.id = "hh-health-intelligence-modal";
    overlay.className = "modal-overlay active hh-hi-overlay";
    overlay.innerHTML = `<section class="modal hh-hi-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><strong>${esc(title)}</strong><button type="button" class="icon-button" data-hi-close aria-label="Close">×</button></div><div class="modal-content">${body}</div></section>`;
    (root.document.body || root.document.documentElement).appendChild(overlay);
    overlay.querySelector("[data-hi-close]")?.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
    return overlay;
  }

  function openEpisodeForm() {
    const farm = readFarmState();
    const animals = activeAnimals(farm);
    if (!animals.length) return showModal("Health episode", "<p>Add an active animal before starting a health episode.</p>");
    const modal = showModal("Start health episode", `<form id="hh-hi-episode-form"><div class="hh-hi-grid"><label><span>Animal</span><select name="animalId" required>${animals.map((animal) => `<option value="${esc(animal.id)}">${esc(animal.name || "Unnamed animal")} · ${esc(displaySpecies(animal.species))}</option>`).join("")}</select></label>${field("Concern / symptom", "concern", "", "text", "required")}${field("Started", "startedDate", today(), "date", "required")}${field("Recheck date", "recheckDate", "", "date")}${select("Appetite", "appetite", ["Normal", "Reduced", "None"], "Normal")}${select("Water intake", "water", ["Normal", "Reduced", "Increased", "None", "Unknown"], "Normal")}${select("Manure / droppings", "manure", ["Normal", "Changed", "Markedly reduced", "None", "Unknown"], "Normal")}${select("Activity", "activity", ["Normal", "Reduced", "Very low", "Unable to rise"], "Normal")}${select("Breathing", "breathing", ["Normal", "Increased", "Labored", "Open-mouth"], "Normal")}${field("Animals affected", "affectedCount", "1", "number", "min=\"1\"")}${field("Temperature (recorded)", "temperature")}${field("Pulse / heart rate (recorded)", "pulse")}${field("Respiratory rate (recorded)", "respiration")}${field("Body-condition score", "bodyCondition")}${field("Mobility score / note", "mobility")}${field("Production change", "productionChange")}${select("Health status", "healthStatus", ["Monitor", "Sick", "Quarantined", "Recovering"], "Monitor")}</div><label class="hh-hi-check"><input type="checkbox" name="quarantined" value="1"> Mark animal quarantined</label><label><span>Notes</span><textarea name="notes" rows="4"></textarea></label><p class="hh-hi-safety">HerdHarbor organizes observations and escalation signs. It does not diagnose disease or replace veterinary care.</p><div class="modal-actions"><button type="button" class="button button-ghost" data-hi-close>Cancel</button><button type="submit" class="button button-primary">Start episode</button></div></form>`);
    modal.querySelector("#hh-hi-episode-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      data.quarantined = Boolean(data.quarantined) || data.healthStatus === "Quarantined";
      const episode = saveEpisode(data);
      modal.remove();
      renderHealthPanel();
      showAssessment(episode);
    });
  }

  function showAssessment(episode) {
    const assessment = episode.assessment || assessEpisode(episode);
    showModal(`${animalName(episode.animalId)} · ${assessment.level}`, `<div class="hh-hi-assessment is-${lower(assessment.level).replace(/[^a-z]+/g, "-")}"><span class="hh-hi-triage">${esc(assessment.level)}</span><h3>${esc(episode.concern || "Health episode")}</h3><p>${esc(assessment.reason)}</p><h4>What to check now</h4><ul>${(episode.checklist || checklistFor(episode)).map((item) => `<li>${esc(item)}</li>`).join("")}</ul><h4>Next steps</h4><ul>${assessment.actions.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>${assessment.escalate?.length ? `<h4>Escalate if</h4><ul>${assessment.escalate.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}<p class="hh-hi-safety">Possible concerns and triage guidance are educational recordkeeping aids, not a diagnosis.</p></div>`);
  }

  function openCareForm() {
    const farm = readFarmState();
    const animals = activeAnimals(farm);
    if (!animals.length) return showModal("Care record", "<p>Add an active animal before creating a care record.</p>");
    const modal = showModal("Add structured care record", `<form id="hh-hi-care-form"><div class="hh-hi-grid"><label><span>Animal</span><select name="animalId" required>${animals.map((animal) => `<option value="${esc(animal.id)}">${esc(animal.name || "Unnamed animal")} · ${esc(displaySpecies(animal.species))}</option>`).join("")}</select></label>${select("Record type", "type", ["Treatment", "Medication", "Vaccination", "Preventive", "Veterinary visit", "Lab / diagnostic test"], "Treatment")}${field("Date", "date", today(), "date", "required")}${field("Product / medication", "product")}${field("Reason", "reason")}${field("Amount given (as recorded)", "amountRecorded")}${field("Route", "route")}${field("Frequency / schedule", "frequency")}${field("Start date", "startDate", "", "date")}${field("End date", "endDate", "", "date")}${field("Prescribed / directed by", "prescribedBy")}${field("Administered by", "administeredBy")}${field("Lot number", "lotNumber")}${field("Expiration", "expirationDate", "", "date")}${field("Booster / follow-up due", "boosterDueDate", "", "date")}${field("Meat withdrawal ends", "meatWithdrawalEnd", "", "date")}${field("Milk withdrawal ends", "milkWithdrawalEnd", "", "date")}${field("Egg withdrawal ends", "eggWithdrawalEnd", "", "date")}${field("Outcome", "outcome")}${field("Adverse reaction", "adverseReaction")}</div><label><span>Notes</span><textarea name="notes" rows="4"></textarea></label><p class="hh-hi-safety"><strong>Medication safety:</strong> record the amount and withdrawal dates from the product label or veterinarian/animal-health directions. HerdHarbor does not calculate medication doses or withdrawal intervals.</p><div class="modal-actions"><button type="button" class="button button-ghost" data-hi-close>Cancel</button><button type="submit" class="button button-primary">Save care record</button></div></form>`);
    modal.querySelector("#hh-hi-care-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCareRecord(Object.fromEntries(new FormData(event.currentTarget)));
      modal.remove();
      renderHealthPanel();
    });
  }

  function openGroupForm() {
    const farm = readFarmState();
    const species = activeSpecies(farm);
    if (!species.length) return showModal("Group health record", "<p>Add active animals before creating a group health record.</p>");
    const modal = showModal("Add herd / flock / group record", `<form id="hh-hi-group-form"><div class="hh-hi-grid">${select("Species", "species", species.map(displaySpecies), displaySpecies(species[0]))}${select("Record type", "type", ["Preventive", "Vaccination", "Treatment", "Parasite management", "Hoof / foot care", "Biosecurity / quarantine", "Observation"], "Preventive")}${field("Date", "date", today(), "date", "required")}${field("Description", "description", "", "text", "required")}${field("Product", "product")}${field("Follow-up date", "followUpDate", "", "date")}</div><label><span>Notes</span><textarea name="notes" rows="4"></textarea></label><p class="hh-hi-safety">By default this record applies to every currently active animal of the selected species. Historical/sold/deceased animals are excluded.</p><div class="modal-actions"><button type="button" class="button button-ghost" data-hi-close>Cancel</button><button type="submit" class="button button-primary">Save group record</button></div></form>`);
    modal.querySelector("#hh-hi-group-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      data.species = canonicalSpecies(data.species);
      saveGroupRecord(data);
      modal.remove();
      renderHealthPanel();
    });
  }

  function panelHtml() {
    const farm = readFarmState();
    const health = readHealthState();
    const animals = activeAnimals(farm);
    const species = activeSpecies(farm);
    const openEpisodes = health.episodes.filter((episode) => !episode.resolved);
    const quarantine = openEpisodes.filter((episode) => episode.quarantined);
    const withdrawals = health.careRecords.filter((record) => withdrawalStatus(record).active);
    const upcoming = [
      ...openEpisodes.filter((episode) => episode.recheckDate && episode.recheckDate >= today()).map((episode) => ({ date: episode.recheckDate, text: `${animalName(episode.animalId, farm)} recheck` })),
      ...health.careRecords.filter((record) => record.boosterDueDate && record.boosterDueDate >= today()).map((record) => ({ date: record.boosterDueDate, text: `${animalName(record.animalId, farm)} booster/follow-up` })),
      ...health.groupRecords.filter((record) => record.followUpDate && record.followUpDate >= today()).map((record) => ({ date: record.followUpDate, text: `${displaySpecies(record.species)} group follow-up` }))
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    const insights = buildInsights(farm, health);
    const episodes = health.episodes.slice().sort((a, b) => String(b.startedDate).localeCompare(String(a.startedDate))).slice(0, 8);
    const care = health.careRecords.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);

    return `<section id="hh-health-intelligence" class="panel hh-hi-panel"><div class="hh-hi-head"><div><p class="eyebrow">Health Intelligence Foundation · v1.7.1</p><h2>Health dashboard</h2><p>Structured observation, triage, treatment history, quarantine, group health, preventive care, and withdrawal tracking for the animals currently on your farm.</p></div><div class="hh-hi-actions"><button type="button" class="button button-primary" data-hi-action="episode">Start health episode</button><button type="button" class="button button-ghost" data-hi-action="care">Add care record</button><button type="button" class="button button-ghost" data-hi-action="group">Group record</button></div></div><div class="hh-hi-species">${species.length ? species.map((id) => `<span>${esc(displaySpecies(id))}</span>`).join("") : "<span>No active species</span>"}</div><div class="hh-hi-stats"><div><small>Active animals</small><strong>${animals.length}</strong></div><div><small>Open concerns</small><strong>${openEpisodes.length}</strong></div><div><small>Quarantined</small><strong>${quarantine.length}</strong></div><div><small>Active withdrawals</small><strong>${withdrawals.length}</strong></div></div><div class="hh-hi-triage-grid"><div class="is-emergency"><strong>Emergency</strong><span>Immediate professional care for red-flag signs.</span></div><div class="is-urgent"><strong>Urgent</strong><span>Prompt / same-day professional review when warranted.</span></div><div class="is-monitor"><strong>Monitor closely</strong><span>Structured checks, recheck timing, and clear escalation rules.</span></div><div class="is-routine"><strong>Routine / preventive</strong><span>Vaccines, parasite management, exams, hoof/foot care, testing, and scheduled health work.</span></div></div>${insights.length ? `<div class="hh-hi-section"><h3>Health intelligence</h3>${insights.map((item) => `<div class="hh-hi-insight is-${esc(item.level)}">${esc(item.text)}</div>`).join("")}</div>` : ""}${upcoming.length ? `<div class="hh-hi-section"><h3>Upcoming rechecks & preventive work</h3><div class="hh-hi-list">${upcoming.map((item) => `<div><strong>${esc(item.date)}</strong><span>${esc(item.text)}</span></div>`).join("")}</div></div>` : ""}<div class="hh-hi-columns"><div class="hh-hi-section"><h3>Health episodes</h3>${episodes.length ? episodes.map((episode) => `<article class="hh-hi-record"><div><span class="hh-hi-triage">${esc(episode.assessment?.level || assessEpisode(episode).level)}</span><strong>${esc(animalName(episode.animalId, farm))}</strong><small>${esc(episode.startedDate)} · ${esc(episode.concern || "Observation")}</small></div><div class="hh-hi-record-actions"><button type="button" class="button button-ghost button-small" data-hi-assess="${esc(episode.id)}">Review</button>${!episode.resolved ? `<button type="button" class="button button-ghost button-small" data-hi-resolve="${esc(episode.id)}">Resolve</button>` : ""}</div></article>`).join("") : `<p class="muted">No Health Intelligence episodes yet. Existing Health records remain unchanged.</p>`}</div><div class="hh-hi-section"><h3>Care, medication & vaccination</h3>${care.length ? care.map((record) => { const withdrawal = withdrawalStatus(record); return `<article class="hh-hi-record"><div>${withdrawal.active ? `<span class="hh-hi-withdrawal">Withdrawal active</span>` : ""}<strong>${esc(animalName(record.animalId, farm))}</strong><small>${esc(record.date)} · ${esc(record.type)}${record.product ? ` · ${esc(record.product)}` : ""}</small></div></article>`; }).join("") : `<p class="muted">No structured care records yet.</p>`}</div></div><p class="hh-hi-safety">HerdHarbor is a recordkeeping and educational aid. It does not diagnose disease, calculate medication doses, calculate withdrawal intervals, or replace a veterinarian or other qualified animal-health professional.</p></section>`;
  }

  function renderHealthPanel() {
    const view = root.document?.querySelector("#view-health");
    if (!view) return null;
    const existing = view.querySelector("#hh-health-intelligence");
    const holder = root.document.createElement("div");
    holder.innerHTML = panelHtml();
    const panel = holder.firstElementChild;
    if (existing) existing.replaceWith(panel);
    else {
      const header = view.querySelector(".page-header");
      if (header?.nextSibling) view.insertBefore(panel, header.nextSibling);
      else view.prepend(panel);
    }
    return panel;
  }

  function activeGuideSpeciesLabels(farm = readFarmState()) {
    const set = new Set();
    for (const animal of activeAnimals(farm)) {
      const raw = displaySpecies(animal.species);
      set.add(raw);
      const id = canonicalSpecies(animal.species);
      if (["chicken", "duck", "turkey", "poultry"].includes(id)) {
        if (id === "poultry") { set.add("Chicken"); set.add("Duck"); set.add("Turkey"); }
        else set.add(raw);
      }
      if (id === "swine") set.add("Pig");
    }
    return set;
  }

  function hardlockSymptomGuide() {
    const speciesSet = activeGuideSpeciesLabels();
    const selector = root.document?.querySelector("#symptom-species");
    if (selector) {
      [...selector.options].forEach((option) => {
        if (!option.value) { option.textContent = "All animals on my farm"; return; }
        option.hidden = !speciesSet.has(option.value);
        option.disabled = !speciesSet.has(option.value);
      });
      if (selector.value && !speciesSet.has(selector.value)) {
        const first = [...selector.options].find((option) => option.value && !option.disabled);
        if (first) {
          selector.value = first.value;
          selector.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }

    root.document?.querySelectorAll(".symptom-card").forEach((card) => {
      const label = clean(card.querySelector(".symptom-species")?.textContent);
      const allowed = label === "All species" || label.split("·").map((part) => clean(part)).some((part) => speciesSet.has(part));
      card.hidden = !allowed;
      const badge = card.querySelector(".symptom-urgency");
      if (badge) badge.textContent = mapGuideUrgency(clean(badge.textContent));
    });
    root.document?.querySelectorAll("#symptom-urgency option").forEach((option) => {
      if (option.value === "Emergency now") option.textContent = TRIAGE.EMERGENCY;
      if (option.value === "Contact a vet soon") option.textContent = TRIAGE.URGENT;
      if (option.value === "Monitor and call") option.textContent = TRIAGE.MONITOR;
    });
  }

  function install() {
    renderHealthPanel();
    hardlockSymptomGuide();
    root.document?.addEventListener("click", (event) => {
      const action = event.target.closest?.("[data-hi-action]")?.dataset?.hiAction;
      if (action === "episode") openEpisodeForm();
      if (action === "care") openCareForm();
      if (action === "group") openGroupForm();
      const assessId = event.target.closest?.("[data-hi-assess]")?.dataset?.hiAssess;
      if (assessId) {
        const episode = readHealthState().episodes.find((item) => item.id === assessId);
        if (episode) showAssessment(episode);
      }
      const resolveId = event.target.closest?.("[data-hi-resolve]")?.dataset?.hiResolve;
      if (resolveId) { resolveEpisode(resolveId); renderHealthPanel(); }
    });
    root.addEventListener?.("herdharbor:health-intelligence-changed", renderHealthPanel);
    root.addEventListener?.("storage", (event) => {
      if (event.key === STORAGE_KEY || event.key === HEALTH_KEY) { renderHealthPanel(); hardlockSymptomGuide(); }
    });
    if (typeof root.MutationObserver === "function" && root.document?.body) {
      let pending = false;
      const observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        queueMicrotask(() => { pending = false; renderHealthPanel(); hardlockSymptomGuide(); });
      });
      observer.observe(root.document.body, { childList: true, subtree: true });
    }
  }

  const API = Object.freeze({
    VERSION,
    TRIAGE,
    isActiveAnimal,
    canonicalSpecies,
    activeAnimals,
    activeSpecies,
    mapGuideUrgency,
    assessEpisode,
    checklistFor,
    normalizeEpisode,
    normalizeCareRecord,
    withdrawalStatus,
    groupTargets,
    buildInsights,
    readHealthState,
    saveEpisode,
    resolveEpisode,
    saveCareRecord,
    saveGroupRecord,
    renderHealthPanel,
    hardlockSymptomGuide,
    install
  });

  root.HerdHarborHealthIntelligence = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
