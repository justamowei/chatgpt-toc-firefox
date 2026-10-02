import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { By, Key } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-fixture');
const { driver, url, action, screenshot, artifacts } = session;
const results = [];
const caps = await driver.getCapabilities();
const build = JSON.parse(await readFile('dist/fixture/build-info.json', 'utf8'));
const metadata = { date: new Date().toISOString(), executor: 'primary-agent', node: process.version, os: `${os.platform()} ${os.release()}`, firefox: caps.get('browserVersion'), profile: caps.get('moz:profile'), sample: 'synthetic-mounted-20/virtual-20', build };
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
async function state() { return evaluate('const h=document.getElementById("chatgpt-toc-root");return h?{roots:document.querySelectorAll("#chatgpt-toc-root").length,nav:h.dataset.navigation,restored:h.dataset.restored,scope:h.shadowRoot.querySelector("#toc-scope").textContent,ids:Array.from(h.shadowRoot.querySelectorAll("#toc-list button")).map(b=>b.dataset.entryId),expanded:h.shadowRoot.querySelector(".toggle").getAttribute("aria-expanded"),status:h.shadowRoot.querySelector("#toc-status").textContent}:null'); }
async function shadow() { return (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot(); }
async function click(selector) { const node = await (await shadow()).findElement(By.css(selector)); await node.click(); }
async function clearInput(input) { await input.sendKeys(Key.chord(Key.CONTROL, 'a'), Key.BACK_SPACE); }
async function waitFor(predicate, message) { return driver.wait(predicate, 8000, message); }
async function test(id, expected, run) {
  const start = performance.now();
  try { const actual = await run(); results.push({ id, expected, actual, status: 'PASS', elapsed_ms: performance.now() - start }); console.log(`${id} PASS ${JSON.stringify(actual)}`); }
  catch (error) { results.push({ id, expected, status: 'FAIL', error: error.message, elapsed_ms: performance.now() - start }); console.error(`${id} FAIL ${error.message}`); await screenshot(`${id.replaceAll(':', '-')}-fail.png`).catch(() => {}); throw error; }
}
try {
  await driver.get(url);
  assert.equal(await state(), null, 'Manual-only fixture must not inject before toolbar action');
  await test('FF-01:manual-and-repeat', 'Real MV3 toolbar action injects one root; second action opens existing panel', async () => {
    await action(); await waitFor(async () => !!await state(), 'Root absent after toolbar action');
    await action(); await waitFor(async () => (await state())?.expanded === 'true', 'Repeat action did not open panel');
    const s = await state(); assert.equal(s.roots, 1); assert.equal(s.ids.length, 20); return s;
  });
  await test('FF-04:search-and-text-safety', 'Same-text prompts stay separate; HTML remains text; keyboard and empty search work', async () => {
    const search = await (await shadow()).findElement(By.id('toc-search'));
    await search.sendKeys('相同提問文字');
    await waitFor(async () => (await state()).ids.length === 2);
    assert.deepEqual((await state()).ids, ['branch-A:u-4', 'branch-A:u-5']);
    await clearInput(search); await search.sendKeys('<img');
    await waitFor(async () => (await state()).ids.length === 1);
    assert.equal(await evaluate('return document.getElementById("chatgpt-toc-root").shadowRoot.querySelectorAll("img,script").length'), 0);
    await search.sendKeys(Key.ARROW_DOWN);
    assert.equal(await evaluate('return document.getElementById("chatgpt-toc-root").shadowRoot.activeElement.dataset.entryId'), 'branch-A:u-3');
    await clearInput(search); await search.sendKeys('不存在的關鍵字'); await waitFor(async () => (await state()).ids.length === 0);
    await clearInput(search); await waitFor(async () => (await state()).ids.length === 20, 'Clearing search did not restore all entries');
    return { repeated_text_ids: 2, injected_elements: 0, empty_search: true, keyboard_focus: 'branch-A:u-3' };
  });
  await test('FF-02:20-targets-and-return', '20/20 stable targets visible and highlighted; return to u-6 offset error <=24px; p95<=1000ms', async () => {
    const timings = [], errors = [];
    for (let i = 0; i < 20; i++) {
      await evaluate('const m=document.querySelector("main"),n=Array.from(document.querySelectorAll("[data-message-id]")).find(n=>n.dataset.messageId===arguments[0]);m.scrollTop+=n.getBoundingClientRect().top-m.getBoundingClientRect().top-100;', 'branch-A:u-6');
      const offset = await evaluate('return Array.from(document.querySelectorAll("[data-message-id]")).find(n=>n.dataset.messageId===arguments[0]).getBoundingClientRect().top-document.querySelector("main").getBoundingClientRect().top', 'branch-A:u-6');
      const start = performance.now(); await click(`#toc-list button[data-entry-id="branch-A:u-${i}"]`);
      await waitFor(async () => (await state()).nav === 'located');
      const located = await evaluate('const n=document.querySelector("[data-toc-located]");const m=document.querySelector("main");return n?{id:n.dataset.messageId,visible:n.getBoundingClientRect().bottom>m.getBoundingClientRect().top&&n.getBoundingClientRect().top<m.getBoundingClientRect().bottom}:null');
      assert.equal(located.id, `branch-A:u-${i}`); assert.equal(located.visible, true); timings.push(performance.now() - start);
      await click('#toc-back'); await waitFor(async () => (await state()).restored === 'true');
      const after = await evaluate('return Array.from(document.querySelectorAll("[data-message-id]")).find(n=>n.dataset.messageId===arguments[0]).getBoundingClientRect().top-document.querySelector("main").getBoundingClientRect().top', 'branch-A:u-6');
      const error = Math.abs(after - offset); errors.push(error); assert.ok(error <= 24, `return error ${error}px`);
    }
    const p95 = timings.sort((a, b) => a - b)[18]; assert.ok(p95 <= 1000); return { targets: 20, successes: 20, failures: 0, p95_ms: p95, max_return_error_px: Math.max(...errors) };
  });
  await screenshot('light-panel.png');
  await test('FF-04:theme-narrow-keyboard', 'Dark theme; panel stays inside 480px viewport; Escape collapses and returns focus', async () => {
    await evaluate('window.fixture.theme(true)'); await driver.manage().window().setRect({ width: 480, height: 800 });
    await waitFor(async () => await evaluate('return document.getElementById("chatgpt-toc-root").getAttribute("data-theme")==="dark"'));
    const bounds = await evaluate('const p=document.getElementById("chatgpt-toc-root").shadowRoot.querySelector(".panel").getBoundingClientRect();return {left:p.left,right:p.right,width:innerWidth}');
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width);
    await screenshot('dark-narrow.png');
    const search = await (await shadow()).findElement(By.id('toc-search')); await search.sendKeys(Key.ESCAPE);
    assert.equal((await state()).expanded, 'false'); assert.equal(await evaluate('return document.getElementById("chatgpt-toc-root").shadowRoot.activeElement.className'), 'toggle');
    await driver.manage().window().setRect({ width: 1200, height: 900 }); await action(); return bounds;
  });
  await test('FF-03:virtual-history-and-stop', 'Synthetic history adds earlier stable IDs; cancellation stops extension callbacks without claiming full history', async () => {
    await evaluate('window.fixture.branch("virtual-A");window.fixture.mode("virtual")'); await waitFor(async () => (await state()).ids.length === 10);
    await click('#toc-earlier'); await waitFor(async () => (await state()).ids.length === 20);
    await click('#toc-stop'); await waitFor(async () => (await state()).nav === 'cancelled');
    const before = await evaluate('return document.querySelector("main").scrollTop'); const count = (await state()).ids.length;
    await driver.sleep(600); assert.equal(await evaluate('return document.querySelector("main").scrollTop'), before); assert.equal((await state()).ids.length, count);
    assert.match((await state()).scope, /歷史尚未完整/); return { collected: count, cancelled: true, no_late_scroll: true, verified_complete: false };
  });
  await test('FF-03:branch-and-route', 'Same-URL branch and SPA changes invalidate old IDs and return anchor', async () => {
    await evaluate('window.fixture.mode("mounted");window.fixture.branch("branch-B")');
    await waitFor(async () => (await state()).ids.every(id => id.startsWith('branch-B:')) && (await state()).ids.length === 20);
    assert.equal(await (await (await shadow()).findElement(By.id('toc-back'))).isEnabled(), false);
    await evaluate('window.fixture.route("/c/new-context")'); await waitFor(async () => (await state()).ids.every(id => id.startsWith('/c/new-context:')));
    return { stale_ids: 0, stale_anchor_disabled: true };
  });
  await test('FF-01:dispose-and-restart', 'Dispose removes root/highlight and future DOM changes do not restart; toolbar action restarts once', async () => {
    await click('#toc-disable'); assert.equal(await state(), null); assert.equal(await evaluate('return document.querySelectorAll("[data-toc-located]").length'), 0);
    await evaluate('window.fixture.append()'); await driver.sleep(250); assert.equal(await state(), null);
    await action(); await waitFor(async () => !!await state()); assert.equal((await state()).roots, 1); return { disposed: true, restarted_roots: 1 };
  });
  await driver.get(session.optionsUrl);
  console.log(JSON.stringify({ options_probe: await evaluate('return {browser:typeof browser,windowBrowser:typeof window.wrappedJSObject?.browser,status:document.querySelector("#status").textContent}') }));
  results.push({ id: 'FF-05', status: 'PENDING', expected: 'Native optional permission grant/deny/revoke/reload/event-page wake', actual: 'Options page reached; permission lifecycle tests to follow.' });
} catch { process.exitCode = 1; }
finally {
  await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ metadata, results }, null, 2));
  await session.close();
}
