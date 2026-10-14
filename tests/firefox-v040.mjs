import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {By} from 'selenium-webdriver';
import {fixtureSession} from './firefox-session.mjs';
import {build} from 'esbuild';
const session=await fixtureSession(process.env.TOC_TEST_ARTIFACTS||'artifacts/firefox-v040',{handleRequest:async(req,res)=>{
 if(req.url.startsWith('/history')){await new Promise(r=>setTimeout(r,300));res.setHeader('Content-Type','application/json');res.end('{"ok":true}');}
 else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><main></main></body></html>');}return true;
}});
const {driver,artifacts}=session,results=[];
const evaluate=(s,...a)=>driver.executeScript(s,...a);
const state=()=>evaluate(`const h=document.getElementById('chatgpt-toc-root'),s=h?.shadowRoot;return s?{nav:h.dataset.navigation,mode:h.dataset.navigationMode,ids:[...s.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-toc-located'),expanded:s.querySelector('.toggle').getAttribute('aria-expanded'),status:s.getElementById('toc-status').textContent}:null;`);
const stats=()=>evaluate('return window.warmFixture.stats()');
async function click(selector){const s=await(await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();await evaluate('arguments[0].click()',await s.findElement(By.css(selector)));}
async function diagnosis(){await click('#toc-diagnose');return evaluate("return JSON.parse(document.getElementById('chatgpt-toc-root').shadowRoot.getElementById('toc-diagnosis').textContent)");}
async function waitIdle(){await driver.wait(async()=>(await state())?.nav==='idle',45000);}
async function target(id){await click('#toc-list button[data-entry-id="warm:u-'+id+'"]');await driver.wait(async()=>{const s=await state();return s.nav==='located'&&s.highlight==='warm:u-'+id;},30000);}
async function test(name,fn){try{const actual=await fn();results.push({name,status:'PASS',actual});console.log(name+' PASS '+JSON.stringify(actual));}catch(e){results.push({name,status:'FAIL',error:String(e),ui:await state().catch(()=>null),fixture:await stats().catch(()=>null),diagnostic:await diagnosis().catch(()=>null)});throw e;}}
try{
 await driver.get(session.optionsUrl);await driver.wait(()=>evaluate("return (async()=> (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();"),10000);
 await driver.get(session.url.replace('synthetic','warm-A'));await evaluate(await readFile('tests/fixtures/warm-renderer.js','utf8'),0,'warm');
 await driver.wait(async()=>!!await state(),10000);if((await state()).expanded!=='true')await click('.toggle');await driver.wait(async()=>(await state()).ids.length===6,10000);
 await test('COLD collection fetches missing pages once, retains 48, ends at head',async()=>{
  const began=performance.now();await click('#toc-earlier');await waitIdle();const s=await state(),f=await stats();
  assert.deepEqual(s.ids,Array.from({length:48},(_,i)=>'warm:u-'+i));assert.equal(f.loadedHead,0);assert.ok(f.top<=2);assert.equal(f.fetches.length,7);assert.equal(new Set(f.fetches.map(x=>x.head)).size,7);assert.equal((await diagnosis()).navigation.fast.attempts,0);
  return {count:48,fetches:7,elapsedMs:Math.round(performance.now()-began),top:f.top};
 });
 let fastEvents,fastMs;
 await test('WARM distant unmounted target jumps across 55k answer without intermediate fetch',async()=>{
  await evaluate('window.warmFixture.tail()');await driver.sleep(400);assert.ok(!await evaluate('return !!document.querySelector(\'[data-message-id="warm:u-3"]\')'));
  await evaluate('window.warmFixture.reset()');const began=performance.now();await target(3);fastMs=performance.now()-began;const f=await stats(),d=await diagnosis();fastEvents=f.commands.length;
  assert.equal(d.navigation.fast.result,'mounted');assert.equal(d.navigation.fast.attempts,1);assert.equal(d.navigation.fast.fallbacks,0);assert.equal(f.fetches.length,7);assert.ok(f.commands.length<=3);assert.ok(fastMs<3000);
  return {elapsedMs:Math.round(fastMs),scrollEvents:fastEvents,historyFetchesAfterFirstPass:0,exactHighlight:'warm:u-3',mountedWindowCount:f.mounts.length};
 });
 await test('WIDTH change disables old geometry; warm cache still navigates by walking',async()=>{
  await evaluate('window.warmFixture.tail();window.warmFixture.resize(980)');await driver.sleep(400);await evaluate('window.warmFixture.reset()');const began=performance.now();await target(3);const elapsed=performance.now()-began,f=await stats(),d=await diagnosis();
  assert.equal(d.navigation.fast.attempts,0);assert.equal(f.fetches.length,7);assert.ok(f.commands.length>fastEvents);assert.ok(elapsed>fastMs);
  return {elapsedMs:Math.round(elapsed),scrollEvents:f.commands.length,fastElapsedMs:Math.round(fastMs),fastScrollEvents:fastEvents,comparison:'same cached renderer, old geometry invalidated by width change'};
 });
 await test('WARM repeat navigation uses relearned width and direct path',async()=>{
  await evaluate('window.warmFixture.tail()');await driver.sleep(400);await evaluate('window.warmFixture.reset()');await target(10);const f=await stats(),d=await diagnosis();assert.equal(d.navigation.fast.result,'mounted');assert.equal(f.fetches.length,7);assert.ok(f.commands.length<=3);return {scrollEvents:f.commands.length,exactHighlight:'warm:u-10',fetches:0};
 });
 await test('STALE 18k layout shift misses once, walks from current window, never highlights wrong target',async()=>{
  await evaluate('window.warmFixture.shift()');await driver.sleep(400);await evaluate('window.warmFixture.reset()');const began=performance.now();await target(30);const f=await stats(),d=await diagnosis();assert.equal(d.navigation.fast.result,'miss');assert.equal(d.navigation.fast.attempts,1);assert.equal(d.navigation.fast.fallbacks,1);assert.equal(f.fetches.length,7);return {elapsedMs:Math.round(performance.now()-began),scrollEvents:f.commands.length,exactHighlight:'warm:u-30',singleFastMiss:true};
 });
 await test('ROOT replacement discards previous geometry and preserves directory',async()=>{
  await evaluate('window.warmFixture.tail();window.warmFixture.replaceRoot()');await driver.sleep(400);const d=await diagnosis();assert.ok(d.navigation.geometry.measuredSpans<12);assert.equal((await state()).ids.length,48);await target(20);assert.equal((await diagnosis()).navigation.fast.attempts,0);return {retained:48,oldSpansDiscarded:true,exactHighlight:'warm:u-20'};
 });
 await evaluate('window.warmFixture.tail()');await driver.sleep(400);await click('#toc-earlier');await waitIdle();
 await test('OVERSHOOT stale inflated spans land before target; fallback reverses using live order',async()=>{
  await evaluate('window.warmFixture.shift(0)');await driver.sleep(400);await evaluate('window.warmFixture.reset()');await target(30);const d=await diagnosis(),f=await stats();
  assert.equal(d.navigation.fast.result,'miss');assert.equal(d.navigation.fast.attempts,1);assert.equal(d.navigation.fast.fallbacks,1);assert.ok(f.commands.some(e=>e.to>e.from+1000));assert.equal(f.fetches.length,7);
  return {exactHighlight:'warm:u-30',singleFastMiss:true,walkedNewerAfterMiss:true,scrollEvents:f.commands.length};
 });
 // Refill every link at the current layout before cancellation and reload tests.
 await evaluate('window.warmFixture.tail()');await driver.sleep(400);await click('#toc-earlier');await waitIdle();
 await test('CANCEL during warm remount prevents late extension scroll/highlight',async()=>{
  await evaluate('window.warmFixture.tail();window.warmFixture.delay(1500)');await driver.sleep(400);await evaluate('window.warmFixture.reset()');await click('#toc-list button[data-entry-id="warm:u-3"]');await driver.wait(async()=>(await state()).nav==='loading'&&(await diagnosis()).navigation.fast.attempts===1,5000);
  await click('#toc-stop');await driver.wait(async()=>(await state()).nav==='cancelled',3000);await driver.sleep(150);const count=(await stats()).commands.length;await driver.sleep(1900);assert.equal((await state()).nav,'cancelled');assert.equal((await stats()).commands.length,count);assert.notEqual((await state()).highlight,'warm:u-3');await evaluate('window.warmFixture.delay(80)');return {noLateScroll:true,noLateTargetHighlight:true};
 });
 await test('SHORT deadline includes failed fast wait and fallback; no late writes',async()=>{
  const compiled=await build({stdin:{contents:"import {IndexStore,Navigator,NAV_LIMITS} from './src/core';import {DomAdapter} from './src/dom';window.warmHarness={IndexStore,Navigator,NAV_LIMITS,DomAdapter};",resolveDir:resolve('.')},bundle:true,write:false,format:'iife',platform:'browser',target:'firefox140',define:{__FIXTURE__:'true',__REVISION__:JSON.stringify('test-only')}});
  await evaluate(compiled.outputFiles[0].text);
  const result=await evaluate(`return (async()=>{const {IndexStore,Navigator,NAV_LIMITS,DomAdapter}=window.warmHarness;const store=new IndexStore();let adapter;const refresh=()=>{store.merge(adapter.read());adapter.remember();};adapter=new DomAdapter(store,refresh);for(let i=0;i<48;i+=3){window.warmFixture.at(i);refresh();}window.warmFixture.tail();refresh();window.warmFixture.delay(5000);window.warmFixture.reset();adapter.begin();const states=[];const nav=new Navigator(adapter,s=>states.push(s),{...NAV_LIMITS,totalMs:1000,batchMs:1000});const began=performance.now();const state=await nav.run('warm:u-3');const elapsed=performance.now()-began,count=window.warmFixture.stats().commands.length;await new Promise(r=>setTimeout(r,1100));const after=window.warmFixture.stats().commands.length,diagnostic=adapter.diagnostic();nav.cancel();adapter.dispose();window.warmFixture.delay(80);window.warmFixture.tail();return {state,reason:nav.lastStopReason,elapsed,count,after,diagnostic,states};})();`);
  assert.equal(result.state,'timed-out');assert.equal(result.reason,'time-limit');assert.ok(result.elapsed<1400);assert.equal(result.diagnostic.fast.attempts,1);assert.equal(result.diagnostic.fast.fallbacks,1);assert.equal(result.after,result.count);assert.ok(!result.states.includes('located'));
  return {elapsedMs:Math.round(result.elapsed),deadlineMs:1000,fastAttempts:1,noLateScroll:true};
 });
 await test('F5 preserves text index while page geometry starts cold',async()=>{
  await driver.sleep(1000);await driver.navigate().refresh();await evaluate(await readFile('tests/fixtures/warm-renderer.js','utf8'),0,'warm');await driver.wait(async()=>(await state())?.ids.length===48,10000);const d=await diagnosis();assert.equal(d.navigation.fast.attempts,0);assert.ok(d.navigation.geometry.measuredSpans<12);assert.equal((await stats()).loadedHead,42);return {retained:48,geometryCold:true,newPageHistoryCold:true};
 });
 // A new page restored text only; refill its geometry before active SPA invalidation.
 await click('#toc-earlier');await waitIdle();
 await test('SPA while warm navigation is pending cancels old target without further movement',async()=>{
  await evaluate('window.warmFixture.tail();window.warmFixture.delay(1500)');await driver.sleep(400);await evaluate('window.warmFixture.reset()');await click('#toc-list button[data-entry-id="warm:u-3"]');await driver.wait(async()=>(await state()).nav==='loading'&&(await diagnosis()).navigation.fast.attempts===1,5000);
  await evaluate("history.pushState({},'', '/c/warm-B');document.querySelector('main').replaceChildren()");await driver.wait(async()=>(await state()).nav!=='loading',3000);await driver.sleep(200);const count=(await stats()).commands.length;await driver.sleep(1700);assert.equal((await stats()).commands.length,count);assert.notEqual((await state()).highlight,'warm:u-3');
  return {oldTargetNeverHighlighted:true,noLateScroll:true,newContext:'/c/warm-B'};
 });
 await driver.get(session.url.replace('synthetic','warm-C'));await evaluate(await readFile('tests/fixtures/warm-renderer.js','utf8'),0,'warm');await driver.wait(async()=>!!await state(),10000);if((await state()).expanded!=='true')await click('.toggle');await click('#toc-earlier');await waitIdle();
 await test('EPOCH body contradiction during fast jump cancels and invalidates old geometry',async()=>{
  await evaluate('window.warmFixture.tail();window.warmFixture.delay(1500)');await driver.sleep(400);await evaluate('window.warmFixture.reset()');await click('#toc-list button[data-entry-id="warm:u-3"]');await driver.wait(async()=>(await state()).nav==='loading'&&(await diagnosis()).navigation.fast.attempts===1,5000);
  await evaluate('window.warmFixture.edit(46)');await driver.wait(async()=>(await state()).nav!=='loading',3000);const d=await diagnosis();assert.ok(d.quarantined>0);assert.ok(d.navigation.geometry.measuredSpans<12);const count=(await stats()).commands.length;await driver.sleep(1700);assert.equal((await stats()).commands.length,count);assert.notEqual((await state()).highlight,'warm:u-3');
  return {contradictionQuarantined:true,oldGeometryInvalidated:true,noLateScroll:true,noWrongHighlight:true};
 });
 await session.screenshot('warm-navigation.png');
}catch(e){console.error(e);process.exitCode=1;await session.screenshot('failure.png').catch(()=>{});}
finally{const caps=await driver.getCapabilities();await writeFile(resolve(artifacts,'results.json'),JSON.stringify({suite:'Firefox v0.4.0 cached-history virtual renderer on localhost; not ChatGPT LIVE',firefox:caps.get('browserVersion'),build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
