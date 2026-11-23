import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";

const fixture=resolve(dirname(fileURLToPath(import.meta.url)),"../tests/fixtures/rabbit-offspring-learning-browser.html");
if(!existsSync(fixture))throw Error("Rabbit genetics browser fixture missing");
const candidates=[process.env.CHROME_BIN,"google-chrome","chromium","chromium-browser"].filter(Boolean);
let dom="",binary="";
for(const executable of candidates){
 try{
  dom=execFileSync(executable,["--headless","--no-sandbox","--disable-gpu",
    "--disable-dev-shm-usage","--disable-background-networking","--no-first-run",
    "--virtual-time-budget=5000","--dump-dom",new URL("file://"+fixture).href],
    {encoding:"utf8",timeout:30000,maxBuffer:10*1024*1024,stdio:["ignore","pipe","pipe"]});
  binary=executable;break;
 }catch(error){
  if(error.code==="ENOENT")continue;
  throw Error("Rabbit genetics Chrome smoke failed to launch: "+String(error.stderr||error.message));
 }
}
if(!binary)throw Error("A Chrome or Chromium binary is required for actual rabbit offspring click tests");
const item=dom.match(/<output[^>]*id="rabbit-learning-result"[^>]*>[\s\S]*?<\/output>/i)?.[0]||"";
const valid=/<output\b[^>]*id="rabbit-learning-result"[^>]*data-status="pass"/.test(item)||
 /<output\b[^>]*data-status="pass"[^>]*id="rabbit-learning-result"/.test(item);
const display=item.replace(/<[^>]+>/g,"").replace(/&quot;/g,'"').replace(/&amp;/g,"&");
if(!valid)throw Error("Rabbit genetics offspring click regression failed: "+display.slice(0,9000)+
 " DOM excerpt: "+dom.slice(-3500));
console.log("Rabbit offspring genetic learning canonical-state browser test: PASS ("+binary+")");
console.log(display);
