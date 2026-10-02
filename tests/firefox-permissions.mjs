import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { fixtureSession } from './firefox-session.mjs';
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-permissions');
const { driver, addon, url, optionsUrl, artifacts } = session;
const results = [], metadata = { date: new Date().toISOString(), executor: process.env.TOC_TEST_EXECUTOR || 'primary-agent', sample: 'synthetic-permission-two-tabs', firefox: (await driver.getCapabilities()).get('browserVersion'), build: JSON.parse(await readFile('dist/fixture/build-info.json', 'utf8')) };
const evaluate = (script, ...args) => driver.executeScript(script, ...args);
const api = script => driver.executeAsyncScript(`const done=arguments[arguments.length-1];(async()=>{${script}})().then(done,error=>done({error:String(error)}));`);
async function wait(test, message) { return driver.wait(test, 8000, message); }
async function hasRoot() { return evaluate('return !!document.getElementById("chatgpt-toc-root")'); }
async function choosePermission(allow) {
  await driver.setContext(firefox.Context.CHROME);
  try {
    await wait(() => driver.executeScript('const p=document.getElementById("notification-popup");return p&&p.state==="open";'), 'Permission popup did not open');
    const controls = await driver.executeScript('return Array.from(document.querySelectorAll("#notification-popup button,#notification-popup toolbarbutton,#notification-popup moz-button")).map(n=>({tag:n.tagName,id:n.id,class:n.className,label:n.getAttribute("label"),width:n.getBoundingClientRect().width}))');
    console.log(JSON.stringify({ permission_controls: controls }));
    const selector = allow ? '.popup-notification-primary-button' : '.popup-notification-secondary-button';
    const outer = await driver.findElement(By.css(`#notification-popup ${selector}`));
    await wait(async () => { const rect = await outer.getRect(); return rect.width > 0 && rect.height > 0; }, 'Permission decision button was not visible');
    const point = await driver.executeScript('const n=arguments[0];const b=n.shadowRoot?.querySelector("button")||n;const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};', outer);
    await driver.actions().move({ x: point.x, y: point.y, origin: 'viewport' }).click().perform();
  } finally { await driver.setContext(firefox.Context.CONTENT); }
}
async function test(id, expected, run) {
  const start = performance.now();
  try { const actual = await run(); results.push({ id, expected, actual, status: 'PASS', elapsed_ms: performance.now() - start }); console.log(`${id} PASS ${JSON.stringify(actual)}`); }
  catch (error) { results.push({ id, expected, error: error.message, status: 'FAIL', elapsed_ms: performance.now() - start }); console.error(`${id} FAIL ${error.message}`); throw error; }
}
try {
  await driver.get(optionsUrl);
  await test('FF-05:deny', 'Native Firefox permission refusal leaves manual mode, no registration and no automatic UI', async () => {
    await driver.findElement(By.id('enable')).click(); await choosePermission(false);
    await wait(async () => /未授予/.test(await driver.findElement(By.id('status')).getText()));
    const s = await api('return {settings:await browser.runtime.sendMessage({kind:"settings:get"}),granted:await browser.permissions.contains({origins:["http://127.0.0.1/*"]}),scripts:await browser.scripting.getRegisteredContentScripts()};');
    assert.equal(s.settings.auto, false); assert.equal(s.granted, false); assert.equal(s.scripts.length, 0);
    await driver.get(url); await driver.sleep(300); assert.equal(await hasRoot(), false); await driver.get(optionsUrl); return s;
  });
  await test('FF-05:grant-and-reload', 'Native grant registers automatic script, settings persist and reload injects one UI', async () => {
    await driver.findElement(By.id('enable')).click(); await choosePermission(true);
    await wait(async () => /已啟用/.test(await driver.findElement(By.id('status')).getText()));
    const s = await api('return {settings:await browser.runtime.sendMessage({kind:"settings:get"}),granted:await browser.permissions.contains({origins:["http://127.0.0.1/*"]}),scripts:await browser.scripting.getRegisteredContentScripts()};');
    assert.equal(s.settings.auto, true); assert.equal(s.granted, true); assert.equal(s.scripts.length, 1);
    return s;
  });
  await test('FF-05:event-page-sleep-wake', 'Observed stopped background wakes from runtime message, preserves permission/settings and automatic registration', async () => {
    // Firefox's own test helper uses extension.terminateBackground and backgroundState:
    // https://searchfox.org/firefox-main/source/toolkit/components/extensions/ExtensionTestCommon.sys.mjs
    // Only the temporary add-on in this isolated profile is addressed here.
    await driver.setContext(firefox.Context.CHROME);
    let stopped;
    try { stopped = await driver.executeAsyncScript('const id=arguments[0],done=arguments[arguments.length-1];const e=WebExtensionPolicy.getByID(id).extension;e.terminateBackground({ignoreDevToolsAttached:true,disableResetIdleForTest:true}).then(()=>done(e.backgroundState),error=>done({error:String(error)}));', addon); }
    finally { await driver.setContext(firefox.Context.CONTENT); }
    assert.equal(stopped, 'stopped');
    const s = await api('return {settings:await browser.runtime.sendMessage({kind:"settings:get"}),granted:await browser.permissions.contains({origins:["http://127.0.0.1/*"]}),scripts:await browser.scripting.getRegisteredContentScripts()};');
    assert.equal(s.settings.auto, true); assert.equal(s.granted, true); assert.equal(s.scripts.length, 1);
    await driver.setContext(firefox.Context.CHROME);
    let resumed;
    try { resumed = await driver.executeScript('return WebExtensionPolicy.getByID(arguments[0]).extension.backgroundState;', addon); }
    finally { await driver.setContext(firefox.Context.CONTENT); }
    assert.equal(resumed, 'running');
    await driver.get(url); await wait(hasRoot, 'Automatic injection missing'); await driver.navigate().refresh(); await wait(hasRoot, 'Reload injection missing');
    assert.equal(await evaluate('return document.querySelectorAll("#chatgpt-toc-root").length'), 1);
    return { stopped, resumed, auto: s.settings.auto, registered: s.scripts.length, reload_roots: 1 };
  });
  const first = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab'); const second = await driver.getWindowHandle(); await driver.get(url + '?second'); await wait(hasRoot);
  await driver.switchTo().newWindow('tab'); const optionsTab = await driver.getWindowHandle(); await driver.get(optionsUrl);
  await test('FF-05:revoke-two-tabs', 'Direct optional-host revoke disposes existing non-activeTab pages and unregisters auto script', async () => {
    const removed = await api('return await browser.permissions.remove({origins:["http://127.0.0.1/*"]});'); assert.equal(removed, true);
    for (const handle of [first, second]) { await driver.switchTo().window(handle); await wait(async () => !await hasRoot(), 'Revoked page still active'); }
    await driver.switchTo().window(first); await driver.navigate().refresh(); await driver.sleep(300); assert.equal(await hasRoot(), false);
    await driver.switchTo().window(optionsTab); const s = await api('return {settings:await browser.runtime.sendMessage({kind:"settings:get"}),scripts:await browser.scripting.getRegisteredContentScripts(),stored:await browser.storage.local.get(null)};');
    assert.equal(s.settings.auto, false); assert.equal(s.scripts.length, 0); assert.deepEqual(Object.keys(s.stored), ['settings']);
    return { disposed_tabs: 2, reload_injected: false, auto: false, scripts: 0, stored_keys: Object.keys(s.stored) };
  });
  await test('FF-05:message-validation', 'Unknown runtime schema cannot change settings or permissions', async () => {
    const s = await api('await browser.runtime.sendMessage({kind:"auto:set",enabled:true,extra:"forged"}).catch(()=>{});await browser.runtime.sendMessage({kind:"eval",code:"not executed"}).catch(()=>{});return await browser.runtime.sendMessage({kind:"settings:get"});');
    assert.equal(s.auto, false); return { rejected: true, auto: s.auto };
  });
  await session.screenshot('options-after-revoke.png');
} catch { await session.screenshot('permission-fail.png').catch(() => {}); process.exitCode = 1; }
finally { await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ metadata, results }, null, 2)); await session.close(); }
