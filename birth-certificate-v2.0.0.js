(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborBirthCertificate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "2.0.0-a6";
  const FIELD_ORDER = Object.freeze([
    "photo", "dob", "sex", "breed", "color", "identity", "birthWeight",
    "currentWeight", "sire", "dam", "breeder", "newOwner", "goHomeDate",
    "breederNote", "signature"
  ]);
  const DEFAULT_FIELDS = Object.freeze({
    photo: true,
    dob: true,
    sex: true,
    breed: true,
    color: true,
    identity: true,
    birthWeight: true,
    currentWeight: true,
    sire: true,
    dam: true,
    breeder: true,
    newOwner: true,
    goHomeDate: true,
    breederNote: true,
    signature: true
  });

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

  function normalizeFields(fields = {}) {
    const out = {};
    for (const field of FIELD_ORDER) {
      out[field] = Object.prototype.hasOwnProperty.call(fields, field)
        ? fields[field] === true
        : DEFAULT_FIELDS[field] === true;
    }
    return out;
  }

  function normalizeOptions(options = {}) {
    return {
      fields: normalizeFields(options.fields || {}),
      newOwner: clean(options.newOwner),
      goHomeDate: clean(options.goHomeDate),
      breederNote: clean(options.breederNote),
      signatureLabel: clean(options.signatureLabel) || "Breeder signature",
      publicReference: options.publicReference && typeof options.publicReference === "object"
        ? {
            enabled: options.publicReference.enabled === true,
            url: clean(options.publicReference.url),
            label: clean(options.publicReference.label)
          }
        : { enabled: false, url: "", label: "" }
    };
  }

  function firstImageValue(value, depth = 0) {
    if (depth > 4 || value == null) return "";
    if (typeof value === "string") {
      const text = value.trim();
      return /^(data:image\/|blob:|https?:\/\/)/i.test(text) ? text : "";
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = firstImageValue(item, depth + 1);
        if (found) return found;
      }
      return "";
    }
    if (typeof value === "object") {
      for (const key of ["photoData", "photoDataUrl", "photoUrl", "photo", "profilePhotoDataUrl", "profilePhoto", "imageDataUrl", "imageUrl", "image", "thumbnail", "photos", "images", "media"]) {
        if (!(key in value)) continue;
        const found = firstImageValue(value[key], depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  function animalIdentity(animal) {
    return clean(
      animal?.earTagNumber ||
      animal?.tag ||
      animal?.tattoo ||
      animal?.registrationNumber
    );
  }

  function weightText(animal, prefix = "") {
    const base = clean(animal?.[`${prefix}Weight`]);
    if (!base) return "";
    const unit = clean(animal?.[`${prefix}WeightUnit`]) || "lb";
    const ounces = clean(animal?.[`${prefix}WeightOunces`]);
    return unit === "lb+oz" && ounces
      ? `${base} lb ${ounces} oz`
      : `${base} ${unit}`;
  }

  function currentWeightText(animal) {
    const explicit = clean(animal?.currentWeight);
    if (explicit) {
      const unit = clean(animal?.currentWeightUnit);
      const ounces = clean(animal?.currentWeightOunces);
      if (unit === "lb+oz" && ounces) return `${explicit} lb ${ounces} oz`;
      return unit ? `${explicit} ${unit}` : explicit;
    }
    return clean(animal?.weight);
  }

  function field(label, value, className = "") {
    return `<div class="hh-birth-field ${escapeHtml(className)}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || "—")}</strong></div>`;
  }

  function brandingHeader(branding = {}) {
    const name = clean(branding.rabbitryName);
    const text = clean(branding.rabbitryText);
    const logo = clean(branding.logoData);
    const website = clean(branding.website);
    const social = clean(branding.social);
    const contact = branding.contact && typeof branding.contact === "object" ? branding.contact : {};
    const metadata = [
      website,
      social,
      clean(contact.email),
      clean(contact.phone),
      clean(contact.address)
    ].filter(Boolean);
    const accent = /^#[0-9a-f]{6}$/i.test(clean(branding.accent)) ? clean(branding.accent) : "#2e7d7b";
    if (!name && !text && !logo && !metadata.length) return "";
    return `<header class="hh-birth-brand" style="--hh-birth-accent:${escapeHtml(accent)}">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="">` : ""}
      <div>
        ${name ? `<strong>${escapeHtml(name)}</strong>` : ""}
        ${text ? `<span>${escapeHtml(text)}</span>` : ""}
        ${metadata.length ? `<small>${metadata.map(escapeHtml).join(" · ")}</small>` : ""}
      </div>
    </header>`;
  }

  function certificateBodyHtml(input = {}) {
    const animal = input.animal || {};
    const sire = input.sire || null;
    const dam = input.dam || null;
    const branding = input.branding || {};
    const options = normalizeOptions(input.options || {});
    const fields = options.fields;
    const formatDate = typeof input.formatDate === "function" ? input.formatDate : (value) => clean(value);
    const photo = fields.photo ? firstImageValue(animal) : "";
    const identity = animalIdentity(animal);
    const birthWeight = weightText(animal, "birth");
    const currentWeight = currentWeightText(animal);
    const breeder = clean(animal.breeder) || clean(branding.rabbitryName);
    const titleName = clean(animal.name) || "Unnamed animal";

    const details = [];
    if (fields.dob) details.push(field("Date of birth", animal.dob ? formatDate(animal.dob) : ""));
    if (fields.sex) details.push(field("Sex", animal.sex));
    if (fields.breed) details.push(field("Breed", animal.breed));
    if (fields.color) details.push(field("Variety / color", animal.variety || animal.color));
    if (fields.identity) details.push(field("ID / tattoo", identity));
    if (fields.birthWeight) details.push(field("Birth weight", birthWeight));
    if (fields.currentWeight) details.push(field("Current weight", currentWeight));
    if (fields.sire) details.push(field("Sire", sire?.name));
    if (fields.dam) details.push(field("Dam", dam?.name));
    if (fields.breeder) details.push(field("Rabbitry / breeder", breeder));
    if (fields.newOwner) details.push(field("New owner", options.newOwner));
    if (fields.goHomeDate) details.push(field("Go-home date", options.goHomeDate ? formatDate(options.goHomeDate) : ""));

    const reference = options.publicReference.enabled && options.publicReference.url
      ? `<div class="hh-birth-public-reference" data-public-reference-url="${escapeHtml(options.publicReference.url)}"><small>${escapeHtml(options.publicReference.label || "Public reference")}</small><strong>${escapeHtml(options.publicReference.url)}</strong></div>`
      : "";

    return `<section class="hh-birth-certificate" data-hh-birth-certificate>
      ${brandingHeader(branding)}
      <div class="hh-birth-title">
        <div>
          <small>Birth Certificate</small>
          <h2>${escapeHtml(titleName)}</h2>
        </div>
        ${photo ? `<img class="hh-birth-photo" src="${escapeHtml(photo)}" alt="">` : ""}
      </div>
      <div class="hh-birth-details">${details.join("")}</div>
      ${fields.breederNote ? `<section class="hh-birth-note"><small>Breeder note</small><p>${escapeHtml(options.breederNote || "—")}</p></section>` : ""}
      ${reference}
      ${fields.signature ? `<div class="hh-birth-signature"><span></span><small>${escapeHtml(options.signatureLabel)}</small></div>` : ""}
    </section>`;
  }

  function buildCertificateHtml(input = {}) {
    const exporter = input.exporter || root?.HerdHarborDocumentExport;
    if (!exporter?.buildDocumentHtml) throw new Error("Document export tools are unavailable.");
    const animal = input.animal || {};
    const bodyHtml = certificateBodyHtml(input);
    return exporter.buildDocumentHtml({
      title: `${clean(animal.name) || "Animal"} Birth Certificate`,
      documentType: "Birth Certificate",
      page: { pageSize: "letter", orientation: "portrait", margin: ".4in" },
      bodyHtml,
      generatedLabel: clean(input.generatedLabel),
      footerLeft: "Created with HerdHarbor",
      footerRight: clean(input.branding?.rabbitryName) || "HerdHarbor"
    });
  }

  function controlsHtml(options = {}) {
    const value = normalizeOptions(options);
    const labels = {
      photo: "Photo", dob: "DOB", sex: "Sex", breed: "Breed", color: "Variety / color",
      identity: "ID / tattoo", birthWeight: "Birth weight", currentWeight: "Current weight",
      sire: "Sire", dam: "Dam", breeder: "Rabbitry / breeder", newOwner: "New owner",
      goHomeDate: "Go-home date", breederNote: "Breeder note", signature: "Signature line"
    };
    return `<div class="hh-birth-config" data-hh-birth-config>
      <fieldset><legend>Certificate fields</legend>
        <div class="hh-birth-config-grid">
          ${FIELD_ORDER.map((key) => `<label><input type="checkbox" name="birthField" value="${escapeHtml(key)}" ${value.fields[key] ? "checked" : ""}><span>${escapeHtml(labels[key])}</span></label>`).join("")}
        </div>
      </fieldset>
      <div class="form-grid two">
        <label>New owner<input name="newOwner" value="${escapeHtml(value.newOwner)}" placeholder="Optional"></label>
        <label>Go-home date<input name="goHomeDate" type="date" value="${escapeHtml(value.goHomeDate)}"></label>
      </div>
      <label>Breeder note<textarea name="breederNote" rows="3" placeholder="Optional note">${escapeHtml(value.breederNote)}</textarea></label>
      <p class="muted">Email, phone, and exact address are not added here. Only document branding explicitly enabled in Settings can appear.</p>
    </div>`;
  }

  function readControls(rootElement, fallback = {}) {
    const base = normalizeOptions(fallback);
    const selected = new Set(Array.from(rootElement?.querySelectorAll?.('input[name="birthField"]:checked') || []).map((input) => clean(input.value)));
    const fields = {};
    for (const key of FIELD_ORDER) fields[key] = selected.has(key);
    return normalizeOptions({
      fields,
      newOwner: rootElement?.querySelector?.('[name="newOwner"]')?.value ?? base.newOwner,
      goHomeDate: rootElement?.querySelector?.('[name="goHomeDate"]')?.value ?? base.goHomeDate,
      breederNote: rootElement?.querySelector?.('[name="breederNote"]')?.value ?? base.breederNote,
      signatureLabel: base.signatureLabel,
      publicReference: base.publicReference
    });
  }

  return Object.freeze({
    VERSION,
    FIELD_ORDER,
    DEFAULT_FIELDS,
    normalizeFields,
    normalizeOptions,
    firstImageValue,
    animalIdentity,
    weightText,
    currentWeightText,
    brandingHeader,
    certificateBodyHtml,
    buildCertificateHtml,
    controlsHtml,
    readControls
  });
});
