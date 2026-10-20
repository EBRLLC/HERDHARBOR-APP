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
  return Object.freeze({ SOURCE, list, search, resolve, classify });
});
