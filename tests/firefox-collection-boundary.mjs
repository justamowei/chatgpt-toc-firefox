import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';

// Native localhost renderer contract, not ChatGPT LIVE. Outer-shell geometry
// drives lazy mounting. No prototype hook pretends to intercept an extension's
// DOM calls across Firefox's Xray boundary. Native root edge arrivals, immutable
// pending requests and actual mount timestamps are independent observations.
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-collection-boundary');
const { driver, artifacts, action } = session;
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const results = [];
const expected = Array.from({ length: 30 }, (_, i) => 'boundary:u-' + i);
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root');if(!h)return null;const s=h.shadowRoot;return {nav:h.dataset.navigation,expanded:s.querySelector('.toggle').getAttribute('aria-expanded')==='true',status:s.querySelector('#toc-status').textContent,scope:s.querySelector('#toc-scope').textContent,ids:[...s.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
const stats = () => evaluate('return window.boundaryFixture.stats();');
async function click(selector) {
  const shadow = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();
  await evaluate('arguments[0].click();', await shadow.findElement(By.css(selector)));
}
async function setup(mode) {
  await driver.get(session.url);
  await evaluate(`
    const mode=arguments[0],m=document.querySelector('main');m.removeAttribute('data-fixture-branch');
    m.style.cssText='margin:0;padding:0;position:relative;overflow:visible;height:auto';m.replaceChildren();
    const decoy=document.createElement('div');decoy.setAttribute('data-scroll-root','');decoy.style.cssText='height:650px;overflow:auto';m.before(decoy);
    let root=document.createElement('div');root.setAttribute('data-scroll-root','');root.style.cssText='height:650px;overflow:hidden;position:relative';decoy.append(root);root.append(m);
    const count=30,size=5,heights=Array.from({length:count},(_,i)=>i===11?24500:2600+(i%4)*350),tops=[];
    let total=0;for(const height of heights){tops.push(total);total+=height;}m.style.height=total+'px';
    let start=mode==='freeze'?12:(mode==='boundary-reset'||mode==='geometry-only')?0:23,serial=0,pending=null,olderRequests=0,stressArmed=false;
    const mounts=[],arrivals=[],events=[],requests=[],changes=[],headClamps=[];
    function render(){
      m.replaceChildren();const wanted=new Set([28,29]);for(let i=start;i<Math.min(count,start+size);i++)wanted.add(i);
      for(const i of [...wanted].sort((a,b)=>a-b))for(const role of ['user','assistant']){
        const shell=document.createElement('section');shell.dataset.testid='conversation-turn-'+serial++;shell.dataset.turn=role;shell.dataset.turnId='boundary:'+role[0]+'-'+i;shell.dataset.boundaryIndex=String(i);shell.dataset.boundaryRole=role;
        const offset=role==='user'?0:100,height=role==='user'?100:heights[i]-100;
        shell.style.cssText='position:absolute;left:20px;right:20px;top:'+(tops[i]+offset)+'px;height:'+height+'px;content-visibility:auto;contain-intrinsic-size:auto '+height+'px';
        const bubble=document.createElement('div');bubble.dataset.messageAuthorRole=role;bubble.dataset.messageId='boundary:'+role[0]+'-'+i;bubble.textContent=(role==='user'?'Local prompt ':'Local answer ')+i;bubble.style.minHeight='70px';shell.append(bubble);m.append(shell);
      }
      mounts.push({start,end:Math.min(count-1,start+size-1),at:performance.now(),rootTop:root.scrollTop});
    }
    function armBoundaryChanges(){
      if(stressArmed||(mode!=='boundary-reset'&&mode!=='geometry-only'))return;stressArmed=true;
      if(mode==='geometry-only'){
        setTimeout(()=>{root.style.transform='translateY(8px)';changes.push({kind:'viewport-shift',at:performance.now()});},5700);
        setTimeout(()=>{root.style.transform='';changes.push({kind:'viewport-restored',at:performance.now()});},6100);
        return;
      }
      setTimeout(()=>{
        const placeholder=document.createElement('div');placeholder.id='boundary-loading';placeholder.setAttribute('role','progressbar');placeholder.setAttribute('aria-label','Synthetic pending history');placeholder.style.cssText='position:absolute;top:160px;height:20px';m.append(placeholder);m.setAttribute('aria-busy','true');changes.push({kind:'loading-start',at:performance.now()});
      },1200);
      setTimeout(()=>{let slot=1000;for(const shell of m.querySelectorAll('section'))shell.dataset.testid='conversation-turn-'+slot++;changes.push({kind:'slot-renumber',at:performance.now()});},2500);
      setTimeout(()=>{
        const previous=root,position=previous.scrollTop;root=previous.cloneNode(false);previous.replaceWith(root);root.append(m);attach();root.scrollTop=position;changes.push({kind:'root-replaced',at:performance.now()});
      },3500);
      setTimeout(()=>{m.style.height=(total+1800)+'px';changes.push({kind:'height-expanded',at:performance.now()});},4300);
      setTimeout(()=>{m.style.height=total+'px';changes.push({kind:'height-restored',at:performance.now()});},4800);
      setTimeout(()=>{document.getElementById('boundary-loading')?.remove();m.removeAttribute('aria-busy');changes.push({kind:'loading-finished',at:performance.now()});},5200);
      setTimeout(()=>{root.style.transform='translateY(8px)';changes.push({kind:'viewport-shift',at:performance.now()});},5700);
      setTimeout(()=>{root.style.transform='';changes.push({kind:'viewport-restored',at:performance.now()});},6100);
    }
    function requestMove(direction){
      if(mode==='freeze'||pending)return;
      const next=direction==='older'?Math.max(0,start-size+1):Math.min(count-size,start+size-1);
      if(next===start)return;
      if(direction==='older')olderRequests++;
      const delay=(mode==='delay'||mode==='cancel'||mode==='slow-mount')&&direction==='older'&&olderRequests===2?(mode==='slow-mount'?25000:5000):130;
      const request={direction,from:start,to:next,delay,at:performance.now(),committedAt:null};requests.push(request);pending=request;
      // Repeated edge observations do not restart or cancel a pending response.
      setTimeout(()=>{start=next;render();request.committedAt=performance.now();pending=null;},delay);
    }
    function observeEdges(){
      const viewport=root.getBoundingClientRect(),end=Math.min(count-1,start+size-1),liveEnd=end>=27?29:end;
      if(start===0&&root.scrollTop<=2)headClamps.push({at:performance.now(),height:root.scrollHeight,top:root.scrollTop});
      for(const direction of ['older','newer']){
        const index=direction==='older'?start:liveEnd,role=direction==='older'?'user':'assistant';
        const shell=m.querySelector('section[data-boundary-index="'+index+'"][data-boundary-role="'+role+'"]');
        const rect=shell.getBoundingClientRect(),edge=direction==='older'?rect.top:rect.bottom,side=direction==='older'?viewport.top:viewport.bottom;
        if(Math.abs(edge-side)>32)continue;
        arrivals.push({index,role,direction,start,end,at:performance.now(),top:root.scrollTop,pinned:false});
        if(direction==='older'&&start===0)armBoundaryChanges();requestMove(direction);
      }
      if(end<27)for(const shell of m.querySelectorAll('section[data-boundary-index="29"]')){
        const rect=shell.getBoundingClientRect();if(Math.abs(rect.bottom-viewport.bottom)<=32)arrivals.push({index:29,direction:'newer',start,end,at:performance.now(),top:root.scrollTop,pinned:true});
      }
    }
    function attach(){root.addEventListener('scroll',()=>{events.push({at:performance.now(),top:root.scrollTop});observeEdges();});}
    render();attach();root.scrollTop=tops[start+2]+20;
    window.boundaryFixture={stats(){return {mode,start,top:root.scrollTop,height:root.scrollHeight,client:root.clientHeight,pending:pending?{...pending}:null,mounts:mounts.map(e=>({...e})),arrivals:arrivals.map(e=>({...e})),events:events.map(e=>({...e})),requests:requests.map(e=>({...e})),changes:changes.map(e=>({...e})),headClamps:headClamps.map(e=>({...e}))};}};
  `, mode);
  await action();await driver.wait(async () => !!(await state()), 10000);
  if (!(await state()).expanded) await click('.toggle');
  await driver.wait(async () => (await state())?.ids.length === 7, 10000);
}
async function finish(ms = 70000) { await driver.wait(async () => (await state()).nav !== 'loading', ms); }
function verifySweep(fixture) {
  const head = fixture.mounts.find(m => m.start === 0);
  const firstNewer = fixture.arrivals.find(a => a.direction === 'newer');
  assert.ok(head, 'Window zero must actually mount');assert.ok(firstNewer, 'Sweep must reach an observed newer outer edge');
  assert.ok(firstNewer.at > head.at, 'A delayed or stalled older window cannot trigger early reverse');
  const clamp = fixture.headClamps.find(c => c.at >= head.at);
  assert.ok(clamp, 'The actual conversation root must reach the physical head');
  assert.ok(firstNewer.at - clamp.at >= 5900, 'Reverse needs a stable physical head, not two short stalls');
  assert.equal(fixture.arrivals.filter(a => a.pinned).length, 0, 'Never jump over unknown middle via pinned tail');
  for(let i=1;i<fixture.mounts.length;i++)assert.ok(Math.abs(fixture.mounts[i].start-fixture.mounts[i-1].start)<=4, 'Each mounted window must overlap its predecessor');
  return {firstHeadAt:Math.round(head.at),firstClampAt:Math.round(clamp.at),firstNewerAt:Math.round(firstNewer.at)};
}
async function test(name, run) {
  const began=Date.now();
  try{const actual=await run();results.push({name,status:'PASS',elapsedMs:Date.now()-began,actual});console.log(name+' PASS '+JSON.stringify(actual));}
  catch(error){results.push({name,status:'FAIL',elapsedMs:Date.now()-began,error:error.message,ui:await state().catch(()=>null),fixture:await stats().catch(()=>null)});throw error;}
}
try {
  await test('BOUNDARY-01: second older request waits five seconds and fills all thirty before reverse', async()=>{
    await setup('delay');await click('#toc-earlier');await finish();const s=await state(),f=await stats();
    assert.equal(s.nav,'idle');assert.deepEqual(s.ids,expected);
    const delayed=f.requests.filter(r=>r.direction==='older')[1];assert.equal(delayed.delay,5000);assert.ok(delayed.committedAt-delayed.at>=4950);
    const proof=verifySweep(f);await session.screenshot('delayed-older-thirty.png');
    return {collected:30,exactOrder:true,delayedMountMs:Math.round(delayed.committedAt-delayed.at),newerAfterFirstZero:true,...proof};
  });
  await test('BOUNDARY-02: frozen middle remains retryable beyond three empty batches until explicit stop', async()=>{
    await setup('freeze');const began=Date.now();await click('#toc-earlier');await driver.sleep(22000);const pending=await state(),f=await stats();
    assert.equal(pending.nav,'loading');assert.equal(pending.ids.length,7);assert.equal(f.mounts.length,1);assert.ok(f.top>f.client,'The frozen root still has substantial older space');
    assert.equal(f.arrivals.filter(a=>a.direction==='newer').length,0);assert.equal(f.headClamps.length,0);
    await click('#toc-stop');await driver.wait(async()=> (await state()).nav==='cancelled',6000);const s=await state();
    return {collected:7,remainingOlderPixels:Math.round(f.top),newerArrivals:0,retryableBeforeStop:true,elapsedMs:Date.now()-began,status:s.status};
  });
  await test('BOUNDARY-03: placeholder, slots, root, height and viewport shifts reset head evidence', async()=>{
    await setup('boundary-reset');await click('#toc-earlier');await finish();const s=await state(),f=await stats();
    assert.equal(s.nav,'idle');assert.deepEqual(s.ids,expected);const proof=verifySweep(f);
    assert.deepEqual(f.changes.map(c=>c.kind),['loading-start','slot-renumber','root-replaced','height-expanded','height-restored','loading-finished','viewport-shift','viewport-restored']);
    const settled=f.changes.at(-1),firstNewer=f.arrivals.find(a=>a.direction==='newer');
    assert.ok(firstNewer.at-settled.at>=5900,'No boundary proof survives loading, changed root/extent or viewport geometry');
    assert.ok(s.ids.every(id=>id.startsWith('boundary:u-')),'Unidentified loading nodes cannot become prompts');
    return {collected:30,exactOrder:true,changes:f.changes.map(c=>c.kind),stableAfterLastChangeMs:Math.round(firstNewer.at-settled.at),...proof};
  });
  await test('BOUNDARY-04: cancellation during five-second pending mount has no late root movement or highlight', async()=>{
    await setup('cancel');await click('#toc-earlier');await driver.wait(async()=> (await stats()).pending?.delay===5000,10000);
    await click('#toc-stop');await driver.wait(async()=> (await state()).nav==='cancelled',6000);await driver.sleep(300);const stopped=await stats();
    await driver.sleep(5500);const after=await stats(),s=await state();
    assert.equal(s.nav,'cancelled');assert.equal(after.top,stopped.top);assert.equal(after.events.length,stopped.events.length);assert.equal(after.arrivals.length,stopped.arrivals.length);assert.ok(s.highlight==null);
    assert.ok(after.requests.some(r=>r.delay===5000&&r.committedAt!==null),'The previously issued renderer response must actually arrive after cancellation');
    return {state:s.nav,lateRootScrollEvents:0,lateEdgeArrivals:0,lateHighlight:false,retained:s.ids.length,rendererCompleted:true};
  });
  await test('BOUNDARY-05: isolated viewport movement invalidates six-second proof with unchanged IDs and extent', async()=>{
    await setup('geometry-only');await click('#toc-earlier');await finish();const s=await state(),f=await stats();
    assert.equal(s.nav,'idle');assert.deepEqual(s.ids,expected);const proof=verifySweep(f);
    assert.deepEqual(f.changes.map(c=>c.kind),['viewport-shift','viewport-restored']);
    const restored=f.changes.at(-1),firstNewer=f.arrivals.find(a=>a.direction==='newer');
    assert.ok(firstNewer.at-restored.at>=5900,'Viewport movement alone must reset proof before the first batch could declare its head');
    return {collected:30,exactOrder:true,stableAfterGeometryRestoreMs:Math.round(firstNewer.at-restored.at),...proof};
  });
  await test('BOUNDARY-06: a 25-second middle mount survives repeated empty batches without early reverse', async()=>{
    await setup('slow-mount');await click('#toc-earlier');await finish(100000);const s=await state(),f=await stats();
    assert.equal(s.nav,'idle');assert.deepEqual(s.ids,expected);
    const delayed=f.requests.filter(r=>r.direction==='older')[1];assert.equal(delayed.delay,25000);assert.ok(delayed.committedAt-delayed.at>=24900);
    const proof=verifySweep(f);return {collected:30,exactOrder:true,delayedMountMs:Math.round(delayed.committedAt-delayed.at),...proof};
  });
}catch(error){console.error(error);await session.screenshot('boundary-failure.png').catch(()=>{});process.exitCode=1;}
finally {
  const caps=await driver.getCapabilities();
  await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),firefox:caps.get('browserVersion'),source:'localhost delayed outer-shell renderer, native root geometry and content-visibility; not ChatGPT LIVE',liveChatGptAddon:false,build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));
  await session.close();
}
