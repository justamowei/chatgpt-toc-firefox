import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('artifacts/background', { recursive: true });
for (const name of ['core', 'config', 'persistence', 'background']) {
  const result = await transform(await readFile(`src/${name}.ts`, 'utf8'), {
    loader: 'ts', format: 'esm', target: 'es2022', define: { __FIXTURE__: 'false', __REVISION__: '"mock"' },
  });
  await writeFile(`artifacts/background/${name}.mjs`, result.code.replace(/from "\.\/(core|config|persistence)"/g, 'from "./$1.mjs"'));
}
const { IndexStore } = await import('../artifacts/background/core.mjs');
const { CACHE_KEY } = await import('../artifacts/background/persistence.mjs');
const migration = 'toc-v033-settings-migrated';
const event = () => { const listeners = []; return { listeners, addListener: listener => { listeners.push(listener); }, emit: (...args) => listeners.map(listener => listener(...args)) }; };
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
let serial = 0;
async function setup(initial = {}, granted = true) {
  const values = structuredClone(initial), writes = [], calls = [], registered = [];
  let currentTab = { id: 1, url: 'https://chatgpt.com/c/a', incognito: false };
  const mock = {
    storage: { local: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(values[key])])),
      set: async patch => { writes.push(structuredClone(patch)); Object.assign(values, structuredClone(patch)); },
      remove: async key => { delete values[key]; },
    } },
    runtime: { id: 'extension-id', getURL: file => `moz-extension://mock/${file}`, onConnect: event(), onMessage: event(), onInstalled: event(), onStartup: event(), openOptionsPage: async () => {} },
    permissions: { contains: async () => granted, request: async () => { calls.push('request'); return true; }, remove: async () => { calls.push('remove-permission'); return true; }, onRemoved: event(), onAdded: event() },
    scripting: {
      getRegisteredContentScripts: async () => structuredClone(registered),
      registerContentScripts: async scripts => { calls.push('register'); registered.push(...structuredClone(scripts)); },
      updateContentScripts: async scripts => { calls.push('update'); registered.splice(0, registered.length, ...structuredClone(scripts)); },
      unregisterContentScripts: async () => { calls.push('unregister'); registered.length = 0; },
      insertCSS: async () => {}, executeScript: async () => {},
    },
    tabs: { onRemoved: event(), query: async () => [{ id: 1 }, { id: 2, incognito: true }],
      get: async id => { if (!currentTab || currentTab.id !== id) throw new Error('Tab unavailable'); return structuredClone(currentTab); },
      sendMessage: async id => { calls.push(`dispose:${id}`); } },
    action: { onClicked: event(), setTitle: async () => {}, setBadgeText: async () => {} },
  };
  globalThis.browser = mock;
  await import(`../artifacts/background/background.mjs?instance=${++serial}`); await settle();
  const options = { id: mock.runtime.id, url: mock.runtime.getURL('options.html') };
  const page = { id: mock.runtime.id, url: 'https://chatgpt.com/c/a', tab: { id: 1 }, frameId: 0 };
  const send = (message, sender = page) => mock.runtime.onMessage.listeners[0](message, sender);
  return { mock, values, writes, calls, registered, options, page, send, grant: value => { granted = value; }, setTab: value => { currentTab = value; } };
}
const state = context => { const store = new IndexStore(); store.merge({ context, branch: 'branch', entries: [{ id: 'a', text: 'local prompt', stable: true }] }); return store.exportState(); };

test('manifest requires ChatGPT host permission and fresh install auto-registers without requesting in background', async () => {
  const manifest = JSON.parse(await readFile('manifests/firefox.json', 'utf8'));
  assert.deepEqual(manifest.host_permissions, ['https://chatgpt.com/*']); assert.equal(manifest.optional_host_permissions, undefined);
  const app = await setup(); assert.equal(app.values.settings.auto, true); assert.equal(app.values[migration], true);
  assert.equal(app.registered.length, 1); assert.deepEqual(app.registered[0].matches, ['https://chatgpt.com/*']);
  assert.equal(app.calls.includes('request'), false);
});

