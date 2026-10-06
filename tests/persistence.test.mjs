import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('artifacts/persistence', { recursive: true });
for (const name of ['core', 'persistence']) {
  const result = await transform(await readFile(`src/${name}.ts`, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' });
  await writeFile(`artifacts/persistence/${name}.mjs`, result.code.replace("from \"./core\"", "from \"./core.mjs\""));
}
const { IndexStore, validStoredIndex } = await import('../artifacts/persistence/core.mjs');
const { PersistentIndex, CacheBroker, CACHE_KEY, PROFILE_LIMITS, conversationContext } = await import('../artifacts/persistence/persistence.mjs');
const context = 'https://chatgpt.com/c/synthetic';
const entry = (id, text = id, stable = true) => ({ id, text, stable });
const snapshot = (entries, branch = 'branch-a', route = context) => ({ entries, branch, context: route });
const state = (entries, branch = 'branch-a', route = context) => { const store = new IndexStore(); store.merge(snapshot(entries, branch, route)); return store.exportState(); };
const ids = store => store.entries.map(entry => entry.id);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const memory = () => {
  const values = {}, writes = [];
  return { values, writes, get: async key => ({ [key]: structuredClone(values[key]) }),
    set: async patch => { writes.push(structuredClone(patch)); Object.assign(values, structuredClone(patch)); },
    remove: async key => { delete values[key]; } };
};

test('stable plain data round-trips after F5, mounts only current DOM and cannot retain completeness proof', () => {
  const before = new IndexStore();
  before.merge(snapshot([{ ...entry('a'), node: { secret: 'DOM' } }, entry('b'), entry('c'), entry('temporary', 'temporary', false)]));
  const exported = before.exportState();
  assert.equal(validStoredIndex(exported), true); assert.equal(JSON.stringify(exported).includes('secret'), false);
  assert.deepEqual(exported.entries.map(entry => entry.id), ['a', 'b', 'c']);
  const after = new IndexStore(); assert.equal(after.restoreState(exported, snapshot([entry('b')])), true);
  assert.deepEqual(ids(after), ['a', 'b', 'c']); assert.deepEqual([...after.mounted], ['b']);
  assert.equal(after.completeness, 'partial'); assert.equal(after.retainedCount, 3);
});

test('unknown branch retains searchable history without duplicate current rows or growing on repeated F5', () => {
  let saved = state([entry('a'), entry('b'), entry('c')], null);
  for (let i = 0; i < 5; i++) {
    const store = new IndexStore(); assert.equal(store.restoreState(saved, snapshot([entry('c')], null)), true);
    assert.deepEqual(ids(store), ['c']); assert.equal(store.retainedCount, 3);
    assert.deepEqual(store.searchObserved('').map(entry => entry.id).sort(), ['a', 'b', 'c']);
    assert.equal(store.quarantine[0].reason, 'restored-unverified');
    saved = store.exportState(); assert.equal(validStoredIndex(saved), true);
  }
});

test('different conversation is rejected; different branch or changed body cannot restore historical navigation', () => {
  const saved = state([entry('a'), entry('b')]);
  const other = new IndexStore(); assert.equal(other.restoreState(saved, snapshot([entry('b')], 'branch-a', 'https://chatgpt.com/c/other')), false);
  const branch = new IndexStore(); branch.restoreState(saved, snapshot([entry('b', 'edited')], 'branch-b'));
  assert.deepEqual(ids(branch), ['b']); assert.equal(branch.entries[0].text, 'edited'); assert.equal(branch.quarantine[0].entries[1].text, 'b');
  const conflict = new IndexStore(); conflict.restoreState(saved, snapshot([entry('b', 'edited')]));
  assert.deepEqual(ids(conflict), ['b']); assert.equal(conflict.searchObserved('a').length, 1);
  const noOverlap = new IndexStore(); noOverlap.restoreState(saved, snapshot([entry('new')]));
  assert.deepEqual(ids(noOverlap), ['new']); assert.equal(noOverlap.quarantine.length, 1);
});

test('later DOM observations promote identical restored witnesses, but retain conflicting versions', () => {
  const store = new IndexStore(); store.restoreState(state([entry('a'), entry('b'), entry('c')], null), snapshot([entry('c')], null));
  store.merge(snapshot([entry('a'), entry('b'), entry('c')], null));
  assert.deepEqual(ids(store), ['a', 'b', 'c']); assert.equal(store.quarantine.length, 0); assert.equal(store.retainedCount, 3);
  const changed = new IndexStore(); changed.restoreState(state([entry('a', 'old'), entry('b')], null), snapshot([entry('b')], null));
  changed.merge(snapshot([entry('a', 'new'), entry('b')], null));
  assert.equal(changed.quarantine[0].entries[0].text, 'old'); assert.equal(changed.retainedCount, 3);
});

test('restoring disconnected windows preserves uncertain order and conflicting mounted order is isolated', () => {
  const before = new IndexStore(); before.merge(snapshot([entry('a'), entry('b')])); before.merge(snapshot([entry('x'), entry('y')]));
  const after = new IndexStore(); after.restoreState(before.exportState(), snapshot([entry('b')]));
  assert.equal(after.ordered, false); assert.equal(after.segments.length, 2);
  const reversed = new IndexStore(); reversed.restoreState(state([entry('a'), entry('b')]), snapshot([entry('b'), entry('a')]));
  assert.deepEqual(ids(reversed), ['b', 'a']); assert.equal(reversed.quarantine[0].reason, 'order-conflict');
});

test('strict cache validation bounds stable entries, total archived characters, segments and schema', () => {
  const original = state([entry('a')]);
  for (const changed of [
    { ...original, unexpected: 1 }, { ...original, version: 2 }, { ...original, branch: '' },
    { ...original, entries: [{ ...entry('a'), stable: false }] }, { ...original, entries: [{ ...entry('a'), node: {} }] },
    { ...original, entries: [entry('a'), entry('a')] }, { ...original, segments: [{ ids: ['absent'], ordered: true }] },
    { ...original, segments: [{ ids: ['a', 'a'], ordered: true }] },
    { ...original, entries: [entry('a', 'x'.repeat(5_000_001))] },
  ]) assert.equal(validStoredIndex(changed), false);
  const huge = state([entry('large', 'x'.repeat(5_000_000))]);
  huge.quarantine.push({ reason: 'invalidated', entries: [entry('old', 'z')], segments: [{ ids: ['old'], ordered: true }], ordered: true });
  assert.equal(validStoredIndex(huge), false);
  const oversized = { ...original, entries: Array.from({ length: 5001 }, (_, i) => entry(String(i))), segments: [] };
  assert.equal(validStoredIndex(oversized), false);
});

test('broker serializes simultaneous same-route writes, preserves disjoint histories, isolates body conflict', async () => {
  const storage = memory(), broker = new CacheBroker(storage);
  await Promise.all([broker.save(state([entry('a'), entry('b')])), broker.save(state([entry('b'), entry('c')]))]);
  let loaded = await broker.load(context); assert.deepEqual(loaded.entries.map(entry => entry.id), ['a', 'b', 'c']);
  await broker.save(state([entry('b', 'edited'), entry('c')]));
  loaded = await broker.load(context);
  assert.equal(loaded.entries.find(entry => entry.id === 'b').text, 'edited');
  assert.equal(loaded.quarantine.some(generation => generation.entries.some(entry => entry.id === 'b' && entry.text === 'b')), true);
  assert.equal(validStoredIndex(loaded), true);
});

test('broker unknown-branch writes deduplicate witnesses and do not mix active branches', async () => {
  const storage = memory(), broker = new CacheBroker(storage);
  await broker.save(state([entry('a'), entry('b')], null));
  for (let i = 0; i < 4; i++) await broker.save(state([entry('b'), entry('c')], null));
  const saved = await broker.load(context);
  assert.deepEqual(saved.entries.map(entry => entry.id), ['b', 'c']);
  assert.deepEqual(saved.quarantine.flatMap(group => group.entries).map(entry => entry.id), ['a']);
  await broker.clear(); assert.equal(storage.values[CACHE_KEY], undefined);
});

test('merging at retention capacity never evicts already saved stable witnesses for new tab observations', async () => {
  const storage = memory(), broker = new CacheBroker(storage);
  const older = Array.from({ length: 5000 }, (_, i) => entry(`old-${i}`));
  await broker.save(state(older, null)); await broker.save(state([entry('new')], null));
  const saved = await broker.load(context), retained = [...saved.entries, ...saved.quarantine.flatMap(group => group.entries)];
  assert.equal(retained.length, 5000); assert.equal(retained.some(entry => entry.id === 'new'), false);
  assert.equal(retained.every(entry => entry.id.startsWith('old-')), true); assert.equal(saved.limitReason, 'entries');
});

test('profile limits evict least-recently-used conversations and enforce total serialized character budget', async () => {
  let clock = 1; const storage = memory(), broker = new CacheBroker(storage, () => clock++);
  for (let i = 0; i < 12; i++) await broker.save(state([entry('a')], 'branch-a', `https://chatgpt.com/c/test-${i}`));
  await broker.load('https://chatgpt.com/c/test-0');
  await broker.save(state([entry('a')], 'branch-a', 'https://chatgpt.com/c/test-12'));
  assert.equal(storage.values[CACHE_KEY].records.length, 12);
  assert.equal(await broker.load('https://chatgpt.com/c/test-1'), undefined);
  assert.ok(await broker.load('https://chatgpt.com/c/test-0'));
  await broker.save(state([entry('large', 'x'.repeat(3_100_000))], 'branch-a', 'https://chatgpt.com/c/large-a'));
  await broker.save(state([entry('large', 'x'.repeat(3_100_000))], 'branch-a', 'https://chatgpt.com/c/large-b'));
  assert.ok(JSON.stringify(storage.values[CACHE_KEY]).length <= PROFILE_LIMITS.characters);
  assert.equal(await broker.load('https://chatgpt.com/c/large-a'), undefined);
});

test('corrupt profile is discarded, no fresh-chat or cross-origin persistence is accepted', async () => {
  const storage = memory(); storage.values[CACHE_KEY] = { version: 1, records: [], surprise: 'secret' };
  const broker = new CacheBroker(storage); assert.equal(await broker.load(context), undefined);
  await assert.rejects(broker.save(state([entry('a')], 'branch-a', 'https://chatgpt.com/')));
  assert.equal(conversationContext('https://chatgpt.com/c/abc?view=1#x'), 'https://chatgpt.com/c/abc');
  assert.equal(conversationContext('https://chatgpt.com/g/g-demo/c/abc'), 'https://chatgpt.com/g/g-demo/c/abc');
  assert.equal(conversationContext('https://evil.test/c/abc'), null);
});

test('JSON-escaped oversized record is refused without erasing an existing profile', async () => {
  const storage = memory(), broker = new CacheBroker(storage);
  await broker.save(state([entry('a')])); const before = structuredClone(storage.values[CACHE_KEY]);
  await assert.rejects(broker.save(state([entry('large', '\n'.repeat(3_100_000))], 'branch-a', 'https://chatgpt.com/c/large')));
  assert.deepEqual(storage.values[CACHE_KEY], before);
});

test('coordinator debounces writes and changing only mounted window does not resave equal history', async () => {
  const store = new IndexStore(), writes = [], backend = { load: async () => undefined, save: async value => { writes.push(value); } };
  const coordinator = new PersistentIndex(backend, store, { debounceMs: 5 });
  store.merge(snapshot([entry('a'), entry('b')])); coordinator.schedule(); coordinator.schedule();
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(writes.length, 1);
  store.merge(snapshot([entry('b')])); coordinator.schedule(); await coordinator.flush();
  assert.equal(writes.length, 1); coordinator.dispose();
});

test('pagehide flush captures latest state and invalidates a delayed stale hydration', async () => {
  const gate = deferred(), writes = [], store = new IndexStore(); store.merge(snapshot([entry('a')]));
  const coordinator = new PersistentIndex({ load: () => gate.promise, save: async value => { writes.push(value); } }, store);
  const loading = coordinator.restore(context, () => snapshot([entry('b')]));
  store.merge(snapshot([entry('b')])); await coordinator.flush();
  gate.resolve(state([entry('old')])); assert.equal(await loading, false);
  assert.deepEqual(ids(store), ['a', 'b']); assert.deepEqual(writes[0].entries.map(entry => entry.id), ['a', 'b']);
  coordinator.dispose();
});

test('scheduled writes wait for hydration and capture full retained history; schedule does not export on every observation', async () => {
  const gate = deferred(), writes = [], store = new IndexStore(); store.merge(snapshot([entry('b')]));
  const coordinator = new PersistentIndex({ load: () => gate.promise, save: async state => { writes.push(state); } }, store, { debounceMs: 5 });
  const loading = coordinator.restore(context, () => snapshot([entry('b')]));
  let exports = 0; const original = store.exportState.bind(store); store.exportState = () => { exports++; return original(); };
  for (let i = 0; i < 25; i++) coordinator.schedule();
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(writes.length, 0); assert.equal(exports, 0);
  gate.resolve(state([entry('a'), entry('b')])); await loading;
  for (let i = 0; i < 25; i++) coordinator.schedule();
  await coordinator.flush(); assert.equal(writes.length, 0); // Restored unchanged state is already stored.
  store.merge(snapshot([entry('b'), entry('c')])); coordinator.schedule(); await coordinator.flush();
  assert.deepEqual(writes[0].entries.map(entry => entry.id), ['a', 'b', 'c']); coordinator.dispose();
});

test('new live observations acquired during hydration are actually saved, and saved status waits for storage resolution', async () => {
  const writeGate = deferred(), statuses = [], writes = [], store = new IndexStore(); store.merge(snapshot([entry('b')]));
  const coordinator = new PersistentIndex({ load: async () => state([entry('a')]), save: async state => { writes.push(state); await writeGate.promise; } }, store,
    { onStatus: status => { statuses.push(status); } });
  await coordinator.restore(context, () => snapshot([entry('b')]));
  assert.equal(coordinator.status, 'pending'); coordinator.schedule(); const saving = coordinator.flush();
  await Promise.resolve(); assert.equal(coordinator.status, 'pending'); const duplicate = coordinator.flush();
  assert.equal(coordinator.status, 'pending'); writeGate.resolve(); await Promise.all([saving, duplicate]);
  assert.equal(coordinator.status, 'saved'); assert.equal(writes.length, 1);
  assert.deepEqual([...writes[0].entries, ...writes[0].quarantine.flatMap(group => group.entries)].map(entry => entry.id).sort(), ['a', 'b']);
  coordinator.dispose(); assert.equal(coordinator.status, 'off');
});

test('route changes reject stale hydration and flush writes remain ordered after dispose', async () => {
  const gate = deferred(), store = new IndexStore(), writes = [];
  store.merge(snapshot([entry('a')]));
  const coordinator = new PersistentIndex({ load: () => gate.promise, save: async state => { writes.push(state); } }, store);
  const loading = coordinator.restore(context, () => snapshot([entry('a')]));
  const first = coordinator.flush();
  const other = 'https://chatgpt.com/c/other'; store.merge(snapshot([entry('b')], 'branch-b', other)); coordinator.schedule();
  const second = coordinator.flush(); coordinator.dispose(); gate.resolve(state([entry('old')]));
  assert.equal(await loading, false); await Promise.all([first, second]);
  assert.deepEqual(writes.map(state => state.context), [context, other]); assert.deepEqual(ids(store), ['b']);
});

test('in-flight hydration preserves observations made while storage was loading', async () => {
  const gate = deferred(), store = new IndexStore(); store.merge(snapshot([entry('b')]));
  const coordinator = new PersistentIndex({ load: () => gate.promise, save: async () => {} }, store);
  const loading = coordinator.restore(context, () => snapshot([entry('c')]));
  store.merge(snapshot([entry('b'), entry('c')])); gate.resolve(state([entry('a'), entry('b')]));
  assert.equal(await loading, true); assert.deepEqual(ids(store), ['a', 'b', 'c']); coordinator.dispose();
});

test('incognito does not read or write conversation storage', async () => {
  let calls = 0; const store = new IndexStore(); store.merge(snapshot([entry('a')]));
  const coordinator = new PersistentIndex({ load: async () => { calls++; }, save: async () => { calls++; } }, store, { incognito: true });
  assert.equal(await coordinator.restore(context, () => snapshot([entry('a')])), false);
  coordinator.schedule(); await coordinator.flush(); coordinator.dispose(); assert.equal(calls, 0);
});
