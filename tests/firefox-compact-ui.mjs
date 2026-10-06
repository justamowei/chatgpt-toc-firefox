import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
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
async function test(name, run) {
  const actual = await run(); results.push({ name, status: 'PASS', actual }); console.log(name + ' PASS ' + JSON.stringify(actual));
}
try {
  await driver.get(session.url); await action(); await wait(async () => !!await state()); await action();
  await click('.toggle'); await wait(async () => (await state()).expanded === 'false');
  await test('UI-01: compact rail caps growth at five without discarding the expanded list', async () => {
    const observed = [];
    for (const count of [0, 1, 5, 6, 120]) {
      await prompts(count); const s = await state();
      assert.equal(s.expanded, 'false'); assert.equal(s.marks.length, Math.min(5, count)); assert.equal(s.entries, count);
      assert.ok(s.railHeight < 180, 'Collapsed navigation must remain compact as the conversation grows');
      if (count > 5) { assert.equal(s.marks[0], `ui:${count}:u-0`); assert.equal(s.marks.at(-1), `ui:${count}:u-${count - 1}`); }
      observed.push({ prompts: count, compactMarkers: s.marks.length, height: s.railHeight });
    }
    await session.screenshot('collapsed-120-light.png'); return observed;
  });
  await test('UI-02: expansion restores every marker and repeated collapse preserves all prompts', async () => {
    for (let pass = 0; pass < 2; pass++) {
      await click('.toggle'); await wait(async () => (await state()).expanded === 'true' && (await state()).marks.length === 120);
      assert.equal((await state()).entries, 120);
      if (pass === 0) await session.screenshot('expanded-120-light.png');
      await click('.toggle'); await wait(async () => (await state()).expanded === 'false' && (await state()).marks.length === 5);
      assert.equal((await state()).entries, 120);
    }
    return { expandedMarkers: 120, collapsedMarkers: 5, retainedPrompts: 120, repeatedToggles: 2 };
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
  await test('UI-04: sampled compact markers still locate their exact prompt', async () => {
    const expected = (await state()).marks[2]; await click('.markers .mark:nth-child(3)');
    await wait(async () => (await state()).nav === 'located' && (await state()).highlight === expected);
    assert.equal((await state()).marks.length, 5); assert.equal((await state()).entries, 120);
    return { exactTarget: expected, compactMarkers: 5, retainedPrompts: 120 };
  });
} catch (error) {
  results.push({ name: 'execution', status: 'FAIL', error: error.message, ui: await state().catch(() => null) });
  console.error(error); await session.screenshot('failure.png').catch(() => {}); process.exitCode = 1;
} finally {
  const caps = await driver.getCapabilities();
  await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ date: new Date().toISOString(), firefox: caps.get('browserVersion'), source: 'isolated localhost Firefox addon UI; not ChatGPT LIVE', build: JSON.parse(await readFile('dist/fixture/build-info.json', 'utf8')), results }, null, 2));
  await session.close();
}
