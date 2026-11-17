import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {existsSync} from 'node:fs';
const here=dirname(fileURLToPath(import.meta.url));
const fixture=resolve(here,'../tests/fixtures/v2.0.3-browser-smoke.html');
if(!existsSync(fixture))throw Error('Browser fixture missing');
const browsers=[process.env.CHROME_BIN,'google-chrome','chromium','chromium-browser'].filter(Boolean);
let html='',error=null,used='';
for(const browser of browsers){
 try{
  html=execFileSync(browser,[
   '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--disable-background-networking','--no-first-run','--virtual-time-budget=5000',
   '--dump-dom',new URL('file://'+fixture).href
  ],{encoding:'utf8',timeout:30000,maxBuffer:5*1024*1024,stdio:['ignore','pipe','pipe']});
  used=browser;error=null;break;
 }catch(e){error=e;if(e.code==='ENOENT')continue;throw Error('Chrome run failed: '+String(e.stderr||e.message));}
}
if(!used)throw Error('A real Chrome/Chromium binary is required for 2.0.3 browser acceptance: '+(error?.message||'not installed'));
if(!/id="hh203-result"[^>]*data-status="pass"/.test(html)&&
   !/data-status="pass"[^>]*id="hh203-result"/.test(html)){
 const excerpt=html.match(/<output[^>]*id="hh203-result"[^>]*>[\s\S]*?<\/output>/)?.[0]||html.slice(-900);
 throw Error('Real Chromium integration smoke did not pass: '+excerpt);
}
console.log('HerdHarbor 2.0.3 headless Chromium module and DOM integration: PASS ('+used+')');
