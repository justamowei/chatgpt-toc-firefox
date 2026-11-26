import assert from 'node:assert/strict';
import { fixtureSession } from './firefox-session.mjs';

const { driver, url, optionsUrl, close } = await fixtureSession('artifacts/firefox-directory-head', {
  handleRequest(request, response) {
    const middle = new URL(request.url, 'http://localhost').searchParams.has('middle');
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><main style="height:500px;overflow:auto">' +
      (middle ? '<div style="height:1500px"></div>' : '') +
      '<div data-user-message-bubble data-message-id="q' + (middle ? '50' : '0') +
      '" style="min-height:80px">Question ' + (middle ? '50' : '0') + '</div>' +
      '<div style="height:2000px"></div></main>' +
      (middle ? '<script>document.querySelector("main").scrollTop=1500</script>' : ''));
    return true;
  },
});
const js = (code, ...args) => driver.executeScript(code, ...args);
const wait = (condition, message) => driver.wait(condition, 10000, message);
const context = url.replace('/synthetic', '/directory-head');
const visibleIds = () => js("return [...document.getElementById('chatgpt-toc-root').shadowRoot.querySelectorAll('#toc-list [data-entry-id]')].map(button => button.dataset.entryId);");
const open = async (page) => {
  await driver.get(page);
  await wait(() => js("return !!document.getElementById('chatgpt-toc-root')"), 'extension panel');
  await js("const toggle = document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('.toggle'); if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();");
};
const expected = Array.from({ length: 106 }, (_, i) => 'q' + i);

try {
  await driver.get(optionsUrl);
  await wait(() => js("return (async() => (await browser.scripting.getRegisteredContentScripts({ ids: ['chatgpt-toc'] })).length === 1)();"), 'content script registration');
  await js("return (async() => {" +
    "const [context, order] = arguments; const ids = [...order.slice(1), order[0]];" +
    "const entries = ids.map(id => ({ id, text: 'Question ' + id.slice(1), stable: true }));" +
    "const state = { version: 1, context, branch: null, entries, segments: [{ ids: ids.slice(0, -1), ordered: true }, { ids: [ids.at(-1)], ordered: true }], quarantine: [], limitReason: null };" +
    "await browser.storage.local.set({ 'toc-index-v1': { version: 1, records: [{ state, touched: 1 }] } });" +
    "})();", context, expected);

  await open(context);
  await wait(async () => (await visibleIds()).length === expected.length, 'restore 106 saved questions');
  assert.deepEqual(await visibleIds(), expected, 'place the sole mounted head before previously collected questions');
  await js("document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('[data-entry-id=q0]').click();");
  await wait(() => js("return document.getElementById('chatgpt-toc-root').dataset.navigation === 'located';"), 'jump to the first question');
  // Let the normal debounced cache write finish before navigating away.
  await wait(() => js("return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-scope').textContent.includes('\u5df2\u5132\u5b58\u65bc\u672c\u6a5f');"), 'save corrected order');

  await open(context + '?middle');
  await wait(async () => (await visibleIds()).length === expected.length, 'restore from a different viewport');
  assert.deepEqual(await visibleIds(), expected, 'preserve corrected order while the first question is unmounted');
  console.log('PASS: the first of 106 saved questions moves from last to first and stays first after reload away from the head.');
} finally {
  await close();
}
