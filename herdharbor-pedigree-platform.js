(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborPedigreePlatform = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0.0";
  const DEFAULT_GENERATIONS = 4;
  const MAX_GENERATIONS = 8;
  const PARENT_FIELDS = Object.freeze([
    Object.freeze({ relation: "sire", field: "sireId", sex: "Male" }),
    Object.freeze({ relation: "dam", field: "damId", sex: "Female" })
  ]);

  function asId(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function identityOf(animal) {
    if (!animal || typeof animal !== "object") return "";
    return asId(animal.id || animal.uuid || animal.recordId || animal.record_id);
  }

  function clampGenerations(value) {
    const number = Number(value || DEFAULT_GENERATIONS);
    if (!Number.isFinite(number)) return DEFAULT_GENERATIONS;
    return Math.max(1, Math.min(MAX_GENERATIONS, Math.trunc(number)));
  }

  function clonePublicAnimal(animal) {
    if (!animal || typeof animal !== "object") return null;
    return {
      id: identityOf(animal),
      name: String(animal.name || ""),
      sex: String(animal.sex || "Unknown"),
      species: String(animal.species || ""),
      dob: String(animal.dob || ""),
      breed: String(animal.breed || ""),
      color: String(animal.color || animal.variety || ""),
      variety: String(animal.variety || animal.color || ""),
      weight: animal.weight ?? animal.currentWeight ?? "",
      registrationNumber: String(animal.registrationNumber || ""),
      gcNumber: String(animal.gcNumber || animal.grandChampionNumber || ""),
      genotype: String(animal.genotype || ""),
      photoData: String(animal.photoData || animal.photoUrl || ""),
      breeder: String(animal.breeder || animal.rabbitry || animal.prefix || ""),
      rabbitry: String(animal.rabbitry || animal.breeder || animal.prefix || ""),
      sireId: asId(animal.sireId),
      damId: asId(animal.damId)
    };
  }

  function expectedAncestorSlots(generations) {
    if (generations <= 1) return 0;
    return Math.pow(2, generations) - 2;
  }

  function buildPedigreeGraph(input) {
    const options = input && typeof input === "object" ? input : {};
    const animals = Array.isArray(options.animals) ? options.animals : [];
    const generations = clampGenerations(options.generations);
    const rootId = asId(options.rootId || options.animalId);
    const byId = new Map();
    const duplicateIds = [];

    for (const animal of animals) {
      const id = identityOf(animal);
      if (!id) continue;
      if (byId.has(id)) {
        duplicateIds.push(id);
        continue;
      }
      byId.set(id, animal);
    }

    const nodes = [];
    const occurrences = new Map();
    const problems = [];
    let knownAncestorCount = 0;

    function addOccurrence(id, path) {
      if (!id) return;
      if (!occurrences.has(id)) occurrences.set(id, []);
      occurrences.get(id).push(path);
    }

    function visit(id, generation, path, relation, lineage) {
      const normalizedId = asId(id);
      const record = normalizedId ? byId.get(normalizedId) : null;
      const cycle = Boolean(normalizedId && lineage.has(normalizedId));
      const missingReference = Boolean(normalizedId && !record);
      const node = {
        path,
        generation,
        relation,
        identityId: normalizedId,
        known: Boolean(record) && !cycle,
        cycle,
        missingReference,
        expectedSex: relation === "sire" ? "Male" : relation === "dam" ? "Female" : "",
        animal: record && !cycle ? clonePublicAnimal(record) : null
      };
      nodes.push(node);

      if (generation > 0 && node.known) knownAncestorCount += 1;
      if (node.known) addOccurrence(normalizedId, path);
      if (cycle) {
        problems.push({ type: "cycle", path, identityId: normalizedId });
        return;
      }
      if (missingReference) problems.push({ type: "missing-reference", path, identityId: normalizedId });
      if (generation >= generations - 1) return;

      const nextLineage = new Set(lineage);
      if (normalizedId) nextLineage.add(normalizedId);

      for (const parent of PARENT_FIELDS) {
        const parentPath = path + "." + parent.relation;
        const parentId = record ? asId(record[parent.field]) : "";
        visit(parentId, generation + 1, parentPath, parent.relation, nextLineage);
      }
    }

    visit(rootId, 0, "root", "subject", new Set());

    const repeatedAncestors = [];
    for (const entry of [...occurrences.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const id = entry[0];
      const paths = entry[1].slice().sort();
      if (id === rootId || paths.length < 2) continue;
      repeatedAncestors.push({
        identityId: id,
        count: paths.length,
        paths
      });
    }

    const expected = expectedAncestorSlots(generations);
    const coverage = expected ? knownAncestorCount / expected : 1;
    return {
      version: VERSION,
      rootId,
      generations,
      ancestorDepth: Math.max(0, generations - 1),
      nodes,
      repeatedAncestors,
      coverage: {
        knownAncestorCount,
        expectedAncestorCount: expected,
        ratio: coverage,
        percent: Number((coverage * 100).toFixed(2))
      },
      problems: problems.sort((a, b) => {
        const typeOrder = String(a.type).localeCompare(String(b.type));
        return typeOrder || String(a.path).localeCompare(String(b.path));
      }),
      duplicateInputIds: [...new Set(duplicateIds)].sort()
    };
  }

  function nodeAt(graph, path) {
    if (!graph || !Array.isArray(graph.nodes)) return null;
    return graph.nodes.find(function (node) { return node.path === path; }) || null;
  }

  function occurrencesOf(graph, identityId) {
    const id = asId(identityId);
    if (!id || !graph || !Array.isArray(graph.nodes)) return [];
    return graph.nodes.filter(function (node) {
      return node.known && node.identityId === id;
    }).map(function (node) {
      return { path: node.path, generation: node.generation, relation: node.relation };
    });
  }


  const RENDER_MODES = Object.freeze({
    privateHerd: Object.freeze({ fields: ["name","rabbitry","sex","dob","breed","variety","color","weight","registrationNumber","gcNumber","genotype","photoData"] }),
    printablePreview: Object.freeze({ fields: ["name","rabbitry","sex","dob","breed","variety","color","weight","registrationNumber","gcNumber","genotype","photoData"] }),
    publicMarketplace: Object.freeze({ fields: ["name","rabbitry","sex","dob","breed","variety","color","weight","registrationNumber","gcNumber","photoData"] }),
    transferPreview: Object.freeze({ fields: ["name","rabbitry","sex","dob","breed","variety","color","weight","registrationNumber","gcNumber","genotype","photoData"] }),
    relationshipAnalysis: Object.freeze({ fields: ["name","rabbitry","sex","dob","breed","variety","color","registrationNumber","gcNumber","photoData"] })
  });
  const FIELD_LABELS = Object.freeze({
    rabbitry: "Rabbitry / prefix",
    sex: "Sex",
    dob: "DOB",
    breed: "Breed",
    variety: "Variety",
    color: "Color",
    weight: "Weight",
    registrationNumber: "Registration",
    gcNumber: "GC number",
    genotype: "Genotype"
  });

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeRenderMode(value) {
    const mode = String(value || "privateHerd");
    return Object.prototype.hasOwnProperty.call(RENDER_MODES, mode) ? mode : "privateHerd";
  }

  function permittedFields(mode, requestedFields) {
    const normalizedMode = normalizeRenderMode(mode);
    const allowed = new Set(RENDER_MODES[normalizedMode].fields);
    const requested = Array.isArray(requestedFields) && requestedFields.length
      ? requestedFields
      : RENDER_MODES[normalizedMode].fields;
    return requested.filter(function (field) { return allowed.has(field); });
  }

  function fieldValue(animal, field) {
    if (!animal) return "";
    if (field === "variety") return animal.variety || animal.color || "";
    if (field === "color") return animal.color || animal.variety || "";
    return animal[field] === null || animal[field] === undefined ? "" : animal[field];
  }

  function renderPedigreeNode(node, options) {
    const mode = normalizeRenderMode(options && options.mode);
    const fields = permittedFields(mode, options && options.fields);
    const expanded = Boolean(options && options.expanded);
    const animal = node && node.animal;
    const unknownLabel = node && node.missingReference ? "Unavailable ancestor" : "Unknown ancestor";
    if (!animal) {
      return '<article class="hh-pedigree-card hh-pedigree-card-unknown" data-path="' + escapeHtml(node && node.path) + '">' +
        '<div class="hh-pedigree-card-head"><span class="hh-pedigree-relation">' + escapeHtml(node && node.relation) + '</span>' +
        '<strong>' + escapeHtml(unknownLabel) + '</strong></div>' +
        (node && node.cycle ? '<span class="hh-pedigree-marker" aria-label="Circular pedigree reference">Circular reference</span>' : '') +
        '</article>';
    }

    const detailRows = fields.filter(function (field) {
      return field !== "name" && field !== "photoData";
    }).map(function (field) {
      const value = fieldValue(animal, field);
      if (value === "") return "";
      return '<div class="hh-pedigree-field" data-field="' + escapeHtml(field) + '"><dt>' +
        escapeHtml(FIELD_LABELS[field] || field) + '</dt><dd>' + escapeHtml(value) + '</dd></div>';
    }).join("");

    const photo = fields.includes("photoData") && animal.photoData
      ? '<img class="hh-pedigree-photo" src="' + escapeHtml(animal.photoData) + '" alt="">'
      : '<span class="hh-pedigree-photo hh-pedigree-photo-placeholder" aria-hidden="true">HH</span>';

    return '<article class="hh-pedigree-card" data-path="' + escapeHtml(node.path) + '" data-identity-id="' + escapeHtml(node.identityId) + '">' +
      '<div class="hh-pedigree-card-head">' + photo +
      '<div class="hh-pedigree-title"><span class="hh-pedigree-relation">' + escapeHtml(node.relation) + '</span><strong>' +
      escapeHtml(animal.name || "Unnamed animal") + '</strong></div>' +
      '<span class="hh-pedigree-sex">' + escapeHtml(animal.sex || node.expectedSex || "Unknown") + '</span></div>' +
      (detailRows ? '<details class="hh-pedigree-details"' + (expanded ? ' open' : '') + '><summary>Details</summary><dl>' + detailRows + '</dl></details>' : '') +
      '</article>';
  }

  function renderPedigree(graph, options) {
    if (!graph || !Array.isArray(graph.nodes)) return "";
    const settings = options && typeof options === "object" ? options : {};
    const mode = normalizeRenderMode(settings.mode);
    const groups = new Map();
    graph.nodes.forEach(function (node) {
      if (!groups.has(node.generation)) groups.set(node.generation, []);
      groups.get(node.generation).push(node);
    });
    const body = [...groups.entries()].sort(function (a, b) { return a[0] - b[0]; }).map(function (entry) {
      const generation = entry[0];
      const label = generation === 0 ? "Animal" : generation === 1 ? "Parents" : "Generation " + (generation + 1);
      return '<section class="hh-pedigree-generation" data-generation="' + generation + '">' +
        '<h3>' + escapeHtml(label) + '</h3><div class="hh-pedigree-generation-grid">' +
        entry[1].map(function (node) { return renderPedigreeNode(node, settings); }).join("") +
        '</div></section>';
    }).join("");

    return '<div class="hh-pedigree-renderer" data-mode="' + escapeHtml(mode) + '" data-generations="' +
      escapeHtml(graph.generations) + '">' + body + '</div>';
  }

  function mountPedigree(target, graph, options) {
    if (!target || typeof target !== "object") throw new Error("A pedigree render target is required.");
    target.innerHTML = renderPedigree(graph, options);
    return target;
  }


  const PEDIGREE_TEMPLATES = Object.freeze({
    classic: Object.freeze({ id:"classic", label:"Classic", generations:4, rootFields:["name","sex","dob","breed","variety","registrationNumber","photoData"], ancestorFields:["name","sex","dob","breed","variety","registrationNumber"], photos:true, showUnknown:true, density:"comfortable" }),
    minimal: Object.freeze({ id:"minimal", label:"Minimal", generations:3, rootFields:["name","sex","breed","variety"], ancestorFields:["name","sex","breed","variety"], photos:false, showUnknown:true, density:"compact" }),
    professional: Object.freeze({ id:"professional", label:"Professional", generations:4, rootFields:["name","rabbitry","sex","dob","breed","variety","registrationNumber","gcNumber","photoData"], ancestorFields:["name","rabbitry","sex","dob","breed","variety","registrationNumber","gcNumber"], photos:true, showUnknown:true, density:"comfortable" }),
    buyer: Object.freeze({ id:"buyer", label:"Buyer", generations:3, rootFields:["name","rabbitry","sex","dob","breed","variety","registrationNumber","photoData"], ancestorFields:["name","rabbitry","sex","breed","variety","registrationNumber"], photos:true, showUnknown:true, density:"comfortable" }),
    rabbitryBranded: Object.freeze({ id:"rabbitryBranded", label:"Rabbitry Branded", generations:4, rootFields:["name","rabbitry","sex","dob","breed","variety","registrationNumber","photoData"], ancestorFields:["name","rabbitry","sex","dob","breed","variety","registrationNumber"], photos:true, showUnknown:true, density:"comfortable", branding:true })
  });
  const PEDIGREE_FIELD_SET = Object.freeze(["name","rabbitry","sex","dob","breed","variety","color","weight","registrationNumber","gcNumber","genotype","photoData"]);

  function uniqueFields(fields, fallback) {
    const allowed = new Set(PEDIGREE_FIELD_SET);
    const source = Array.isArray(fields) ? fields : fallback;
    return [...new Set((source || []).filter(function (field) { return allowed.has(field); }))];
  }

  function normalizePedigreeConfig(config) {
    const raw = config && typeof config === "object" ? config : {};
    const preset = PEDIGREE_TEMPLATES[raw.templateId] || PEDIGREE_TEMPLATES.classic;
    const generations = Math.max(3, Math.min(5, Math.trunc(Number(raw.generations || preset.generations || 4))));
    const rootFields = uniqueFields(raw.rootFields, preset.rootFields);
    const ancestorFields = uniqueFields(raw.ancestorFields, preset.ancestorFields);
    const photos = raw.photos === undefined ? preset.photos !== false : Boolean(raw.photos);
    const showUnknown = raw.showUnknown === undefined ? preset.showUnknown !== false : Boolean(raw.showUnknown);
    const density = raw.density === "compact" ? "compact" : "comfortable";
    if (!photos) {
      return {
        templateId: raw.templateId && PEDIGREE_TEMPLATES[raw.templateId] ? raw.templateId : preset.id,
        generations,
        rootFields: rootFields.filter(function (field) { return field !== "photoData"; }),
        ancestorFields: ancestorFields.filter(function (field) { return field !== "photoData"; }),
        photos:false,
        showUnknown,
        density
      };
    }
    return {
      templateId: raw.templateId && PEDIGREE_TEMPLATES[raw.templateId] ? raw.templateId : preset.id,
      generations,
      rootFields,
      ancestorFields,
      photos:true,
      showUnknown,
      density
    };
  }

  function pedigreeRenderPlan(graph, config, mode) {
    const normalized = normalizePedigreeConfig(config);
    const renderMode = normalizeRenderMode(mode || "privateHerd");
    const filteredNodes = (graph && Array.isArray(graph.nodes) ? graph.nodes : []).filter(function (node) {
      if (node.generation >= normalized.generations) return false;
      return normalized.showUnknown || node.known;
    });
    return {
      graph: Object.assign({}, graph || {}, { generations:normalized.generations, nodes:filteredNodes }),
      rootOptions: { mode:renderMode, fields:normalized.rootFields, expanded:normalized.density !== "compact" },
      ancestorOptions: { mode:renderMode, fields:normalized.ancestorFields, expanded:false },
      config:normalized
    };
  }

  function renderCustomizedPedigree(graph, config, mode) {
    const plan = pedigreeRenderPlan(graph, config, mode);
    const root = plan.graph.nodes.filter(function (node) { return node.generation === 0; });
    const ancestors = plan.graph.nodes.filter(function (node) { return node.generation > 0; });
    const merged = Object.assign({}, plan.graph, { nodes:root });
    const rootHtml = renderPedigree(merged, plan.rootOptions);
    const ancestorGraph = Object.assign({}, plan.graph, { nodes:ancestors });
    const ancestorHtml = ancestors.length ? renderPedigree(ancestorGraph, plan.ancestorOptions) : "";
    return '<div class="hh-pedigree-customized hh-density-' + escapeHtml(plan.config.density) + '">' + rootHtml + ancestorHtml + '</div>';
  }


  function sanitizeBranding(input, context) {
    const raw = input && typeof input === "object" ? input : {};
    const publicMode = context === "publicMarketplace";
    return {
      rabbitryName: String(raw.rabbitryName || raw.operationName || "").trim(),
      logoData: String(raw.logoData || "").trim(),
      accent: String(raw.accent || "").trim(),
      website: String(raw.website || "").trim(),
      social: String(raw.social || "").trim(),
      email: publicMode ? "" : (raw.includeEmail === true ? String(raw.email || "").trim() : ""),
      phone: publicMode ? "" : (raw.includePhone === true ? String(raw.phone || "").trim() : ""),
      includeEmail: publicMode ? false : raw.includeEmail === true,
      includePhone: publicMode ? false : raw.includePhone === true
    };
  }

  function savedTemplatesFrom(settings) {
    const list = settings && Array.isArray(settings.pedigreeTemplates) ? settings.pedigreeTemplates : [];
    return list.filter(function (item) { return item && typeof item === "object" && item.id; }).map(function (item) {
      return Object.assign({}, item, {
        config: normalizePedigreeConfig(item.config),
        branding: sanitizeBranding(item.branding, "private")
      });
    });
  }

  function upsertSavedTemplate(settings, template) {
    const current = savedTemplatesFrom(settings);
    const raw = template && typeof template === "object" ? template : {};
    const id = asId(raw.id) || "pedigree-template-" + Date.now();
    const normalized = {
      id,
      name: String(raw.name || "Untitled pedigree template").trim() || "Untitled pedigree template",
      config: normalizePedigreeConfig(raw.config),
      branding: sanitizeBranding(raw.branding, "private"),
      updatedAt: String(raw.updatedAt || new Date().toISOString())
    };
    const next = current.filter(function (item) { return item.id !== id; });
    next.push(normalized);
    next.sort(function (a, b) { return a.name.localeCompare(b.name) || a.id.localeCompare(b.id); });
    return Object.assign({}, settings || {}, { pedigreeTemplates:next });
  }

  function removeSavedTemplate(settings, templateId) {
    const id = asId(templateId);
    return Object.assign({}, settings || {}, {
      pedigreeTemplates:savedTemplatesFrom(settings).filter(function (item) { return item.id !== id; })
    });
  }

  function publicPreviewTemplate(template) {
    const raw = template && typeof template === "object" ? template : {};
    return {
      id: asId(raw.id),
      name: String(raw.name || ""),
      config: normalizePedigreeConfig(raw.config),
      branding: sanitizeBranding(raw.branding, "publicMarketplace"),
      mode:"publicMarketplace"
    };
  }

  const SAVED_TEMPLATE_EXAMPLES = Object.freeze([
    "Sales Pedigree",
    "Show Pedigree",
    "Pet Buyer Pedigree",
    "Full Breeding Pedigree"
  ]);


  function graphOccurrences(graph) {
    const result=new Map();
    if (!graph || !Array.isArray(graph.nodes)) return result;
    graph.nodes.forEach(function(node){
      if (!node.known || !node.identityId || node.generation === 0) return;
      if (!result.has(node.identityId)) result.set(node.identityId,[]);
      result.get(node.identityId).push({path:node.path,generation:node.generation,relation:node.relation});
    });
    for (const occurrences of result.values()) {
      occurrences.sort(function(a,b){return a.generation-b.generation || a.path.localeCompare(b.path);});
    }
    return result;
  }

  function analyzeSharedAncestors(input) {
    const raw=input && typeof input === "object" ? input : {};
    const animals=Array.isArray(raw.animals) ? raw.animals : [];
    const generations=clampGenerations(raw.generations || 5);
    const leftId=asId(raw.leftId || raw.firstId);
    const rightId=asId(raw.rightId || raw.secondId);
    const leftGraph=buildPedigreeGraph({animals,rootId:leftId,generations});
    const rightGraph=buildPedigreeGraph({animals,rootId:rightId,generations});
    const left=graphOccurrences(leftGraph);
    const right=graphOccurrences(rightGraph);
    const shared=[];
    for (const id of [...left.keys()].filter(function(candidate){return right.has(candidate);}).sort()) {
      const leftPaths=left.get(id);
      const rightPaths=right.get(id);
      const pairs=[];
      leftPaths.forEach(function(l){
        rightPaths.forEach(function(r){
          pairs.push({
            leftPath:l.path,
            rightPath:r.path,
            leftGeneration:l.generation,
            rightGeneration:r.generation,
            pathLength:l.generation+r.generation
          });
        });
      });
      pairs.sort(function(a,b){
        return a.pathLength-b.pathLength || a.leftPath.localeCompare(b.leftPath) || a.rightPath.localeCompare(b.rightPath);
      });
      const animal=animals.find(function(item){return identityOf(item)===id;}) || null;
      shared.push({
        identityId:id,
        name:animal ? String(animal.name || "") : "",
        leftOccurrences:leftPaths,
        rightOccurrences:rightPaths,
        occurrencePairs:pairs,
        closestPath:pairs[0] || null
      });
    }
    shared.sort(function(a,b){
      const left=a.closestPath ? a.closestPath.pathLength : Infinity;
      const right=b.closestPath ? b.closestPath.pathLength : Infinity;
      return left-right || a.identityId.localeCompare(b.identityId);
    });
    return {
      leftId,
      rightId,
      generations,
      leftGraph,
      rightGraph,
      sharedAncestors:shared,
      sharedAncestorCount:shared.length,
      closestSharedAncestor:shared[0] || null,
      coverage:{
        left:leftGraph.coverage,
        right:rightGraph.coverage
      }
    };
  }

  function analyzePairing(animals, leftId, rightId, generations) {
    return analyzeSharedAncestors({animals,leftId,rightId,generations});
  }


  function pedigreeOrder(animals, focalIds) {
    const byId=new Map();
    (Array.isArray(animals)?animals:[]).forEach(function(animal){
      const id=identityOf(animal);
      if (id && !byId.has(id)) byId.set(id,animal);
    });
    const visiting=new Set();
    const visited=new Set();
    const order=[];
    function visit(id) {
      const key=asId(id);
      if (!key || !byId.has(key) || visited.has(key)) return;
      if (visiting.has(key)) throw new Error("Circular pedigree prevents relationship calculation at " + key + ".");
      visiting.add(key);
      const animal=byId.get(key);
      visit(animal.sireId);
      visit(animal.damId);
      visiting.delete(key);
      visited.add(key);
      order.push(key);
    }
    (Array.isArray(focalIds)?focalIds:[]).forEach(visit);
    return {order,byId};
  }

  function buildNumeratorRelationshipMatrix(animals, focalIds) {
    const topology=pedigreeOrder(animals,focalIds);
    const order=topology.order;
    const byId=topology.byId;
    const index=new Map(order.map(function(id,i){return [id,i];}));
    const matrix=Array.from({length:order.length},function(){return Array(order.length).fill(0);});
    function a(parentId,j) {
      const id=asId(parentId);
      const i=index.get(id);
      return i === undefined ? 0 : matrix[i][j];
    }
    for (let i=0;i<order.length;i+=1) {
      const animal=byId.get(order[i]) || {};
      const sire=asId(animal.sireId);
      const dam=asId(animal.damId);
      for (let j=0;j<i;j+=1) {
        const value=0.5*(a(sire,j)+a(dam,j));
        matrix[i][j]=value;
        matrix[j][i]=value;
      }
      const sireIndex=index.get(sire);
      const damIndex=index.get(dam);
      matrix[i][i]=1+((sireIndex!==undefined && damIndex!==undefined) ? 0.5*matrix[sireIndex][damIndex] : 0);
    }
    return {order,index,matrix,byId};
  }

  function matrixValue(result,leftId,rightId) {
    const i=result.index.get(asId(leftId));
    const j=result.index.get(asId(rightId));
    return i===undefined || j===undefined ? 0 : result.matrix[i][j];
  }

  function individualPedigreeCoi(result, animalId) {
    const i=result.index.get(asId(animalId));
    return i===undefined ? 0 : Math.max(0,result.matrix[i][i]-1);
  }

  function identityPath(graph,path) {
    const parts=String(path||"").split(".");
    const ids=[];
    for(let i=0;i<parts.length;i+=1){
      const prefix=parts.slice(0,i+1).join(".");
      const node=nodeAt(graph,prefix);
      if (node?.known && node.identityId) ids.push(node.identityId);
    }
    return ids;
  }

  function relationshipContributionDetails(sharedAnalysis,matrixResult) {
    if (!sharedAnalysis || !Array.isArray(sharedAnalysis.sharedAncestors)) return [];
    const output=[];
    sharedAnalysis.sharedAncestors.forEach(function(entry){
      const ancestorF=individualPedigreeCoi(matrixResult,entry.identityId);
      const paths=[];
      entry.occurrencePairs.forEach(function(pair){
        const leftIds=identityPath(sharedAnalysis.leftGraph,pair.leftPath);
        const rightIds=identityPath(sharedAnalysis.rightGraph,pair.rightPath);
        const leftWithoutAncestor=new Set(leftIds.slice(0,-1));
        const rightWithoutAncestor=new Set(rightIds.slice(0,-1));
        const independent=[...leftWithoutAncestor].every(function(id){return !rightWithoutAncestor.has(id);});
        if (!independent) return;
        const contribution=Math.pow(0.5,pair.leftGeneration+pair.rightGeneration)*(1+ancestorF);
        paths.push(Object.assign({},pair,{ancestorInbreeding:ancestorF,contribution}));
      });
      if (paths.length) {
        output.push({
          identityId:entry.identityId,
          name:entry.name,
          ancestorInbreeding:ancestorF,
          validPathPairs:paths,
          pathContributionTotal:paths.reduce(function(sum,item){return sum+item.contribution;},0)
        });
      }
    });
    return output;
  }

  function calculatePedigreeRelationship(input) {
    const raw=input && typeof input === "object" ? input : {};
    const animals=Array.isArray(raw.animals)?raw.animals:[];
    const leftId=asId(raw.leftId || raw.firstId);
    const rightId=asId(raw.rightId || raw.secondId);
    const generations=clampGenerations(raw.generations || 5);
    const shared=analyzeSharedAncestors({animals,leftId,rightId,generations});
    const matrix=buildNumeratorRelationshipMatrix(animals,[leftId,rightId]);
    const numeratorRelationship=matrixValue(matrix,leftId,rightId);
    const projectedOffspringPedigreeCoi=numeratorRelationship/2;
    const leftF=individualPedigreeCoi(matrix,leftId);
    const rightF=individualPedigreeCoi(matrix,rightId);
    const leftDiagonal=1+leftF;
    const rightDiagonal=1+rightF;
    const normalizedRelationship=(leftDiagonal>0 && rightDiagonal>0)
      ? numeratorRelationship/Math.sqrt(leftDiagonal*rightDiagonal)
      : 0;
    return {
      leftId,
      rightId,
      generationsAnalyzed:generations,
      relationshipCoefficient:numeratorRelationship,
      numeratorRelationship,
      normalizedRelationshipCoefficient:normalizedRelationship,
      projectedOffspringPedigreeCoi,
      leftPedigreeCoi:leftF,
      rightPedigreeCoi:rightF,
      sharedAncestorCount:shared.sharedAncestorCount,
      sharedAncestors:shared.sharedAncestors,
      sharedAncestorContributions:relationshipContributionDetails(shared,matrix),
      pedigreeCompleteness:{
        left:shared.coverage.left,
        right:shared.coverage.right
      },
      incompletePedigree:shared.coverage.left.percent<100 || shared.coverage.right.percent<100,
      label:"Pedigree COI"
    };
  }

  return Object.freeze({
    VERSION,
    DEFAULT_GENERATIONS,
    MAX_GENERATIONS,
    PARENT_FIELDS,
    identityOf,
    clonePublicAnimal,
    expectedAncestorSlots,
    buildPedigreeGraph,
    nodeAt,
    occurrencesOf,
    RENDER_MODES,
    FIELD_LABELS,
    escapeHtml,
    normalizeRenderMode,
    permittedFields,
    renderPedigreeNode,
    renderPedigree,
    mountPedigree,
    PEDIGREE_TEMPLATES,
    PEDIGREE_FIELD_SET,
    normalizePedigreeConfig,
    pedigreeRenderPlan,
    renderCustomizedPedigree,
    sanitizeBranding,
    savedTemplatesFrom,
    upsertSavedTemplate,
    removeSavedTemplate,
    publicPreviewTemplate,
    SAVED_TEMPLATE_EXAMPLES,
    graphOccurrences,
    analyzeSharedAncestors,
    analyzePairing,
    pedigreeOrder,
    buildNumeratorRelationshipMatrix,
    matrixValue,
    individualPedigreeCoi,
    relationshipContributionDetails,
    calculatePedigreeRelationship
  });
});
