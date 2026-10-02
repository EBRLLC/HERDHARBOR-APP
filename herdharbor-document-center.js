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
    openPrintPreview
  });
});
