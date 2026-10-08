import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {By} from 'selenium-webdriver';
import {fixtureSession} from './firefox-session.mjs';
const session=await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-v034',{
  handleRequest:async(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><title>Isolated recovery renderer</title></head><body style="margin:0"><main></main></body></html>');return true;},
});
const {driver,artifacts}=session,results=[],renderer=await readFile('tests/fixtures/recovery-renderer.js','utf8');
const evaluate=(code,...args)=>driver.executeScript(code,...args);
const url=session.url.replace('/c/synthetic','/c/recovery-A');
const state=()=>evaluate(`const h=document.getElementById('chatgpt-toc-root'),s=h?.shadowRoot;if(!s)return null;return {nav:h.dataset.navigation,expanded:s.querySelector('.toggle').getAttribute('aria-expanded'),status:s.querySelector('#toc-status').textContent,scope:s.querySelector('#toc-scope').textContent,ids:[...s.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),disabled:[...s.querySelectorAll('#toc-list button:disabled')].map(b=>b.dataset.entryId),archived:s.querySelectorAll('.archived').length,groups:[...s.querySelectorAll('#toc-list .empty')].map(n=>n.textContent),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
const wait=p=>driver.wait(p,20000);
async function click(selector){const s=await(await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();const b=await s.findElement(By.css(selector));await evaluate('arguments[0].click();',b);}
async function mount(prefix='A',start=23){await evaluate(renderer,start,prefix);await wait(async()=>!!await state());if((await state()).expanded!=='true')await click('.toggle');}
async function switchRoute(prefix){await evaluate('history.pushState({},"",arguments[0]);',url.replace('recovery-A','recovery-'+prefix));await driver.sleep(200);await mount(prefix);}
async function exactTarget(index){const id='A:u-'+index;await wait(async()=> (await state()).ids.includes(id)&&!(await state()).disabled.includes(id));assert.equal(await evaluate('return !!document.querySelector(arguments[0]);','[data-message-id="'+id+'"]'),false);await click('#toc-list button[data-entry-id="'+id+'"]');await driver.wait(async()=>{const s=await state();return s.nav==='located'&&s.highlight===id;},25000);return id;}
async function seedLegacy(){
   await driver.get(session.optionsUrl);
   await evaluate(`return (async()=>{const context=arguments[0];const entries=Array.from({length:30},(_,i)=>({id:'A:u-'+i,text:'A 本機提問 '+i,stable:true}));const tail=entries.slice(23),prefix=entries.slice(0,23);await browser.storage.local.set({'toc-index-v1':{version:1,records:[{touched:Date.now(),state:{version:1,context,branch:null,entries:tail,segments:[{ids:tail.map(e=>e.id),ordered:true}],quarantine:[{reason:'restored-unverified',entries:prefix,segments:[{ids:prefix.map(e=>e.id),ordered:true}],ordered:true}],limitReason:null}}]}});return true;})();`,url);
}
async function test(name,run){const started=Date.now();try{const actual=await run();results.push({name,status:'PASS',elapsedMs:Date.now()-started,actual});console.log(name+' PASS '+JSON.stringify(actual));}catch(e){results.push({name,status:'FAIL',error:String(e),ui:await state()});throw e;}}
try{
 await driver.get(session.optionsUrl);
 await wait(()=>evaluate(`return (async()=> (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();`));
 await driver.get(url);await mount();await wait(async()=> (await state()).ids.length===7);
 await test('V034-01 null-branch full collection persists all thirty exact prompts',async()=>{
   await click('#toc-earlier');await wait(async()=> (await state()).nav==='loading');assert.match((await state()).status,/最多 10 分鐘/);
   await driver.wait(async()=> (await state()).nav==='idle',65000);await wait(async()=> (await state()).scope.includes('已儲存'));
   assert.deepEqual((await state()).ids,Array.from({length:30},(_,i)=>'A:u-'+i));await session.screenshot('collected-thirty.png');return {collected:30,branch:null,minutes:10};
 });
 await test('V034-02 SPA A to B to A restores the full index without F5 and seeks an unmounted prompt',async()=>{
   await evaluate(`const i=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-search');i.value='A 本機提問 3';i.dispatchEvent(new Event('input',{bubbles:true}));`);
   await wait(async()=> (await state()).ids.length===1);
   await switchRoute('B');await wait(async()=> (await state()).ids.length===7);assert.ok((await state()).ids.every(id=>id.startsWith('B:')));
   await switchRoute('A');await wait(async()=> (await state()).ids.length===30);assert.equal((await state()).archived,0);
   const target=await exactTarget(3);await session.screenshot('spa-restored-navigation.png');return {restored:30,otherConversation:7,exactHighlight:target};
 });
 await test('V034-03 F5 retains clickable saved prompts and verifies both navigation directions',async()=>{
   await wait(async()=> (await state()).scope.includes('已儲存'));await driver.navigate().refresh();await mount();await wait(async()=> (await state()).ids.length===30);
   assert.deepEqual((await state()).groups,[]);assert.match((await state()).scope,/已沿用保存的目錄排序/);
   const targets=[await exactTarget(3),await exactTarget(24)];assert.equal((await state()).archived,0);assert.match((await state()).scope,/尚未完整/);
   await session.screenshot('refresh-clickable.png');return {restored:30,exactTargets:targets,claimsComplete:false};
 });
 await test('V034-07 repeated F5 restores the saved thirty-row order before any scrolling',async()=>{
   for(let i=0;i<3;i++){
     await wait(async()=> (await state()).scope.includes('已儲存'));await driver.navigate().refresh();await mount();await wait(async()=> (await state()).ids.length===30);
     const s=await state();assert.deepEqual(s.ids,Array.from({length:30},(_,n)=>'A:u-'+n));assert.deepEqual(s.groups,[]);assert.equal(s.archived,0);
     assert.match(s.scope,/已沿用保存的目錄排序/);assert.match(s.scope,/尚未完整/);assert.equal((await evaluate('return window.anchorFixture.stats();')).start,23);
   }
   await session.screenshot('saved-order-repeated-refresh.png');return {refreshes:3,restored:30,automaticRecollection:false};
 });
 await test('V034-08 saved index restores while the SPA has an empty message mount',async()=>{
   await switchRoute('B');await wait(async()=> (await state()).ids.length===7);
   await evaluate('history.pushState({},"",arguments[0]);document.querySelector("main").replaceChildren();',url);
   await wait(async()=> (await state()).ids.length===30);
   const s=await state();assert.deepEqual(s.ids,Array.from({length:30},(_,n)=>'A:u-'+n));assert.deepEqual(s.groups,[]);assert.equal(s.archived,0);
   assert.match(s.scope,/目前掛載 0 則/);assert.match(s.scope,/已沿用保存的目錄排序/);
   await mount();await wait(async()=> (await state()).ids.length===30);
   return {emptyMount:true,restoredBeforeMount:30,orderingRetained:true};
 });
 await test('V034-04 v032 archived prefix migrates without recollecting and is navigable',async()=>{
   await seedLegacy();
   await driver.get(url);await mount();await wait(async()=> (await state()).ids.length===30);assert.equal((await state()).archived,0);
   const older=await exactTarget(3);
   await seedLegacy();await driver.get(url);await mount('A',0);await wait(async()=> (await state()).ids.length===30);
   const newer=await exactTarget(24);
   return {migrated:30,exactTargets:[older,newer],coldPrefixToTail:true};
 });
 await test('V034-05 settings save a two-minute deadline, survive reload and apply to the next collection',async()=>{
   await driver.get(session.optionsUrl);await wait(()=>evaluate('return document.querySelector("#collection-minutes").value==="10";'));
   await evaluate('document.querySelector("#collection-minutes").value="2";document.querySelector("#collection-save").click();');await wait(()=>evaluate('return document.querySelector("#collection-status").textContent.includes("最多 2 分鐘");'));
   await driver.navigate().refresh();await wait(()=>evaluate('return document.querySelector("#collection-minutes").value==="2";'));
   await driver.get(url);await mount();await wait(async()=> (await state()).ids.length===30);await evaluate('window.anchorFixture.freeze();');await click('#toc-earlier');
   await wait(async()=> (await state()).nav==='loading'&&(await state()).status.includes('最多 2 分鐘'));await click('#toc-stop');await wait(async()=> (await state()).nav==='cancelled');
   return {defaultMinutes:10,savedMinutes:2,persistedAfterReload:true,nextCollectionMinutes:2,explicitStop:true};
 });
 await test('V034-06 a changed offscreen body cancels old navigation rather than highlighting the wrong version',async()=>{
   await evaluate('window.anchorFixture.freeze(false);window.anchorFixture.edit(3);');
   await wait(async()=> (await state()).ids.length===30);
   await click('#toc-list button[data-entry-id="A:u-3"]');
   await driver.wait(async()=> (await state()).archived>0&&(await state()).nav!=='loading',25000);
   const s=await state();assert.notEqual(s.nav,'located');assert.ok(!s.highlight);
   assert.equal(await evaluate(`return [...document.getElementById('chatgpt-toc-root').shadowRoot.querySelectorAll('.archived')].some(n=>n.textContent==='A 本機提問 3');`),true);
   return {falseHighlight:false,oldVersionArchived:true,state:s.nav};
 });
}catch(e){console.error(e);await session.screenshot('failure.png').catch(()=>{});process.exitCode=1;}
finally{await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),source:'Native Firefox isolated addon, localhost virtual renderer with null branch, SPA routing and real extension storage; not ChatGPT LIVE',firefox:(await driver.getCapabilities()).get('browserVersion'),build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
