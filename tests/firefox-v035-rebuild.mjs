import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { By } from 'selenium-webdriver';
import { fixtureSession } from './firefox-session.mjs';
const renderer = await readFile('tests/fixtures/v035-rebuild-renderer.js', 'utf8');
const configurations = new Map();
const sourceRevision = spawnSync('git', ['-c', 'safe.directory=' + process.cwd().split(String.fromCharCode(92)).join('/'), 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout?.trim();
const sourceFiles = [...(await readdir('src')).filter(file => file.endsWith('.ts')).map(file => 'src/' + file), 'scripts/build.mjs', 'package.json', 'manifests/firefox.json'];
const runtimeHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-v035-rebuild', {
  handleRequest: async (req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    const config = configurations.get(path) || { prefix: path.split('/').at(-1), start: 15 };
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const mount = '(' + renderer + ')(' + JSON.stringify(config) + ');';
    const script = config.mountDelayMs ? 'setTimeout(()=>{' + mount + '},' + config.mountDelayMs + ');' : mount;
    res.end('<!doctype html><html><head><meta charset="utf-8"><title>Independent v035 numeric virtualizer</title></head><body style="margin:0"><main></main><script>' + script + '</script></body></html>');
    return true;
  },
});
const { driver, artifacts } = session, results = [];
const testedBuild = JSON.parse(await readFile('dist/fixture/build-info.json', 'utf8'));
const evaluate = (code, ...args) => driver.executeScript(code, ...args);
const base = session.url.replace('/c/synthetic', '');
const url = prefix => base + '/c/' + prefix;
const ids = (prefix, count = 32) => Array.from({ length: count }, (_, i) => prefix + ':u-' + i);
const state = () => evaluate(`const h=document.getElementById('chatgpt-toc-root'),s=h?.shadowRoot;if(!s)return null;
return {nav:h.dataset.navigation,expanded:s.querySelector('.toggle')?.getAttribute('aria-expanded'),status:s.querySelector('#toc-status')?.textContent,
scope:s.querySelector('#toc-scope')?.textContent,ids:[...s.querySelectorAll('#toc-list button')].map(b=>b.dataset.entryId),
disabled:[...s.querySelectorAll('#toc-list button:disabled')].map(b=>b.dataset.entryId),archived:s.querySelectorAll('.archived').length,
build:s.querySelector('#toc-build')?.textContent,buildDisabled:s.querySelector('#toc-build')?.disabled,earlierDisabled:s.querySelector('#toc-earlier')?.disabled,stopHidden:s.querySelector('#toc-stop')?.hidden,highlight:document.querySelector('[data-chatgpt-toc-highlight]')?.getAttribute('data-message-id')};`);
const stats = () => evaluate('return window.v035Fixture?.stats();');
const wait = (predicate, ms = 20000) => driver.wait(predicate, ms);
async function click(selector) {
  const shadow = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();
  await evaluate('arguments[0].click();', await shadow.findElement(By.css(selector)));
}
async function open(prefix, options = {}) {
  configurations.set('/c/' + prefix, { prefix, start: 15, ...options });
  await driver.get(url(prefix)); await wait(async () => !!await state());
  if ((await state()).expanded !== 'true') await click('.toggle');
}
async function route(prefix, options = {}) {
  await evaluate('history.pushState({},"",arguments[0]);(' + renderer + ')(arguments[1]);', url(prefix), { prefix, start: 15, ...options });
  await wait(async () => (await state())?.ids.some(id => id.startsWith(prefix + ':')));
}
function record(prefix, entries = ids(prefix).map((id, i) => ({ id, text: prefix + ' 本機提問 ' + i, stable: true })), quarantine = []) {
  return { touched: Date.now(), state: { version: 1, context: url(prefix), branch: null, entries,
    segments: entries.length ? [{ ids: entries.map(e => e.id), ordered: true }] : [], quarantine, limitReason: null } };
}
async function storage(records) {
  await driver.get(session.optionsUrl);
  await evaluate(`return (async()=>{await browser.storage.local.set({'toc-index-v1':{version:1,records:arguments[0]}});return true;})();`, records);
}
async function savedRecords() {
  await driver.get(session.optionsUrl);
  return evaluate(`return (async()=> (await browser.storage.local.get('toc-index-v1'))['toc-index-v1']?.records||[])();`);
}
async function completed(prefix, count = 32, timeout = 75000) {
  await wait(async () => (await state())?.nav === 'idle' && (await stats())?.start === 0 && (await state()).ids.length === count, timeout);
  const s = await state(), f = await stats();
  assert.deepEqual(s.ids, ids(prefix, count)); assert.equal(f.top, 0, 'collection must stop at physical head');
  assert.equal(s.archived, 0); assert.equal(s.disabled.length, 0);
  await wait(async () => (await state()).scope.includes('已儲存'));
  return { ui: s, fixture: f };
}
function bottomThenHead(f) {
  const bottom = f.events.find(event => event.bottom);
  assert.ok(bottom, 'must first reach numeric bottom, including trailing spacer');
  const upward = f.requests.filter(request => request.at > bottom.at && request.direction === 'older');
  assert.ok(upward.length, 'must collect upwards after bottom');
  let previous = bottom.top; for (const event of f.events.filter(event => event.at > bottom.at)) { assert.ok(event.top <= previous + 2, 'head walk scroll pixels must never reverse downwards'); previous = event.top; }
  assert.ok(f.requests.filter(request => request.at > upward[0].at).every(request => request.direction === 'older'), 'must never reverse after head walk begins');
  return { bottomAt: bottom.at, upwardWindows: upward.length, finalTop: f.top };
}
async function exact(prefix, index) {
  const id = prefix + ':u-' + index;
  await wait(async () => (await state()).ids.includes(id) && !(await state()).disabled.includes(id));
  await click('#toc-list button[data-entry-id="' + id + '"]');
  await wait(async () => (await state()).nav === 'located' && (await state()).highlight === id, 30000);
  return id;
}
async function unchanged(ms = 1800) {
  const before = await stats(); await driver.sleep(ms); const after = await stats();
  assert.equal(after.requests.length, before.requests.length, 'cached conversation must not automatically recollect');
  assert.notEqual((await state()).nav, 'loading'); return after;
}
async function test(name, run) {
  if (process.env.TOC_TEST_CASE && !process.env.TOC_TEST_CASE.split(',').some(fragment => name.includes(fragment))) return;
  const started = Date.now();
  try { const actual = await run(); results.push({ name, status: 'PASS', elapsedMs: Date.now() - started, actual }); console.log(name + ' PASS ' + JSON.stringify(actual)); }
  catch (error) {
    results.push({ name, status: 'FAIL', elapsedMs: Date.now() - started, error: String(error), ui: await state().catch(() => null), fixture: await stats().catch(() => null) });
    console.error(name + ' FAIL ' + String(error)); process.exitCode = 1;
    await session.screenshot(name + '-fail.png').catch(() => {});
    if ((await state().catch(() => null))?.nav === 'loading') await click('#toc-stop').catch(() => {});
  }
}
try {
  await driver.get(session.optionsUrl);
  await wait(() => evaluate(`return (async()=> (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length===1)();`));
  await test('V035-R01-empty-cache-middle-bottom-head-32', async () => {
    await storage([]); await open('AUTO5', { start: 13, windowSize: 5 });
    await wait(async () => (await state()).nav === 'loading');
    const { fixture } = await completed('AUTO5');
    const trajectory = bottomThenHead(fixture); await session.screenshot('auto-middle-bottom-head.png');
    return { prompts: 32, virtualWindow: 5, pinnedTail: 2, spacer: 1600, ...trajectory };
  });
  await test('V035-R02-seven-window-hidden-busy-tail-stream', async () => {
    await storage([]); await open('AUTO7', { start: 22, windowSize: 7, hiddenBusy: true, tailStream: true });
    const { fixture } = await completed('AUTO7'); assert.ok(fixture.streamTick > 0);
    return { prompts: 32, virtualWindow: 7, hiddenBusy: true, tailStreamTicks: fixture.streamTick, ...bottomThenHead(fixture) };
  });
  await test('V035-R03-v034-cache-no-auto-SPA-F5-exact-navigation', async () => {
    await storage([record('A'), record('B')]); await open('A');
    await wait(async () => (await state()).ids.length === 32); await unchanged();
    const targets = [await exact('A', 3)];
    await route('B'); await wait(async () => (await state()).ids.length === 32); await unchanged();
    assert.ok((await state()).ids.every(id => id.startsWith('B:')));
    await route('A'); await wait(async () => (await state()).ids.length === 32); await unchanged(); targets.push(await exact('A', 24));
    await driver.navigate().refresh(); await wait(async () => (await state())?.ids.length === 32);
    if ((await state()).expanded !== 'true') await click('.toggle'); await unchanged(); targets.push(await exact('A', 2));
    return { restored: 32, routeSequence: ['A', 'B', 'A'], f5: true, exactHighlights: targets, autoRecollection: false };
  });
  await test('V035-R04-any-cache-including-quarantine-suppresses-auto', async () => {
    const ghost = { id: 'Q:old', text: '隔離提問', stable: true };
    const quarantine = [{ reason: 'text-change', entries: [ghost], segments: [{ ids: [ghost.id], ordered: true }], ordered: true }];
    await storage([record('Q', [], quarantine), record('P', [{ id: 'P:u-0', text: 'P 本機提問 0', stable: true }])]);
    await open('Q', { start: 12 }); await wait(async () => (await state()).archived === 1); await unchanged(2500); assert.equal((await stats()).start, 12);
    await open('P', { start: 19 }); await wait(async () => (await state()).ids.includes('P:u-0')); await unchanged(2500); assert.equal((await stats()).start, 19);
    return { quarantineOnly: true, partialActive: true, autoRecollection: false };
  });
  await test('V035-R05-manual-build-resets-only-selected-before-bottom', async () => {
    const oldA = record('RESET-A'); oldA.state.entries.push({ id: 'RESET-A:obsolete', text: '舊A目錄必須清掉', stable: true }); oldA.state.segments[0].ids.push('RESET-A:obsolete');
    const oldB = record('RESET-B'); await storage([oldA, oldB]); await open('RESET-A', { frozen: true });
    await wait(async () => (await state()).ids.includes('RESET-A:obsolete')); assert.equal((await state()).build, '建立完整目錄'); await click('#toc-build');
    await wait(async () => (await state()).nav === 'loading' && !(await state()).ids.includes('RESET-A:obsolete'));
    assert.ok((await state()).ids.length < 32); await driver.sleep(700);
    const records = await savedRecords(), selected = records.find(item => item.state.context === url('RESET-A')), other = records.find(item => item.state.context === url('RESET-B'));
    assert.ok(selected); assert.ok(!selected.state.entries.some(entry => entry.id === 'RESET-A:obsolete'));
    assert.deepEqual(other.state, oldB.state, 'selected reset preserves other conversation byte-for-byte');
    await open('RESET-A', { start: 14 }); await wait(async () => (await state()).ids.length > 0); await click('#toc-build');
    const { fixture } = await completed('RESET-A');
    return { oldRowRemovedBeforeTraversal: true, otherConversationUnchanged: true, prompts: 32, ...bottomThenHead(fixture) };
  });
  await test('V035-R06-earlier-no-reset-and-stop-at-head', async () => {
    await storage([record('EARLIER')]); await open('EARLIER', { start: 18 }); await wait(async () => (await state()).ids.length === 32); await unchanged();
    await click('#toc-earlier'); await wait(async () => (await state()).nav === 'loading'); assert.equal((await state()).ids.length, 32, 'earlier must not reset saved index');
    const { fixture } = await completed('EARLIER'); assert.ok(fixture.requests.every(request => request.direction === 'older'), 'earlier must not seek tail or reverse');
    return { retainedAtStart: 32, finalTop: fixture.top, bottomVisited: fixture.events.some(event => event.bottom), reversed: false };
  });
  await test('V035-R07-new-prompt-persists-after-F5', async () => {
    await storage([record('APPEND')]); await open('APPEND'); await wait(async () => (await state()).ids.length === 32); await unchanged();
    await evaluate('window.v035Fixture.append();'); await wait(async () => (await state()).ids.includes('APPEND:u-32')); await wait(async () => (await state()).scope.includes('已儲存'));
    configurations.set('/c/APPEND', { prefix: 'APPEND', count: 33, start: 28, windowSize: 5 });
    await driver.navigate().refresh(); await wait(async () => (await state())?.ids.length === 33);
    if ((await state()).expanded !== 'true') await click('.toggle'); await unchanged(); assert.deepEqual((await state()).ids, ids('APPEND', 33));
    return { newPrompt: 'APPEND:u-32', persisted: 33, f5: true };
  });
  await test('V035-R08-stop-and-route-change-cancel-session', async () => {
    await storage([record('CANCEL-B')]); await open('CANCEL-A', { delay: 2200 });
    await wait(async () => (await state()).nav === 'loading'); await click('#toc-stop'); await wait(async () => (await state()).nav === 'cancelled'); await driver.sleep(2500);
    const stopped = await stats(); await driver.sleep(1600); assert.equal((await stats()).events.length, stopped.events.length, 'stop forbids later scroll writes');
    await click('#toc-build'); await wait(async () => (await state()).nav === 'loading'); await click('#toc-stop');
    await wait(async () => (await state()).nav === 'cancelled');
    assert.equal((await state()).buildDisabled, false); assert.equal((await state()).earlierDisabled, false); assert.equal((await state()).stopHidden, true);
    await click('#toc-build'); await wait(async () => (await state()).nav === 'loading'); await route('CANCEL-B');
    await wait(async () => (await state()).ids.length === 32); await unchanged(3000); assert.ok((await state()).ids.every(id => id.startsWith('CANCEL-B:')));
    const target = await exact('CANCEL-B', 1);
    await route('CANCEL-A'); await unchanged(2500); assert.ok((await state()).ids.every(id => id.startsWith('CANCEL-A:')));
    await route('CANCEL-B'); await wait(async () => (await state()).ids.length === 32); await unchanged();
    return { stopState: 'cancelled', stoppedScrollEvents: stopped.events.length, preparationStop: true, staleSessionApplied: false, routes: ['A', 'B', 'A', 'B'], exactHighlight: target };
  });
  await test('V035-R09-slow-visible-head-loader-no-premature-completion', async () => {
    await storage([]); await open('SLOW', { start: 9, slowHeadMs: 9000 }); await wait(async () => (await stats()).loading, 40000);
    await driver.sleep(7000); assert.equal((await stats()).loading, true); assert.equal((await stats()).start, 0); assert.equal((await stats()).top, 0); assert.equal((await state()).nav, 'loading', 'visible loader at physical head prevents premature completion');
    const { fixture } = await completed('SLOW'); return { slowHeadMs: 9000, stillLoadingAt7000: true, prompts: 32, ...bottomThenHead(fixture) };
  });
  await test('V035-R10-late-first-mount-auto-without-user-input', async () => {
    await storage([]);
    await evaluate(`return browser.storage.local.set({settings:{auto:true,expanded:true,collectionMinutes:10}});`);
    configurations.set('/c/LATE', { prefix: 'LATE', start: 17, windowSize: 5, mountDelayMs: 1100 });
    await driver.get(url('LATE')); await wait(async () => !!await state());
    assert.equal(await stats(), null, 'extension initially sees an empty mount');
    assert.notEqual((await state()).nav, 'loading', 'empty mount has not started automatic collection');
    await wait(async () => (await state()).nav === 'loading', 10000);
    const { fixture } = await completed('LATE');
    return { mountDelayMs: 1100, conversationInteractions: 0, prompts: 32, ...bottomThenHead(fixture) };
  });
  await test('V035-R11-unstable-ID-mount-waits-for-stable-hydration', async () => {
    await storage([]); await open('HYDRATE', { start: 16, unstableIds: true });
    await wait(async () => (await state()).ids.length > 0); await unchanged(1800);
    assert.ok((await state()).ids.every(id => id.startsWith('transient-')));
    assert.equal((await stats()).requests.length, 0, 'unstable mounted IDs cannot consume automatic collection');
    await evaluate('window.v035Fixture.hydrateStable();');
    await wait(async () => (await state()).nav === 'loading', 10000);
    const { fixture } = await completed('HYDRATE');
    return { unstableDelayMs: 1800, autoBeforeStable: false, autoAfterStable: true, prompts: 32, ...bottomThenHead(fixture) };
  });
} finally {
  await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ date: new Date().toISOString(), executor: process.env.TOC_TEST_EXECUTOR || 'independent-v035-acceptance',
    source: 'Native Firefox isolated extension and real storage; localhost numeric virtualizer; NOT ChatGPT LIVE', revision: sourceRevision, runtimeRevision: process.env.TOC_TEST_RUNTIME_REVISION || sourceRevision, runtimeHashes,
    firefox: (await driver.getCapabilities()).get('browserVersion'), build: testedBuild, results }, null, 2));
  await session.close();
}
