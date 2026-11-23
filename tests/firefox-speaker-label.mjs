import assert from 'node:assert/strict';
import { fixtureSession } from './firefox-session.mjs';

const { driver, url, optionsUrl, close } = await fixtureSession('artifacts/firefox-speaker-label', {
  handleRequest(request, response) {
    response.setHeader('Content-Type', 'text/html');
    const offscreen = new URL(request.url, 'http://localhost').searchParams.has('offscreen');
    response.end('<!doctype html><meta charset="utf-8"><main style="height:500px;overflow:auto">' +
      (offscreen ? '' : '<section data-turn-key="label-only"><div data-conversation-role="user">你說：</div></section>' +
      '<section data-turn-key="literal"><div data-conversation-role="user">你說：</div><div data-user-message-bubble data-message-id="literal">你說：</div></section>') +
      '<section data-turn-key="message"><div data-user-message-bubble data-message-id="with-prefix"><h5 class="sr-only">你說：</h5><p>你說：這是正文</p></div></section>' +
      '<section data-turn-key="heading-marker"><h5 data-user-message-bubble data-message-id="heading-label">你說：</h5><div data-message-author-role="user" data-message-id="body">Actual prompt</div></section>' +
      '<div style="height:700px"></div></main>');
    return true;
  },
});
const js = (code, ...args) => driver.executeScript(code, ...args);
const wait = (check, message) => driver.wait(check, 10000, message);
const context = url.replace('/synthetic', '/speaker-label');
const rows = () => js("return [...document.getElementById('chatgpt-toc-root').shadowRoot.querySelectorAll('#toc-list [data-entry-id]')].map(row => [row.dataset.entryId, row.textContent]);");
const open = async page => {
  await driver.get(page);
  await wait(() => js("return !!document.getElementById('chatgpt-toc-root')"), 'extension panel');
  await js("const toggle = document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('.toggle'); if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();");
};

try {
  await driver.get(optionsUrl);
  await wait(() => js("return (async() => (await browser.scripting.getRegisteredContentScripts({ids:['chatgpt-toc']})).length === 1)();"), 'script registration');
  await js("return (async()=>{ const [context, entries]=arguments; await browser.storage.local.set({'toc-index-v1':{version:1,records:[{touched:1,state:" +
    "{version:1,context,branch:null,entries,segments:[{ids:entries.map(e=>e.id),ordered:true}],quarantine:[],limitReason:null}}]}}); })();", context,
    [{ id: 'saved', text: '以前保存的提問', stable: true }, { id: 'stale-label', text: '你說：', stable: true }]);

  await open(context);
  await wait(async () => (await rows()).some(([id]) => id === 'saved'), 'old cache restored');
  assert.deepEqual((await rows()).sort(), [['body', 'Actual prompt'], ['literal', '你說：'], ['saved', '以前保存的提問'], ['with-prefix', '你說：這是正文']]);
  await wait(() => js("return document.getElementById('chatgpt-toc-root').shadowRoot.querySelector('#toc-scope').textContent.includes('已儲存於本機');"), 'cleaned cache saved');

  await open(context + '?offscreen');
  await wait(async () => (await rows()).some(([id]) => id === 'literal'), 'genuine offscreen literal restored');
  assert.deepEqual((await rows()).sort(), [['body', 'Actual prompt'], ['literal', '你說：'], ['saved', '以前保存的提問'], ['with-prefix', '你說：這是正文']]);
  console.log('PASS: author labels excluded from the live DOM and old cache, with literal user messages retained after refresh.');
} finally {
  await close();
}
