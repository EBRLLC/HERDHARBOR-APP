import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {existsSync} from "node:fs";

const here=dirname(fileURLToPath(import.meta.url));
const fixture=resolve(here,"../tests/fixtures/core-button-browser-smoke.html");
if(!existsSync(fixture))throw Error("Core button browser fixture missing");
const candidates=[process.env.CHROME_BIN,"google-chrome","chromium","chromium-browser"].filter(Boolean);
let html="",browser="";
for(const executable of candidates){
 try {
  html=execFileSync(executable,[
    "--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--disable-background-networking","--no-first-run","--virtual-time-budget=4000",
    "--dump-dom",new URL("file://"+fixture).href
  ],{encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024,stdio:["ignore","pipe","pipe"]});
  browser=executable;break;
 }catch(error){
  if(error.code==="ENOENT")continue;
  throw Error("Core action Chromium run failed: "+String(error.stderr||error.message));
 }
}
if(!browser)throw Error("Core action smoke requires a real Chrome/Chromium binary");
const output=html.match(/<output[^>]*id="hh-core-actions-result"[^>]*>[\s\S]*?<\/output>/)?.[0]||
 html.match(/<output[^>]*data-status="[^"]+"[^>]*id="hh-core-actions-result"[^>]*>[\s\S]*?<\/output>/)?.[0]||html.slice(-3000);
const isPass=/id="hh-core-actions-result"[^>]*data-status="pass"/.test(html)||
  /data-status="pass"[^>]*id="hh-core-actions-result"/.test(html);
if(!isPass)throw Error("Core button browser smoke failed: "+output.slice(0,7000));
const message=output.replace(/<[^>]+>/g,"").replace(/&quot;/g,'"').replace(/&amp;/g,"&");
console.log("HerdHarbor real Chromium core action smoke: PASS ("+browser+")");
console.log(message);
