(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCanineBreeds = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SOURCE = Object.freeze({
    organization: "American Kennel Club",
    url: "https://www.akc.org/press-center/articles-resources/facts-and-stats/breeds-year-recognized/",
    sourceUpdated: "2026-01-01",
    checkedAt: "2026-10-16",
    catalogVersion: "akc-recognized-2026-01-01",
    recognizedCount: 205
  });
  // 205 recognized breed identities; umbrella "Fox Terrier" is represented by its
  // current Smooth/Wire breeds, Manchester Terrier varieties remain one breed,
  // and the duplicated Bracco Italiano history-page entry is represented once.
  const RECOGNIZED_NAMES = Object.freeze(["Pointer","Chesapeake Bay Retriever","Clumber Spaniel","Cocker Spaniel","English Setter","Gordon Setter","Irish Setter","Irish Water Spaniel","Sussex Spaniel","Basset Hound","Beagle","Bloodhound","Bull Terrier","Collie","Dachshund","Greyhound","Harrier","Irish Terrier","Mastiff","Pug","Saint Bernard","Scottish Terrier","Yorkshire Terrier","Bedlington Terrier","Bulldog","Dandie Dinmont Terrier","English Toy Spaniel","American Foxhound","Italian Greyhound","Manchester Terrier","Newfoundland","Scottish Deerhound","Great Dane","Poodle","Skye Terrier","Wirehaired Pointing Griffon","Airedale Terrier","Dalmatian","Japanese Chin","Maltese","Old English Sheepdog","Pomeranian","Welsh Terrier","Whippet","Borzoi","Boston Terrier","Field Spaniel","Irish Wolfhound","French Bulldog","Chow Chow","Boxer","Chihuahua","Schipperke","Standard Schnauzer","Pekingese","Samoyed","Doberman Pinscher","German Shepherd Dog","West Highland White Terrier","English Foxhound","Otterhound","Brussels Griffon","English Springer Spaniel","Sealyham Terrier","Shetland Sheepdog","Belgian Sheepdog","Cairn Terrier","Norwegian Elkhound","Welsh Springer Spaniel","Papillon","Flat-Coated Retriever","Labrador Retriever","Kerry Blue Terrier","Curly-Coated Retriever","Miniature Pinscher","Golden Retriever","Afghan Hound","Miniature Schnauzer","Saluki","Briard","Border Terrier","Giant Schnauzer","Keeshond","German Shorthaired Pointer","Siberian Husky","Bouvier des Flandres","Kuvasz","Rottweiler","Great Pyrenees","Brittany","Bullmastiff","Lakeland Terrier","Pembroke Welsh Corgi","Alaskan Malamute","Lhasa Apso","Cardigan Welsh Corgi","Affenpinscher","American Staffordshire Terrier","Norwich Terrier","Puli","Bernese Mountain Dog","Komondor","American Water Spaniel","Weimaraner","Basenji","Black and Tan Coonhound","English Cocker Spaniel","Rhodesian Ridgeback","Belgian Malinois","Belgian Tervuren","German Wirehaired Pointer","Silky Terrier","Australian Terrier","Vizsla","Shih Tzu","Akita","Bichon Frise","Soft Coated Wheaten Terrier","Tibetan Terrier","Staffordshire Bull Terrier","Bearded Collie","Ibizan Hound","Norfolk Terrier","Australian Cattle Dog","Pharaoh Hound","Portuguese Water Dog","Tibetan Spaniel","Petit Basset Griffon Vendéen","Australian Shepherd","Chinese Crested","Finnish Spitz","Miniature Bull Terrier","Chinese Shar-Pei","Shiba Inu","American Eskimo Dog","Border Collie","Cavalier King Charles Spaniel","Greater Swiss Mountain Dog","Anatolian Shepherd Dog","Havanese","Löwchen","Canaan Dog","Parson Russell Terrier","Spinone Italiano","Polish Lowland Sheepdog","German Pinscher","Nova Scotia Duck Tolling Retriever","Toy Fox Terrier","Black Russian Terrier","Glen of Imaal Terrier","Neapolitan Mastiff","Plott Hound","Tibetan Mastiff","Beauceron","Swedish Vallhund","Dogue de Bordeaux","Bluetick Coonhound","Boykin Spaniel","Irish Red and White Setter","Norwegian Buhund","Pyrenean Shepherd","Redbone Coonhound","Cane Corso","Icelandic Sheepdog","Leonberger","American English Coonhound","Cesky Terrier","Entlebucher Mountain Dog","Finnish Lapphund","Norwegian Lundehund","Xoloitzcuintli","Russell Terrier","Treeing Walker Coonhound","Chinook","Portuguese Podengo Pequeno","Rat Terrier","Coton de Tulear","Wirehaired Vizsla","Bergamasco Sheepdog","Berger Picard","Boerboel","Cirneco dell'Etna","Lagotto Romagnolo","Miniature American Shepherd","Spanish Water Dog","American Hairless Terrier","Pumi","Sloughi","Grand Basset Griffon Vendéen","Nederlandse Kooikerhondje","Azawakh","Barbet","Dogo Argentino","Belgian Laekenois","Biewer Terrier","Bracco Italiano","Mudi","Russian Toy","Lancashire Heeler","Danish-Swedish Farmdog","Basset Fauve de Bretagne","Russian Tsvetnaya Bolonka","Teddy Roosevelt Terrier","Smooth Fox Terrier","Wire Fox Terrier"]);
  const ALIASES = Object.freeze({
    "Golden Retriever": ["Retriever (Golden)"],
    "Labrador Retriever": ["Retriever (Labrador)", "Lab"],
    "Chesapeake Bay Retriever": ["Retriever (Chesapeake Bay)"],
    "English Setter": ["Setter (English)"],
    "English Cocker Spaniel": ["Spaniel (English Cocker)"],
    "Flat-Coated Retriever": ["Retriever (Flat-Coated)"],
    "American Foxhound": ["Foxhound (American)"],
    "English Foxhound": ["Foxhound (English)"],
    "German Shorthaired Pointer": ["Pointer (German Shorthaired)"],
    "German Wirehaired Pointer": ["Pointer (German Wirehaired)"],
    "Cardigan Welsh Corgi": ["Welsh Corgi (Cardigan)"],
    "Pembroke Welsh Corgi": ["Welsh Corgi (Pembroke)"],
    "Manchester Terrier": ["Toy Manchester Terrier", "Standard Manchester Terrier"],
    "Smooth Fox Terrier": ["Fox Terrier (Smooth)"],
    "Wire Fox Terrier": ["Fox Terrier (Wire)"],
    "Great Pyrenees": ["Pyrenees"],
    "Bergamasco Sheepdog": ["Bergamasco"],
    "Nova Scotia Duck Tolling Retriever": ["Nova Scotia Duck Trolling Retriever"],
    "Anatolian Shepherd Dog": ["Anatolian Shepherd"]
  });
  const norm = (str) => String(str || "").trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const slug = (str) => norm(str).replace(/\s+/g, "-");
  const RECORDS = Object.freeze(RECOGNIZED_NAMES.map(name => Object.freeze({
    id: "akc:" + slug(name),
    name,
    aliases: Object.freeze(ALIASES[name] || []),
    registry: "AKC",
    recognized: true,
    sourceVersion: SOURCE.catalogVersion
  })).sort((a,b)=>a.name.localeCompare(b.name)));
  const IDS = new Set(RECORDS.map(r => r.id));
  if (RECORDS.length !== SOURCE.recognizedCount || IDS.size !== RECORDS.length)
    throw new Error("Invalid AKC breed catalog: expected 205 unique IDs.");
  function list() { return RECORDS.slice(); }
  function search(query = "", limit = 205) {
    const needle = norm(query);
    const found = needle ? RECORDS.filter(r => [r.name, ...r.aliases].some(s => norm(s).includes(needle))) : RECORDS;
    return found.slice(0, Math.max(0, Math.min(205, Number(limit) || 205)));
  }
  function resolve(value) {
    const key = norm(value);
    return RECORDS.find(r => norm(r.id) === key || norm(r.name) === key ||
      r.aliases.some(a => norm(a) === key)) || null;
  }
  function classify(name) {
    const breed = resolve(name);
    return breed ? { status: "recognized", breed } :
      { status: "user-entered", breed: null, name: String(name || "").trim() };
  }

  // The browser datalist remains useful for typing but iOS does not present it
  // consistently. A native select makes the complete recognized catalog
  // browsable on mobile while the existing canonical breed input stays editable.
  const escapeHtml = value => String(value == null ? "" : value).replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const CUSTOM = "__hh_custom_dog_breed__";

  function pickerHtml(species = "", value = "") {
    const dog = norm(species) === "dog";
    const existing = resolve(value)?.name || (String(value || "").trim() ? CUSTOM : "");
    return '<label data-hh-dog-breed-picker class="hh-dog-breed-picker' + (dog ? '' : ' hidden') + '"' +
      (dog ? '' : ' hidden') + '>Browse dog breeds (AKC recognized)' +
      '<select data-hh-dog-breed-select aria-label="Browse recognized dog breeds"' +
      (dog ? '' : ' disabled') + '>' +
      '<option value="">Select a dog breed</option>' +
      RECORDS.map(row => '<option value="' + escapeHtml(row.name) + '"' +
        (existing === row.name ? ' selected' : '') + '>' + escapeHtml(row.name) + '</option>').join("") +
      '<option value="' + CUSTOM + '"' + (existing === CUSTOM ? ' selected' : '') +
      '>Other / mixed breed / not listed</option></select>' +
      '<small class="muted">For crosses, mixed breeds or breeds outside the AKC catalog, type the breed in the Breed field above.</small></label>';
  }

  function bindPicker(form, speciesSelect) {
    const wrapper = form?.querySelector?.('[data-hh-dog-breed-picker]');
    const select = form?.querySelector?.('[data-hh-dog-breed-select]');
    const breed = form?.querySelector?.('input[name="breed"]');
    if (!wrapper || !select || !breed || !speciesSelect) return false;
    const sync = () => {
      const dog = norm(speciesSelect.value) === "dog";
      wrapper.hidden = !dog;
      wrapper.classList?.toggle?.("hidden", !dog);
      select.disabled = !dog;
      if (dog) {
        select.value = resolve(breed.value)?.name || (String(breed.value || "").trim() ? CUSTOM : "");
      }
    };
    let previousSpecies = norm(speciesSelect.value);
    speciesSelect.addEventListener?.("change", () => {
      const nextSpecies = norm(speciesSelect.value);
      // Avoid silently assigning a previously-entered rabbit breed to a Dog,
      // or preserving a Dog breed after an explicit change to another species.
      if (nextSpecies !== previousSpecies && (nextSpecies === "dog" || previousSpecies === "dog")) {
        breed.value = "";
      }
      previousSpecies = nextSpecies;
      sync();
    });
    select.addEventListener?.("change", () => {
      if (select.value === CUSTOM) {
        // A prior recognized selection must not be silently retained as a
        // "custom" breed when the breeder explicitly chooses Other.
        if (resolve(breed.value)) breed.value = "";
        breed.focus?.();
      } else {
        breed.value = select.value;
      }
    });
    breed.addEventListener?.("input", sync);
    sync();
    return true;
  }


  // Curated from the AKC breed pages' "Breed Colors & Markings" / COLORS
  // registration tables as checked 2026-10-26. These are AKC-listed color
  // descriptions, NOT assertions of conformation eligibility; AKC also lists
  // alternate or disqualifying colors for some breeds. An incomplete breed
  // mapping MUST fall back to observed free text, never rabbit colors or a
  // borrowed all-dogs palette.
  const AKC_COAT_COLORS = Object.freeze({
    "Labrador Retriever": ["Black", "Chocolate", "Yellow"],
    "Golden Retriever": ["Dark Golden", "Golden", "Light Golden"],
    "Great Pyrenees": ["White"],
    "Australian Shepherd": ["Black", "Blue Merle", "Red", "Red Merle"],
    "Cavalier King Charles Spaniel": ["Blenheim", "Black & Tan", "Black & White", "Ruby"],
    "Pembroke Welsh Corgi": ["Black & Tan", "Fawn", "Red", "Sable"],
    "Rottweiler": ["Black & Rust", "Black & Mahogany", "Black & Tan"],
    "French Bulldog": ["Brindle", "Brindle & White", "Cream", "Fawn", "Fawn & White", "Fawn Brindle", "White", "White & Brindle", "Fawn Brindle & White", "White & Fawn"],
    "Bulldog": ["Red Brindle & White", "Fawn Brindle & White", "Fawn & Brindle", "Fallow", "White", "Red", "Red & White", "Fawn", "Red Brindle", "Brindle & White", "Fawn & White"],
    "Beagle": ["Black & White", "Lemon", "Lemon & White", "White", "Black", "Brown", "Tan", "Black & Tan", "Red", "Red & White", "Brown & White", "Black White & Tan", "Brown White & Tan", "Blue", "Black Tan & White", "White Black & Tan", "Blue & White", "Blue Tan & White", "Black Red & White", "Tan & White", "Red Black & White", "Red & Black", "Black Tan & Redtick", "Black Fawn & White", "Black Tan & Bluetick"],
    "German Shepherd Dog": ["Black", "Black & Cream", "Black & Red", "Black & Silver", "Black & Tan", "Gray", "Sable", "White", "Liver", "Blue", "Bi-Color"],
    "Poodle": ["Apricot", "Black", "Blue", "Brown", "Cream", "Red", "Silver", "Silver Beige", "White", "Cafe Au Lait", "Gray", "Black & Cream", "Black & Gray", "Black & Silver", "Black & White", "Blue & White", "Brown & Apricot", "Brown & White", "Black & Apricot", "Cream & White", "Black & Brown", "Gray & White", "Red & Apricot", "Red & White", "White & Apricot", "White & Silver", "Black & Tan"],
    "Bernese Mountain Dog": ["Black Rust & White", "Black Tan & White", "Black & Rust", "Black & White", "Rust & White"],
    "Siberian Husky": ["Agouti & White", "Black & White", "Gray & White", "Red & White", "Sable & White", "White", "Brown & White", "Black Tan & White", "Black"],
    "Boxer": ["Brindle", "Fawn", "White"],
    "Cardigan Welsh Corgi": ["Black & White", "Blue Merle & White", "Brindle & White", "Red & White", "Sable & White", "Brindle Merle & White", "Gray & White", "Liver & White", "Red Merle & White", "Sable Merle & White", "White Merle"],
    "Pomeranian": ["Blue Merle", "Blue Brindle", "Chocolate Merle", "Blue Sable", "Black", "Black & Tan", "Blue", "Blue & Tan", "Chocolate", "Chocolate & Tan", "Cream", "Cream Sable", "Orange", "Orange Sable", "Red", "Red Sable", "Beaver", "Brindle", "Chocolate Sable", "White", "Wolf Sable", "Beaver Sable", "Tri-Colored", "Black & Brindle"],
    "Staffordshire Bull Terrier": ["Black", "Black & White", "Blue", "Blue & White", "Brindle", "Brindle & White", "Fawn", "Fawn & White", "Red", "Red & White", "White", "White & Brindle", "White & Fawn", "White & Red", "Black & Tan", "Liver"],
    "American Staffordshire Terrier": ["Black", "White", "Brown", "Blue", "Fawn Sable", "Blue Fawn", "Red Brindle", "Blue Fawn Brindle", "Liver", "Black Brindle", "Fawn Brindle", "Blue Brindle", "Liver Brindle", "Fawn", "Red", "Seal Brown", "Red Sable", "Brown Brindle"],
    "American Hairless Terrier": ["Apricot", "Black", "Black Sable Red", "Blue", "Blue Fawn", "Chocolate", "Lemon", "Lilac Dilute", "Red", "Red Sable", "White & Apricot", "White & Black", "White, Black Sable Red", "White & Blue", "White & Blue Fawn", "White & Chocolate", "White & Lemon", "White & Red", "Black & Tan", "Black Tan & White", "Black Brindle", "Black Brindle & White", "Blue & Tan", "Blue Tan & White", "Blue Brindle", "Blue Brindle & White", "Blue Fawn & White", "Chocolate Brindle", "Chocolate & Tan", "Lemon & White", "Red & Tan", "Red & White", "Red Brindle", "Red Brindle & White", "Seal"],
    "Italian Greyhound": ["Fawn", "Blue", "Red", "Red Fawn", "Black", "Blue Fawn", "Sable", "Seal", "White & Black", "White & Blue", "White & Fawn", "White & Red", "White & Red Fawn", "White & Blue Fawn", "White & Seal", "White & Sable", "Black & Tan", "White", "Brindle", "Blue & Tan", "Chocolate", "Cream"],
    "Chinese Crested": ["Apricot", "Black", "Black White & Tan", "Blue", "Chocolate", "Cream", "Palomino", "Pink & Chocolate", "Pink & Slate", "Slate", "White", "Black & Tan", "Black & White", "Brown", "Pink", "Red", "Sable", "Silver", "White & Black", "White & Chocolate"],
    "Greyhound": ["Black", "Black Brindle", "Blue Brindle", "Red", "Red Brindle", "White", "White & Black", "White & Blue Brindle", "White & Red", "Blue", "Blue Fawn", "White & Black Brindle", "White & Blue", "White & Blue Fawn", "White & Red Brindle", "Black & White", "Blue Brindle & White", "Red & White", "Black Brindle & White", "Blue & White", "Blue Fawn & White", "Fawn"]
  });
  const AKC_COAT_SOURCES = Object.freeze(Object.fromEntries(Object.keys(AKC_COAT_COLORS).map(name =>
    [name, "https://www.akc.org/dog-breeds/" +
      (name === "Poodle" ? "poodle-standard" : slug(name)) + "/"]
  )));
  const coatColorChoices = breed => {
    const recognized = resolve(breed);
    const row = recognized && AKC_COAT_COLORS[recognized.name];
    return Array.isArray(row) ? row.slice() : [];
  };
  const COAT_OTHER = "__hh_other_canine_color__";
  function coatColorHtml(species = "", breed = "", color = "") {
    const dog = norm(species) === "dog";
    const choices = dog ? coatColorChoices(breed) : [];
    const observed = String(color || "").trim();
    const match = choices.find(choice => norm(choice) === norm(observed));
    const custom = !choices.length || Boolean(observed && !match);
    return '<div data-hh-canine-coat-panel class="hh-canine-coat-panel' + (dog ? "" : " hidden") + '"' +
      (dog ? "" : " hidden") + '>' +
      '<label>Dog coat color (breed-specific AKC listings)' +
      '<select data-hh-canine-coat-select' + (!dog || !choices.length ? ' disabled' : '') + '>' +
      '<option value="">Select a coat color</option>' +
      choices.map(choice => '<option value="' + escapeHtml(choice) + '"' +
        (match === choice ? ' selected' : '') + '>' + escapeHtml(choice) + '</option>').join("") +
      '<option value="' + COAT_OTHER + '"' + (custom && choices.length ? ' selected' : '') +
      '>Other / observed color not listed</option></select></label>' +
      '<label data-hh-canine-coat-custom-row' + (!dog || !custom ? ' hidden' : '') + '>' +
      'Describe coat color<input data-hh-canine-coat-custom type="text" maxlength="160"' +
      ' value="' + escapeHtml(custom ? observed : "") + '" placeholder="e.g. Blue merle & tan"></label>' +
      '<small data-hh-canine-coat-note class="muted"></small>' +
      '</div>';
  }

  // Color always persists through the original Animal.color field. The new
  // select/custom input have no form names, so FormData cannot overwrite it.
  function bindCoatColor(form, speciesSelect) {
    const panel = form?.querySelector?.('[data-hh-canine-coat-panel]');
    const select = form?.querySelector?.('[data-hh-canine-coat-select]');
    const manualRow = form?.querySelector?.('[data-hh-canine-coat-custom-row]');
    const manual = form?.querySelector?.('[data-hh-canine-coat-custom]');
    const note = form?.querySelector?.('[data-hh-canine-coat-note]');
    const canonical = form?.querySelector?.('input[name="color"]');
    const breed = form?.querySelector?.('input[name="breed"]');
    const dogBreedSelect = form?.querySelector?.('[data-hh-dog-breed-select]');
    if (!panel || !select || !manualRow || !manual || !canonical || !breed || !speciesSelect) return false;

    const canonicalRow = canonical.closest?.("label");
    const visible = (element, on) => {
      if (!element) return;
      element.hidden = !on;
      element.classList?.toggle?.("hidden", !on);
    };
    const identity = () => norm(speciesSelect.value) + "|" + norm(breed.value);
    let previousIdentity = identity();

    const sync = () => {
      const dog = norm(speciesSelect.value) === "dog";
      visible(panel, dog);
      visible(canonicalRow, !dog);
      if (!dog) {
        // Dog -> another species must never retain a canine-only color.
        // Keep existing rabbit/other-species colors on ordinary edits.
        if (previousIdentity.startsWith("dog|")) canonical.value = "";
        select.disabled = true;
        visible(manualRow, false);
        previousIdentity = identity();
        return;
      }
      const key = identity();
      if (key !== previousIdentity) {
        // Deliberate breed/species change invalidates prior color. Do not
        // silently save a Labrador color for a Golden Retriever.
        canonical.value = "";
      }
      previousIdentity = key;
      const choices = coatColorChoices(breed.value);
      const current = String(canonical.value || "").trim();
      const match = choices.find(choice => norm(choice) === norm(current)) || "";
      const custom = !choices.length || Boolean(current && !match);
      select.innerHTML = '<option value="">Select a coat color</option>' +
        choices.map(choice => '<option value="' + escapeHtml(choice) + '">' +
        escapeHtml(choice) + '</option>').join("") +
        '<option value="' + COAT_OTHER + '">Other / observed color not listed</option>';
      select.disabled = !choices.length;
      select.value = !choices.length ? COAT_OTHER : match || (custom ? COAT_OTHER : "");
      manual.value = custom ? current : "";
      visible(manualRow, custom);
      if (note) {
        const recognized = resolve(breed.value);
        note.textContent = !recognized
          ? "Mixed or unlisted breed: enter the observed coat color; no rabbit colors are used."
          : !choices.length
            ? "No verified AKC color table is loaded for this breed yet. Enter its observed coat color."
            : "AKC registration color descriptions for " + recognized.name +
              ". AKC show-standard eligibility can differ; record markings separately below.";
      }
    };
    speciesSelect.addEventListener?.("change", sync);
    breed.addEventListener?.("input", sync);
    breed.addEventListener?.("change", sync);
    // The breed picker sets the canonical breed field without firing "input".
    // Register after its own listener so this callback sees the new breed.
    dogBreedSelect?.addEventListener?.("change", sync);
    select.addEventListener?.("change", () => {
      if (select.value === COAT_OTHER) {
        if (coatColorChoices(breed.value).some(x => norm(x) === norm(canonical.value))) {
          canonical.value = "";
        }
        manual.value = canonical.value;
        visible(manualRow, true);
        manual.focus?.();
      } else {
        canonical.value = select.value;
        manual.value = "";
        visible(manualRow, false);
      }
    });
    manual.addEventListener?.("input", () => {
      if (norm(speciesSelect.value) === "dog") canonical.value = manual.value;
    });
    sync();
    return true;
  }

  // Official AKC Breed Colors & Markings tables (reviewed 2026-10-26).
  // Empty or missing lists must never be replaced with generic rabbit or
  // all-breed markings. Breeders can always record a custom observed marking.
  const AKC_MARKINGS = Object.freeze({
    "Labrador Retriever": ["White Markings"],
    "Great Pyrenees": ["Badger Markings", "Tan Markings", "Gray Markings", "Reddish Brown Markings"],
    "Australian Shepherd": ["White Markings", "Tan Points", "White Markings, Tan Points"],
    "Cavalier King Charles Spaniel": ["Tan Markings"],
    "Pembroke Welsh Corgi": ["White Markings"],
    "French Bulldog": ["Black Markings", "White Markings", "Black Mask", "Brindle Markings", "Piebald", "Tan Points"],
    "Pomeranian": ["Parti-Color", "Mask", "White Markings", "Tan Markings", "Brindle", "Irish Marked", "Tri Color Markings", "Sable", "Merle Markings"],
    "Staffordshire Bull Terrier": ["Brindle Markings"],
    "American Staffordshire Terrier": ["White Markings", "Spotted", "Black Mask", "Patched"],
    "American Hairless Terrier": ["Brindle Points", "Brindle", "Tan Markings", "Tan Points", "Sable", "White Markings", "White Markings, Tan Points", "Piebald"],
    "Italian Greyhound": ["White Markings", "Black Mask", "Blue Mask", "White Markings, Black Mask", "White Markings, Blue Mask"],
    "Chinese Crested": ["Spotted", "White Markings"],
    "Cardigan Welsh Corgi": ["Black Mask", "Black Mask & Ticked", "Brindle Points", "Brindle Points & Ticked", "Tan Points", "Tan Points & Ticked", "Ticked"]
  });
  function markingChoices(breed) {
    const entry = resolve(breed);
    return entry && Array.isArray(AKC_MARKINGS[entry.name]) ? AKC_MARKINGS[entry.name].slice() : [];
  }
  const OTHER_MARKING = "__hh_other_canine_marking__";
  function markingsHtml(species = "", breed = "", marking = "") {
    const isCanine = norm(species) === "dog";
    const choices = isCanine ? markingChoices(breed) : [];
    const current = String(marking || "").trim();
    const match = choices.find(choice => norm(choice) === norm(current)) || "";
    const useManual = !choices.length || Boolean(current && !match);
    return '<div data-hh-canine-markings-panel class="hh-canine-markings-panel' +
      (isCanine ? "" : " hidden") + '"' + (isCanine ? "" : " hidden") + '>' +
      '<label>Dog markings (separate from coat color)' +
      '<select data-hh-canine-marking-select' + (!isCanine || !choices.length ? ' disabled' : '') + '>' +
      '<option value="">None / not specified</option>' +
      choices.map(value => '<option value="' + escapeHtml(value) + '"' +
        (value === match ? ' selected' : '') + '>' + escapeHtml(value) + '</option>').join("") +
      '<option value="' + OTHER_MARKING + '"' + (useManual && choices.length ? ' selected' : '') +
      '>Other / observed markings</option></select></label>' +
      '<label data-hh-canine-marking-custom-row' + (!isCanine || !useManual ? ' hidden' : '') + '>' +
      'Describe markings<input type="text" data-hh-canine-marking-custom maxlength="160"' +
      ' value="' + escapeHtml(useManual ? current : "") + '" placeholder="e.g. white chest patch"></label>' +
      '<input type="hidden" data-hh-canine-markings-value value="' + escapeHtml(current) + '">' +
      '<small data-hh-canine-marking-note class="muted"></small></div>';
  }
  function bindMarkings(form, speciesSelect) {
    const panel = form?.querySelector?.('[data-hh-canine-markings-panel]');
    const picker = form?.querySelector?.('[data-hh-canine-marking-select]');
    const manualRow = form?.querySelector?.('[data-hh-canine-marking-custom-row]');
    const manual = form?.querySelector?.('[data-hh-canine-marking-custom]');
    const value = form?.querySelector?.('[data-hh-canine-markings-value]');
    const note = form?.querySelector?.('[data-hh-canine-marking-note]');
    const breed = form?.querySelector?.('input[name="breed"]');
    const breedPicker = form?.querySelector?.('[data-hh-dog-breed-select]');
    if (!panel || !picker || !manualRow || !manual || !value || !breed || !speciesSelect) return false;
    const visible = (el, on) => {
      el.hidden = !on;
      el.classList?.toggle?.("hidden", !on);
    };
    const identity = () => norm(speciesSelect.value) + "|" + norm(breed.value);
    let previousIdentity = identity();
    const sync = () => {
      const dog = norm(speciesSelect.value) === "dog";
      visible(panel, dog);
      if (!dog) {
        if (previousIdentity.startsWith("dog|")) value.value = "";
        picker.disabled = true;
        visible(manualRow, false);
        previousIdentity = identity();
        return;
      }
      const next = identity();
      if (previousIdentity !== next) value.value = "";
      previousIdentity = next;
      const options = markingChoices(breed.value);
      const existing = String(value.value || "").trim();
      const match = options.find(option => norm(option) === norm(existing)) || "";
      const custom = !options.length || Boolean(existing && !match);
      picker.innerHTML = '<option value="">None / not specified</option>' +
        options.map(option => '<option value="' + escapeHtml(option) + '">' +
          escapeHtml(option) + '</option>').join("") +
        '<option value="' + OTHER_MARKING + '">Other / observed markings</option>';
      picker.disabled = !options.length;
      picker.value = !options.length ? OTHER_MARKING : match || (custom ? OTHER_MARKING : "");
      manual.value = custom ? existing : "";
      visible(manualRow, custom);
      if (note) {
        const recognized = resolve(breed.value);
        note.textContent = !recognized
          ? "Mixed/unlisted breed: describe the observed markings."
          : !options.length
            ? "No reviewed AKC marking table available here; describe observed markings."
            : "Breed-specific AKC registration marking descriptions; eligibility for conformation may differ.";
      }
    };
    speciesSelect.addEventListener?.("change", sync);
    breed.addEventListener?.("input", sync);
    breed.addEventListener?.("change", sync);
    breedPicker?.addEventListener?.("change", sync);
    picker.addEventListener?.("change", () => {
      if (picker.value === OTHER_MARKING) {
        if (markingChoices(breed.value).some(x => norm(x) === norm(value.value))) value.value = "";
        manual.value = value.value;
        visible(manualRow, true);
        manual.focus?.();
      } else {
        value.value = picker.value;
        manual.value = "";
        visible(manualRow, false);
      }
    });
    manual.addEventListener?.("input", () => {
      if (norm(speciesSelect.value) === "dog") value.value = manual.value;
    });
    sync();
    return true;
  }
  return Object.freeze({ SOURCE, list, search, resolve, classify, pickerHtml, bindPicker,
    coatColorChoices, coatColorHtml, bindCoatColor, AKC_COAT_SOURCES,
    markingChoices, markingsHtml, bindMarkings, AKC_MARKINGS });
});