test('v033 migration preserves old auto=false and expanded, adds ten minutes once and survives restarts', async () => {
  const first = await setup({ settings: { auto: false, expanded: true } });
  assert.deepEqual(await first.send({ kind: 'settings:get' }), { auto: false, expanded: true, collectionMinutes: 10 });
  assert.equal(first.values[migration], true);
  assert.equal(first.writes.length, 1);
  await first.send({ kind: 'settings:get' }); assert.equal(first.writes.length, 1);
  await first.send({ kind: 'auto:set', enabled: false }, first.options); await settle();
  assert.deepEqual(first.values.settings, { auto: false, expanded: true, collectionMinutes: 10 }); assert.equal(first.registered.length, 0);
  assert.ok(first.calls.includes('dispose:1')); assert.equal(first.calls.includes('dispose:2'), false);
  assert.equal(first.calls.includes('remove-permission'), false);
  const restarted = await setup(first.values);
  assert.deepEqual(await restarted.send({ kind: 'settings:get' }), { auto: false, expanded: true, collectionMinutes: 10 }); assert.equal(restarted.registered.length, 0);
  assert.equal(restarted.writes.length, 0);
});

test('collection minutes persist independently of automatic and expanded preferences, including legacy v032 marker', async () => {
  const app = await setup({ settings: { auto: false, expanded: true }, 'toc-v032-auto-migrated': true });
  assert.deepEqual(await app.send({ kind: 'collection:set', minutes: 3 }, app.options), { auto: false, expanded: true, collectionMinutes: 3 });
  await app.send({ kind: 'settings:set', expanded: false });
  await app.send({ kind: 'auto:set', enabled: true }, app.options);
  assert.deepEqual(app.values.settings, { auto: true, expanded: false, collectionMinutes: 3 });
  const restarted = await setup(app.values);
  assert.deepEqual(await restarted.send({ kind: 'settings:get' }), { auto: true, expanded: false, collectionMinutes: 3 });
  assert.equal(restarted.writes.length, 0);
  for (const minutes of [1, 10]) assert.equal((await restarted.send({ kind: 'collection:set', minutes }, restarted.options)).collectionMinutes, minutes);
});

test('collection settings reject invalid ranges, types, extra keys and any unverified options sender', async () => {
  const app = await setup(); const before = structuredClone(app.values.settings), writeCount = app.writes.length;
  for (const minutes of [0, 11, -1, 1.5, NaN, Infinity, '3', null, undefined, true]) {
    assert.equal(app.send({ kind: 'collection:set', minutes }, app.options), undefined);
  }
  assert.equal(app.send({ kind: 'collection:set', minutes: 3, expanded: false }, app.options), undefined);
  assert.equal(app.send({ kind: 'collection:set', minutes: 3 }), undefined);
  for (const sender of [
    { ...app.options, id: 'other-extension' },
    { ...app.options, url: `${app.options.url}?fake` },
    { ...app.options, url: 'https://evil.test/options.html' },
    { ...app.options, tab: { id: 4, incognito: true } },
  ]) assert.equal(app.send({ kind: 'collection:set', minutes: 3 }, sender), undefined);
  await settle(); assert.deepEqual(app.values.settings, before); assert.equal(app.writes.length, writeCount);
});

test('queued collection and panel changes preserve both preferences', async () => {
  const app = await setup();
  await Promise.all([app.send({ kind: 'collection:set', minutes: 2 }, app.options), app.send({ kind: 'settings:set', expanded: true })]);
  assert.deepEqual(app.values.settings, { auto: true, expanded: true, collectionMinutes: 2 });
});

test('withheld mandatory permission does not register; permission changes respect persistent auto preference', async () => {
  const app = await setup({}, false); assert.equal(app.registered.length, 0);
  assert.equal((await app.send({ kind: 'auto:set', enabled: true }, app.options)).error, 'permission-required');
  app.grant(true); app.mock.permissions.onAdded.emit({ origins: ['https://chatgpt.com/*'] }); await settle();
  assert.equal(app.registered.length, 1);
  app.grant(false); app.mock.permissions.onRemoved.emit({ origins: ['https://chatgpt.com/*'] }); await settle();
  assert.equal(app.registered.length, 0); assert.equal(app.values.settings.auto, true);
  app.grant(true); await app.send({ kind: 'auto:set', enabled: false }, app.options);
  app.mock.permissions.onAdded.emit({ origins: ['https://chatgpt.com/*'] }); await settle(); assert.equal(app.registered.length, 0);
});

