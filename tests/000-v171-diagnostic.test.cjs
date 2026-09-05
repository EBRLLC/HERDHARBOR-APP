"use strict";
const fs=require("node:fs");
const path=require("node:path");
const dir=__dirname;
const needles=["1\\.7\\.0","1.7.0","arba-standards-1","versionCode 13","pwa.js?v=28","current-release-reference-audit-v1.7.0"];
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith(".test.cjs")&&n!==path.basename(__filename)).sort()){
  const lines=fs.readFileSync(path.join(dir,name),"utf8").split(/\r?\n/);
  lines.forEach((line,index)=>{if(needles.some(n=>line.includes(n)))console.log(`[v171-stale] ${name}:${index+1}: ${line.trim()}`);});
}
console.log("v1.7.1 stale-reference diagnostic complete");
