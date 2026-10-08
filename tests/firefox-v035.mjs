import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {By} from 'selenium-webdriver';
import {fixtureSession} from './firefox-session.mjs';
const session=await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-v035',{handleRequest:async(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><title>Isolated rebuild renderer</title></head><body style="margin:0"><main></main></body></html>');return true;}});
const {driver,artifacts}=session,results=[],renderer=await readFile('tests/fixtures/rebuild-renderer.js','utf8');
const evaluate=(code,...args)=>driver.executeScript(code,...args),url=session.url.replace('/c/synthetic','/c/rebuild-A');
const ui=()=>evaluate(`const h=document.getElementById('chatgpt-toc-root'),s=h?.shadowRoot;if(!s)return null;return {nav:h.dataset.navigation,expanded:s.querySelector('.toggle').getAttribute('aria-expanded'),status:s.querySelector('#toc-status').textContent,scope:s.querySelector('#toc-scope').textContent,earlierDisabled:s.querySelector('#toc-earlier').disabled,rows:[...s.querySelectorAll('#toc-list button')].map(b=>({id:b.dataset.entryId,n:Number(b.dataset.ordinal),confirmed:b.dataset.numberConfirmed==='true',disabled:b.disabled,text:b.textContent})),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
const wait=p=>driver.wait(p,20000);
async function click(selector){const s=await(await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();await evaluate('arguments[0].click();',await s.findElement(By.css(selector)));}
async function mount(prefix='A',start=15,count=30){await evaluate(renderer,start,prefix,count);await wait(async()=>!!await ui());if((await ui()).expanded!=='true')await click('.toggle');}
async function test(name,run){const started=Date.now();try{const actual=await run();results.push({name,status:'PASS',elapsedMs:Date.now()-started,actual});console.log(name+' PASS '+JSON.stringify(actual));}catch(e){results.push({name,status:'FAIL',error:String(e),ui:await ui()});throw e;}}
const expected=Array.from({length:30},(_,i)=>'A:u-'+i);
try{
 await driver.get(session.optionsUrl);await wait(()=>evaluate(`return (async()=> (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();`));
 // Deliberately seed a polluted active/quarantine record and an unrelated session.
 await evaluate(`return (async()=>{const context=arguments[0],state={version:1,context,branch:null,entries:[{id:'polluted',text:'retired prompt',stable:true}],segments:[{ids:['polluted'],ordered:true}],quarantine:[{reason:'text-change',entries:[{id:'obsolete',text:'older body',stable:true}],segments:[{ids:['obsolete'],ordered:true}],ordered:true}],limitReason:null};const other={...state,context:context.replace('rebuild-A','unrelated'),entries:[{id:'other',text:'keep me',stable:true}],segments:[{ids:['other'],ordered:true}],quarantine:[]};await browser.storage.local.set({'toc-index-v1':{version:1,records:[{touched:Date.now(),state},{touched:Date.now(),state:other}]}});return true;})();`,url);
 await driver.get(url);await mount();await wait(async()=> (await ui()).rows.some(r=>r.id==='polluted'));
 await test('V035-01 rebuild clears this session, reaches bottom first, walks upwards and stops at head despite repeated remounts and tail height changes',async()=>{
   await evaluate('window.anchorFixture.remountHead();window.anchorFixture.growTail();');
   await click('#toc-earlier');await wait(async()=> (await ui()).nav==='loading');
   await driver.wait(async()=> (await ui()).nav==='idle',65000);await wait(async()=> (await ui()).scope.includes('已儲存'));
   const s=await ui(),stats=await evaluate('return window.anchorFixture.stats();');
   assert.deepEqual(s.rows.map(r=>r.id),expected);assert.ok(s.rows.every((r,i)=>r.confirmed&&r.n===i+1));assert.match(s.status,/到達頂端並自動停止/);
   assert.equal(stats.mounts.find(m=>m.start===25)?.start,25);const bottom=stats.mounts.findIndex(m=>m.start===25);const later=stats.mounts.slice(bottom+1).map(m=>m.start);assert.ok(later.every((n,i)=>!i||n<=later[i-1]));
   assert.equal(stats.start,0);await driver.sleep(1500);assert.equal((await ui()).nav,'idle');assert.equal((await evaluate('return window.anchorFixture.stats();')).start,0);
   await evaluate('window.anchorFixture.stopNoise();');await session.screenshot('rebuild-at-head-numbered.png');return {collected:30,numbered:30,bottomFirst:true,headAutoStop:true,remountEveryMs:80,tailHeightNoiseMs:200};
 });
 await test('V035-02 F5 restores saved numbering, search preserves global ordinal and unmounted target still navigates',async()=>{
   await driver.navigate().refresh();await mount('A',23);await wait(async()=> (await ui()).rows.length===30);
   assert.ok((await ui()).rows.every((r,i)=>r.confirmed&&r.n===i+1));
   await evaluate(`const input=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-search');input.value='A 本機提問 3';input.dispatchEvent(new Event('input',{bubbles:true}));`);
   await wait(async()=> (await ui()).rows.length===1);assert.equal((await ui()).rows[0].n,4);
   await click('#toc-list button[data-entry-id="A:u-3"]');await driver.wait(async()=> (await ui()).nav==='located',25000);assert.equal((await ui()).highlight,'A:u-3');
   await evaluate(`const input=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));`);
   return {restored:30,searchOrdinal:4,exactHighlight:'A:u-3'};
 });
 await test('V035-03 SPA restoration keeps thirty ordinals and contiguous new prompt gets number thirty-one',async()=>{
   await evaluate('history.pushState({},"",arguments[0]);',url.replace('rebuild-A','rebuild-B'));await mount('B',23);await wait(async()=> (await ui()).rows.every(r=>r.id.startsWith('B:')));
   await evaluate('history.pushState({},"",arguments[0]);',url);await mount('A',26,31);await wait(async()=> (await ui()).rows.length===31);
   const s=await ui();assert.ok(s.rows.every((r,i)=>r.confirmed&&r.n===i+1));await session.screenshot('saved-ordinal-appended.png');return {retained:30,appendedOrdinal:s.rows.at(-1).n};
 });
 await test('V035-04 repeated rebuild discards polluted data and leaves another conversation untouched',async()=>{
   await click('#toc-earlier');await wait(async()=> (await ui()).nav==='loading');await driver.wait(async()=> (await ui()).nav==='idle',65000);
   assert.equal((await ui()).rows.length,31);await wait(async()=> (await ui()).scope.includes('已儲存'));
   await driver.get(session.optionsUrl);const stored=await evaluate(`return (async()=>{const x=await browser.storage.local.get(['toc-index-v1','toc-index-generations-v1']);return x;})();`);
   const a=stored['toc-index-v1'].records.find(r=>r.state.context===url).state;assert.equal(a.generation,2);assert.equal(a.entries.length,31);assert.deepEqual(a.quarantine,[]);
   assert.equal(stored['toc-index-v1'].records.find(r=>r.state.context.endsWith('/c/unrelated')).state.entries[0].id,'other');return {resetGeneration:2,quarantine:0,otherSessionPreserved:true};
 });
 await test('V035-05 a frozen middle window never becomes head and explicit stop re-enables rebuild',async()=>{
   await driver.get(url);await mount('A',15,31);await wait(async()=> (await ui()).rows.length===31);await evaluate('window.anchorFixture.freeze();');
   await click('#toc-earlier');await wait(async()=> (await ui()).nav==='loading');await driver.sleep(8000);assert.equal((await ui()).nav,'loading');
   await click('#toc-stop');await wait(async()=> (await ui()).nav==='cancelled');assert.equal((await ui()).earlierDisabled,false);return {falseHeadStop:false,stopWorks:true};
 });
}catch(e){console.error(e);await session.screenshot('failure.png').catch(()=>{});process.exitCode=1;}
finally{await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),source:'Native Firefox isolated addon and localhost virtual renderer, actual browser scrolling; ChatGPT LIVE not performed',firefox:(await driver.getCapabilities()).get('browserVersion'),build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
