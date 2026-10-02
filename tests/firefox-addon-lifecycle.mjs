import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { fixtureSession } from './firefox-session.mjs';
const session = await fixtureSession(process.env.TOC_TEST_ARTIFACTS || 'artifacts/firefox-addon-lifecycle');
const { driver, addon, url, artifacts } = session;
const results = [], metadata = { date: new Date().toISOString(), executor: process.env.TOC_TEST_EXECUTOR || 'primary-agent', firefox: (await driver.getCapabilities()).get('browserVersion'), sample: 'synthetic-manual-disable-enable-uninstall', build: JSON.parse(await readFile('dist/fixture/build-info.json', 'utf8')) };
const state = () => driver.executeScript('const h=document.getElementById("chatgpt-toc-root"),n=document.querySelector("[data-toc-located]");return {roots:document.querySelectorAll("#chatgpt-toc-root").length,visible:!!h&&getComputedStyle(h).display!=="none",highlight:n?getComputedStyle(n).outlineStyle:"none",markers:document.querySelectorAll("[data-chatgpt-toc-highlight]").length};');
async function highlight() {
  const shadow = await (await driver.findElement(By.id('chatgpt-toc-root'))).getShadowRoot();
  const toggle = await shadow.findElement(By.css('.toggle'));
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await (await shadow.findElement(By.css('#toc-list button[data-entry-id="branch-A:u-6"]'))).click();
  await driver.wait(async () => (await state()).highlight === 'solid', 8000);
}
async function toggleAddon(enabled) {
  await driver.setContext(firefox.Context.CHROME);
  try {
    return await driver.executeAsyncScript('const id=arguments[0],enabled=arguments[1],done=arguments[arguments.length-1];const {AddonManager}=ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");(async()=>{const a=await AddonManager.getAddonByID(id);await(enabled?a.enable():a.disable());return {active:a.isActive,disabled:a.userDisabled};})().then(done,e=>done({error:String(e)}));', addon, enabled);
  } finally { await driver.setContext(firefox.Context.CONTENT); }
}
async function test(id, expected, run) {
  const start = performance.now();
  try { const actual = await run(); results.push({ id, expected, actual, status: 'PASS', elapsed_ms: performance.now() - start }); console.log(`${id} PASS ${JSON.stringify(actual)}`); }
  catch (error) { results.push({ id, expected, error: error.message, status: 'FAIL', elapsed_ms: performance.now() - start }); throw error; }
}
try {
  await driver.get(url); await session.action(); await driver.wait(async () => (await state()).visible, 8000); await highlight();
  await test('FF-01:addon-disable', 'Native add-on disable removes managed CSS: no visible UI or highlight remains', async () => {
    const disabled = await toggleAddon(false); assert.equal(disabled.active, false);
    await driver.wait(async () => !(await state()).visible, 8000);
    const s = await state(); assert.equal(s.highlight, 'none'); return { addon: disabled, ...s, remaining_dom: 'inert hidden node until reload/re-enable' };
  });
  await test('FF-01:addon-reenable', 'Re-enable/action cleans the old isolated context DOM and creates exactly one usable UI', async () => {
    const enabled = await toggleAddon(true); assert.equal(enabled.active, true);
    await session.action(); await driver.wait(async () => (await state()).visible, 8000);
    const s = await state(); assert.equal(s.roots, 1); assert.equal(s.markers, 0);
    await highlight(); return { addon: enabled, ...s, located_after_reenable: true };
  });
  await test('FF-01:addon-uninstall', 'Native uninstall removes visible UI/highlight; a page reload removes inert DOM', async () => {
    await driver.uninstallAddon(addon); await driver.wait(async () => !(await state()).visible, 8000);
    const s = await state(); assert.equal(s.highlight, 'none');
    await driver.navigate().refresh(); const reloaded = await state(); assert.equal(reloaded.roots, 0);
    return { before_reload: s, after_reload: reloaded };
  });
  await session.screenshot('after-uninstall-reload.png');
} catch (error) { console.error(error); await session.screenshot('addon-lifecycle-fail.png').catch(() => {}); process.exitCode = 1; }
finally { await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ metadata, results }, null, 2)); await session.close(); }
