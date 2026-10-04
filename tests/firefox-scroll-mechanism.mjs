import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';

const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-scroll-mechanism');
const { driver, artifacts, action } = session;
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const results = [];
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root');if(!h)return null;return {nav:h.dataset.navigation,status:h.shadowRoot.querySelector('#toc-status').textContent,scope:h.shadowRoot.querySelector('#toc-scope').textContent,ids:[...h.shadowRoot.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
async function click(selector) { const root=await(await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();await(await root.findElement(By.css(selector))).click(); }
async function setup(mode='nested') {
  await driver.get(session.url);
  await evaluate(`const m=document.querySelector('main');m.removeAttribute('data-fixture-branch');m.style.cssText='margin:0;padding:0;height:auto;overflow:visible';m.replaceChildren();
    const decoy=document.createElement('div');decoy.dataset.scrollRoot='';decoy.style.cssText='height:650px;overflow:auto';m.before(decoy);
    let root=document.createElement('div');root.dataset.scrollRoot='';root.style.cssText='height:650px;overflow:hidden;position:relative';decoy.append(root);root.append(m);
    let tops=[],total=0,delay=350,pending=null,events=[],unmounts=0,replaceOnce=false,evictOnce=false,lastScroll=performance.now(),replacements=[],evictions=[];
    const ledger=[];const answers=Array.from({length:18},(_,i)=>i===8?7800:850+(i%4)*170);
    function layout(){tops=[];total=0;for(let i=0;i<18;i++){tops.push(total);total+=100+answers[i]+100;}m.style.height=total+'px';m.style.position='relative';}
    function render(){let index=0;for(let i=0;i<18;i++)if(tops[i]<=root.scrollTop)index=i;m.replaceChildren();const wanted=new Set([16,17]);for(let i=Math.max(0,index-1);i<=Math.min(17,index+2);i++)wanted.add(i);
      for(const i of [...wanted].sort((a,b)=>a-b)){const u=document.createElement('div');u.dataset.messageAuthorRole='user';u.dataset.messageId='mechanism:u-'+i;u.textContent='掛載機制測試 '+i;u.style.cssText='position:absolute;left:20px;right:20px;top:'+tops[i]+'px;height:100px';m.append(u);
      const a=document.createElement('div');a.dataset.messageAuthorRole='assistant';a.dataset.messageId='mechanism:a-'+i;a.textContent='本機回答 '+i;a.style.cssText='position:absolute;left:20px;right:20px;top:'+(tops[i]+100)+'px;height:'+answers[i]+'px';m.append(a);}}
    function attach(){root.addEventListener('scroll',()=>{lastScroll=performance.now();events.push({top:root.scrollTop,height:root.scrollHeight,at:lastScroll});clearTimeout(pending);m.replaceChildren();unmounts++;
      if(replaceOnce){replaceOnce=false;replacements.push(performance.now());const old=root,position=old.scrollTop;root=old.cloneNode(false);old.replaceWith(root);root.append(m);attach();root.scrollTop=position;}
      if(evictOnce){evictOnce=false;evictions.push(performance.now());root.scrollTop=total-root.clientHeight;}
      pending=setTimeout(render,delay);});}
    layout();attach();root.scrollTop=total-root.clientHeight;render();
    window.mechanism={tail(){root.scrollTop=total-root.clientHeight;render();},head(){root.scrollTop=0;render();},replace(){replaceOnce=true;return performance.now();},evict(){evictOnce=true;return performance.now();},delay(v){delay=v;},getRoot(){return root;},events,quiet(){return performance.now()-lastScroll>550&&m.children.length>0;},stats(){return {top:root.scrollTop,height:root.scrollHeight,client:root.clientHeight,events:events.length,unmounts,replacements,evictions};}};
    if(arguments[0]==='plain')decoy.removeAttribute('data-scroll-root');`,mode);
  await action();await driver.wait(async()=>(await state())?.ids.length>=2,10000);await action();
}
async function test(name,run){const actual=await run();results.push({name,status:'PASS',actual});console.log(name+' PASS '+JSON.stringify(actual));}
const quiet = () => driver.wait(async()=>await evaluate(`return window.mechanism.quiet()`),6000);
try {
  await test('MECH-01: real nested-scroll shape ignores a non-scrollable outer marker and moves hidden inner root',async()=>{
    await setup();await click('#toc-earlier');
    await driver.wait(async()=>await evaluate(`return window.mechanism.events.length>1 && window.mechanism.getRoot().scrollTop<1000`),9000);
    await driver.wait(async()=>(await state()).ids.some(id=>id==='mechanism:u-0'),10000);
    const stats=await evaluate(`return window.mechanism.stats()`);assert.ok(stats.unmounts>0);return stats;
  });
  await test('MECH-02: head collection sweeps unseen middle instead of declaring a head jump complete',async()=>{
    await driver.wait(async()=>(await state()).ids.length===18&&(await state()).nav==='idle',55000);
    const s=await state();assert.deepEqual(s.ids,Array.from({length:18},(_,i)=>'mechanism:u-'+i));assert.ok(s.scope.includes('歷史尚未完整'));assert.ok(!s.scope.includes('順序待核對'));
    await session.screenshot('collected-18-nested.png');return {collected:18,exactOrder:true,scope:s.scope,stats:await evaluate(`return window.mechanism.stats()`)};
  });
  await test('MECH-HEIGHT: warm measured turn spans accelerate a far user jump',async()=>{
    await evaluate(`window.mechanism.tail();`);await quiet();await click('#toc-list button[data-entry-id="mechanism:u-7"]');
    await driver.wait(async()=>(await state()).nav==='located'&&(await state()).highlight==='mechanism:u-7',16000);
    await click('#toc-diagnose');const d=JSON.parse(await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-diagnosis').textContent`));
    assert.equal(d.navigation.lastAttempt.method,'measured-turn-spans');return {method:d.navigation.lastAttempt.method,exactHighlight:'mechanism:u-7',geometry:d.navigation.geometry};
  });
  await test('MECH-03: replacing scroll root during navigation recovers the exact target',async()=>{
    await evaluate(`window.mechanism.tail();`);await quiet();const armed=await evaluate(`return window.mechanism.replace()`);await click('#toc-list button[data-entry-id="mechanism:u-2"]');
    await driver.wait(async()=>(await state()).nav==='located'&&(await state()).highlight==='mechanism:u-2',16000);
    const stats=await evaluate(`return window.mechanism.stats()`);assert.equal(stats.replacements.length,1);assert.ok(stats.replacements[0]>=armed);
    return {exactHighlight:'mechanism:u-2',replacementAfterArming:true,stats};
  });
  await test('MECH-04: async eviction during a mounted target jump retries exact remount',async()=>{
    await evaluate(`window.mechanism.head();`);await quiet();const armed=await evaluate(`return window.mechanism.evict()`);await driver.wait(async()=>await evaluate(`return !!document.querySelector('[data-message-id="mechanism:u-1"]')`),5000);
    await click('#toc-list button[data-entry-id="mechanism:u-1"]');await driver.wait(async()=>(await state()).nav==='located'&&(await state()).highlight==='mechanism:u-1',16000);
    const stats=await evaluate(`return window.mechanism.stats()`);assert.equal(stats.evictions.length,1);assert.ok(stats.evictions[0]>=armed);
    return {exactHighlight:'mechanism:u-1',evictionAfterArming:true,state:(await state()).nav};
  });
  await test('MECH-06: reading return waits for remount after its final offset scroll',async()=>{
    await evaluate(`window.mechanism.tail();`);await quiet();
    const before=await evaluate(`return document.querySelector('[data-message-id="mechanism:a-17"]').getBoundingClientRect().top`);
    await click('#toc-list button[data-entry-id="mechanism:u-3"]');await driver.wait(async()=>(await state()).nav==='located',16000);
    await click('#toc-back');await driver.wait(async()=>await evaluate(`return document.getElementById('chatgpt-toc-root').dataset.restored==='true'`),18000);
    await quiet();const after=await evaluate(`return document.querySelector('[data-message-id="mechanism:a-17"]').getBoundingClientRect().top`);assert.ok(Math.abs(after-before)<=24);
    return {sameAnswer:'mechanism:a-17',offsetBefore:before,offsetAfter:after,remounted:true};
  });
  await test('MECH-05: diagnostic exposes geometry and actual movement without message IDs or text',async()=>{
    await click('#toc-list button[data-entry-id="mechanism:u-7"]');await driver.wait(async()=>(await state()).nav==='located',16000);
    await click('#toc-diagnose');const raw=await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-diagnosis').textContent`);
    const d=JSON.parse(raw);assert.ok(d.navigation.scroll);assert.ok(d.navigation.lastAttempt);assert.equal(d.navigation.scroll.tag,'DIV');assert.ok(!raw.includes('mechanism:u-'));assert.ok(!raw.includes('掛載機制測試'));
    return d.navigation;
  });
}catch(error){results.push({name:'execution',status:'FAIL',error:error.message,ui:await state().catch(()=>null),stats:await evaluate(`return window.mechanism?.stats()`).catch(()=>null)});console.error(error);await session.screenshot('failure.png').catch(()=>{});process.exitCode=1;}
finally{const caps=await driver.getCapabilities();await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),firefox:caps.get('browserVersion'),source:'localhost nested scrolling and virtual unmount model; not real ChatGPT LIVE',build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
