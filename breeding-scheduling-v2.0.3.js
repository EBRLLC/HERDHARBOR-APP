(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborBreedingSchedule203 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  // Estimated species ranges, not pregnancy diagnoses. See:
  // https://www.merckvetmanual.com/reproductive-system/reproductive-system-introduction/the-reproductive-system-in-animals
  // https://www.merckvetmanual.com/multimedia/table/physiological-data-for-guinea-pigs
  const RULES = Object.freeze({
    Rabbit: {gestationDays:31,minDays:30,maxDays:33,checkDays:14,prepareDaysBefore:3,birthLabel:"kindling",prepareLabel:"Place nest box"},
    Dog: {gestationDays:63,minDays:58,maxDays:72,checkDays:28,prepareDaysBefore:7,birthLabel:"whelping",prepareLabel:"Prepare whelping area"},
    Cat: {gestationDays:65,minDays:63,maxDays:71,checkDays:25,prepareDaysBefore:7,birthLabel:"queening",prepareLabel:"Prepare kittening area"},
    Cavy: {gestationDays:68,minDays:59,maxDays:72,checkDays:25,prepareDaysBefore:7,birthLabel:"farrowing",prepareLabel:"Prepare birthing area"},
    Cattle: {gestationDays:283,minDays:271,maxDays:291,checkDays:30,prepareDaysBefore:14,birthLabel:"calving",prepareLabel:"Prepare calving area"},
    Goat: {gestationDays:150,minDays:146,maxDays:155,checkDays:30,prepareDaysBefore:14,birthLabel:"kidding",prepareLabel:"Prepare kidding area"},
    Sheep: {gestationDays:147,minDays:143,maxDays:151,checkDays:30,prepareDaysBefore:14,birthLabel:"lambing",prepareLabel:"Prepare lambing area"},
    Pig: {gestationDays:114,minDays:110,maxDays:116,checkDays:28,prepareDaysBefore:7,birthLabel:"farrowing",prepareLabel:"Prepare farrowing area"},
    Horse: {gestationDays:340,minDays:320,maxDays:360,checkDays:45,prepareDaysBefore:21,birthLabel:"foaling",prepareLabel:"Prepare foaling area"}
  });
  const aliases = Object.freeze({"rabbit":"Rabbit","rabbits":"Rabbit","dog":"Dog","dogs":"Dog","cat":"Cat","cats":"Cat","feline":"Cat","cavy":"Cavy","cavies":"Cavy","guinea pig":"Cavy","guinea pigs":"Cavy","cattle":"Cattle","cow":"Cattle","goat":"Goat","goats":"Goat","sheep":"Sheep","pig":"Pig","pigs":"Pig","swine":"Pig","horse":"Horse","horses":"Horse"});
  const canonicalSpecies = value => aliases[String(value || "").trim().toLowerCase()] || String(value || "");
  function parsedDate(input) {
    const value = String(input || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? date : null;
  }
  function plusDays(value, days) {
    const date = parsedDate(value);
    if (!date || !Number.isFinite(days)) return "";
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0,10);
  }
  function schedule(animal, breedingDate, overrides = {}) {
    const species = canonicalSpecies(animal?.species);
    const rule = RULES[species] || null, base = {species,rule, pregnancyCheckDate:"",preparationDate:"",dueDate:"",dueRange:null,estimated:false,pregnancyConfirmed:false,evidence:"not-enough-information"};
    if (!rule || !parsedDate(breedingDate)) return base;
    const dueDate = plusDays(breedingDate,rule.gestationDays);
    return {...base, pregnancyCheckDate: overrides.pregnancyCheckDate || plusDays(breedingDate,rule.checkDays),
      preparationDate: overrides.preparationDate || plusDays(dueDate,-rule.prepareDaysBefore),
      dueDate: overrides.dueDate || dueDate,
      dueRange: {earliest:plusDays(breedingDate,rule.minDays),latest:plusDays(breedingDate,rule.maxDays)},
      estimated:true,evidence:"estimated-from-recorded-mating-date"};
  }
  function pairingEligibility(animal) {
    if (!animal) return {eligible:false,reason:"Animal record unavailable."};
    const statuses = [animal.status,animal.breedingStatus,animal.reproductiveStatus].map(x=>String(x||"").trim().toLowerCase());
    if (statuses.some(x=>/\b(deceased|dead|retired|sterilized|spayed|neutered|castrated|immature|juvenile|weanling|growing)\b/.test(x))) return {eligible:false,reason:"Animal is not recorded as an active breeding adult."};
    if (statuses.some(x=>/\b(sold|transferred)\b/.test(x))) return {eligible:false,reason:"Animal is no longer recorded as part of the active breeding herd."};
    return {eligible:true,reason:"Eligibility still requires species-specific health and maturity review."};
  }
  return Object.freeze({VERSION:"2.0.3",RULES,canonicalSpecies,plusDays,schedule,pairingEligibility});
});
