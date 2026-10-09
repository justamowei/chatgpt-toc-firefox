import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fixtureSession} from './firefox-session.mjs';
const session=await fixtureSession('artifacts/firefox-live-recorder',{handleRequest:async(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><main></main></body></html>');return true;}});
const {driver,artifacts}=session, results=[];
const execute=(code,...args)=>driver.executeScript(code,...args);
const click=id=>execute("document.getElementById('toc-live-recorder').shadowRoot.getElementById(arguments[0]).click()",id);
const status=()=>execute("return document.getElementById('toc-live-recorder')?.shadowRoot.getElementById('status').textContent");
try {
 const initialWindows=await driver.getAllWindowHandles();
 await driver.switchTo().window(initialWindows[0]);
 const addonDir=resolve(artifacts,'addon');await mkdir(addonDir,{recursive:true});
 const manifest=JSON.parse(await readFile('tools/firefox-live-recorder/manifest.json','utf8'));
 assert.deepEqual(manifest.host_permissions,['https://chatgpt.com/*']);assert.equal(manifest.background,undefined);
 manifest.host_permissions=['http://127.0.0.1/*'];manifest.content_scripts[0].matches=['http://127.0.0.1/*'];
 await writeFile(resolve(addonDir,'manifest.json'),JSON.stringify(manifest));await copyFile('tools/firefox-live-recorder/recorder.js',resolve(addonDir,'recorder.js'));
 await driver.get(session.optionsUrl);
 await driver.wait(()=>execute("return (async()=> (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();"),10000);
 await driver.installAddon(addonDir,true);
 const windows=await driver.getAllWindowHandles();assert.ok(windows.length);await driver.switchTo().window(windows[0]);
 await driver.get(session.url);
 await execute(await readFile('tests/fixtures/recovery-renderer.js','utf8'),10,'PRIVATE-MESSAGE-ID');
 await driver.wait(async()=>!!await status(),10000);
 await driver.wait(()=>execute("return !!document.getElementById('chatgpt-toc-root')?.shadowRoot.getElementById('toc-diagnose')"),10000);
 // Inspect the actual local Blob through the download anchor; no network request.
 await execute("document.addEventListener('click',e=>{const a=e.composedPath().find(n=>n?.download==='toc-firefox-live-trace.json');if(a){window.recorderUrl=a.href;e.preventDefault();}},true);");
 await click('start');await driver.sleep(1200);
 await execute("document.getElementById('chatgpt-toc-root').shadowRoot.getElementById('toc-earlier').click()");
 await driver.sleep(2500);await click('end');await click('save');
 let data=JSON.parse(await execute("return fetch(window.recorderUrl).then(r=>r.text())"));
 assert.ok(data.samples.length>=10);assert.equal(data.ended.reason,'user');assert.ok(data.actions.some(a=>a.action==='collect'));
 assert.ok(data.samples.some(s=>s.diagnostic?.version==='0.3.5'));assert.ok(data.samples.some(s=>s.diagnostic?.attempt?.method==='mounted-edge-anchor'));
 assert.ok(data.samples.some(s=>s.scrollEvents>0));assert.ok(data.samples.some(s=>s.mutations.added>0));
 assert.ok(data.samples.some(s=>s.mounted.some(n=>n.message!==null)));assert.ok(!JSON.stringify(data).includes('PRIVATE-MESSAGE-ID'));
 const stable=await status();await driver.sleep(500);assert.equal(await status(),stable);
 results.push({name:'real Firefox localhost, separate content script, scrolling/diagnostic/export',status:'PASS',samples:data.samples.length});
 await execute("document.getElementById('chatgpt-toc-root').shadowRoot.getElementById('toc-stop').click()");
 // Deliberately taint the diagnostic source. Only permitted numeric fields survive.
 await execute("document.getElementById('chatgpt-toc-root').shadowRoot.getElementById('toc-diagnose').addEventListener('click',()=>{document.getElementById('chatgpt-toc-root').shadowRoot.getElementById('toc-diagnosis').textContent=JSON.stringify({version:'PRIVATE-VERSION',text:'PRIVATE-TEXT',url:'PRIVATE-URL',mounted:6,navigation:{scroll:{top:10,secret:'PRIVATE-TOKEN'},collection:'PRIVATE-STATE',lastAttempt:{method:'PRIVATE-METHOD',before:10,boundary:{physical:true,secret:'PRIVATE-COOKIE'}}}});});");
 await click('start');await driver.sleep(1100);await click('end');await click('save');
 data=JSON.parse(await execute("return fetch(window.recorderUrl).then(r=>r.text())"));
 assert.ok(!JSON.stringify(data).includes('PRIVATE-'));assert.equal(data.samples[0].diagnostic.mounted,6);
 results.push({name:'allowlisted export excludes text, IDs, URL and tainted diagnostic strings',status:'PASS'});
 await click('start');await execute("history.pushState({},'', '/c/other')");
 await driver.wait(async()=>String(await status()).includes('已停止'),3000);await click('save');
 data=JSON.parse(await execute("return fetch(window.recorderUrl).then(r=>r.text())"));assert.equal(data.ended.reason,'route-changed');
 results.push({name:'SPA route change stops recording and preserves export',status:'PASS'});
 await session.screenshot('recorder.png');
} catch(e) {results.push({status:'FAIL',error:String(e)});process.exitCode=1;console.error(e);}
finally {await writeFile(resolve(artifacts,'results.json'),JSON.stringify({environment:'native Firefox localhost; not ChatGPT LIVE',results},null,2));await session.close();}
console.log(JSON.stringify(results));
