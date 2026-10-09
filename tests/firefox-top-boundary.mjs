import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {By} from 'selenium-webdriver';
import {fixtureSession} from './firefox-session.mjs';
const session=await fixtureSession(process.env.TOC_TEST_ARTIFACTS||'artifacts/firefox-top-boundary',{handleRequest:async(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><main></main></body></html>');return true;}});
const {driver,artifacts}=session,results=[];
const source=await readFile('tests/fixtures/recovery-renderer.js','utf8');
const evaluate=(s,...a)=>driver.executeScript(s,...a);
const state=()=>evaluate(`const h=document.getElementById('chatgpt-toc-root'),s=h?.shadowRoot;return s?{nav:h.dataset.navigation,status:s.querySelector('#toc-status').textContent,ids:[...s.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),expanded:s.querySelector('.toggle').getAttribute('aria-expanded')}:null;`);
const stats=()=>evaluate('return window.anchorFixture.stats();');
async function click(selector){const sh=await(await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();await evaluate('arguments[0].click();',await sh.findElement(By.css(selector)));}
async function setup(pad=450,start=23,mode='normal'){
 await driver.get(session.url.replace('synthetic','top-'+pad+'-'+start+'-'+mode));
 let code=source.replace('let total=0;',`let total=${pad};`).replace("m.style.height=total+'px'", "m.style.height=(total+450)+'px'");
 if(mode==='hidden') code+=`const h=document.createElement('div');h.setAttribute('role','progressbar');h.style.display='none';m.append(h);`;
 if(mode==='slow') code+=`const loader=document.createElement('div');loader.setAttribute('role','progressbar');loader.style.cssText='position:absolute;top:0;height:20px;width:100px';m.append(loader);root.setAttribute('aria-busy','true');setTimeout(()=>{loader.remove();root.removeAttribute('aria-busy');},9000);`;
 await evaluate(code,start,'T');await driver.wait(async()=>!!await state(),10000);
 if((await state()).expanded!=='true')await click('.toggle');
 await driver.wait(async()=>(await state()).ids.length===7,10000);
}
async function test(name,fn){try{const actual=await fn();results.push({name,status:'PASS',actual});console.log(name+' PASS '+JSON.stringify(actual));}catch(e){results.push({name,status:'FAIL',error:String(e),ui:await state().catch(()=>null),fixture:await stats().catch(()=>null)});throw e;}}
try{
 await driver.get(session.optionsUrl);
 await driver.wait(()=>evaluate("return (async()=> (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();"),10000);
 if(process.env.TOC_REPRODUCE==='1'){
  await test('REPRO-original-v034-padding-head-loop',async()=>{await setup(450,0);await click('#toc-earlier');await driver.sleep(18000);const s=await state(),f=await stats();assert.equal(s.nav,'loading');assert.equal(f.start,0);assert.ok(f.top>2);assert.ok(f.events.length>=4);await session.screenshot('original-head-loop.png');await click('#toc-stop');return {state:s.nav,actualFirstWindow:0,scrollTop:f.top,scrollEvents:f.events.length,status:s.status};});
 }else{
  for(const [pad,mode] of [[0,'normal'],[450,'normal'],[450,'hidden']])await test('TOP-'+pad+'-'+mode,async()=>{await setup(pad,23,mode);await click('#toc-earlier');await driver.wait(async()=>(await state()).nav==='idle',65000);const s=await state(),f=await stats();assert.deepEqual(s.ids,Array.from({length:30},(_,i)=>'T:u-'+i));assert.equal(f.start,0);assert.ok(f.top<=2);const stopped=f.events.length;await driver.sleep(1000);assert.equal((await stats()).events.length,stopped);await session.screenshot('top-'+pad+'-'+mode+'.png');return {count:30,top:f.top,scrollEvents:f.events.length,status:s.status,noLateScroll:true};});
  await test('TOP-large-unknown-spacer-remains-cancellable',async()=>{await setup(950,0);await click('#toc-earlier');await driver.sleep(14000);const f=await stats();assert.equal((await state()).nav,'loading');assert.ok(f.top<=2);await click('#toc-stop');await driver.wait(async()=>(await state()).nav==='cancelled',5000);return {top:f.top,unprovenHead:true,cancellable:true};});
  await test('TOP-visible-loader-delays-proof',async()=>{await setup(450,0,'slow');const began=Date.now();await click('#toc-earlier');await driver.sleep(6500);assert.equal((await state()).nav,'loading');await driver.wait(async()=>(await state()).nav==='idle',20000);assert.ok(Date.now()-began>=14000);return {waitedMs:Date.now()-began,top:(await stats()).top};});
  await test('TOP-frozen-middle-stop',async()=>{await setup(450,12);await evaluate('window.anchorFixture.freeze();');await click('#toc-earlier');await driver.sleep(10000);assert.equal((await state()).nav,'loading');const f=await stats();assert.ok(f.top>2);await click('#toc-stop');await driver.wait(async()=>(await state()).nav==='cancelled',5000);await driver.sleep(250);const atStop=await stats();await driver.sleep(1000);const later=await stats();assert.equal(later.top,atStop.top);assert.equal(later.events.length,atStop.events.length);return {middleTop:f.top,lateScroll:false};});
 }
}catch(e){console.error(e);await session.screenshot('failure.png').catch(()=>{});process.exitCode=1;}finally{await writeFile(resolve(artifacts,'results.json'),JSON.stringify({suite:'native Firefox localhost, not ChatGPT LIVE',results},null,2));await session.close();}
