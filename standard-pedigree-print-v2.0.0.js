(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborStandardPedigreePrint = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.0-standard";
  const CORE_ID_FIELDS = ["earTagNumber", "tag", "tattoo"];

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function animalIdValue(animal) {
    for (const key of CORE_ID_FIELDS) {
      const value = clean(animal?.[key]);
      if (value) return value;
    }
    return "—";
  }

  function genotypeValue(animal) {
    const value = animal?.genotype || animal?.genetics;
    if (!value) return "—";
    if (typeof value === "string" || typeof value === "number") return clean(value) || "—";
    if (Array.isArray(value)) return value.map(genotypeValue).filter(Boolean).join(" · ") || "—";
    if (typeof value === "object") {
      if (value.text) return clean(value.text) || "—";
      if (value.genotype) return genotypeValue({ genotype: value.genotype });
      const source = value.loci && typeof value.loci === "object" ? value.loci : value;
      const rows = Object.entries(source).map(([locus, row]) => {
        if (Array.isArray(row?.alleles)) return `${locus}: ${row.alleles.filter(Boolean).join("")}`;
        if (typeof row === "string" || typeof row === "number") return `${locus}: ${clean(row)}`;
        return "";
      }).filter(Boolean);
      return rows.join(" · ") || "—";
    }
    return "—";
  }

  function fieldRows(animal, fields, formatDate) {
    const selected = new Set(Array.isArray(fields) ? fields : []);
    const rows = [["ID", animalIdValue(animal), "id"]];
    const push = (field, label, value) => {
      if (!selected.has(field)) return;
      rows.push([label, clean(value) || "—", field]);
    };
    push("dob", "DOB", animal?.dob ? formatDate(animal.dob) : "—");
    push("color", "COLOR", animal?.variety || animal?.color);
    push("breed", "BREED", animal?.breed);
    push("registrationNumber", "REG", animal?.registrationNumber || animal?.registration || animal?.regNumber || animal?.regNo);
    push("prefix", "BREEDER", animal?.prefix || animal?.rabbitry || animal?.rabbitryName || animal?.breeder);
    push("weight", "WEIGHT", animal?.currentWeight || animal?.weight);
    push("gcNumber", "GC", animal?.gcNumber || animal?.grandChampionNumber || animal?.grandChampionNo);
    push("genotype", "GENOTYPE", genotypeValue(animal));
    return rows;
  }

  function sexMeta(animal, subjectSpecies) {
    const sex = clean(animal?.sex || animal?.gender).toLowerCase();
    const rabbit = clean(animal?.species || subjectSpecies).toLowerCase() === "rabbit";
    if (sex === "male") return ["♂", rabbit ? "BUCK" : "MALE"];
    if (sex === "female") return ["♀", rabbit ? "DOE" : "FEMALE"];
    return ["•", "UNKNOWN"];
  }

  function relationFor(node) {
    return clean(node?.relation) || "Ancestor";
  }

  function cardHtml(node, config, options = {}) {
    const animal = node?.animal || null;
    const subject = options.subject || null;
    const isSubject = Number(node?.generation || 0) === 0;
    const fields = isSubject ? config.rootFields : config.ancestorFields;
    const [symbol, label] = sexMeta(animal, subject?.species);
    const showSex = fields.includes("sex");
    const showName = fields.includes("name");
    const unknownBlank = !animal && config.unknownDisplay === "blank";
    const title = animal
      ? (showName ? clean(animal.name || animal.registeredName || animal.animalName) : "Recorded ancestor")
      : (unknownBlank ? " " : "Unknown");
    const rows = animal ? fieldRows(animal, fields, options.formatDate) : [];
    const relation = relationFor(node);
    const extraClass = options.great ? " great-node-card" : "";
    const subjectClass = isSubject ? " subject-card" : "";
    return `<article class="pedigree-node-card${subjectClass}${animal ? "" : " unknown"}${extraClass}">
      <div class="node-header">
        <div class="node-title"><span class="species-mark">${options.speciesIcon(animal?.species || subject?.species)}</span><div><span class="relation">${escapeHtml(relation)}</span><strong>${escapeHtml(title)}</strong></div></div>
        ${showSex ? `<div class="sex-mark"><span>${symbol}</span><small>${label}</small></div>` : ""}
      </div>
      ${rows.length ? `<div class="node-details">${rows.map(([fieldLabel, value, field]) => {
        const protectedValue = ["color", "prefix", "genotype"].includes(field) ? " pedigree-protected-value" : "";
        return `<div data-field="${escapeHtml(field)}"><b>${escapeHtml(fieldLabel)}:</b><span class="${protectedValue.trim()}" title="${escapeHtml(value)}">${escapeHtml(value)}</span></div>`;
      }).join("")}</div>` : ""}
    </article>`;
  }

  function generationNodes(graph, generation) {
    return graph.nodes.filter((node) => Number(node.generation) === generation);
  }

  function treeHtml(graph, config, options) {
    const generations = Number(config.generations || 4);
    const slots = 2 ** Math.max(0, generations - 1);
    const parts = [];
    for (let generation = 0; generation < generations; generation += 1) {
      const nodes = generationNodes(graph, generation);
      const nodeColumn = (generation * 2) + 1;
      const span = Math.max(1, Math.floor(slots / Math.max(1, nodes.length)));
      nodes.forEach((node, index) => {
        const start = (index * span) + 1;
        const end = start + span;
        parts.push(`<div class="pedigree-node${generation === generations - 1 ? " great-node" : ""}" style="grid-column:${nodeColumn};grid-row:${start} / ${end}">${cardHtml(node, config, {
          ...options,
          great: generation === generations - 1
        })}</div>`);
      });
      if (generation >= generations - 1) continue;
      const branchColumn = nodeColumn + 1;
      nodes.forEach((_node, index) => {
        const start = (index * span) + 1;
        const end = start + span;
        parts.push(`<div class="pedigree-branch" style="grid-column:${branchColumn};grid-row:${start} / ${end}"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>`);
      });
    }
    return parts.join("");
  }

  function columnTemplate(generations) {
    if (generations === 3) {
      return "minmax(200px,1.18fr) 34px minmax(195px,1.1fr) 34px minmax(190px,1fr)";
    }
    if (generations === 5) {
      return "minmax(142px,1.16fr) 22px minmax(138px,1.08fr) 22px minmax(132px,1fr) 22px minmax(126px,.96fr) 22px minmax(118px,.9fr)";
    }
    return "minmax(168px,1.18fr) 34px minmax(164px,1.1fr) 34px minmax(158px,1fr) 34px minmax(152px,.96fr)";
  }

  function pageHeight(generations) {
    return generations === 5 ? "8.02in" : "8.06in";
  }

  function buildHtml(options = {}) {
    const graph = options.graph;
    const subject = options.subject || graph?.root?.animal;
    if (!graph || !subject) throw new Error("Standard pedigree print requires a subject and canonical pedigree graph.");
    const config = options.config || { generations: 4, rootFields: [], ancestorFields: [], photos: false, unknownDisplay: "label" };
    const generations = Number(config.generations || 4);
    const branding = options.branding || {};
    const operationName = clean(branding.rabbitryName) || clean(options.operationName) || "HerdHarbor Breeder";
    const brandText = clean(branding.rabbitryText);
    const logo = clean(branding.logoData) || clean(options.defaultLogo);
    const subjectPhoto = config.photos ? clean(subject.photoData || subject.photoDataUrl || subject.photoUrl || subject.photo) : "";
    const formatDate = typeof options.formatDate === "function" ? options.formatDate : (value) => clean(value);
    const speciesIcon = typeof options.speciesIcon === "function" ? options.speciesIcon : () => "•";
    const sale = options.sale || {};
    const salePrice = clean(sale.salePrice) ? `$${escapeHtml(sale.salePrice)}` : "—";
    const generatedDate = clean(options.generatedDate);
    const accent = /^#[0-9a-f]{6}$/i.test(clean(branding.accent)) ? clean(branding.accent) : "#4f7776";
    const contact = branding.contact && typeof branding.contact === "object" ? branding.contact : {};
    const brandMeta = [branding.website, branding.social, contact.email, contact.phone, contact.address].map(clean).filter(Boolean).join(" · ");
    const slots = 2 ** Math.max(0, generations - 1);
    const finalGenerationClass = generations === 5 ? " five-generation" : generations === 3 ? " three-generation" : " four-generation";

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject.name)} Pedigree</title><style>
      @page { size: letter landscape; margin: .2in; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: #2f3438; background: #fff; font-family: "Segoe UI", Arial, Helvetica, sans-serif; }
      body { padding: 0; }
      .sheet { width: 100%; height: ${pageHeight(generations)}; min-height: 0; max-height: ${pageHeight(generations)}; display: flex; flex-direction: column; overflow: hidden; }
      .header { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 0 0 8px; border-bottom: 2px solid #68737b; }
      .brand-print { min-width: 0; display: flex; align-items: center; gap: 11px; }
      .brand-print img { width: 52px; height: 52px; object-fit: contain; padding: 3px; background: #fff; border: 1px solid #d7dce0; border-radius: 6px; }
      .brand-print h1 { margin: 0; color: #27343d; font-size: 20px; line-height: 1.1; }
      .tagline { margin-top: 3px; color: #707980; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
      .brand-meta { margin-top: 2px; color: #7b848a; font-size: 7px; overflow-wrap:anywhere; }
      .print-subject { display: flex; align-items: center; gap: 10px; text-align: right; }
      .print-subject strong { display: block; color: #242b30; font-size: 14px; }
      .print-subject small { display: block; margin-top: 3px; color: #747d84; font-size: 8px; }
      .print-animal-photo { width: 52px; height: 52px; display: grid; place-items: center; overflow: hidden; color: #fff; background: #40505a; border: 1px solid #cfd5d9; border-radius: 6px; font-size: 24px; }
      .print-animal-photo img { width: 100%; height: 100%; object-fit: cover; }

      .pedigree-tree {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: ${columnTemplate(generations)};
        grid-template-rows: repeat(${slots}, minmax(0,1fr));
        column-gap: 0;
        padding: 8px 0 6px;
      }
      .pedigree-node { min-width: 0; align-self: center; padding: 2px 0; }
      .pedigree-node-card { width: 100%; padding: 6px 7px; background: #fff; border: 1px solid #c9d0d5; border-radius: 5px; box-shadow: 0 1px 1px rgba(20,31,39,.035); }
      .pedigree-node-card.subject-card { border-color: #7d8991; border-left: 3px solid ${accent}; }
      .pedigree-node-card.unknown { color: #747d84; background: #fafbfb; border-style: dashed; }
      .node-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #eef0f2; }
      .node-title { min-width: 0; display: flex; align-items: flex-start; gap: 5px; }
      .species-mark { width: 15px; height: 15px; flex: 0 0 auto; display: grid; place-items: center; color: #65717a; background: #f1f3f4; border-radius: 50%; font-size: 9px; }
      .node-title > div { min-width: 0; }
      .relation { display: block; margin-bottom: 1px; color: #7b858c; font-size: 6.5px; font-weight: 800; letter-spacing: .075em; text-transform: uppercase; }
      .node-title strong { display: block; overflow: hidden; color: #2b3237; font-size: 9px; line-height: 1.12; text-overflow: ellipsis; white-space: nowrap; }
      .sex-mark { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; color: #707980; }
      .sex-mark > span { font-size: 10px; line-height: 1; }
      .sex-mark small { font-size: 5.8px; font-weight: 800; letter-spacing: .05em; }
      .node-details { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 1px 7px; padding-top: 4px; }
      .node-details div { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr); gap: 3px; align-items: baseline; font-size: 6.7px; line-height: 1.2; }
      .node-details b { color: #4e575e; font-size: 6px; letter-spacing: .045em; }
      .node-details span { overflow: hidden; color: #505a61; text-overflow: ellipsis; white-space: nowrap; }
      .node-details .pedigree-protected-value { overflow: visible; font-family: inherit; font-size: inherit; line-height: 1.08; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; word-break: normal; }
      .great-node .pedigree-node-card { padding: 4px 6px; }
      .great-node .node-header { padding-bottom: 2px; }
      .great-node .node-details { gap: 0 5px; padding-top: 2px; }
      .great-node .node-details div { font-size: 6.1px; }
      .great-node .node-details b { font-size: 5.5px; }
      .great-node .relation { display: none; }
      .great-node .node-title strong { font-size: 8px; }

      .pedigree-branch { position: relative; align-self: stretch; }
      .pedigree-branch::before { content: ""; position: absolute; left: 50%; top: 25%; bottom: 25%; border-left: 1px solid #aab2b8; }
      .pedigree-branch::after { content: ""; position: absolute; left: 0; top: 50%; width: 50%; border-top: 1px solid #aab2b8; }
      .branch-arm { position: absolute; left: 50%; right: 0; border-top: 1px solid #aab2b8; }
      .branch-arm.top { top: 25%; }
      .branch-arm.bottom { top: 75%; }

      .sale-strip { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 5px; padding-top: 7px; border-top: 2px solid #68737b; }
      .sale-field { min-width: 0; padding: 5px 6px; background: #fafafa; border: 1px solid #d9dee2; border-radius: 4px; }
      .sale-field small, .sale-field strong { display: block; }
      .sale-field small { color: #717b82; font-size: 6px; font-weight: 800; letter-spacing: .055em; text-transform: uppercase; }
      .sale-field strong { margin-top: 2px; overflow: hidden; color: #343b40; font-size: 7.5px; text-overflow: ellipsis; white-space: nowrap; }
      .sale-notes { grid-column: 1 / -1; }
      .sale-notes strong { white-space: normal; }
      .certification { display: grid; grid-template-columns: 1.35fr 1fr 1fr; gap: 18px; align-items: end; margin-top: 8px; color: #4d565c; font-size: 7px; }
      .certification p { margin: 0; line-height: 1.35; }
      .signature { padding-top: 10px; border-top: 1px solid #68737b; text-align: center; }
      .footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 7px; color: #7b848a; font-size: 6.5px; }
      .no-print { position: fixed; right: 18px; bottom: 18px; padding: 10px 15px; color: #fff; background: #2e7d7b; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; box-shadow: 0 5px 18px rgba(0,0,0,.18); }
      .five-generation .pedigree-node-card { padding: 3px 4px; }
      .five-generation .node-title strong { font-size: 6.6px; }
      .five-generation .node-details div { font-size: 4.9px; gap: 2px; }
      .five-generation .node-details b { font-size: 4.5px; }
      .five-generation .relation { font-size: 4.8px; }
      .five-generation .species-mark { width: 12px; height: 12px; font-size: 7px; }
      @media screen and (max-width: 980px) { body { min-width: 980px; } }
      @media print {
        html, body { width: 100%; height: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet, .pedigree-tree { break-inside: avoid; page-break-inside: avoid; }
        .no-print { display: none; }
      }
    </style></head><body><div class="sheet ${finalGenerationClass}">
      <header class="header">
        <div class="brand-print">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(operationName)} logo">` : ""}<div><h1>${escapeHtml(operationName)}</h1><div class="tagline">${generations}-generation pedigree · Generated by HerdHarbor</div>${brandText ? `<div class="brand-meta">${escapeHtml(brandText)}</div>` : ""}${brandMeta ? `<div class="brand-meta">${escapeHtml(brandMeta)}</div>` : ""}</div></div>
        <div class="print-subject"><div><strong>${escapeHtml(subject.name)}</strong><small>${escapeHtml([animalIdValue(subject), subject.earTagColor, subject.registrationNumber, subject.breed, subject.variety || subject.color].filter((value) => clean(value) && clean(value) !== "—").join(" · ") || "Pedigree record")}<br>${generatedDate ? `Generated ${escapeHtml(generatedDate)}` : ""}</small></div><div class="print-animal-photo">${subjectPhoto ? `<img src="${escapeHtml(subjectPhoto)}" alt="${escapeHtml(subject.name)} photo">` : `<span>${speciesIcon(subject.species)}</span>`}</div></div>
      </header>

      <main class="pedigree-tree" aria-label="Pedigree chart for ${escapeHtml(subject.name)}">
        ${treeHtml(graph, config, { subject, formatDate, speciesIcon })}
      </main>

      <section class="sale-strip">
        <div class="sale-field"><small>Seller</small><strong>${escapeHtml(sale.sellerName || "—")}</strong></div>
        <div class="sale-field"><small>Seller contact</small><strong>${escapeHtml(sale.sellerContact || "—")}</strong></div>
        <div class="sale-field"><small>Buyer</small><strong>${escapeHtml(sale.buyerName || "—")}</strong></div>
        <div class="sale-field"><small>Sale / transfer date</small><strong>${escapeHtml(sale.saleDate ? formatDate(sale.saleDate) : "—")}</strong></div>
        <div class="sale-field"><small>Sale price</small><strong>${salePrice}</strong></div>
        <div class="sale-field"><small>Transfer number</small><strong>${escapeHtml(sale.transferNumber || "—")}</strong></div>
        <div class="sale-field sale-notes"><small>Sale notes</small><strong>${escapeHtml(sale.saleNotes || "—")}</strong></div>
      </section>

      <section class="certification"><p>I certify that this pedigree reflects the records entered for this animal to the best of my knowledge.</p><div class="signature">Seller signature / date</div><div class="signature">Buyer signature / date</div></section>
      <footer class="footer"><span>Created with HerdHarbor · Livestock records without limits.</span><span>${escapeHtml(operationName)}</span></footer>
      <button class="no-print" onclick="window.print()">Print / Save PDF</button>
    </div></body></html>`;
  }

  return Object.freeze({
    VERSION,
    buildHtml,
    treeHtml,
    cardHtml,
    columnTemplate
  });
});
