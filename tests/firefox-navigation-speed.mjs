import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';

const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-navigation-speed');
const { driver, artifacts, action } = session;
const results = [];
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root');if(!h)return null;return {nav:h.dataset.navigation,scope:h.shadowRoot.querySelector('#toc-scope').textContent,status:h.shadowRoot.querySelector('#toc-status').textContent,ids:[...h.shadowRoot.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
async function click(selector) { const root = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot(); await (await root.findElement(By.css(selector))).click(); }
const wait = (predicate, ms = 10000) => driver.wait(predicate, ms);
async function test(name, run) { const actual = await run(); results.push({ name, status: 'PASS', actual }); console.log(`${name} PASS ${JSON.stringify(actual)}`); }

try {
  await driver.get(session.url);
  // All artificial prompt content stays on localhost. This model includes
  // true unmounting, pinned tail turns, fixed-coordinate gaps and slow hydration.
  await evaluate(`window.fixture.mode('mounted');const m=document.querySelector('main');m.removeAttribute('data-fixture-branch');m.setAttribute('data-scroll-root','');m.style.padding='0';m.replaceChildren();
    const inner=document.createElement('div');inner.style.position='relative';m.append(inner);
    let extra=0, delay=500, pending=null;const tops=[];let total=0;
    function layout(){total=0;tops.length=0;for(let i=0;i<40;i++){tops.push(total);total+=i===35?60600:600;if(i===19)total+=extra;}inner.style.height=total+'px';}
    function current(){let index=0;for(let i=0;i<40;i++)if(tops[i]<=m.scrollTop)index=i;return index;}
    function render(){const index=current();inner.replaceChildren();const wanted=new Set([38,39]);for(let i=Math.max(0,index-2);i<=Math.min(39,index+2);i++)wanted.add(i);
      for(const i of [...wanted].sort((a,b)=>a-b)){const u=document.createElement('div');u.setAttribute('data-message-author-role','user');u.setAttribute('data-message-id','speed:u-'+i);u.textContent='本機速度提問 '+i;u.style.cssText='position:absolute;left:20px;right:20px;height:80px;top:'+tops[i]+'px';inner.append(u);
        const a=document.createElement('div');a.setAttribute('data-message-author-role','assistant');a.setAttribute('data-message-id','speed:a-'+i);a.textContent='本機回答 '+i;a.style.cssText='position:absolute;left:20px;right:20px;top:'+(tops[i]+80)+'px;height:'+(i===35?60520:520)+'px';inner.append(a);}}
    const commands=[];let lastTop=m.scrollTop;
    m.addEventListener('scroll',()=>{if(Math.abs(lastTop-m.scrollTop)>2)commands.push({from:lastTop,to:m.scrollTop});lastTop=m.scrollTop;clearTimeout(pending);inner.replaceChildren();pending=setTimeout(render,delay);});
    window.speedFixture={tail(){m.scrollTop=total-m.clientHeight;clearTimeout(pending);render();},at(i){m.scrollTop=tops[i];clearTimeout(pending);render();},moveLayout(){extra=18000;layout();this.tail();},commands,resetCommands(){commands.length=0;lastTop=m.scrollTop;},delay(value){delay=value;},tops};layout();window.speedFixture.tail();`);
  await action(); await wait(async () => (await state())?.ids.length >= 3); await action();
  await test('SPEED-01: collect all40 through a60000px answer and500ms empty hydration', async () => {
    const initial = (await state()).ids.length;
    await evaluate(`window.speedFixture.resetCommands()`);
    const started = performance.now(); await click('#toc-earlier');
    // Collection now proves each physical endpoint for six seconds. Keep a
    // bounded regression budget while preserving exact coverage and giant-answer skipping.
    await wait(async () => { const s=await state(); return s.nav === 'idle' && s.ids.length === 40 && !s.scope.includes('順序待核對'); }, 90000);
    const elapsed = performance.now() - started;
    const s = await state(); assert.deepEqual(s.ids, Array.from({length:40},(_,i)=>'speed:u-'+i));
    assert.ok(!s.scope.includes('順序待核對'));
    const commands = await evaluate(`return window.speedFixture.commands`);
    assert.ok(commands.some(c => c.to - c.from > 50000), 'The forward sweep skips a mounted long answer interior after the head jump');
    assert.ok(elapsed < 90000); await session.screenshot('collected-40.png');
    return { initial, collected:40, elapsedMs:Math.round(elapsed), steps:commands.length, longAnswerJump:true, emptyHydrationMs:500, exactOrder:true };
  });
  await test('SPEED-02: offscreen known prompt walks mounted anchors and verifies remounted identity', async () => {
    await evaluate(`window.speedFixture.tail();window.speedFixture.resetCommands();`);
    await wait(async () => await evaluate(`return !!document.querySelector('[data-message-id="speed:u-39"]')`));
    const started = performance.now(); await click('#toc-list button[data-entry-id="speed:u-3"]');
    await wait(async () => (await state()).nav === 'located' && (await state()).highlight === 'speed:u-3', 30000);
    const elapsed = performance.now() - started, commands = await evaluate(`return window.speedFixture.commands`);
    assert.ok(commands.length <= 60, 'Anchor seeking stays within its bounded traversal budget');
    return { elapsedMs:Math.round(elapsed), jumpCommands:commands.length, exactHighlight:'speed:u-3' };
  });
  await test('SPEED-03: stale positions after an18000px layout shift are refined without wrong highlight', async () => {
    await evaluate(`window.speedFixture.moveLayout();window.speedFixture.resetCommands();`);
    await wait(async () => await evaluate(`return !!document.querySelector('[data-message-id="speed:u-39"]')`));
    const started = performance.now(); await click('#toc-list button[data-entry-id="speed:u-25"]');
    await wait(async () => (await state()).nav === 'located' && (await state()).highlight === 'speed:u-25', 30000);
    const commands = await evaluate(`return window.speedFixture.commands`);
    assert.ok(commands.length <= 60);
    return { elapsedMs:Math.round(performance.now()-started), commands:commands.length, exactHighlight:'speed:u-25', staleGeometry:true };
  });
  await test('SPEED-04: stop during far navigation prevents late movement/highlight and retains40', async () => {
    await evaluate(`window.speedFixture.delay(2000);window.speedFixture.tail();window.speedFixture.resetCommands();`);
    await click('#toc-list button[data-entry-id="speed:u-1"]'); await wait(async () => (await state()).nav === 'loading');
    await click('#toc-stop'); await wait(async () => (await state()).nav === 'cancelled');
    const count = await evaluate(`return window.speedFixture.commands.length`); await driver.sleep(2300);
    assert.equal((await state()).nav,'cancelled'); assert.equal((await state()).ids.length,40);
    assert.equal(await evaluate(`return window.speedFixture.commands.length`), count);
    assert.notEqual((await state()).highlight,'speed:u-1');
    return { state:'cancelled', retained:40, noLateScroll:true, noLateTargetHighlight:true };
  });
} catch (error) { results.push({ name:'execution',status:'FAIL',error:error.message,ui:await state().catch(()=>null),commands:await evaluate(`return window.speedFixture?.commands`).catch(()=>null) });console.error(error);await session.screenshot('speed-fail.png').catch(()=>{});process.exitCode=1; }
finally {const caps=await driver.getCapabilities();await writeFile(resolve(artifacts,'results.json'),JSON.stringify({date:new Date().toISOString(),firefox:caps.get('browserVersion'),source:'synthetic virtual renderer on localhost; not ChatGPT LIVE',build:JSON.parse(await readFile('dist/fixture/build-info.json','utf8')),results},null,2));await session.close();}
