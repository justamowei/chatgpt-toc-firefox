import assert from 'node:assert/strict';
import { fixtureSession } from './firefox-session.mjs';

const { driver, url, optionsUrl, close } = await fixtureSession('artifacts/firefox-delayed-history', {
  handleRequest(_request, response) {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><main style="height:500px;overflow:auto;overflow-anchor:none">' +
      '<div data-user-message-bubble data-message-id="recent" style="height:80px">Recent question</div>' +
      '<div style="height:1900px"></div></main>');
    return true;
  },
});
const js = (code) => driver.executeScript(code);
const state = () => js("const host = document.getElementById('chatgpt-toc-root'); if (!host) return null;" +
  "const panel = host.shadowRoot; return { nav: host.dataset.navigation, status: panel.querySelector('#toc-status').textContent," +
  "ids: [...panel.querySelectorAll('#toc-list [data-entry-id]')].map(row => row.dataset.entryId), top: document.querySelector('main').scrollTop };");

try {
  await driver.get(optionsUrl);
  await driver.wait(() => js("return (async() => (await browser.scripting.getRegisteredContentScripts({ ids: ['chatgpt-toc'] })).length === 1)();"), 10000);
  await js("return browser.runtime.sendMessage({ kind: 'collection:set', minutes: 1 });");
  await driver.get(url.replace('/synthetic', '/delayed-history'));
  await driver.wait(async () => !!await state(), 10000);
  await js("const panel = document.getElementById('chatgpt-toc-root').shadowRoot; const toggle = panel.querySelector('.toggle');" +
    "if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click(); panel.querySelector('#toc-earlier').click();");
  await driver.wait(async () => (await state()).nav === 'loading', 10000);
  const started = Date.now();
  await js("setTimeout(() => { const bubble = document.querySelector('[data-message-id=recent]'); const prior = bubble.cloneNode();" +
    "prior.dataset.messageId = 'older'; prior.textContent = 'Earlier question'; bubble.before(prior); }, 34000);");

  await driver.sleep(32000);
  const waiting = await state();
  assert.equal(waiting.nav, 'loading', 'the old 30-second cutoff must not end collection');
  assert.equal(waiting.top, 0, 'waiting at the loaded edge does not reverse scroll');
  assert.deepEqual(waiting.ids, ['recent']);
  await driver.wait(async () => (await state()).ids.includes('older'), 8000);
  assert.deepEqual((await state()).ids, ['older', 'recent']);
  assert.equal((await state()).nav, 'loading');
  await driver.wait(async () => (await state()).nav === 'timed-out', 32000);
  assert.ok(Date.now() - started >= 59000, 'must reach the configured one-minute limit');
  assert.deepEqual((await state()).ids, ['older', 'recent']);
  console.log('PASS: waits past 30 seconds, collects older history after 34 seconds, and preserves both rows at the configured time limit.');
} finally {
  await close();
}
