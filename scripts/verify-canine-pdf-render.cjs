"use strict";
// Headless browser PDF acceptance for the 2.0.1 canine-only release.
// It exercises the real pedigree source, not a hand-authored HTML fixture.
// Chromium is not an iOS/Android printing certification.
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const engine = require("../pedigree-engine-v2.0.0.js");
const standard = require("../standard-pedigree-print-v2.0.0.js");
const canine = require("../canine-identity-v2.0.1.js");
const lineage = require("../canine-lineage-v2.0.1.js");
const printer = require("../canine-pedigree-print-v2.0.1.js");
const deps = { engine, standard, canine, lineage };

function available(binary) {
  // GitHub runners may be CPU-starved while the parallel PostgreSQL/Android
  // jobs start. A four-second Chrome startup probe intermittently timed out
  // even though /usr/bin/google-chrome was present. Still require actual
  // executable/version and real generated PDF output; never skip rendering.
  const result = cp.spawnSync(binary, ["--version"], { encoding:"utf8", timeout:15000 });
  if (result.error || result.status !== 0) {
    console.warn("Chrome version probe unavailable for", binary,
      result.error?.code || ("exit-"+result.status));
    return false;
  }
  return true;
}
const chrome = [process.env.HERDHARBOR_CHROME_PATH, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
  .filter(Boolean).find(available);
assert.ok(chrome, "A Chromium/Chrome browser is required to render real canine PDFs.");
assert.equal(cp.spawnSync("sh", ["-c", "command -v pdftotext"], {encoding:"utf8",timeout:4000}).status, 0, "Install poppler-utils (pdftotext) for printable-content verification.");
const dogs = [{
  id:"dog-subject",species:"Dog",sex:"Female",name:"Journey",
  sireId:"male-0",damId:"female-0",breed:"Golden Retriever",
  canine:{
    registeredName:"HerdHarbor Long Registered Journey of Kentucky",
    registrations:[{ id:"r1",registry:"AKC",number:"123456789" }],
    titles:[{organization:"AKC",abbreviation:"CH",placement:"prefix",displayOrder:1},
      {organization:"AKC",abbreviation:"CGC",placement:"suffix",displayOrder:2}],
  },
}];
for (let generation=0;generation<3;generation++) {
  for (const [prefix,sex] of [["male","Male"],["female","Female"]]) {
    dogs.push({
      id:`${prefix}-${generation}`,species:"Dog",sex,breed:"Golden Retriever",
      name:`${sex} ancestor ${generation}`,
      sireId:generation<2?`male-${generation+1}`:"",
      damId:generation<2?`female-${generation+1}`:"",
      canine:{registeredName:`Verified print ancestor ${prefix} ${generation} ${"Family Line ".repeat(5)}`},
    });
  }
}
assert.equal(lineage.validate(dogs,dogs[0]).valid,true,"Fixture canine pedigree must be valid.");
const temp = fs.mkdtempSync(path.join(os.tmpdir(),"herdharbor-print-"));
try {
  for (const generations of [3,4]) {
    for (const paperSize of ["letter","a4"]) {
      const label=`${generations}-${paperSize}`;
      const html=printer.buildDocument({
        animals:dogs,subjectId:"dog-subject",generations,paperSize,
        generatedDate:"2026-10-26",operationName:"HerdHarbor PDF QA",...deps,
      }).html;
      assert.match(html, /hh-canine-appendix/);
      assert.doesNotMatch(html, /class="sale-strip"|class="certification"/);
      const input=path.join(temp,`canine-${label}.html`);
      const output=path.join(temp,`canine-${label}.pdf`);
      fs.writeFileSync(input,html);
      const run=cp.spawnSync(chrome,[
        "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
        "--no-pdf-header-footer",`--print-to-pdf=${output}`,
        pathToFileURL(input).href,
      ],{encoding:"utf8",timeout:45000});
      assert.equal(run.status,0,`Chrome failed ${label}: ${run.error?.message||run.stderr?.slice(-1800)}`);
      assert.ok(fs.statSync(output).size>2000,`Empty or truncated PDF: ${label}`);
      const extracted=cp.spawnSync("pdftotext",["-layout",output,"-"],{
        encoding:"utf8",timeout:15000
      });
      assert.equal(extracted.status,0,`Unreadable PDF ${label}: ${extracted.stderr}`);
      const text=extracted.stdout.replace(/\s+/g," ").trim();
      for (const phrase of ["Journey of Kentucky","Complete canine pedigree details",
        "not an official AKC-certified document","ancestor male 0","ancestor female 0"]) {
        assert.ok(text.includes(phrase),`PDF ${label} has missing or clipped printable text: ${phrase}`);
      }
      assert.match(text,/CH HerdHarbor Long Registered Journey/,`Missing prefix/title in ${label}`);
      assert.match(text,/CGC/,`Missing suffix/title in ${label}`);
      console.log(`Actual ${label} PDF validated: ${fs.statSync(output).size} bytes`);
    }
  }
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
