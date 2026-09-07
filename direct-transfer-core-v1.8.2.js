(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborDirectTransferCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PAYLOAD_TYPE = "herdharbor-direct-animal-transfer";
  const PAYLOAD_VERSION = 1;
  const MAX_ANIMAL_RECORDS = 100;
  const MAX_SUBJECTS = 25;
  const ACTIVE_STATUSES = new Set(["active", "breeding"]);

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const clean = (value, max = 240) => String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max);
  const norm = (value) => clean(value).toLowerCase();

  function stableKey(value) {
    const source = clean(value, 180) || "transfer";
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const readable = source.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "transfer";
    return `${readable}_${(hash >>> 0).toString(36)}`;
  }

  function sanitizeOwnershipHistory(history) {
    return (Array.isArray(history) ? history : [])
      .slice(-25)
      .map((row) => ({
        type: clean(row?.type, 32) || "transfer",
        date: clean(row?.date || row?.at, 32),
        transferId: clean(row?.transferId, 120),
        sourceSaleNumber: clean(row?.sourceSaleNumber, 120),
        from: clean(row?.from, 160),
        to: clean(row?.to, 160)
      }))
      .filter((row) => row.date || row.transferId || row.from || row.to);
  }

  function sanitizeGenetics(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const genetics = input;
    const loci = {};
    if (genetics.loci && typeof genetics.loci === "object" && !Array.isArray(genetics.loci)) {
      Object.entries(genetics.loci).slice(0, 80).forEach(([locus, raw]) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
        const alleles = Array.isArray(raw.alleles)
          ? raw.alleles.slice(0, 2).map((value) => clean(value, 32) || "_")
          : [];
        loci[clean(locus, 32)] = {
          alleles,
          status: clean(raw.status, 40),
          source: clean(raw.source, 80),
          confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, Number(raw.confidence))) : null,
          value: typeof raw.value === "string" || typeof raw.value === "number" || typeof raw.value === "boolean" ? raw.value : "",
          scientificStatus: clean(raw.scientificStatus, 80),
          predictionModel: clean(raw.predictionModel, 80)
        };
      });
    }
    const phenotype = genetics.phenotype && typeof genetics.phenotype === "object" ? genetics.phenotype : {};
    const registry = genetics.registry && typeof genetics.registry === "object" ? genetics.registry : {};
    const additionalTraits = (Array.isArray(genetics.additionalTraits) ? genetics.additionalTraits : [])
      .slice(0, 40)
      .map((row) => typeof row === "string"
        ? { label: clean(row, 120), status: "", source: "" }
        : {
            label: clean(row?.label || row?.name, 120),
            status: clean(row?.status, 40),
            source: clean(row?.source, 80),
            value: typeof row?.value === "string" || typeof row?.value === "number" || typeof row?.value === "boolean" ? row.value : ""
          })
      .filter((row) => row.label);
    return {
      schemaVersion: Number.isFinite(Number(genetics.schemaVersion)) ? Number(genetics.schemaVersion) : null,
      geneticsContractVersion: clean(genetics.geneticsContractVersion, 40),
      engineVersion: clean(genetics.engineVersion, 40),
      engineBuild: clean(genetics.engineBuild, 40),
      species: clean(genetics.species, 80),
      breedProfileId: clean(genetics.breedProfileId, 120),
      phenotype: {
        recorded: clean(phenotype.recorded || phenotype.recordedColor, 160),
        canonicalId: clean(phenotype.canonicalId, 120),
        canonical: clean(phenotype.canonical, 160),
        family: clean(phenotype.family, 120),
        breedTerm: clean(phenotype.breedTerm, 160),
        confidence: Number.isFinite(phenotype.confidence) ? Math.max(0, Math.min(1, Number(phenotype.confidence))) : null
      },
      loci,
      additionalTraits,
      registry: {
        authority: clean(registry.authority, 80),
        version: clean(registry.version, 80)
      },
      updatedAt: clean(genetics.updatedAt, 40) || null
    };
  }

  function transferableAnimal(animal) {
    if (!animal || typeof animal !== "object") return null;
    return {
      id: clean(animal.id, 160),
      name: clean(animal.name, 160),
      tag: clean(animal.tag, 120),
      earTagNumber: clean(animal.earTagNumber, 120),
      earTagColor: clean(animal.earTagColor, 80),
      tattoo: clean(animal.tattoo, 120),
      registrationNumber: clean(animal.registrationNumber, 160),
      breeder: clean(animal.breeder, 160),
      species: clean(animal.species, 100),
      breed: clean(animal.breed, 160),
      sex: clean(animal.sex, 40) || "Unknown",
      dob: clean(animal.dob, 32),
      color: clean(animal.color, 160),
      variety: clean(animal.variety, 160),
      sireId: clean(animal.sireId, 160),
      damId: clean(animal.damId, 160),
      genetics: sanitizeGenetics(animal.genetics),
      ownershipHistory: sanitizeOwnershipHistory(animal.ownershipHistory)
    };
  }

  function transferAnimalsForSale(state, sale) {
    const animals = Array.isArray(state?.animals) ? state.animals : [];
    const items = Array.isArray(sale?.items) ? sale.items : [];
    const subjectIds = new Set(items.map((item) => clean(item?.animalId, 160)).filter(Boolean));
    const included = new Set(subjectIds);
    let frontier = [...subjectIds];
    for (let depth = 0; depth < 3; depth += 1) {
      const next = [];
      frontier.forEach((animalId) => {
        const animal = animals.find((record) => String(record?.id) === String(animalId));
        [animal?.sireId, animal?.damId].forEach((parentIdRaw) => {
          const parentId = clean(parentIdRaw, 160);
          if (!parentId || included.has(parentId)) return;
          if (!animals.some((record) => String(record?.id) === String(parentId))) return;
          included.add(parentId);
          next.push(parentId);
        });
      });
      frontier = next;
    }
    return {
      subjectIds: [...subjectIds],
      animals: [...included]
        .map((id) => animals.find((record) => String(record?.id) === String(id)))
        .filter(Boolean)
        .map(transferableAnimal)
        .filter(Boolean)
    };
  }

  function buildTransferPayload(state, saleId, senderIdentity = {}) {
    const sales = Array.isArray(state?.sales) ? state.sales : [];
    const customers = Array.isArray(state?.customers) ? state.customers : [];
    const sale = sales.find((record) => String(record?.id) === String(saleId));
    if (!sale) throw new Error("That sale could not be found.");
    if (norm(sale.status) !== "completed") throw new Error("Complete the sale before sending an account-to-account animal transfer.");
    const customer = customers.find((record) => String(record?.id) === String(sale.customerId)) || {};
    const transferId = clean(sale.transferNumber || sale.saleNumber, 120);
    if (!transferId) throw new Error("The completed sale is missing a transfer number.");
    const transfer = transferAnimalsForSale(state, sale);
    if (!transfer.subjectIds.length) throw new Error("The sale does not contain an animal to transfer.");
    if (transfer.subjectIds.length > MAX_SUBJECTS || transfer.animals.length > MAX_ANIMAL_RECORDS) {
      throw new Error("This sale contains too many animal records for a single direct transfer.");
    }
    const profile = state?.profile && typeof state.profile === "object" ? state.profile : {};
    return {
      app: "HerdHarbor",
      type: PAYLOAD_TYPE,
      payloadVersion: PAYLOAD_VERSION,
      transferId,
      exportedAt: new Date().toISOString(),
      sender: {
        operationName: clean(senderIdentity.operationName || profile.operationName, 160),
        ownerName: clean(senderIdentity.ownerName || profile.ownerName, 160),
        memberCode: clean(senderIdentity.memberCode, 64)
      },
      recipient: {
        name: clean(customer.name, 160)
      },
      sale: {
        saleNumber: clean(sale.saleNumber, 120),
        saleDate: clean(sale.saleDate, 32),
        transferNumber: transferId
      },
      subjectIds: transfer.subjectIds,
      animals: transfer.animals
    };
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== "object") return { valid: false, error: "Transfer payload is missing." };
    if (payload.type !== PAYLOAD_TYPE || Number(payload.payloadVersion) !== PAYLOAD_VERSION) {
      return { valid: false, error: "This is not a supported HerdHarbor direct animal transfer." };
    }
    if (!clean(payload.transferId, 120)) return { valid: false, error: "Transfer ID is missing." };
    if (!Array.isArray(payload.subjectIds) || !payload.subjectIds.length || payload.subjectIds.length > MAX_SUBJECTS) {
      return { valid: false, error: "The transfer has an invalid subject-animal list." };
    }
    if (!Array.isArray(payload.animals) || !payload.animals.length || payload.animals.length > MAX_ANIMAL_RECORDS) {
      return { valid: false, error: "The transfer has an invalid pedigree-animal list." };
    }
    const ids = payload.animals.map((animal) => clean(animal?.id, 160));
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return { valid: false, error: "The transfer contains invalid or duplicate animal IDs." };
    const idSet = new Set(ids);
    if (payload.subjectIds.some((id) => !idSet.has(clean(id, 160)))) return { valid: false, error: "A transferred animal is missing from the pedigree payload." };
    return { valid: true };
  }

  function transferMatch(animals, incoming) {
    const records = Array.isArray(animals) ? animals : [];
    const sourceSpecies = norm(incoming?.species);
    const identifierFields = ["registrationNumber", "tattoo", "tag", "earTagNumber"];
    for (const field of identifierFields) {
      const value = norm(incoming?.[field]);
      if (!value) continue;
      let matches = records.filter((record) => norm(record?.[field]) === value);
      if (sourceSpecies) {
        const sameSpecies = matches.filter((record) => !norm(record?.species) || norm(record?.species) === sourceSpecies);
        if (sameSpecies.length) matches = sameSpecies;
      }
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  function mergeMissingIdentity(target, source) {
    const fields = ["name", "tag", "earTagNumber", "earTagColor", "tattoo", "registrationNumber", "breeder", "species", "breed", "sex", "dob", "color", "variety"];
    fields.forEach((field) => {
      if (!clean(target?.[field], 1000) && clean(source?.[field], 1000)) target[field] = source[field];
    });
    if (!target.genetics && source.genetics) target.genetics = clone(source.genetics);
  }

  function applyIncomingTransfer(inputState, payload, options = {}) {
    const checked = validatePayload(payload);
    if (!checked.valid) throw new Error(checked.error);
    const state = clone(inputState && typeof inputState === "object" ? inputState : {});
    state.animals = Array.isArray(state.animals) ? state.animals : [];
    state.transfers = Array.isArray(state.transfers) ? state.transfers : [];
    const transferId = clean(payload.transferId, 120);
    const existingTransfer = state.transfers.find((record) => String(record?.sourceTransferId || record?.transferId) === transferId && norm(record?.direction) === "received");
    if (existingTransfer) {
      return {
        state,
        alreadyImported: true,
        subjectAnimalIds: Array.isArray(existingTransfer.animalIds) ? existingTransfer.animalIds : []
      };
    }

    const transferKey = stableKey(transferId);
    const subjectIds = payload.subjectIds.map((id) => clean(id, 160));
    const subjectSet = new Set(subjectIds);
    const idMap = new Map();
    payload.animals.forEach((source, index) => {
      const existing = transferMatch(state.animals, source);
      idMap.set(clean(source.id, 160), existing?.id || `animal_received_${transferKey}_${String(index + 1).padStart(3, "0")}`);
    });

    const now = new Date().toISOString();
    const senderName = clean(payload.sender?.operationName || payload.sender?.ownerName || options.senderDisplayName, 160) || "HerdHarbor member";
    const recipientName = clean(options.recipientDisplayName, 160);
    const saleDate = clean(payload.sale?.saleDate, 32);
    const sourceSaleNumber = clean(payload.sale?.saleNumber, 120);
    const addedIds = [];

    payload.animals.forEach((source) => {
      const sourceId = clean(source.id, 160);
      const mappedId = idMap.get(sourceId);
      const isSubject = subjectSet.has(sourceId);
      const mappedSire = idMap.get(clean(source.sireId, 160)) || "";
      const mappedDam = idMap.get(clean(source.damId, 160)) || "";
      let animal = state.animals.find((record) => String(record?.id) === String(mappedId));
      if (animal) {
        mergeMissingIdentity(animal, source);
        if (!animal.sireId && mappedSire) animal.sireId = mappedSire;
        if (!animal.damId && mappedDam) animal.damId = mappedDam;
        if (isSubject) animal.status = "Active";
      } else {
        animal = {
          ...transferableAnimal(source),
          id: mappedId,
          sireId: mappedSire,
          damId: mappedDam,
          status: isSubject ? "Active" : "Ancestor Only",
          location: "",
          saleRecordId: "",
          sourceBirthId: "",
          notes: isSubject ? `Received through HerdHarbor direct transfer ${transferId}.` : "",
          createdAt: now,
          updatedAt: now
        };
        state.animals.push(animal);
        addedIds.push(mappedId);
      }

      if (isSubject) {
        const history = sanitizeOwnershipHistory(animal.ownershipHistory);
        const duplicateHistory = history.some((row) => row.transferId === transferId);
        if (!duplicateHistory) {
          history.push({
            type: "transfer",
            date: saleDate || now,
            transferId,
            sourceSaleNumber,
            from: senderName,
            to: recipientName
          });
        }
        animal.ownershipHistory = history;
        animal.updatedAt = now;
      }
    });

    const subjectAnimalIds = subjectIds.map((id) => idMap.get(id)).filter(Boolean);
    state.transfers.push({
      id: `transfer_received_${transferKey}`,
      direction: "Received",
      channel: "HerdHarbor Direct",
      sourceTransferId: transferId,
      sourceSaleNumber,
      serverTransferId: clean(options.serverTransferId, 160),
      senderName,
      animalIds: subjectAnimalIds,
      createdAt: now,
      acceptedAt: now
    });

    return { state, alreadyImported: false, subjectAnimalIds, addedIds };
  }

  function activeAnimalCount(animals) {
    return (Array.isArray(animals) ? animals : []).filter((animal) => {
      const status = norm(animal?.status || "Active");
      return ACTIVE_STATUSES.has(status);
    }).length;
  }

  return Object.freeze({
    PAYLOAD_TYPE,
    PAYLOAD_VERSION,
    MAX_ANIMAL_RECORDS,
    MAX_SUBJECTS,
    sanitizeGenetics,
    transferableAnimal,
    transferAnimalsForSale,
    buildTransferPayload,
    validatePayload,
    transferMatch,
    applyIncomingTransfer,
    activeAnimalCount,
    stableKey
  });
});
