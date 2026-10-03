import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';

// Real message/role/slot snapshots, rebuilt on localhost. No real profile,
// cookies, ChatGPT API, or direct automation of a user's Firefox session.
const evidence = JSON.parse(await readFile('docs/evidence/iab-2026-10-03/live-dom-evidence.json', 'utf8'));
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-seen-cache');
const { driver, action, artifacts } = session;
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const results = [];
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root'); if(!h)return null;const r=h.shadowRoot;return {scope:r.querySelector('#toc-scope').textContent,nav:h.dataset.navigation,items:[...r.querySelectorAll('#toc-list button')].map(b=>({id:b.dataset.entryId,text:b.title,disabled:b.disabled})),archived:[...r.querySelectorAll('.archived')].map(e=>e.title),back:!r.querySelector('#toc-back').disabled};`);
const wait = predicate => driver.wait(predicate, 10000);
async function click(selector) { const root = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot(); await (await root.findElement(By.css(selector))).click(); }
async function test(name, run) { const actual = await run(); results.push({ name, status: 'PASS', actual }); console.log(`${name} PASS ${JSON.stringify(actual)}`); }
async function frame(snapshot) {
  await evaluate(`const m=document.querySelector('main'); m.removeAttribute('data-fixture-branch');m.setAttribute('data-scroll-root','');m.replaceChildren();
    for(const e of arguments[0]){const s=document.createElement('section');s.setAttribute('data-testid',e.slot);s.setAttribute('data-turn',e.role);s.setAttribute('data-turn-id',e.id);s.style.cssText='min-height:240px;padding:25px';const b=document.createElement('div');b.setAttribute('data-message-author-role',e.role);b.setAttribute('data-message-id',e.id);b.textContent=e.role==='user'?e.text:'本機重播回答錨點，沒有保存真實回答全文。';s.append(b);m.append(s);}`, snapshot.messages);
}
try {
  await driver.get(session.url);
  const initial = evidence.snapshots.find(s => s.action === 'cold-initial');
  await frame(initial); await action(); await wait(async () => (await state())?.items.length === 4); await action();
  await test('CACHE-01: real snapshot cold collection retains exact 12 IDs/text through slot renumbering', async () => {
    let count = 4;
    for (const snapshot of evidence.snapshots.filter(s => s.action.startsWith('cold-') && s.action !== 'cold-initial')) {
      await frame(snapshot); const mounted = snapshot.messages.filter(e => e.role === 'user').length;
      await wait(async () => { const s = await state(); return s.items.length >= count && s.scope.includes(`目前掛載 ${mounted} 則`); });
      const s = await state(); count = s.items.length; assert.equal(s.archived.length, 0);
    }
    const s = await state(); assert.equal(s.items.length, 12);
    assert.deepEqual(s.items.map(e => e.id), evidence.expectedPrompts.map(e => e.id));
    for (const entry of evidence.expectedPrompts) assert.equal(s.items.find(e => e.id === entry.id).text, entry.text);
    return { count: 12, slotChangesPreserved: true, quarantined: 0 };
  });
  await test('CACHE-02: returning to a tail window keeps offscreen search and reading return', async () => {
    await frame(evidence.snapshots.find(s => s.action === 'tail-confirmed'));
    await wait(async () => (await state()).scope.includes('目前掛載 2 則'));
    assert.equal((await state()).items.length, 12);
    const shadow = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();
    const input = await shadow.findElement(By.id('toc-search')); await input.sendKeys('TOC-LIVE-SHORT');
    await wait(async () => (await state()).items.length === 1);
    assert.equal((await state()).items[0].id, evidence.expectedPrompts[0].id);
    await input.clear(); await input.sendKeys(' '); await wait(async () => (await state()).items.length === 12);
    const target = evidence.expectedPrompts.at(-1).id;
    await click(`#toc-list button[data-entry-id="${target}"]`); await wait(async () => (await state()).nav === 'located');
    assert.equal(await evaluate(`return document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')`), target);
    await click('#toc-back'); await wait(async () => await evaluate(`return document.getElementById('chatgpt-toc-root').dataset.restored==='true'`));
    return { retained: 12, offscreenSearch: true, exactHighlight: true, returnRestored: true };
  });
  await test('CACHE-03: empty mounts and first-seen removed subtrees survive UI debounce', async () => {
    await evaluate(`const m=document.querySelector('main');m.replaceChildren();const b=document.createElement('div');b.setAttribute('data-message-author-role','user');b.setAttribute('data-message-id','flash-prompt');b.textContent='瞬間掛載提問';m.append(b);b.remove();`);
    await wait(async () => (await state()).items.some(e => e.id === 'flash-prompt'));
    const s = await state(); assert.equal(s.items.length, 13); assert.match(s.scope, /目前掛載 0 則/); assert.match(s.scope, /順序待核對/);
    assert.equal(s.items.find(e => e.id === 'flash-prompt').disabled, true);
    return { retained: 13, emptyMountRetained: true, removedFirstSeen: true, uncertainOrderDisabled: true };
  });
  await test('CACHE-04: prefix edits quarantine old versions; never erase previously observed text', async () => {
    await frame(evidence.snapshots.find(s => s.action === 'head-return-confirmed'));
    await wait(async () => (await state()).scope.includes('目前掛載 5 則'));
    const id = evidence.expectedPrompts[0].id, text = evidence.expectedPrompts[0].text;
    await evaluate(`document.querySelector('[data-message-id="'+arguments[0]+'"]').textContent=arguments[1];`, id, text + ' 追加編輯版本');
    await wait(async () => (await state()).archived.length === 13);
    const s = await state(); assert.ok(s.archived.includes(text)); assert.ok(s.items.some(e => e.id === id && e.text.endsWith('追加編輯版本'))); assert.equal(s.back, false);
    return { historicalVersions: 13, editedCurrent: true, oldTextSearchable: true, staleReturnDisabled: true };
  });
  await test('CACHE-05: SPA URL transitions exclude old DOM and late removed old-route prompts', async () => {
    await evaluate(`history.pushState({},'', '/c/cache-other');`);
    await wait(async () => (await state()).items.length === 0 && (await state()).archived.length === 0);
    await evaluate(`const m=document.querySelector('main');m.replaceChildren();const b=document.createElement('div');b.setAttribute('data-message-author-role','user');b.setAttribute('data-message-id','new-route-user');b.textContent='新對話提問';m.append(b);`);
    await wait(async () => (await state()).items.length === 1);
    assert.equal((await state()).items[0].id, 'new-route-user'); assert.equal((await state()).archived.length, 0);
    await session.screenshot('cache-current-route.png');
    return { oldRouteLeak: false, newRouteOnly: true };
  });
  await test('CACHE-06: assigning a new conversation URL preserves its first prompt on the same node', async () => {
    await evaluate(`history.pushState({},'', '/');`);
    await wait(async () => (await state()).items.length === 0);
    await evaluate(`const m=document.querySelector('main');m.replaceChildren();const b=document.createElement('div');b.setAttribute('data-message-author-role','user');b.setAttribute('data-message-id','first-new-chat');b.textContent='新對話第一則';m.append(b);`);
    await wait(async () => (await state()).items[0]?.id === 'first-new-chat');
    await evaluate(`history.pushState({},'', '/c/assigned-new');`);
    await wait(async () => (await state()).items[0]?.id === 'first-new-chat');
    // Wait for the route timer to prove this wasn't just the old context's UI.
    await driver.wait(async () => await evaluate(`return location.pathname==='/c/assigned-new' && document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-list button')?.disabled===false`), 10000);
    await driver.sleep(650);
    assert.equal((await state()).items[0]?.id, 'first-new-chat');
    return { sameNodeSurvivesUrlAssignment: true };
  });
  await test('CACHE-07: bounded overlap collection and return work in an isolated virtual Firefox fixture', async () => {
    await evaluate(`history.pushState({},'', '/c/virtual-collection');window.fixture.mode('virtual');`);
    await wait(async () => (await state()).items.length === 10 && (await state()).items[0].id === 'branch-A:u-10');
    await click('#toc-earlier');
    await driver.wait(async () => (await state()).nav === 'idle', 20000);
    assert.equal((await state()).items.length, 20);
    assert.match((await state()).scope, /目前掛載 10 則/);
    await click('#toc-back');
    await driver.wait(async () => await evaluate(`return document.getElementById('chatgpt-toc-root').dataset.restored==='true'`), 12000);
    assert.equal((await state()).items.length, 20);
    await click('#toc-earlier'); await wait(async () => (await state()).nav === 'loading'); await click('#toc-stop');
    await wait(async () => (await state()).nav === 'cancelled');
    assert.equal((await state()).items.length, 20);
    return { collected: 20, mounted: 10, restored: true, cancelledWithoutCacheLoss: true };
  });
} catch (error) { results.push({ name: 'execution', status: 'FAIL', error: error.message }); console.error(error); process.exitCode = 1; }
finally { const caps = await driver.getCapabilities(); await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ date: new Date().toISOString(), firefox: caps.get('browserVersion'), source: 'real IAB snapshots rebuilt on localhost', liveChatGptAddon: false, build: JSON.parse(await readFile('dist/fixture/build-info.json','utf8')), results }, null, 2)); await session.close(); }
