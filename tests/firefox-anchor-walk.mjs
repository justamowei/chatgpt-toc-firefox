import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';

// A renderer contract fixture, not ChatGPT LIVE. Native Firefox performs every
// scrollIntoView. The renderer observes outer-shell edges reaching the viewport,
// not guessed scrollbar coordinates, and mounts one overlapping adjacent window. Scroll
// events alone do not imply new messages. The permanent tail is intentionally
// separated by unseen turns, so choosing the furthest DOM node loses coverage.
// No page prototype hook is used: Firefox content-script Xray wrappers would
// make that hook an invalid observation of the addon's actual DOM operations.
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-anchor-walk');
const { driver, artifacts, action } = session;
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const results = [];
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root');if(!h)return null;const s=h.shadowRoot;return {nav:h.dataset.navigation,expanded:s.querySelector('.toggle').getAttribute('aria-expanded')==='true',status:s.querySelector('#toc-status').textContent,scope:s.querySelector('#toc-scope').textContent,ids:[...s.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
const stats = () => evaluate('return window.anchorFixture.stats();');
async function click(selector) {
  const shadow = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();
  const button = await shadow.findElement(By.css(selector));
  await evaluate('arguments[0].click();', button);
}
let setupSerial = 0;
async function setup(start = 23) {
  await driver.get(session.url.replace('/c/synthetic', '/c/anchor-case-' + ++setupSerial));
  await evaluate(`
    const m=document.querySelector('main');m.removeAttribute('data-fixture-branch');
    m.style.cssText='margin:0;padding:0;position:relative;overflow:visible;height:auto';m.replaceChildren();
    const decoy=document.createElement('div');decoy.setAttribute('data-scroll-root','');decoy.style.cssText='height:650px;overflow:auto';m.before(decoy);
    const root=document.createElement('div');root.setAttribute('data-scroll-root','');root.style.cssText='height:650px;overflow:hidden;position:relative';decoy.append(root);root.append(m);
    const count=30,windowSize=5,heights=Array.from({length:count},(_,i)=>i===11?24500:2600+(i%4)*350);
    const tops=[];let total=0;for(const h of heights){tops.push(total);total+=h;}m.style.height=total+'px';
    let start=arguments[0],frozen=false,timer=null,mounts=[],calls=[],writes=[],events=[],serial=0;
    function render(){
      m.replaceChildren();const wanted=new Set([28,29]);for(let i=start;i<Math.min(count,start+windowSize);i++)wanted.add(i);
      for(const i of [...wanted].sort((a,b)=>a-b))for(const role of ['user','assistant']){
        const shell=document.createElement('section');shell.dataset.testid='conversation-turn-'+serial++;shell.dataset.turn=role;shell.dataset.turnId='anchor:'+role[0]+'-'+i;shell.dataset.anchorIndex=String(i);shell.dataset.anchorRole=role;
        const offset=role==='user'?0:100,height=role==='user'?100:heights[i]-100;
        shell.style.cssText='position:absolute;left:20px;right:20px;top:'+(tops[i]+offset)+'px;height:'+height+'px;content-visibility:auto;contain-intrinsic-size:auto '+height+'px';
        const b=document.createElement('div');b.dataset.messageAuthorRole=role;b.dataset.messageId='anchor:'+role[0]+'-'+i;b.textContent=role==='user'?'錨點本機提問 '+i:'本機長回答 '+i;b.style.cssText='min-height:70px';shell.append(b);m.append(shell);
      }
      mounts.push({start,end:Math.min(count-1,start+windowSize-1),at:performance.now()});
    }
    function observeEdge(){
      const viewport=root.getBoundingClientRect(),end=Math.min(count-1,start+windowSize-1),liveEnd=end>=27?29:end;
      for(const direction of ['older','newer']){
        const index=direction==='older'?start:liveEnd,role=direction==='older'?'user':'assistant';
        const shell=m.querySelector('section[data-anchor-index="'+index+'"][data-anchor-role="'+role+'"]');
        const rect=shell.getBoundingClientRect(),edge=direction==='older'?rect.top:rect.bottom,boundary=direction==='older'?viewport.top:viewport.bottom;
        if(Math.abs(edge-boundary)>32)continue;
        calls.push({index,role,outer:true,pinned:false,direction,start,end,at:performance.now(),top:root.scrollTop,edgeError:edge-boundary});
        if(!frozen){const next=direction==='older'?Math.max(0,start-windowSize+1):Math.min(count-windowSize,start+windowSize-1);
          if(next!==start){clearTimeout(timer);timer=setTimeout(()=>{start=next;render();},130);}}
      }
      // Observe disjoint tail arrivals too. They never advance the renderer and
      // are failures even if every message later happens to be collected.
      if(end<27)for(const shell of m.querySelectorAll('section[data-anchor-index="29"]')){
        const rect=shell.getBoundingClientRect();if(Math.abs(rect.bottom-viewport.bottom)<=32)calls.push({index:29,pinned:true,direction:'newer',start,end,at:performance.now(),top:root.scrollTop});
      }
    }
    root.addEventListener('scroll',()=>{events.push({top:root.scrollTop,at:performance.now()});writes.push({kind:'native-scroll-event',at:performance.now(),top:root.scrollTop});observeEdge();});
    render();root.scrollTop=tops[Math.min(29,start+2)]+20;
    window.anchorFixture={freeze(v=true){frozen=v;},tail(){clearTimeout(timer);start=23;render();root.scrollTop=tops[25]+20;},stats(){return {start,top:root.scrollTop,mounts:mounts.slice(),calls:calls.slice(),writes:writes.slice(),events:events.slice(),lazyShells:m.querySelectorAll('section').length,contentVisibility:getComputedStyle(m.querySelector('section')).contentVisibility,rootHeight:root.scrollHeight,outerHeight:decoy.scrollHeight,outerClient:decoy.clientHeight};}};
  `, start);
  await action();
  await driver.wait(async () => !!(await state()), 10000);
  if (!(await state()).expanded) await click('.toggle');
  await driver.wait(async () => (await state())?.ids.length === 7, 10000);
}
async function waitForCollectedHead() {
  await driver.wait(async () => {
    const s = await state(), f = await stats();
    return s.nav === 'loading' && s.ids.length === 30 && f.start === 0 && f.top <= 2;
  }, 65000);
}
function contiguousMounts(actual) {
  for(let i=1;i<actual.mounts.length;i++)assert.ok(Math.abs(actual.mounts[i].start-actual.mounts[i-1].start)<=4,'Adjacent windows must overlap; unknown middle cannot be skipped');
  assert.equal(actual.calls.filter(c=>c.pinned).length,0,'Disjoint pinned tail must never drive traversal');
}
async function test(name, run) {
  const started=Date.now();
  try {const actual=await run();results.push({name,status:'PASS',elapsedMs:Date.now()-started,actual});console.log(name+' PASS '+JSON.stringify(actual));}
  catch(error){results.push({name,status:'FAIL',elapsedMs:Date.now()-started,error:error.message,ui:await state().catch(()=>null),fixture:await stats().catch(()=>null)});throw error;}
}
try {
  await test('ANCHOR-01: cold seven-message tail traverses native outer shells and collects all thirty exactly', async()=>{
    await setup();const cold=await state();assert.deepEqual(cold.ids,Array.from({length:7},(_,i)=>'anchor:u-'+(23+i)));
    await click('#toc-earlier');await waitForCollectedHead();const s=await state(),f=await stats();
    assert.equal(s.nav,'loading');assert.deepEqual(s.ids,Array.from({length:30},(_,i)=>'anchor:u-'+i));
    assert.ok(f.mounts.some(m=>m.start===0),'Actual first window must have mounted');assert.ok(f.calls.some(c=>c.outer&&c.direction==='older'),'Native edge jump must move the real root');
    assert.equal(f.contentVisibility,'auto');assert.equal(f.outerHeight,f.outerClient,'Outer marker is a decoy');contiguousMounts(f);
    await click('#toc-stop');
    await session.screenshot('anchor-collected-thirty.png');return {cold:7,collected:30,orderExact:true,windows:f.mounts.map(m=>m.start),nativeShellCalls:f.calls.length};
  });
  await test('ANCHOR-02: observed offscreen targets remount by adjacent windows and highlight exact IDs', async()=>{
    const observed=[];
    for(const target of [3,24]){
      if(target===3)await evaluate('window.anchorFixture.tail();');await driver.sleep(450);const before=await stats();
      assert.equal(await evaluate('return !!document.querySelector(arguments[0]);','[data-message-id="anchor:u-'+target+'"]'),false);
      await click('#toc-list button[data-entry-id="anchor:u-'+target+'"]');
      await driver.wait(async()=>{const s=await state();return s.nav==='located'&&s.highlight==='anchor:u-'+target;},18000);
      const f=await stats();const calls=f.calls.slice(before.calls.length);assert.ok(calls.some(c=>c.outer&&c.direction===(target===3?'older':'newer')));
      assert.equal(calls.filter(c=>c.pinned).length,0);observed.push({target,exactHighlight:'anchor:u-'+target,nativeShellCalls:calls.length});
    }
    return observed;
  });
  await test('ANCHOR-03: cold middle retains pinned tail and fills every unknown intervening prompt', async()=>{
    await setup(12);await click('#toc-earlier');await waitForCollectedHead();const s=await state(),f=await stats();
    assert.equal(s.nav,'loading');assert.deepEqual(s.ids,Array.from({length:30},(_,i)=>'anchor:u-'+i));
    assert.ok(f.mounts.some(m=>m.start===0));contiguousMounts(f);
    return {collected:30,pinnedTailRetained:2,unknownMiddleActuallyMounted:true,windows:f.mounts.map(m=>m.start)};
  });
  await test('ANCHOR-04: stationary middle remains retryable beyond three empty batches and can be stopped', async()=>{
    await setup();await evaluate('window.anchorFixture.freeze();');const began=Date.now();await click('#toc-earlier');await driver.sleep(22000);
    const pending=await state(),f=await stats();assert.equal(pending.nav,'loading');assert.equal(pending.ids.length,7);assert.equal(f.mounts.length,1);
    assert.ok(f.top>2,'A stationary middle has not reached the physical head');assert.match(pending.scope,/歷史尚未完整/);
    await click('#toc-stop');await driver.wait(async()=> (await state()).nav==='cancelled',6000);await driver.sleep(300);
    const stopped=await stats();await driver.sleep(700);const after=await stats(),s=await state();
    assert.equal(s.nav,'cancelled');assert.equal(s.ids.length,7);assert.equal(after.calls.length,stopped.calls.length);assert.equal(after.writes.length,stopped.writes.length);
    return {state:s.nav,collected:7,retryableBeforeStop:true,outerCalls:f.calls.length,elapsedMs:Date.now()-began,status:s.status};
  });
  await test('ANCHOR-05: cancelling an in-flight edge mount prevents late scrolling or highlight', async()=>{
    await setup();await click('#toc-earlier');await driver.wait(async()=> (await stats()).calls.length>0,6000);
    await click('#toc-stop');await driver.wait(async()=> (await state()).nav==='cancelled',6000);await driver.sleep(300);
    const stopped=await stats();await driver.sleep(1200);const after=await stats(),s=await state();
    assert.equal(s.nav,'cancelled');assert.equal(after.calls.length,stopped.calls.length);assert.equal(after.writes.length,stopped.writes.length);assert.equal(after.top,stopped.top);assert.ok(s.highlight == null);
    return {state:s.nav,lateAnchorCalls:0,lateRootWrites:0,lateHighlight:false,retained:s.ids.length};
  });
}catch(error){console.error(error);await session.screenshot('anchor-failure.png').catch(()=>{});process.exitCode=1;}
finally {
  const caps=await driver.getCapabilities();
  await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),firefox:caps.get('browserVersion'),source:'localhost renderer contract, native Firefox scrollIntoView and content-visibility shells; not ChatGPT LIVE',liveChatGptAddon:false,build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));
  await session.close();
}
