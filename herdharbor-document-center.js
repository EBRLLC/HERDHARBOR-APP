(function (root, factory) {
  "use strict";
  const api = factory(root && root.HerdHarborPedigreePlatform);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborDocumentCenter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (pedigree) {
  "use strict";

  const VERSION = "1.0.0";
  const PAGE_SIZES = Object.freeze({
    letter: Object.freeze({ width:612, height:792, label:"US Letter" }),
    a4: Object.freeze({ width:595.28, height:841.89, label:"A4" })
  });

  function asText(value) {
    return String(value === null || value === undefined ? "" : value);
  }

  function escapeHtml(value) {
    return asText(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function truncate(value, max) {
    const text = asText(value).replace(/\s+/g," ").trim();
    const limit = Math.max(1, Number(max || 40));
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(1, limit - 1)).trimEnd() + "…";
  }

  function pageGeometry(pageSize, orientation) {
    const base = PAGE_SIZES[String(pageSize || "letter").toLowerCase()] || PAGE_SIZES.letter;
    const landscape = String(orientation || "landscape").toLowerCase() === "landscape";
    return {
      pageSize:String(pageSize || "letter").toLowerCase() in PAGE_SIZES ? String(pageSize || "letter").toLowerCase() : "letter",
      orientation:landscape ? "landscape" : "portrait",
      width:landscape ? base.height : base.width,
      height:landscape ? base.width : base.height
    };
  }

  function nodeDetails(node, fields) {
    if (!node || !node.animal) return [];
    const animal = node.animal;
    return (fields || []).filter(function (field) {
      return field !== "name" && field !== "photoData";
    }).map(function (field) {
      let value = animal[field];
      if (field === "variety") value = animal.variety || animal.color;
      if (field === "color") value = animal.color || animal.variety;
      if (value === "" || value === null || value === undefined) return null;
      const label = pedigree && pedigree.FIELD_LABELS ? (pedigree.FIELD_LABELS[field] || field) : field;
      return { label:asText(label), value:asText(value) };
    }).filter(Boolean);
  }

  function buildPedigreeLayout(graph, options) {
    if (!graph || !Array.isArray(graph.nodes)) throw new Error("A canonical pedigree graph is required.");
    const config = pedigree && pedigree.normalizePedigreeConfig
      ? pedigree.normalizePedigreeConfig(options && options.config)
      : Object.assign({ generations:Math.min(4, graph.generations || 4), rootFields:["name"], ancestorFields:["name"], photos:true }, options && options.config);
    const geometry = pageGeometry(options && options.pageSize, options && options.orientation || (config.generations >= 4 ? "landscape" : "portrait"));
    const branding = pedigree && pedigree.sanitizeBranding
      ? pedigree.sanitizeBranding(options && options.branding, "private")
      : Object.assign({}, options && options.branding);
    const margin = 24;
    const headerHeight = 58;
    const footerHeight = 24;
    const gap = 8;
    const contentTop = geometry.height - margin - headerHeight;
    const contentBottom = margin + footerHeight;
    const contentHeight = contentTop - contentBottom;
    const generationCount = Math.max(1, Math.min(config.generations, graph.generations || config.generations));
    const columnWidth = (geometry.width - margin * 2 - gap * (generationCount - 1)) / generationCount;
    const nodes = graph.nodes.filter(function (node) { return node.generation < generationCount; });
    const cards = [];
    const images = [];

    for (let generation = 0; generation < generationCount; generation += 1) {
      const generationNodes = nodes.filter(function (node) { return node.generation === generation; });
      const rowGap = 5;
      const rowHeight = generationNodes.length
        ? (contentHeight - rowGap * Math.max(0, generationNodes.length - 1)) / generationNodes.length
        : contentHeight;
      generationNodes.forEach(function (node, index) {
        const x = margin + generation * (columnWidth + gap);
        const yTop = contentTop - index * (rowHeight + rowGap);
        const y = yTop - rowHeight;
        const fields = generation === 0 ? config.rootFields : config.ancestorFields;
        const photoData = config.photos && node.animal ? asText(node.animal.photoData || "") : "";
        const imageKey = photoData ? "img-" + cards.length : "";
        const details = nodeDetails(node, fields).slice(0, Math.max(1, rowHeight > 80 ? 5 : rowHeight > 45 ? 3 : 1));
        const card = {
          path:node.path,
          generation,
          relation:node.relation,
          known:Boolean(node.known),
          cycle:Boolean(node.cycle),
          missingReference:Boolean(node.missingReference),
          name:node.animal ? asText(node.animal.name || "Unnamed animal") : (node.missingReference ? "Unavailable ancestor" : "Unknown ancestor"),
          details,
          x,y,width:columnWidth,height:rowHeight,
          imageKey,
          photoData
        };
        cards.push(card);
        if (photoData) images.push({ key:imageKey, dataUrl:photoData });
      });
    }

    const root = nodes.find(function (node) { return node.generation === 0; });
    return {
      schemaVersion:1,
      type:"pedigree",
      generatedAt:asText(options && options.generatedAt || new Date().toISOString()),
      title:asText(options && options.title || ((root && root.animal && root.animal.name) ? root.animal.name + " Pedigree" : "Pedigree")),
      geometry,
      branding,
      cards,
      images,
      footer:asText(options && options.footer || "Generated by HerdHarbor"),
      config
    };
  }

  function renderDocumentHtml(model) {
    if (!model || model.type !== "pedigree") throw new Error("Unsupported document model.");
    const widthIn = (model.geometry.width / 72).toFixed(3);
    const heightIn = (model.geometry.height / 72).toFixed(3);
    const accent = escapeHtml(model.branding && model.branding.accent || "#2E7D7B");
    const cards = model.cards.map(function (card) {
      const left = (card.x / 72).toFixed(3);
      const top = ((model.geometry.height - card.y - card.height) / 72).toFixed(3);
      const width = (card.width / 72).toFixed(3);
      const height = (card.height / 72).toFixed(3);
      const photo = card.photoData ? '<img src="' + escapeHtml(card.photoData) + '" alt="">' : "";
      const details = card.details.map(function (item) {
        return '<div><b>' + escapeHtml(item.label) + ':</b> ' + escapeHtml(truncate(item.value, 42)) + '</div>';
      }).join("");
      return '<article class="card' + (card.known ? '' : ' unknown') + '" style="left:' + left + 'in;top:' + top + 'in;width:' + width + 'in;height:' + height + 'in">' +
        photo + '<small>' + escapeHtml(card.relation) + '</small><strong>' + escapeHtml(truncate(card.name, 48)) + '</strong>' + details +
        (card.cycle ? '<em>Circular reference</em>' : '') + '</article>';
    }).join("");
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      escapeHtml(model.title) + '</title><style>@page{size:' + widthIn + 'in ' + heightIn + 'in;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#263746;font-family:Arial,sans-serif}.page{position:relative;width:' +
      widthIn + 'in;height:' + heightIn + 'in;overflow:hidden}.header{position:absolute;left:.333in;right:.333in;top:.23in;height:.64in;border-bottom:2px solid ' +
      accent + ';display:flex;align-items:center;justify-content:space-between}.header h1{margin:0;font-size:18px}.header span{font-size:10px}.card{position:absolute;padding:7px;border:1px solid #cfd8dc;border-left:3px solid ' +
      accent + ';border-radius:6px;overflow:hidden;background:#fff}.card.unknown{border-style:dashed;border-left-style:solid;color:#667783}.card img{float:left;width:34px;height:34px;object-fit:cover;border-radius:5px;margin:0 6px 4px 0}.card small{display:block;color:#667783;font-size:7px;text-transform:uppercase}.card strong{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card div{font-size:7px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card em{display:block;margin-top:3px;font-size:6px}.footer{position:absolute;left:.333in;right:.333in;bottom:.16in;text-align:right;color:#667783;font-size:7px}</style></head><body><div class="page"><div class="header"><div><h1>' +
      escapeHtml(model.title) + '</h1><span>' + escapeHtml(model.branding && model.branding.rabbitryName || "") + '</span></div><span>' +
      escapeHtml(model.branding && model.branding.website || "") + '</span></div>' + cards + '<div class="footer">' + escapeHtml(model.footer) + '</div></div></body></html>';
  }

  function base64Bytes(value) {
    const raw = asText(value);
    if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(raw, "base64"));
    if (typeof atob === "function") {
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i=0;i<binary.length;i+=1) bytes[i]=binary.charCodeAt(i);
      return bytes;
    }
    throw new Error("Base64 decoding is unavailable.");
  }

  function jpegInfo(dataUrl) {
    const match = /^data:image\/jpe?g;base64,(.+)$/i.exec(asText(dataUrl));
    if (!match) return null;
    const bytes = base64Bytes(match[1]);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        return {
          bytes,
          height:(bytes[offset + 5] << 8) + bytes[offset + 6],
          width:(bytes[offset + 7] << 8) + bytes[offset + 8]
        };
      }
      if (!length || length < 2) break;
      offset += 2 + length;
    }
    return null;
  }

  async function toJpegDataUrl(dataUrl, maxSide) {
    const value = asText(dataUrl);
    if (!value || /^data:image\/jpe?g;base64,/i.test(value)) return value;
    if (!/^data:image\/(?:png|webp);base64,/i.test(value)) return "";
    if (typeof document === "undefined" || typeof Image === "undefined") return "";
    const image = new Image();
    image.src = value;
    if (typeof image.decode === "function") await image.decode();
    else await new Promise(function (resolve, reject) { image.onload=resolve; image.onerror=reject; });
    const limit = Math.max(64, Number(maxSide || 900));
    const scale = Math.min(1, limit / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",0.86);
  }

  async function prepareDocumentImages(model) {
    const copy = JSON.parse(JSON.stringify(model));
    const byKey = new Map();
    for (const image of copy.images || []) {
      const prepared = await toJpegDataUrl(image.dataUrl, 1000).catch(function () { return ""; });
      if (prepared) byKey.set(image.key, prepared);
    }
    copy.images = [...byKey.entries()].map(function (entry) { return { key:entry[0], dataUrl:entry[1] }; });
    copy.cards.forEach(function (card) { card.photoData = byKey.get(card.imageKey) || ""; });
    return copy;
  }

  function pdfText(value) {
    return asText(value).replace(/[^\x20-\x7E\xA0-\xFF]/g,"?").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  }

  function buildPdfBytes(model) {
    if (!model || model.type !== "pedigree") throw new Error("Unsupported document model.");
    const encoder = new TextEncoder();
    const objects = [];
    const imageObjects = [];
    const imageMap = new Map();
    (model.images || []).forEach(function (image) {
      const info = jpegInfo(image.dataUrl);
      if (!info) return;
      imageMap.set(image.key, { name:"Im" + (imageObjects.length + 1), index:imageObjects.length, info });
      imageObjects.push(info);
    });

    const content = [];
    content.push("0.8 w 0.82 0.85 0.87 RG");
    content.push("BT /F2 16 Tf " + 24 + " " + (model.geometry.height - 35) + " Td (" + pdfText(truncate(model.title,80)) + ") Tj ET");
    if (model.branding && model.branding.rabbitryName) content.push("BT /F1 8 Tf 24 " + (model.geometry.height - 49) + " Td (" + pdfText(truncate(model.branding.rabbitryName,90)) + ") Tj ET");

    model.cards.forEach(function (card) {
      content.push(card.x.toFixed(2) + " " + card.y.toFixed(2) + " " + card.width.toFixed(2) + " " + card.height.toFixed(2) + " re S");
      let textX = card.x + 6;
      const imageRef = imageMap.get(card.imageKey);
      if (imageRef && card.height >= 36) {
        const size = Math.min(30, card.height - 10);
        content.push("q " + size.toFixed(2) + " 0 0 " + size.toFixed(2) + " " + (card.x + 6).toFixed(2) + " " + (card.y + card.height - size - 6).toFixed(2) + " cm /" + imageRef.name + " Do Q");
        textX += size + 5;
      }
      const top = card.y + card.height - 11;
      content.push("BT /F1 5 Tf " + textX.toFixed(2) + " " + top.toFixed(2) + " Td (" + pdfText(truncate(card.relation.toUpperCase(),24)) + ") Tj ET");
      content.push("BT /F2 8 Tf " + textX.toFixed(2) + " " + (top - 10).toFixed(2) + " Td (" + pdfText(truncate(card.name,36)) + ") Tj ET");
      let lineY = top - 20;
      card.details.slice(0,4).forEach(function (detail) {
        if (lineY <= card.y + 6) return;
        content.push("BT /F1 5.5 Tf " + (card.x + 6).toFixed(2) + " " + lineY.toFixed(2) + " Td (" + pdfText(truncate(detail.label + ": " + detail.value,54)) + ") Tj ET");
        lineY -= 7;
      });
    });
    content.push("BT /F1 6 Tf 24 12 Td (" + pdfText(truncate(model.footer,120)) + ") Tj ET");
    const contentBytes = encoder.encode(content.join("\n") + "\n");

    const imageStartId = 6;
    const contentId = imageStartId + imageObjects.length;
    const xobjects = imageObjects.map(function (_, index) { return "/Im" + (index+1) + " " + (imageStartId+index) + " 0 R"; }).join(" ");
    objects[1] = encoder.encode("<< /Type /Catalog /Pages 2 0 R >>");
    objects[2] = encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objects[3] = encoder.encode("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + model.geometry.width.toFixed(2) + " " + model.geometry.height.toFixed(2) + "] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << " + xobjects + " >> >> /Contents " + contentId + " 0 R >>");
    objects[4] = encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects[5] = encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    imageObjects.forEach(function (info,index) {
      const header = encoder.encode("<< /Type /XObject /Subtype /Image /Width " + info.width + " /Height " + info.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + info.bytes.length + " >>\nstream\n");
      const footer = encoder.encode("\nendstream");
      const combined = new Uint8Array(header.length + info.bytes.length + footer.length);
      combined.set(header,0); combined.set(info.bytes,header.length); combined.set(footer,header.length+info.bytes.length);
      objects[imageStartId + index] = combined;
    });
    objects[contentId] = encoder.encode("<< /Length " + contentBytes.length + " >>\nstream\n" + content.join("\n") + "\nendstream");

    const chunks = [encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
    const offsets = [0];
    let total = chunks[0].length;
    for (let id=1;id<=contentId;id+=1) {
      offsets[id]=total;
      const head=encoder.encode(id + " 0 obj\n");
      const tail=encoder.encode("\nendobj\n");
      chunks.push(head, objects[id], tail);
      total += head.length + objects[id].length + tail.length;
    }
    const xrefOffset=total;
    let xref="xref\n0 " + (contentId+1) + "\n0000000000 65535 f \n";
    for (let id=1;id<=contentId;id+=1) xref += String(offsets[id]).padStart(10,"0") + " 00000 n \n";
    xref += "trailer\n<< /Size " + (contentId+1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n";
    chunks.push(encoder.encode(xref));
    const length=chunks.reduce(function (sum,chunk) { return sum+chunk.length; },0);
    const output=new Uint8Array(length);
    let cursor=0;
    chunks.forEach(function (chunk) { output.set(chunk,cursor); cursor+=chunk.length; });
    return output;
  }

  async function downloadPdf(model, fileName) {
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") throw new Error("PDF download requires a browser.");
    const prepared=await prepareDocumentImages(model);
    const bytes=buildPdfBytes(prepared);
    const blob=new Blob([bytes],{type:"application/pdf"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;
    anchor.download=asText(fileName || model.title || "herdharbor-pedigree").replace(/[^a-z0-9._-]+/gi,"-") + ".pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); },0);
    return bytes.length;
  }

  function openPrintPreview(model) {
    if (typeof window === "undefined") throw new Error("Print preview requires a browser.");
    const html=renderDocumentHtml(model);
    const popup=window.open("","_blank");
    if (!popup) return { html, popup:null };
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    return { html, popup };
  }


  function birthCertificateField(label, value) {
    const text=asText(value).trim();
    return text ? { label:asText(label), value:text } : null;
  }

  function buildBirthCertificateModel(options) {
    const raw=options && typeof options === "object" ? options : {};
    const animal=raw.animal && typeof raw.animal === "object" ? raw.animal : {};
    const branding=pedigree && pedigree.sanitizeBranding
      ? pedigree.sanitizeBranding(raw.branding, "private")
      : Object.assign({}, raw.branding || {});
    const geometry=pageGeometry(raw.pageSize || "letter", raw.orientation || "portrait");
    const fields=[
      birthCertificateField("Date of birth", animal.dob),
      birthCertificateField("Sex", animal.sex),
      birthCertificateField("Breed", animal.breed),
      birthCertificateField("Color / variety", animal.color || animal.variety),
      birthCertificateField("ID / tattoo", animal.tattoo || animal.earTagNumber || animal.tag),
      birthCertificateField("Birth weight", raw.birthWeight || animal.birthWeight),
      birthCertificateField("Current weight", raw.currentWeight || animal.weight || animal.currentWeight),
      birthCertificateField("Sire", raw.sireName),
      birthCertificateField("Dam", raw.damName),
      birthCertificateField("Go-home date", raw.goHomeDate),
      birthCertificateField("New owner", raw.newOwnerName)
    ].filter(Boolean);
    return {
      schemaVersion:1,
      type:"birthCertificate",
      generatedAt:asText(raw.generatedAt || new Date().toISOString()),
      title:asText(raw.title || "Birth Certificate"),
      geometry,
      branding,
      animal:{
        name:asText(animal.name || "Unnamed animal"),
        photoData:asText(animal.photoData || animal.photoUrl || "")
      },
      fields,
      breederName:asText(raw.breederName || branding.rabbitryName || ""),
      breederNote:asText(raw.breederNote || ""),
      signatureLabel:raw.signatureLine === false ? "" : asText(raw.signatureLabel || "Breeder signature"),
      qrTarget:asText(raw.qrTarget || ""),
      contact:{
        email:branding.includeEmail ? asText(branding.email) : "",
        phone:branding.includePhone ? asText(branding.phone) : "",
        website:asText(branding.website || ""),
        social:asText(branding.social || "")
      }
    };
  }

  function renderBirthCertificateHtml(model) {
    if (!model || model.type !== "birthCertificate") throw new Error("A birth certificate model is required.");
    const widthIn=(model.geometry.width/72).toFixed(3);
    const heightIn=(model.geometry.height/72).toFixed(3);
    const accent=escapeHtml(model.branding && model.branding.accent || "#2E7D7B");
    const fields=(model.fields || []).map(function (item) {
      return '<div class="bc-field"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(truncate(item.value,70)) + '</strong></div>';
    }).join("");
    const photo=model.animal && model.animal.photoData
      ? '<img class="bc-photo" src="' + escapeHtml(model.animal.photoData) + '" alt="">'
      : '<div class="bc-photo bc-placeholder">HH</div>';
    const contacts=[
      model.contact && model.contact.email,
      model.contact && model.contact.phone,
      model.contact && model.contact.website,
      model.contact && model.contact.social
    ].filter(Boolean).map(escapeHtml).join(" · ");
    const qrNote=model.qrTarget ? '<div class="bc-qr" data-qr-target="' + escapeHtml(model.qrTarget) + '">QR-ready transfer / animal link</div>' : "";
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      escapeHtml(model.title) + '</title><style>@page{size:' + widthIn + 'in ' + heightIn + 'in;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#263746;font-family:Arial,sans-serif}.page{width:' +
      widthIn + 'in;height:' + heightIn + 'in;padding:.42in;display:flex;flex-direction:column}.frame{flex:1;border:3px solid ' + accent +
      ';border-radius:18px;padding:.34in}.bc-head{text-align:center;border-bottom:1px solid #d9e1e4;padding-bottom:.18in}.bc-head h1{margin:0;font-size:26px}.bc-head p{margin:5px 0 0;color:#667783}.bc-animal{display:grid;grid-template-columns:1.35in 1fr;gap:.22in;align-items:start;padding:.24in 0}.bc-photo{width:1.35in;height:1.35in;object-fit:cover;border-radius:14px;border:1px solid #d9e1e4}.bc-placeholder{display:grid;place-items:center;background:#f1f5f5;color:' +
      accent + ';font-size:28px;font-weight:900}.bc-name{font-size:24px;margin:0 0 .12in}.bc-grid{display:grid;grid-template-columns:1fr 1fr;gap:.1in}.bc-field{padding:.1in;border:1px solid #e0e5e7;border-radius:9px}.bc-field span{display:block;color:#667783;font-size:8px;font-weight:700;text-transform:uppercase}.bc-field strong{display:block;margin-top:2px;font-size:11px;overflow-wrap:anywhere}.bc-note{margin-top:.18in;padding:.14in;background:#f7f3ea;border-radius:10px;font-size:10px}.bc-footer{margin-top:auto;padding-top:.22in;display:flex;justify-content:space-between;gap:.2in;align-items:end}.bc-signature{min-width:2.1in;border-top:1px solid #263746;padding-top:5px;font-size:8px}.bc-contact{text-align:right;font-size:8px;color:#667783}.bc-qr{margin-top:5px;font-size:7px;font-weight:700}</style></head><body><div class="page"><section class="frame"><header class="bc-head"><h1>' +
      escapeHtml(model.title) + '</h1><p>' + escapeHtml(model.breederName) + '</p></header><div class="bc-animal">' + photo +
      '<div><h2 class="bc-name">' + escapeHtml(truncate(model.animal && model.animal.name,80)) + '</h2><div class="bc-grid">' + fields +
      '</div></div></div>' + (model.breederNote ? '<div class="bc-note">' + escapeHtml(model.breederNote) + '</div>' : '') +
      '<footer class="bc-footer">' + (model.signatureLabel ? '<div class="bc-signature">' + escapeHtml(model.signatureLabel) + '</div>' : '<div></div>') +
      '<div class="bc-contact">' + contacts + qrNote + '</div></footer></section></div></body></html>';
  }

  function buildBirthCertificatePdfBytes(model) {
    if (!model || model.type !== "birthCertificate") throw new Error("A birth certificate model is required.");
    const encoder=new TextEncoder();
    const lines=[];
    const left=42;
    const top=model.geometry.height-52;
    lines.push("1.4 w 0.18 0.49 0.48 RG 30 30 " + (model.geometry.width-60).toFixed(2) + " " + (model.geometry.height-60).toFixed(2) + " re S");
    lines.push("BT /F2 22 Tf " + left + " " + top + " Td (" + pdfText(truncate(model.title,70)) + ") Tj ET");
    lines.push("BT /F1 10 Tf " + left + " " + (top-18) + " Td (" + pdfText(truncate(model.breederName,90)) + ") Tj ET");
    lines.push("BT /F2 18 Tf " + left + " " + (top-58) + " Td (" + pdfText(truncate(model.animal && model.animal.name,70)) + ") Tj ET");
    let y=top-86;
    (model.fields || []).forEach(function (item,index) {
      const x=index % 2 === 0 ? left : Math.max(left+220,model.geometry.width/2+4);
      if (index % 2 === 0 && index > 0) y-=28;
      lines.push("BT /F1 7 Tf " + x.toFixed(2) + " " + y.toFixed(2) + " Td (" + pdfText(truncate(item.label.toUpperCase(),30)) + ") Tj ET");
      lines.push("BT /F2 10 Tf " + x.toFixed(2) + " " + (y-11).toFixed(2) + " Td (" + pdfText(truncate(item.value,48)) + ") Tj ET");
    });
    y-=46;
    if (model.breederNote) lines.push("BT /F1 8 Tf " + left + " " + y.toFixed(2) + " Td (" + pdfText(truncate(model.breederNote,110)) + ") Tj ET");
    const contacts=[model.contact && model.contact.email,model.contact && model.contact.phone,model.contact && model.contact.website,model.contact && model.contact.social].filter(Boolean).join(" | ");
    if (contacts) lines.push("BT /F1 7 Tf " + left + " 46 Td (" + pdfText(truncate(contacts,120)) + ") Tj ET");
    if (model.signatureLabel) {
      lines.push(left + " 72 180 0 re S");
      lines.push("BT /F1 7 Tf " + left + " 60 Td (" + pdfText(model.signatureLabel) + ") Tj ET");
    }
    if (model.qrTarget) lines.push("BT /F1 6 Tf " + left + " 36 Td (QR-ready transfer / animal link) Tj ET");

    const content=lines.join("\n")+"\n";
    const objects=[];
    objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
    objects[2]="<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objects[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + model.geometry.width.toFixed(2) + " " + model.geometry.height.toFixed(2) + "] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>";
    objects[4]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    objects[6]="<< /Length " + encoder.encode(content).length + " >>\nstream\n" + content + "endstream";
    const chunks=[encoder.encode("%PDF-1.4\n")];
    const offsets=[0];
    let total=chunks[0].length;
    for(let id=1;id<=6;id+=1){
      offsets[id]=total;
      const part=encoder.encode(id+" 0 obj\n"+objects[id]+"\nendobj\n");
      chunks.push(part); total+=part.length;
    }
    const xrefOffset=total;
    let xref="xref\n0 7\n0000000000 65535 f \n";
    for(let id=1;id<=6;id+=1) xref+=String(offsets[id]).padStart(10,"0")+" 00000 n \n";
    xref+="trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n"+xrefOffset+"\n%%EOF\n";
    chunks.push(encoder.encode(xref));
    const length=chunks.reduce(function(sum,part){return sum+part.length;},0);
    const out=new Uint8Array(length); let cursor=0;
    chunks.forEach(function(part){out.set(part,cursor);cursor+=part.length;});
    return out;
  }

  function birthCertificatePreview(options) {
    const model=buildBirthCertificateModel(options);
    return { model, html:renderBirthCertificateHtml(model) };
  }


  function buildRecordDocumentModel(options) {
    const raw=options && typeof options==="object" ? options : {};
    const branding=pedigree && pedigree.sanitizeBranding
      ? pedigree.sanitizeBranding(raw.branding,"private")
      : Object.assign({},raw.branding||{});
    const fields=(Array.isArray(raw.fields)?raw.fields:[]).map(function(item){
      if(!item || item.value===null || item.value===undefined || String(item.value).trim()==="") return null;
      return {label:asText(item.label),value:asText(item.value)};
    }).filter(Boolean);
    return {
      schemaVersion:1,
      type:asText(raw.type||"recordDocument"),
      title:asText(raw.title||"HerdHarbor Record"),
      subtitle:asText(raw.subtitle||""),
      geometry:pageGeometry(raw.pageSize||"letter",raw.orientation||"portrait"),
      branding,
      fields,
      notes:asText(raw.notes||""),
      signatureLabel:raw.signatureLine===false?"":asText(raw.signatureLabel||"Signature"),
      qrTarget:asText(raw.qrTarget||""),
      generatedAt:asText(raw.generatedAt||new Date().toISOString())
    };
  }

  function renderRecordDocumentHtml(model) {
    const widthIn=(model.geometry.width/72).toFixed(3);
    const heightIn=(model.geometry.height/72).toFixed(3);
    const accent=escapeHtml(model.branding?.accent||"#2E7D7B");
    const fields=model.fields.map(function(item){
      return '<div class="rd-field"><span>'+escapeHtml(item.label)+'</span><strong>'+escapeHtml(truncate(item.value,90))+'</strong></div>';
    }).join("");
    const contacts=[
      model.branding?.includeEmail ? model.branding?.email : "",
      model.branding?.includePhone ? model.branding?.phone : "",
      model.branding?.website,
      model.branding?.social
    ].filter(Boolean).map(escapeHtml).join(" · ");
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+
      escapeHtml(model.title)+'</title><style>@page{size:'+widthIn+'in '+heightIn+'in;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#263746;font-family:Arial,sans-serif}.page{width:'+widthIn+'in;height:'+heightIn+'in;padding:.42in}.frame{height:100%;border:2px solid '+accent+';border-radius:16px;padding:.3in;display:flex;flex-direction:column}.head{border-bottom:1px solid #d9e1e4;padding-bottom:.15in}.head h1{margin:0;font-size:24px}.head p{margin:5px 0 0;color:#667783}.grid{display:grid;grid-template-columns:1fr 1fr;gap:.1in;margin-top:.22in}.rd-field{padding:.1in;border:1px solid #e0e5e7;border-radius:8px}.rd-field span{display:block;color:#667783;font-size:8px;text-transform:uppercase;font-weight:700}.rd-field strong{display:block;margin-top:3px;font-size:11px;overflow-wrap:anywhere}.notes{margin-top:.18in;padding:.14in;background:#f7f3ea;border-radius:8px;font-size:10px}.foot{margin-top:auto;padding-top:.25in;display:flex;justify-content:space-between;gap:.2in;align-items:end}.sig{min-width:2.1in;border-top:1px solid #263746;padding-top:5px;font-size:8px}.contact{text-align:right;color:#667783;font-size:8px}.qr{margin-top:5px;font-size:7px;font-weight:700}</style></head><body><div class="page"><section class="frame"><header class="head"><h1>'+
      escapeHtml(model.title)+'</h1><p>'+escapeHtml(model.subtitle)+'</p></header><div class="grid">'+fields+'</div>'+
      (model.notes?'<div class="notes">'+escapeHtml(model.notes)+'</div>':'')+'<footer class="foot">'+
      (model.signatureLabel?'<div class="sig">'+escapeHtml(model.signatureLabel)+'</div>':'<div></div>')+
      '<div class="contact">'+contacts+(model.qrTarget?'<div class="qr" data-qr-target="'+escapeHtml(model.qrTarget)+'">QR-ready transfer link</div>':'')+
      '</div></footer></section></div></body></html>';
  }

  function buildRecordDocumentPdfBytes(model) {
    const encoder=new TextEncoder();
    const lines=[];
    const left=42;
    const top=model.geometry.height-52;
    lines.push("1.2 w 0.18 0.49 0.48 RG 30 30 "+(model.geometry.width-60).toFixed(2)+" "+(model.geometry.height-60).toFixed(2)+" re S");
    lines.push("BT /F2 20 Tf "+left+" "+top+" Td ("+pdfText(truncate(model.title,72))+") Tj ET");
    if(model.subtitle) lines.push("BT /F1 9 Tf "+left+" "+(top-18)+" Td ("+pdfText(truncate(model.subtitle,100))+") Tj ET");
    let y=top-55;
    model.fields.forEach(function(item,index){
      const x=index%2===0?left:Math.max(left+220,model.geometry.width/2+4);
      if(index%2===0 && index>0)y-=28;
      lines.push("BT /F1 7 Tf "+x.toFixed(2)+" "+y.toFixed(2)+" Td ("+pdfText(truncate(item.label.toUpperCase(),32))+") Tj ET");
      lines.push("BT /F2 9 Tf "+x.toFixed(2)+" "+(y-11).toFixed(2)+" Td ("+pdfText(truncate(item.value,52))+") Tj ET");
    });
    if(model.notes){
      y-=42;
      lines.push("BT /F1 8 Tf "+left+" "+y.toFixed(2)+" Td ("+pdfText(truncate(model.notes,115))+") Tj ET");
    }
    if(model.signatureLabel){
      lines.push(left+" 72 180 0 re S");
      lines.push("BT /F1 7 Tf "+left+" 60 Td ("+pdfText(model.signatureLabel)+") Tj ET");
    }
    if(model.qrTarget) lines.push("BT /F1 6 Tf "+left+" 36 Td (QR-ready transfer link) Tj ET");
    const content=lines.join("\n")+"\n";
    const objects=[];
    objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
    objects[2]="<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objects[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+model.geometry.width.toFixed(2)+" "+model.geometry.height.toFixed(2)+"] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>";
    objects[4]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    objects[6]="<< /Length "+encoder.encode(content).length+" >>\nstream\n"+content+"endstream";
    const chunks=[encoder.encode("%PDF-1.4\n")],offsets=[0];
    let total=chunks[0].length;
    for(let id=1;id<=6;id+=1){offsets[id]=total;const part=encoder.encode(id+" 0 obj\n"+objects[id]+"\nendobj\n");chunks.push(part);total+=part.length;}
    const xrefOffset=total;
    let xref="xref\n0 7\n0000000000 65535 f \n";
    for(let id=1;id<=6;id+=1)xref+=String(offsets[id]).padStart(10,"0")+" 00000 n \n";
    xref+="trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n"+xrefOffset+"\n%%EOF\n";
    chunks.push(encoder.encode(xref));
    const length=chunks.reduce(function(sum,part){return sum+part.length;},0),out=new Uint8Array(length);
    let cursor=0;chunks.forEach(function(part){out.set(part,cursor);cursor+=part.length;});
    return out;
  }

  function buildSaleTransferRecordModel(options) {
    const raw=options && typeof options==="object" ? options : {};
    const animal=raw.animal||{};
    return buildRecordDocumentModel({
      type:"saleTransferRecord",
      title:"Sale / Transfer Record",
      subtitle:raw.sellerName||raw.branding?.rabbitryName||"HerdHarbor",
      branding:raw.branding,
      qrTarget:raw.qrTarget,
      signatureLabel:"Seller / breeder signature",
      notes:raw.notes||"",
      fields:[
        {label:"Animal",value:animal.name},
        {label:"Animal ID / tattoo",value:animal.tattoo||animal.earTagNumber||animal.tag},
        {label:"Breed",value:animal.breed},
        {label:"Sex",value:animal.sex},
        {label:"Date of birth",value:animal.dob},
        {label:"Color / variety",value:animal.color||animal.variety},
        {label:"Buyer",value:raw.buyerName},
        {label:"Sale date",value:raw.saleDate},
        {label:"Sale number",value:raw.saleNumber},
        {label:"Transfer ID",value:raw.transferId},
        {label:"Pedigree included",value:raw.pedigreeIncluded===false?"No":"Yes"},
        {label:"Transfer method",value:raw.transferMethod||""}
      ]
    });
  }

  function buildAnimalInformationSheetModel(options) {
    const raw=options && typeof options==="object" ? options : {};
    const animal=raw.animal||{};
    return buildRecordDocumentModel({
      type:"animalInformationSheet",
      title:"Animal Information Sheet",
      subtitle:raw.branding?.rabbitryName||raw.operationName||"HerdHarbor",
      branding:raw.branding,
      qrTarget:raw.qrTarget,
      signatureLine:false,
      notes:raw.includeNotes===true ? asText(animal.notes||"") : "",
      fields:[
        {label:"Animal",value:animal.name},
        {label:"Species",value:animal.species},
        {label:"Breed",value:animal.breed},
        {label:"Sex",value:animal.sex},
        {label:"Date of birth",value:animal.dob},
        {label:"Color / variety",value:animal.color||animal.variety},
        {label:"ID / tattoo",value:animal.tattoo||animal.earTagNumber||animal.tag},
        {label:"Registration",value:animal.registrationNumber},
        {label:"Breeder",value:animal.breeder},
        {label:"Sire",value:raw.sireName},
        {label:"Dam",value:raw.damName},
        {label:"Current weight",value:animal.weight||animal.currentWeight}
      ]
    });
  }


  const DOCUMENT_TYPES = Object.freeze({
    pedigree:Object.freeze({ id:"pedigree", label:"Pedigree", enabled:true }),
    birthCertificate:Object.freeze({ id:"birthCertificate", label:"Birth Certificate", enabled:true }),
    saleTransferRecord:Object.freeze({ id:"saleTransferRecord", label:"Sale / Transfer Record", enabled:true }),
    animalInformationSheet:Object.freeze({ id:"animalInformationSheet", label:"Animal Information Sheet", enabled:true }),
    healthSummary:Object.freeze({ id:"healthSummary", label:"Health Summary", enabled:false }),
    breedingRecord:Object.freeze({ id:"breedingRecord", label:"Breeding Record", enabled:false }),
    litterRecord:Object.freeze({ id:"litterRecord", label:"Litter Record", enabled:false })
  });

  function downloadBytes(bytes, fileName, mimeType) {
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") throw new Error("Download requires a browser.");
    const blob=new Blob([bytes],{type:mimeType || "application/octet-stream"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;
    anchor.download=asText(fileName || "herdharbor-document").replace(/[^a-z0-9._-]+/gi,"-");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},0);
    return bytes.length;
  }

  function activeDocumentTypes() {
    return Object.values(DOCUMENT_TYPES).filter(function (item) { return item.enabled; });
  }

  function futureDocumentTypes() {
    return Object.values(DOCUMENT_TYPES).filter(function (item) { return !item.enabled; });
  }

  function renderHub(context) {
    const ctx=context && typeof context === "object" ? context : {};
    const target=ctx.target;
    if (!target) throw new Error("Document Center target is required.");
    const state=ctx.state && typeof ctx.state === "object" ? ctx.state : {};
    const animals=Array.isArray(state.animals) ? state.animals : [];
    const esc=typeof ctx.escapeHtml === "function" ? ctx.escapeHtml : escapeHtml;
    const options=animals.slice().sort(function(a,b){return asText(a.name).localeCompare(asText(b.name));}).map(function(animal){
      return '<option value="' + esc(animal.id) + '">' + esc(animal.name || animal.tag || "Unnamed animal") + '</option>';
    }).join("");
    const future=futureDocumentTypes().map(function(item){return '<span class="badge">' + esc(item.label) + '</span>';}).join("");
    target.innerHTML=
      '<div class="page-header"><div><p class="eyebrow">HerdHarbor</p><h2>Documents</h2><p>Create consistent records from the same animal and pedigree data already in HerdHarbor.</p></div></div>' +
      '<div class="cards-grid hh-document-grid">' +
        '<article class="panel"><div class="panel-header"><div><h3>Pedigree</h3><small>Customizable pedigree preview, print, and PDF</small></div></div>' +
          '<label>Animal<select id="hh-document-pedigree-animal"><option value="">Choose an animal</option>' + options + '</select></label>' +
          '<div class="modal-actions"><button type="button" class="button button-ghost" id="hh-document-pedigree-preview">Preview</button><button type="button" class="button button-primary" id="hh-document-pedigree-pdf">Download PDF</button></div>' +
        '</article>' +
        '<article class="panel"><div class="panel-header"><div><h3>Birth Certificate</h3><small>Buyer-ready certificate with privacy-safe contact defaults</small></div></div>' +
          '<label>Animal<select id="hh-document-birth-animal"><option value="">Choose an animal</option>' + options + '</select></label>' +
          '<label>New owner (optional)<input id="hh-document-birth-owner" type="text" maxlength="120"></label>' +
          '<label>Go-home date (optional)<input id="hh-document-birth-date" type="date"></label>' +
          '<div class="modal-actions"><button type="button" class="button button-ghost" id="hh-document-birth-preview">Preview</button><button type="button" class="button button-primary" id="hh-document-birth-pdf">Download PDF</button></div>' +
        '</article>' +
      '</div>' +
      '<section class="panel"><div class="panel-header"><div><h3>Document foundation</h3><small>Reserved extension points reuse this same engine as they are released.</small></div></div><div class="badge-row">' + future + '</div></section>';

    function selectedAnimal(selectId) {
      const id=target.querySelector(selectId)?.value || "";
      return animals.find(function(animal){return String(animal.id)===String(id);}) || null;
    }
    function requireAnimal(selectId) {
      const animal=selectedAnimal(selectId);
      if (!animal) {
        if (typeof ctx.toast === "function") ctx.toast("Choose an animal first.","error");
        return null;
      }
      return animal;
    }
    function brandingFromState() {
      return {
        rabbitryName:state.profile?.operationName || state.profile?.rabbitryName || "",
        logoData:state.profile?.logoData || "",
        website:state.profile?.website || "",
        social:state.profile?.social || "",
        email:state.profile?.email || "",
        phone:state.profile?.phone || "",
        includeEmail:false,
        includePhone:false
      };
    }
    function pedigreeModel(animal) {
      if (!pedigree || typeof pedigree.buildPedigreeGraph !== "function") throw new Error("Pedigree engine is unavailable.");
      const graph=pedigree.buildPedigreeGraph({animals,rootId:animal.id,generations:4});
      return buildPedigreeLayout(graph,{config:{templateId:"classic",generations:4},branding:brandingFromState()});
    }
    function certificateModel(animal) {
      const sire=animals.find(function(item){return String(item.id)===String(animal.sireId || "");});
      const dam=animals.find(function(item){return String(item.id)===String(animal.damId || "");});
      return buildBirthCertificateModel({
        animal,
        sireName:sire?.name || "",
        damName:dam?.name || "",
        newOwnerName:target.querySelector("#hh-document-birth-owner")?.value || "",
        goHomeDate:target.querySelector("#hh-document-birth-date")?.value || "",
        breederName:state.profile?.operationName || state.profile?.rabbitryName || "",
        branding:brandingFromState()
      });
    }

    target.querySelector("#hh-document-pedigree-preview")?.addEventListener("click",function(){
      const animal=requireAnimal("#hh-document-pedigree-animal"); if(!animal) return;
      openPrintPreview(pedigreeModel(animal));
    });
    target.querySelector("#hh-document-pedigree-pdf")?.addEventListener("click",async function(){
      const animal=requireAnimal("#hh-document-pedigree-animal"); if(!animal) return;
      await downloadPdf(pedigreeModel(animal), (animal.name || "animal") + "-pedigree");
    });
    target.querySelector("#hh-document-birth-preview")?.addEventListener("click",function(){
      const animal=requireAnimal("#hh-document-birth-animal"); if(!animal) return;
      const model=certificateModel(animal);
      if (typeof window === "undefined") return;
      const popup=window.open("","_blank");
      if (!popup) return;
      popup.document.open(); popup.document.write(renderBirthCertificateHtml(model)); popup.document.close();
    });
    target.querySelector("#hh-document-birth-pdf")?.addEventListener("click",function(){
      const animal=requireAnimal("#hh-document-birth-animal"); if(!animal) return;
      const bytes=buildBirthCertificatePdfBytes(certificateModel(animal));
      downloadBytes(bytes,(animal.name || "animal")+"-birth-certificate.pdf","application/pdf");
    });
    return target;
  }

  return Object.freeze({
    VERSION,
    PAGE_SIZES,
    pageGeometry,
    truncate,
    buildPedigreeLayout,
    renderDocumentHtml,
    jpegInfo,
    toJpegDataUrl,
    prepareDocumentImages,
    buildPdfBytes,
    downloadPdf,
    openPrintPreview,
    buildBirthCertificateModel,
    renderBirthCertificateHtml,
    buildBirthCertificatePdfBytes,
    birthCertificatePreview,
    DOCUMENT_TYPES,
    activeDocumentTypes,
    futureDocumentTypes,
    downloadBytes,
    renderHub
  });
});