test('cache broker allows trusted same-origin SPA tail writes while reads stay on current route', async () => {
  const app = await setup(); const current = app.page.url, other = 'https://chatgpt.com/c/b';
  assert.equal(await app.send({ kind: 'cache:get', context: current }), undefined);
  assert.equal(await app.send({ kind: 'cache:set', state: state(current) }), true);
  const moved = { ...app.page, url: other };
  app.setTab({ id: 1, url: other, incognito: false });
  assert.equal(await app.send({ kind: 'cache:set', state: state(current) }, moved), true);
  assert.equal(await app.send({ kind: 'cache:set', state: state('https://chatgpt.com/c/unseen') }, moved), true);
  assert.equal(app.send({ kind: 'cache:set', state: state('http://127.0.0.1/c/unseen') }, moved), undefined);
  assert.equal(await app.send({ kind: 'cache:get', context: current }, moved), undefined);
  for (const sender of [{ ...app.page, id: 'other-extension' }, { ...app.page, frameId: 1 }, { ...app.page, tab: { id: 1, incognito: true } }, { ...app.page, url: 'https://evil.test/c/a' }]) {
    assert.equal(app.send({ kind: 'cache:get', context: current }, sender), undefined);
    assert.equal(app.send({ kind: 'cache:set', state: state(current) }, sender), undefined);
  }
  assert.equal(app.send({ kind: 'cache:clear' }), undefined);
  assert.equal(await app.send({ kind: 'cache:clear' }, app.options), true); assert.equal(app.values[CACHE_KEY], undefined);
});

test('freshly awakened background accepts old-route flush without an earlier route read or in-memory authorization', async () => {
  const sleeping = await setup(); const previous = sleeping.page.url;
  await sleeping.send({ kind: 'cache:set', state: state(previous) });
  const awakened = await setup(sleeping.values); const moved = { ...awakened.page, url: 'https://chatgpt.com/c/new-route' };
  awakened.setTab({ id: 1, url: moved.url, incognito: false });
  const tail = state(previous); tail.entries[0].text = 'latest pre-navigation body';
  assert.equal(await awakened.send({ kind: 'cache:set', state: tail }, moved), true);
  assert.equal(awakened.values[CACHE_KEY].records[0].state.entries[0].text, 'latest pre-navigation body');
  assert.equal(await awakened.send({ kind: 'cache:get', context: previous }, moved), undefined);
});

test('SPA cache reads use the live tab route even when Firefox retains the sender document URL', async () => {
  const app = await setup(); const first = app.page.url, second = 'https://chatgpt.com/c/b';
  const savedFirst = state(first), savedSecond = state(second);
  await app.send({ kind: 'cache:set', state: savedFirst });
  await app.send({ kind: 'cache:set', state: savedSecond });
  app.setTab({ id: 1, url: second, incognito: false });
  assert.deepEqual(await app.send({ kind: 'cache:get', context: second }), savedSecond);
  assert.equal(await app.send({ kind: 'cache:get', context: first }), undefined);
  app.setTab({ id: 1, url: first, incognito: false });
  assert.deepEqual(await app.send({ kind: 'cache:get', context: first }), savedFirst);
  for (const tab of [
    { id: 1, url: 'https://chatgpt.com/c/c', incognito: false },
    { id: 1, url: 'https://evil.test/c/b', incognito: false },
    { id: 1, url: second, incognito: true },
    { id: 1, incognito: false },
    null,
  ]) {
    app.setTab(tab);
    assert.equal(await app.send({ kind: 'cache:get', context: second }), undefined);
  }
});

test('malformed cache messages and incognito options cannot write settings or clear cache', async () => {
  const app = await setup(); const saved = state(app.page.url);
  assert.equal(app.send({ kind: 'cache:set', state: { ...saved, dom: {} } }), undefined);
  assert.equal(app.send({ kind: 'cache:get', context: app.page.url, extra: true }), undefined);
  assert.equal(app.send({ kind: 'auto:set', enabled: false }), undefined);
  const privateOptions = { ...app.options, tab: { id: 4, incognito: true } };
  assert.equal(app.send({ kind: 'auto:set', enabled: false }, privateOptions), undefined);
  assert.equal(app.send({ kind: 'cache:clear' }, privateOptions), undefined);
  assert.equal(app.values.settings.auto, true);
});
