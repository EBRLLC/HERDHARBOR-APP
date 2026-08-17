(() => {
  "use strict";

  const sources = Object.freeze({
    avmaEmergency: {
      label: "AVMA: animal emergencies",
      url: "https://www.avma.org/resources/pet-owners/emergencycare/13-animal-emergencies-require-immediate-veterinary-consultation-andor-care"
    },
    merckEmergency: {
      label: "Merck Veterinary Manual: emergency triage",
      url: "https://www.merckvetmanual.com/emergency-medicine-and-critical-care/evaluation-and-initial-treatment-of-small-animal-emergency-patients/initial-triage-and-resuscitation-of-small-animal-emergency-patients"
    },
    merckDog: {
      label: "Merck Veterinary Manual: routine health care of dogs",
      url: "https://www.merckvetmanual.com/dog-owners/routine-care-of-dogs/routine-health-care-of-dogs"
    },
    merckRabbit: {
      label: "Merck Veterinary Manual: routine health care of rabbits",
      url: "https://www.merckvetmanual.com/all-other-pets/rabbits/routine-health-care-of-rabbits"
    },
    merckPoultry: {
      label: "Merck Veterinary Manual: backyard poultry diseases",
      url: "https://www.merckvetmanual.com/exotic-and-laboratory-animals/backyard-poultry/common-infectious-diseases-in-backyard-poultry"
    },
    merckHorse: {
      label: "Merck Veterinary Manual: routine health care of horses",
      url: "https://www.merckvetmanual.com/horse-owners/routine-care-of-horses/routine-health-care-of-horses"
    },
    aaepChoke: {
      label: "AAEP: understanding choke in horses",
      url: "https://aaep.org/post/understanding-choke-in-horses/"
    },
    merckBloat: {
      label: "Merck Veterinary Manual: bloat in ruminants",
      url: "https://www.merckvetmanual.com/digestive-system/diseases-of-the-ruminant-forestomach/bloat-in-ruminants"
    },
    merckPig: {
      label: "Merck Veterinary Manual: disorders of potbellied pigs",
      url: "https://www.merckvetmanual.com/all-other-pets/potbellied-pigs/disorders-and-diseases-of-potbellied-pigs"
    },
    aphisReportable: {
      label: "USDA APHIS: nationally reportable animal diseases",
      url: "https://www.aphis.usda.gov/livestock-poultry-disease/surveillance/reportable-diseases"
    }
  });

  const allSpecies = ["All"];
  const poultry = ["Chicken", "Duck", "Turkey"];
  const ruminants = ["Cattle", "Goat", "Sheep"];

  const entries = Object.freeze([
    {
      id: "breathing-emergency",
      species: allSpecies,
      title: "Trouble breathing, choking, or blue/pale tissue",
      signs: ["Labored, noisy, rapid, or open-mouth breathing", "Repeated choking, gagging, or nonstop coughing", "Blue, gray, very pale, or white gums, comb, tongue, or tissue"],
      concerns: ["Airway obstruction", "Severe lung or heart problem", "Shock, allergic reaction, or serious infection"],
      urgency: "Emergency now",
      action: "Keep handling and stress to a minimum. Contact an emergency veterinarian immediately and follow their transport instructions.",
      keywords: ["gasping", "panting", "dyspnea", "cyanotic", "cough", "choke", "breath"],
      source: sources.avmaEmergency
    },
    {
      id: "collapse-neurologic-emergency",
      species: allSpecies,
      title: "Collapse, seizure, paralysis, or unable to stand",
      signs: ["Collapse or loss of consciousness", "Seizure, severe tremors, circling, head pressing, or loss of coordination", "Sudden weakness, paralysis, or inability to rise"],
      concerns: ["Neurologic emergency", "Poisoning, severe metabolic illness, trauma, or shock", "Heat illness or another rapidly worsening condition"],
      urgency: "Emergency now",
      action: "Protect the animal and people from injury without restraining the mouth. Contact an emergency veterinarian immediately.",
      keywords: ["down", "recumbent", "fit", "convulsion", "ataxia", "staggering", "blind", "tremor"],
      source: sources.merckEmergency
    },
    {
      id: "bleeding-trauma-emergency",
      species: allSpecies,
      title: "Severe bleeding, major wound, or serious trauma",
      signs: ["Bleeding that is heavy or will not stop", "Deep wound, exposed tissue, broken bone, or severe burn", "Hit, crushed, attacked, or injured with worsening pain or weakness"],
      concerns: ["Blood loss or shock", "Internal injury", "Fracture, infection risk, or organ damage"],
      urgency: "Emergency now",
      action: "Contact an emergency veterinarian. Keep the animal quiet and avoid actions that delay professional care.",
      keywords: ["blood", "cut", "wound", "fracture", "broken", "injury", "attack", "burn"],
      source: sources.avmaEmergency
    },
    {
      id: "poisoning-emergency",
      species: allSpecies,
      title: "Suspected poisoning or toxic exposure",
      signs: ["Known or possible access to a toxin, medication, chemical, toxic plant, moldy feed, or harmful food", "Drooling, vomiting, diarrhea, tremors, breathing trouble, weakness, or sudden behavior change"],
      concerns: ["Toxic exposure", "Contaminated feed or water", "Medication or chemical reaction"],
      urgency: "Emergency now",
      action: "Call a veterinarian or animal poison service immediately. Keep the package, plant, feed sample, or photo available. Do not induce vomiting or give a remedy unless a veterinarian directs it.",
      keywords: ["toxin", "poison", "chemical", "plant", "mold", "medication", "overdose", "antifreeze"],
      source: sources.avmaEmergency
    },
    {
      id: "appetite-energy-change",
      species: allSpecies,
      title: "Not eating, drinking less, hiding, or unusually quiet",
      signs: ["Reduced appetite or refusing food", "Less active, isolated, hunched, or unusually quiet", "Weight loss or reduced production"],
      concerns: ["Pain, dental or digestive problem", "Infection, fever, stress, or environmental problem", "Feed or water problem, parasites, or another systemic illness"],
      urgency: "Contact a vet soon",
      action: "Record when the change began, feed and water intake, manure or droppings, and any other signs. Contact a veterinarian promptly; do not wait if the animal is young, pregnant, rapidly worsening, or belongs to a species that declines quickly.",
      keywords: ["anorexia", "off feed", "lethargy", "depressed", "hiding", "weight loss", "quiet"],
      source: sources.merckDog
    },
    {
      id: "digestive-change",
      species: allSpecies,
      title: "Diarrhea, constipation, abnormal manure, or belly pain",
      signs: ["Diarrhea, blood, mucus, very dark stool, or straining", "Little or no manure or droppings", "Swollen or painful abdomen, repeated looking at the belly, or restlessness"],
      concerns: ["Diet change, parasites, infection, or inflammation", "Obstruction, impaction, or disrupted gut movement", "Toxin, contaminated feed, or another systemic illness"],
      urgency: "Contact a vet soon",
      action: "Save a photo or fresh sample if safe, note feed changes and affected animals, and contact a veterinarian. Treat severe pain, blood, dehydration, collapse, rapid swelling, or no manure as urgent.",
      keywords: ["scours", "stool", "feces", "poop", "droppings", "manure", "constipation", "bloat", "abdomen"],
      source: sources.merckPig
    },
    {
      id: "respiratory-discharge",
      species: allSpecies,
      title: "Coughing, sneezing, or eye/nose discharge",
      signs: ["New or persistent cough or sneeze", "Nasal or eye discharge, swelling, or crusting", "Reduced appetite, feverish behavior, or lower activity with respiratory signs"],
      concerns: ["Respiratory infection or irritation", "Dust, poor ventilation, allergy, or foreign material", "Dental, eye, or sinus problem"],
      urgency: "Contact a vet soon",
      action: "Separate the affected animal from the group when practical, improve fresh air without chilling, record how many animals are affected, and contact a veterinarian. Breathing effort or blue/pale tissue is an emergency.",
      keywords: ["snot", "runny nose", "weepy eye", "watery eye", "rattle", "wheeze", "respiratory"],
      source: sources.merckDog
    },
    {
      id: "lameness-mobility",
      species: allSpecies,
      title: "Limping, swelling, or reluctance to move",
      signs: ["Limping or not bearing weight", "Hot, swollen, painful, or injured foot, hoof, leg, or joint", "Stiffness, reluctance to rise, or changed gait"],
      concerns: ["Foot or hoof injury", "Sprain, fracture, joint disease, infection, or abscess", "Neurologic or systemic illness"],
      urgency: "Contact a vet soon",
      action: "Limit unnecessary movement and inspect only if it is safe. Contact a veterinarian promptly for sudden severe lameness, inability to bear weight, a wound near a joint, or worsening swelling.",
      keywords: ["limp", "lame", "hoof", "foot", "leg", "joint", "stiff", "gait", "swollen"],
      source: sources.merckHorse
    },
    {
      id: "skin-coat-change",
      species: allSpecies,
      title: "Hair, feather, wool, skin, or itching changes",
      signs: ["Hair, feather, or wool loss outside normal shedding", "Redness, crusts, sores, swelling, or persistent itching", "Lumps, parasites, foul odor, or a wound that is not healing"],
      concerns: ["Parasites, infection, allergy, or irritation", "Nutrition or housing problem", "Injury or another underlying illness"],
      urgency: "Monitor and call",
      action: "Photograph the area, check other animals, and arrange veterinary advice if it spreads, is painful, affects eating or movement, or does not improve quickly.",
      keywords: ["rash", "itch", "mites", "lice", "fleas", "bald", "feathers", "wool", "coat", "skin"],
      source: sources.merckDog
    },
    {
      id: "urination-thirst-change",
      species: allSpecies,
      title: "Urination or thirst change",
      signs: ["Straining, crying, frequent attempts, or little/no urine", "Blood or unusual color in urine", "Drinking or urinating much more or less than normal"],
      concerns: ["Urinary blockage or infection", "Kidney, metabolic, reproductive, or hydration problem", "Toxin or medication effect"],
      urgency: "Contact a vet soon",
      action: "Contact a veterinarian promptly. Repeated straining with little or no urine, severe pain, weakness, or collapse is an emergency.",
      keywords: ["pee", "urine", "urinate", "thirst", "water", "blood urine", "straining"],
      source: sources.merckDog
    },
    {
      id: "rabbit-not-eating",
      species: ["Rabbit"],
      title: "Rabbit not eating or making fewer/no droppings",
      signs: ["Refusing food or favorite treats", "Droppings are smaller, fewer, or absent", "Hunched posture, tooth grinding, bloated abdomen, or low energy"],
      concerns: ["Pain or dental disease", "Gastrointestinal slowdown or obstruction", "Diet, stress, dehydration, or systemic illness"],
      urgency: "Emergency now",
      action: "Contact a rabbit-experienced veterinarian immediately. Note the last time the rabbit ate, drank, urinated, and passed droppings. Do not delay care or force-feed unless a veterinarian has ruled out obstruction and directed you.",
      keywords: ["stasis", "ileus", "no poop", "small poop", "teeth grinding", "hunched"],
      source: sources.merckRabbit
    },
    {
      id: "rabbit-breathing-discharge",
      species: ["Rabbit"],
      title: "Rabbit nose/eye discharge, drooling, or breathing change",
      signs: ["Wet nose, sneezing, eye discharge, or matted front paws", "Drooling, wet chin, difficulty chewing, or facial swelling", "Noisy, fast, or open-mouth breathing"],
      concerns: ["Respiratory or eye disease", "Dental disease or pain", "Airway or lung emergency"],
      urgency: "Contact a vet soon",
      action: "Arrange prompt care with a rabbit-experienced veterinarian. Open-mouth or labored breathing is an emergency.",
      keywords: ["snuffles", "wet chin", "drool", "tooth", "teeth", "eye", "nose"],
      source: sources.merckRabbit
    },
    {
      id: "poultry-group-illness",
      species: poultry,
      title: "Several birds sick, sudden deaths, or rapid production drop",
      signs: ["More than one bird becomes ill or dies suddenly", "Sharp drop in feed, water, eggs, growth, or activity", "Respiratory, digestive, or neurologic signs spreading through the flock"],
      concerns: ["Contagious or reportable flock disease", "Feed, water, toxin, ventilation, or heat problem", "Parasites or management-related illness"],
      urgency: "Emergency now",
      action: "Separate sick birds when practical, stop movement of birds/equipment, contact a veterinarian immediately, and follow instructions for notifying state or federal animal-health officials. Do not move or sell affected birds.",
      keywords: ["flock", "mortality", "dead birds", "egg drop", "outbreak", "avian influenza", "newcastle"],
      source: sources.aphisReportable
    },
    {
      id: "poultry-respiratory",
      species: poultry,
      title: "Bird coughing, sneezing, swollen face, or breathing noise",
      signs: ["Coughing, sneezing, rattling, gasping, or nasal discharge", "Swollen face/eyes, watery eyes, or purple/blue comb or wattles", "Huddling, ruffled feathers, low appetite, or reduced eggs"],
      concerns: ["Respiratory infection", "Poor ventilation, dust, ammonia, or heat stress", "Serious contagious flock disease"],
      urgency: "Contact a vet soon",
      action: "Isolate the bird when practical, check ventilation and the rest of the flock, and contact a poultry veterinarian. Gasping, blue tissue, sudden deaths, or multiple sick birds is an emergency.",
      keywords: ["gasp", "rattle", "comb", "wattle", "swollen eye", "huddle", "ruffled"],
      source: sources.merckPoultry
    },
    {
      id: "poultry-diarrhea",
      species: poultry,
      title: "Bird diarrhea, bloody droppings, or pasted vent",
      signs: ["Watery, bloody, unusually colored, or mucus-covered droppings", "Pasted vent, dehydration, weakness, or weight loss", "Reduced feed intake, growth, or egg production"],
      concerns: ["Parasites or intestinal infection", "Diet, water, toxin, or organ disease", "Contagious flock illness"],
      urgency: "Contact a vet soon",
      action: "Contact a poultry veterinarian, photograph fresh droppings, and note age groups and number affected. Blood, severe weakness, or spread through the flock needs urgent attention.",
      keywords: ["coccidiosis", "pasty butt", "pasted vent", "bloody poop", "green droppings"],
      source: sources.merckPoultry
    },
    {
      id: "horse-colic",
      species: ["Horse"],
      title: "Horse colic or abdominal pain signs",
      signs: ["Pawing, flank watching, stretching, kicking at the belly, or repeated lying down/rolling", "Sweating, restlessness, loss of appetite, or reduced manure", "Bloated abdomen, weakness, or worsening pain"],
      concerns: ["Gas or intestinal spasm", "Impaction, displacement, obstruction, or another abdominal emergency", "Feed, parasite, toxin, or systemic problem"],
      urgency: "Emergency now",
      action: "Call an equine veterinarian immediately and follow their instructions. Remove feed unless directed otherwise and prioritize handler safety; do not give medication without veterinary direction.",
      keywords: ["colic", "pawing", "rolling", "flank", "belly", "no manure", "sweating"],
      source: sources.merckHorse
    },
    {
      id: "horse-choke",
      species: ["Horse"],
      title: "Horse choke or feed/saliva from the nostrils",
      signs: ["Feed or saliva coming from the nostrils", "Repeated swallowing, retching, coughing, or heavy salivation", "Sudden refusal to eat with distress"],
      concerns: ["Esophageal obstruction (choke)", "Aspiration risk", "Dental or swallowing problem"],
      urgency: "Emergency now",
      action: "Remove feed and water and call an equine veterinarian immediately. Keep the horse calm with its head lowered when safe; do not pass a hose or give oral medication.",
      keywords: ["feed nose", "saliva nose", "esophagus", "retching", "can't swallow"],
      source: sources.aaepChoke
    },
    {
      id: "ruminant-bloat",
      species: ruminants,
      title: "Rapid left-sided belly swelling or suspected bloat",
      signs: ["Left side of the abdomen becomes enlarged or tight", "Restlessness, kicking at the belly, repeated lying down, or stopping eating", "Fast/labored breathing, weakness, collapse, or open-mouth breathing"],
      concerns: ["Free-gas or frothy bloat", "Feed-related rumen problem", "Choke or another digestive obstruction"],
      urgency: "Emergency now",
      action: "Contact a livestock veterinarian immediately. Severe bloat can impair breathing quickly. Do not attempt invasive procedures unless a veterinarian directs and has trained you.",
      keywords: ["bloat", "rumen", "left side", "swollen belly", "distended"],
      source: sources.merckBloat
    },
    {
      id: "ruminant-off-feed-neuro",
      species: ruminants,
      title: "Ruminant off feed with head pressing, circling, blindness, or staggering",
      signs: ["Separating from the group or suddenly stopping feed", "Head pressing, stargazing, circling, apparent blindness, twitching, or loss of coordination", "Recumbency or seizure"],
      concerns: ["Neurologic or metabolic disease", "Toxin, feed-related problem, or infection", "Serious pregnancy-related disease in late gestation"],
      urgency: "Emergency now",
      action: "Move other animals away from hazards, avoid unsafe handling, and call a livestock veterinarian immediately. Record recent feed changes, pregnancy stage, and number affected.",
      keywords: ["stargazing", "head press", "blind", "circle", "polio", "listeria", "pregnancy toxemia"],
      source: sources.merckEmergency
    },
    {
      id: "livestock-mouth-lesions",
      species: ["Cattle", "Goat", "Sheep", "Pig", "Horse"],
      title: "Mouth/foot blisters, heavy drooling, or unexplained group lameness",
      signs: ["Blisters, erosions, or sores around the mouth, tongue, nose, teats, or feet", "Heavy drooling or frothing", "Several animals suddenly lame, feverish, or off feed"],
      concerns: ["Reportable vesicular disease", "Severe mouth/foot infection or toxin", "Trauma or another contagious condition"],
      urgency: "Emergency now",
      action: "Stop animal movement, avoid sharing equipment, and call a veterinarian and the appropriate animal-health authority immediately. Do not transport affected animals for evaluation unless officials direct it.",
      keywords: ["blister", "vesicle", "drool", "froth", "mouth sore", "foot and mouth", "vesicular"],
      source: sources.aphisReportable
    },
    {
      id: "pig-diarrhea-color",
      species: ["Pig"],
      title: "Pig diarrhea, feverish behavior, weakness, or purple/blue skin",
      signs: ["Diarrhea with mucus or blood", "Feverish behavior, weakness, vomiting, or refusal to eat", "Blue or purple discoloration of ears, legs, belly, or jowls"],
      concerns: ["Serious intestinal or systemic infection", "Toxin, dehydration, or circulation problem", "Potential contagious or reportable swine disease"],
      urgency: "Emergency now",
      action: "Isolate affected pigs when practical, stop animal movement, and contact a swine veterinarian immediately. Multiple cases, deaths, or purple discoloration may require animal-health notification.",
      keywords: ["scours", "purple ears", "blue ears", "jowls", "bloody diarrhea", "swine fever"],
      source: sources.merckPig
    },
    {
      id: "dog-vomiting-diarrhea",
      species: ["Dog"],
      title: "Dog vomiting or diarrhea",
      signs: ["Repeated vomiting, diarrhea, retching, or inability to keep water down", "Blood, black/tarry stool, painful or swollen abdomen", "Weakness, dehydration, feverish behavior, or known foreign-object/toxin exposure"],
      concerns: ["Dietary upset, infection, parasites, or inflammation", "Foreign body, toxin, organ disease, or pancreatitis", "Bloat/torsion when the abdomen is swollen with unproductive retching"],
      urgency: "Contact a vet soon",
      action: "Contact a veterinarian. A swollen painful abdomen, repeated unproductive retching, collapse, blood, known toxin/foreign body, or rapid worsening is an emergency.",
      keywords: ["vomit", "throw up", "diarrhea", "retch", "bloody stool", "tarry", "foreign body"],
      source: sources.merckDog
    },
    {
      id: "birth-reproductive-emergency",
      species: allSpecies,
      title: "Difficult birth, heavy reproductive bleeding, or severe postpartum illness",
      signs: ["Strong active labor without progress, a visible offspring stuck, or distress that exceeds the veterinarian's species-specific plan", "Heavy bleeding, collapse, foul discharge with severe illness, or tissue protruding", "Parent stops eating, becomes weak, or cannot care for offspring"],
      concerns: ["Obstructed or difficult birth", "Hemorrhage, prolapse, retained tissue, infection, or metabolic emergency", "Postpartum pain or systemic illness"],
      urgency: "Emergency now",
      action: "Call a veterinarian immediately and follow species-specific instructions. Do not pull an offspring or tissue unless a veterinarian has directed and trained you to do so.",
      keywords: ["labor", "birth", "calving", "kidding", "lambing", "farrowing", "foaling", "whelping", "kindling", "prolapse"],
      source: sources.avmaEmergency
    }
  ]);

  window.HERDHARBOR_SYMPTOM_GUIDE = Object.freeze({
    disclaimer: "HerdHarbor is not a veterinary provider. This educational guide cannot diagnose, treat, or replace care from a licensed veterinarian.",
    emergencyRedFlags: Object.freeze([
      "Trouble breathing, choking, or blue/gray/pale tissue",
      "Collapse, seizure, paralysis, or inability to stand",
      "Severe bleeding, major trauma, or suspected poisoning",
      "Rapid belly swelling, severe colic, or uncontrolled pain",
      "Difficult birth, prolapse, or heavy reproductive bleeding",
      "Several animals suddenly ill or dying"
    ]),
    sources,
    entries
  });
})();
