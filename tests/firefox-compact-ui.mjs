import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By, Key } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';

const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-compact-ui');
const { driver, artifacts, action } = session;
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const results = [];
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root');if(!h)return null;const s=h.shadowRoot,t=s.querySelector('.toggle'),r=s.querySelector('.rail'),p=s.querySelector('.panel');return {expanded:t.getAttribute('aria-expanded'),entries:s.querySelectorAll('#toc-list button').length,marks:[...s.querySelectorAll('.mark')].map(n=>n.dataset.entryId),toggleText:t.textContent,toggleWriting:getComputedStyle(t).writingMode,toggleWidth:t.getBoundingClientRect().width,toggleHeight:t.getBoundingClientRect().height,railHeight:r.getBoundingClientRect().height,railWidth:r.getBoundingClientRect().width,accent:getComputedStyle(h).getPropertyValue('--accent').trim(),theme:h.dataset.theme,panel:{left:p.getBoundingClientRect().left,right:p.getBoundingClientRect().right},width:innerWidth,nav:h.dataset.navigation,highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
async function click(selector) {
  const shadow = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();
  await (await shadow.findElement(By.css(selector))).click();
}
const wait = predicate => driver.wait(predicate, 10000);
async function prompts(count) {
  await evaluate(`history.pushState({},'', '/c/compact-'+arguments[0]);const m=document.querySelector('main');m.removeAttribute('data-fixture-branch');m.replaceChildren();m.scrollTop=0;for(let i=0;i<arguments[0];i++){const a=document.createElement('article');a.dataset.testid='conversation-turn-'+(i*2);const u=document.createElement('div');u.dataset.messageAuthorRole='user';u.dataset.messageId='ui:'+arguments[0]+':u-'+i;u.textContent='Local UI prompt '+i;const b=document.createElement('div');b.dataset.messageAuthorRole='assistant';b.dataset.messageId='ui:'+arguments[0]+':a-'+i;b.textContent='Local reply '+i;a.append(u,b);m.append(a);}`, count);
  await wait(async () => (await state()).entries === count);
}
async function mount(indices) {
  await evaluate(`const m=document.querySelector('main');m.replaceChildren();m.scrollTop=0;for(const i of arguments[0]){const a=document.createElement('article');a.dataset.testid='conversation-turn-'+i*2;for(const role of ['user','assistant']){const b=document.createElement('div');b.dataset.messageAuthorRole=role;b.dataset.messageId='ui:120:'+ (role==='user'?'u':'a')+'-'+i;b.textContent=(role==='user'?'Local UI prompt ':'Local reply ')+i;a.append(b);}m.append(a);}`, indices);
  const ids = indices.map(i => `ui:120:u-${i}`);
  await wait(async () => JSON.stringify((await state()).marks) === JSON.stringify(ids));
  assert.equal((await state()).entries, 120);
}
async function shiftO() { await driver.actions().keyDown(Key.SHIFT).sendKeys('o').keyUp(Key.SHIFT).perform(); }
async function test(name, run) {
  const actual = await run(); results.push({ name, status: 'PASS', actual }); console.log(name + ' PASS ' + JSON.stringify(actual));
}
try {
  await driver.get(session.url); await action(); await wait(async () => !!await state()); await action();
  await click('.toggle'); await wait(async () => (await state()).expanded === 'false');
  await test('UI-01: rail follows mounted prompts rather than cached-history sampling', async () => {
    const observed = [];
    for (const count of [0, 1, 5, 6, 120]) {
      await prompts(count); const s = await state();
      assert.equal(s.expanded, 'false'); assert.equal(s.marks.length, count); assert.equal(s.entries, count);
      const bounds=await evaluate(`const s=document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('.markers');return {client:s.clientHeight,scroll:s.scrollHeight,viewport:innerHeight};`);
      assert.ok(bounds.client <= bounds.viewport*.5+1, 'Mounted markers stay within half the viewport');
      if(count===120)assert.ok(bounds.scroll>bounds.client,'A large mounted window has an actual scrollbar');
      if (count > 5) { assert.equal(s.marks[0], `ui:${count}:u-0`); assert.equal(s.marks.at(-1), `ui:${count}:u-${count - 1}`); }
      observed.push({ prompts: count, compactMarkers: s.marks.length, height: s.railHeight });
    }
    await mount([111,112,113,114,115,116]);
    assert.equal((await state()).marks.length, 6); assert.ok((await state()).railHeight < 180);
    await session.screenshot('collapsed-120-light.png'); return {allMounted:observed,cache:120,mounted:6,railUsesOnlyMounted:true};
  });
  await test('UI-02: expanded text retains 120 prompts while the rail stays within the mounted six', async () => {
    for (let pass = 0; pass < 2; pass++) {
      await click('.toggle'); await wait(async () => (await state()).expanded === 'true' && (await state()).marks.length === 6);
      assert.equal((await state()).entries, 120);
      if (pass === 0) await session.screenshot('expanded-120-light.png');
      await click('.toggle'); await wait(async () => (await state()).expanded === 'false' && (await state()).marks.length === 6);
      assert.equal((await state()).entries, 120);
    }
    return { expandedMarkers: 6, collapsedMarkers: 6, retainedPrompts: 120, repeatedToggles: 2 };
  });
  await test('UI-03: horizontal neutral navigation fits light, dark and narrow windows', async () => {
    const light = await state(); assert.equal(light.toggleWriting, 'horizontal-tb'); assert.ok(light.toggleWidth > light.toggleHeight);
    assert.equal(light.accent, '#6366f1');
    await evaluate(`document.documentElement.classList.add('dark')`); await wait(async () => (await state()).theme === 'dark');
    assert.equal((await state()).accent, '#a5b4fc'); await session.screenshot('collapsed-120-dark.png');
    await driver.manage().window().setRect({ width: 480, height: 800 });
    await click('.toggle'); await wait(async () => (await state()).expanded === 'true');
    const narrow = await state(); assert.ok(narrow.panel.left >= 0 && narrow.panel.right <= narrow.width);
    await session.screenshot('expanded-120-dark-narrow.png'); await click('.toggle');
    await driver.manage().window().setRect({ width: 1200, height: 900 });
    return { writingMode: light.toggleWriting, lightAccent: light.accent, darkAccent: '#a5b4fc', narrowPanel: narrow.panel };
  });
  await test('UI-04: live compact markers locate their exact mounted prompt', async () => {
    const expected = (await state()).marks[2]; await click('.markers .mark:nth-child(3)');
    await wait(async () => (await state()).nav === 'located' && (await state()).highlight === expected);
    assert.equal((await state()).marks.length, 6); assert.equal((await state()).entries, 120);
    return { exactTarget: expected, compactMarkers: 6, retainedPrompts: 120 };
  });
  await test('UI-05: changing and empty mounts update rail without losing offscreen searchable history', async () => {
    await mount([10,11,12,13,14]); await mount([]);
    assert.equal((await state()).marks.length,0); assert.equal((await state()).entries,120);
    await click('.toggle'); await wait(async()=>(await state()).expanded==='true');
    const shadow=await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();
    const input=await shadow.findElement(By.id('toc-search')); await input.sendKeys('Local UI prompt 119');
    await wait(async()=>(await state()).entries===1); assert.equal((await state()).marks.length,0);
    await input.clear(); await wait(async()=>(await state()).entries===120);
    await click('.toggle'); await mount([70,71,72,73,74,118]);
    await evaluate(`const u=document.createElement('div');u.dataset.messageAuthorRole='user';u.textContent='Unidentified local prompt';document.querySelector('main').append(u);`);
    await wait(async()=>(await state()).entries===121); assert.equal((await state()).marks.length,6);
    await evaluate(`document.querySelector('main > div[data-message-author-role]').remove()`);
    await wait(async()=>(await state()).entries===120);
    return {emptyRail:0,cacheRetained:120,offscreenSearch:true,newWindowRail:6,unidentifiedPromptExcluded:true};
  });
  await test('UI-06: trusted Shift+O opens and focuses search; Escape closes; plain o does not open', async () => {
    await evaluate('document.activeElement?.blur();'); await shiftO();
    await wait(async()=>(await state()).expanded==='true');
    assert.ok(await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.activeElement?.id==='toc-search'`));
    await driver.actions().sendKeys(Key.ESCAPE).perform();await wait(async()=>(await state()).expanded==='false');
    await evaluate('document.activeElement?.blur();'); await driver.actions().sendKeys('o').perform();assert.equal((await state()).expanded,'false');
    return {trustedShiftO:true,searchFocused:true,escapeCloses:true,plainOIignored:true};
  });
  await test('UI-07: typing and composition/modifier/repeat keys never open the panel or consume text', async () => {
    const field=await driver.findElement(By.css('footer input')); await field.click();await field.clear();await shiftO();
    assert.equal((await state()).expanded,'false');assert.equal(await field.getAttribute('value'),'O');
    await evaluate(`const editor=document.createElement('div');editor.id='local-editor';editor.contentEditable='true';editor.innerHTML='<span>Type here: </span>';document.body.append(editor);editor.focus();`);
    await shiftO(); assert.equal((await state()).expanded,'false');assert.ok((await evaluate(`return document.getElementById('local-editor').textContent`)).includes('O'));
    await evaluate(`const host=document.createElement('div');host.id='local-shadow-editor';const s=host.attachShadow({mode:'open'});const i=document.createElement('input');s.append(i);document.body.append(host);i.focus();`);
    await shiftO();assert.equal((await state()).expanded,'false');assert.equal(await evaluate(`return document.getElementById('local-shadow-editor').shadowRoot.querySelector('input').value`),'O');
    const guards=await evaluate(`document.body.tabIndex=-1;document.body.focus();const cases=[{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}];return cases.map(extra=>{const e=new KeyboardEvent('keydown',{key:'O',shiftKey:true,bubbles:true,cancelable:true,composed:true,...extra});document.body.dispatchEvent(e);return !e.defaultPrevented;});`);
    assert.ok(guards.every(Boolean));assert.equal((await state()).expanded,'false');
    await evaluate(`const e=new KeyboardEvent('keydown',{key:'O',shiftKey:true,bubbles:true,cancelable:true});e.preventDefault();document.body.dispatchEvent(e);`);
    assert.equal((await state()).expanded,'false');
    await shiftO();await wait(async()=>(await state()).expanded==='true');await shiftO();
    assert.equal(await evaluate(`return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-search').value`),'O');
    assert.equal((await state()).expanded,'true');
    return {inputTypedO:true,contenteditableTypedO:true,shadowInputTypedO:true,guardCasesUnconsumed:guards.length,searchTypedO:true};
  });
} catch (error) {
  results.push({ name: 'execution', status: 'FAIL', error: error.message, ui: await state().catch(() => null) });
  console.error(error); await session.screenshot('failure.png').catch(() => {}); process.exitCode = 1;
} finally {
  const caps = await driver.getCapabilities();
  await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ date: new Date().toISOString(), firefox: caps.get('browserVersion'), source: 'isolated localhost Firefox addon UI; not ChatGPT LIVE', build: JSON.parse(await readFile('dist/fixture/build-info.json', 'utf8')), results }, null, 2));
  await session.close();
}
