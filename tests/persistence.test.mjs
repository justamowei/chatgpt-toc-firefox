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

test('null branch F5 restores exact seek candidates and original order without growing or claiming verification', () => {
  let saved = state([entry('a'), entry('b'), entry('c')], null);
  for (let i = 0; i < 5; i++) {
    const store = new IndexStore(); assert.equal(store.restoreState(saved, snapshot([entry('c')], null)), true);
    assert.deepEqual(ids(store), ['a', 'b', 'c']); assert.equal(store.retainedCount, 3);
    assert.deepEqual(store.searchObserved('').map(entry => entry.id).sort(), ['a', 'b', 'c']);
    assert.equal(store.quarantine.length, 0); assert.equal(store.canSeek('a'), true);
    assert.equal(store.seekDirection('a'), 'older'); assert.equal(store.seekDirection('c', ['a']), 'newer');
    assert.equal(store.ordered, true); assert.equal(store.branchConfidence, 'unverified'); assert.equal(store.completeness, 'partial');
    assert.deepEqual([...store.recoveredIds], ['a', 'b']);
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
  assert.deepEqual(ids(noOverlap), ['a', 'b', 'new']); assert.equal(noOverlap.quarantine.length, 0);
  assert.equal(noOverlap.canSeek('a'), true); assert.equal(noOverlap.seekDirection('a'), null); assert.equal(noOverlap.ordered, false);
});

test('later DOM observations promote identical restored witnesses, but retain conflicting versions', () => {
  const store = new IndexStore(); store.restoreState(state([entry('a'), entry('b'), entry('c')], null), snapshot([entry('c')], null));
  store.merge(snapshot([entry('a'), entry('b'), entry('c')], null));
  assert.deepEqual(ids(store), ['a', 'b', 'c']); assert.equal(store.quarantine.length, 0); assert.equal(store.retainedCount, 3);
  assert.equal(store.recoveredIds.size, 0); assert.equal(store.branchConfidence, 'unverified');
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

test('v032 search-only prefix migrates before the live tail, with no invented bridge direction', () => {
  const saved = state([entry('c'), entry('d')], null);
  saved.quarantine.push({ reason: 'restored-unverified', entries: [entry('a'), entry('b')],
    segments: [{ ids: ['a', 'b'], ordered: true }], ordered: true });
  for (let i = 0; i < 3; i++) {
    const store = new IndexStore(); store.restoreState(saved, snapshot([entry('d')], null));
    assert.deepEqual(ids(store), ['a', 'b', 'c', 'd']); assert.equal(store.quarantine.length, 0);
    assert.equal(store.canSeek('a'), true); assert.equal(store.seekDirection('a'), null);
    assert.equal(store.seekDirection('c'), 'older'); assert.equal(store.seekDirection('a', ['b']), 'older');
    assert.equal(store.ordered, false); assert.equal(store.completeness, 'partial');
    Object.assign(saved, store.exportState()); assert.equal(validStoredIndex(saved), true);
  }
});

test('legacy duplicate versions or body contradictions remain quarantined and never supply seek identities', () => {
  const saved = state([entry('tail')], null);
  saved.quarantine = ['old', 'other'].map(text => ({ reason: 'restored-unverified', entries: [entry('a', text)],
    segments: [{ ids: ['a'], ordered: true }], ordered: true }));
  const store = new IndexStore(); store.restoreState(saved, snapshot([entry('tail')], null));
  assert.deepEqual(ids(store), ['tail']); assert.equal(store.canSeek('a'), false);
  assert.deepEqual(store.searchObserved('').filter(entry => entry.id === 'a').map(entry => entry.text), ['old', 'other']);
  const duplicateDOM = new IndexStore(); duplicateDOM.restoreState(state([entry('a', 'old')], null), snapshot([entry('a', 'old'), entry('a', 'new')], null));
  assert.equal(duplicateDOM.canSeek('a'), false); assert.equal(duplicateDOM.mounted.has('a'), false);
  assert.equal(duplicateDOM.quarantine[0].reason, 'text-change');
  assert.equal(validStoredIndex(duplicateDOM.exportState()), true);
  const reversed = state([entry('b'), entry('a')], null);
  reversed.quarantine.push({ reason: 'restored-unverified', entries: [entry('a'), entry('b')],
    segments: [{ ids: ['a', 'b'], ordered: true }], ordered: true });
  const order = new IndexStore(); order.restoreState(reversed, snapshot([entry('tail')], null));
  assert.deepEqual(ids(order), ['tail']); assert.equal(order.canSeek('a'), false);
  assert.equal(order.quarantine[0].reason, 'order-conflict'); assert.equal(validStoredIndex(order.exportState()), true);
});

test('cached candidate body/order contradictions invalidate the navigation epoch, and known branch archives never migrate', () => {
  for (const changed of [[entry('b', 'edited')], [entry('b'), entry('a')]]) {
    const store = new IndexStore(); store.restoreState(state([entry('a'), entry('b')], null), snapshot([entry('b')], null));
    const epoch = store.epoch; assert.equal(store.merge(snapshot(changed, null)), true); assert.ok(store.epoch > epoch);
    assert.deepEqual(ids(store), changed.map(entry => entry.id)); assert.equal(store.recoveredIds.size, 0);
    assert.equal(store.quarantine[0].reason, changed.length === 1 ? 'text-change' : 'order-conflict');
  }
  const changed = new IndexStore(); changed.restoreState(state([entry('a'), entry('b')]), snapshot([entry('b')], 'branch-b'));
  assert.equal(changed.quarantine[0].reason, 'branch-change');
  const later = new IndexStore(); later.restoreState(changed.exportState(), snapshot([entry('b')], null));
  assert.equal(later.canSeek('a'), false); assert.equal(later.searchObserved('a').length, 1);
});

test('null branch broker writes preserve seek hints through legacy migration, disjoint tabs and exact conflicts', async () => {
  const storage = memory(), broker = new CacheBroker(storage);
  const legacy = state([entry('c')], null);
  legacy.quarantine.push({ reason: 'restored-unverified', entries: [entry('a'), entry('b')],
    segments: [{ ids: ['a', 'b'], ordered: true }], ordered: true });
  await broker.save(legacy); await broker.save(state([entry('c'), entry('d')], null));
  let saved = await broker.load(context), store = new IndexStore(); store.restoreState(saved, snapshot([entry('d')], null));
  assert.deepEqual(ids(store), ['a', 'b', 'c', 'd']); assert.equal(store.seekDirection('a'), null); assert.equal(store.canSeek('a'), true);
  await broker.save(state([entry('a', 'edited')], null)); saved = await broker.load(context);
  store = new IndexStore(); store.restoreState(saved, snapshot([entry('a', 'edited')], null));
  assert.equal(store.entries.find(entry => entry.id === 'a').text, 'edited');
  assert.equal(store.quarantine.some(group => group.entries.some(entry => entry.id === 'a' && entry.text === 'a')), true);
  assert.equal(validStoredIndex(saved), true);
});

test('broker known branch changes also isolate a legacy restored-unverified prefix', async () => {
  const storage = memory(), broker = new CacheBroker(storage), old = state([entry('tail')]);
  old.quarantine.push({ reason: 'restored-unverified', entries: [entry('prefix')],
    segments: [{ ids: ['prefix'], ordered: true }], ordered: true });
  await broker.save(old); await broker.save(state([entry('new')], 'branch-b'));
  const store = new IndexStore(); store.restoreState(await broker.load(context), snapshot([entry('new')], null));
  assert.deepEqual(ids(store), ['new']); assert.equal(store.canSeek('prefix'), false); assert.equal(store.canSeek('tail'), false);
  assert.equal(store.searchObserved('prefix').length, 1);
});

test('strict cache validation bounds stable entries, total archived characters, segments and schema', () => {
  const original = state([entry('a')]);
  for (const changed of [
    { ...original, unexpected: 1 }, { ...original, version: 2 }, { ...original, branch: '' },
    { ...original, entries: [{ ...entry('a'), stable: false }] }, { ...original, entries: [{ ...entry('a'), node: {} }] },
    { ...original, entries: [entry('a'), entry('a')] }, { ...original, segments: [{ ids: ['absent'], ordered: true }] },
    { ...original, recovery: { candidateIds: ['absent'] } }, { ...original, recovery: { candidateIds: ['a', 'a'] } },
    { ...original, recovery: { candidateIds: ['a'], unexpected: true } },
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
  assert.deepEqual(saved.entries.map(entry => entry.id), ['a', 'b', 'c']);
  assert.deepEqual(saved.quarantine.flatMap(group => group.entries), []);
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

test('SPA empty mounts hydrate null-branch candidates before later DOM windows arrive', async () => {
  const gate = deferred(), store = new IndexStore(), writes = [];
  store.merge(snapshot([], null));
  const coordinator = new PersistentIndex({ load: () => gate.promise, save: async state => { writes.push(state); } }, store);
  const loading = coordinator.restore(context, () => snapshot([], null));
  store.merge(snapshot([], null)); coordinator.schedule();
  gate.resolve(state([entry('a'), entry('b'), entry('c')], null));
  assert.equal(await loading, true); assert.deepEqual(ids(store), ['a', 'b', 'c']); assert.equal(store.mounted.size, 0);
  assert.equal(store.canSeek('a'), true); assert.equal(store.seekDirection('a'), null); assert.equal(store.ordered, true);
  store.merge(snapshot([entry('c')], null)); coordinator.schedule(); await coordinator.flush();
  assert.deepEqual(ids(store), ['a', 'b', 'c']); assert.equal(store.seekDirection('a'), 'older');
  assert.deepEqual(writes[0].recovery.candidateIds, ['a', 'b']); assert.equal(validStoredIndex(writes[0]), true);
  coordinator.dispose();
});

test('incognito does not read or write conversation storage', async () => {
  let calls = 0; const store = new IndexStore(); store.merge(snapshot([entry('a')]));
  const coordinator = new PersistentIndex({ load: async () => { calls++; }, save: async () => { calls++; } }, store, { incognito: true });
  assert.equal(await coordinator.restore(context, () => snapshot([entry('a')])), false);
  coordinator.schedule(); await coordinator.flush(); coordinator.dispose(); assert.equal(calls, 0);
});


test('saved null-branch sorting survives empty, middle and tail mounts across repeated reloads without a rescan', () => {
  const all = Array.from({ length: 30 }, (_, i) => entry('p-' + i, 'prompt ' + i));
  let saved = state(all, null);
  // The original v033 format can contain recovery candidates while its saved
  // segments already have valid ordering. Both states must restore identically.
  saved.recovery = { candidateIds: all.map(e => e.id) };
  for (const live of [[], [all[15]], [all[29]], [], [all[2]]]) {
    const store = new IndexStore(); assert.equal(store.restoreState(saved, snapshot(live, null)), true);
    assert.deepEqual(ids(store), all.map(e => e.id));
    assert.equal(store.ordered, true); assert.deepEqual(store.segments, [{ ids: ids(store), ordered: true }]);
    assert.equal(store.branchConfidence, 'unverified'); assert.equal(store.completeness, 'partial');
    assert.equal(store.quarantine.length, 0); assert.equal(store.retainedCount, 30);
    assert.deepEqual([...store.mounted], live.map(e => e.id));
    assert.ok(store.recoveredIds.size >= 29); assert.ok(all.every(e => store.canSeek(e.id)));
    saved = store.exportState(); assert.equal(validStoredIndex(saved), true);
  }
});

test('saved ordering never promotes recovered identities into a completeness proof', () => {
  const store = new IndexStore();
  store.restoreState(state([entry('a'), entry('b')]), snapshot([]));
  const proof = { source: 'conversation-structure', branch: 'branch-a', exhausted: true, orderedIds: ['a', 'b'] };
  assert.equal(store.ordered, true); assert.equal(store.recoveredIds.size, 2);
  assert.equal(store.verifyComplete(proof), false); assert.equal(store.completeness, 'partial');
  store.merge(snapshot([entry('b')])); assert.equal(store.verifyComplete(proof), false);
  store.merge(snapshot([entry('a'), entry('b')])); assert.equal(store.recoveredIds.size, 0);
  assert.equal(store.verifyComplete(proof), true);
  const unknown = new IndexStore(); unknown.restoreState(state([entry('a'), entry('b')], null), snapshot([], null));
  assert.equal(unknown.verifyComplete(proof), false);
});

test('restored disconnected groups retain their own order without inventing order between groups', () => {
  const before = new IndexStore(); before.merge(snapshot([entry('a'), entry('b')], null)); before.merge(snapshot([entry('x'), entry('y')], null));
  const after = new IndexStore(); after.restoreState(before.exportState(), snapshot([], null));
  assert.equal(after.ordered, false);
  assert.deepEqual(after.segments, [{ ids: ['a', 'b'], ordered: true }, { ids: ['x', 'y'], ordered: true }]);
  assert.equal(after.seekDirection('a', ['y']), null);
  after.merge(snapshot([entry('b'), entry('x')], null));
  assert.equal(after.ordered, true); assert.deepEqual(ids(after), ['a', 'b', 'x', 'y']);
});

test('legacy archived prefix retains local ordering after migration but does not invent a bridge', () => {
  const saved = state([entry('c'), entry('d')], null);
  saved.quarantine.push({ reason: 'restored-unverified', entries: [entry('a'), entry('b')], segments: [{ ids: ['a', 'b'], ordered: true }], ordered: true });
  const store = new IndexStore(); store.restoreState(saved, snapshot([], null));
  assert.equal(store.ordered, false);
  assert.deepEqual(store.segments, [{ ids: ['a', 'b'], ordered: true }, { ids: ['c', 'd'], ordered: true }]);
  assert.equal(store.seekDirection('a', ['d']), null); assert.equal(store.seekDirection('a', ['b']), 'older');
});

test('broker merges saved overlapping windows without degrading ordering across tabs and repeated writes', async () => {
  const broker = new CacheBroker(memory());
  await broker.save(state([entry('a'), entry('b'), entry('c')], null));
  for (let i = 0; i < 5; i++) {
    await broker.save(state([entry('c'), entry('d')], null));
    const store = new IndexStore(); store.restoreState(await broker.load(context), snapshot([entry('d')], null));
    assert.deepEqual(ids(store), ['a', 'b', 'c', 'd']); assert.equal(store.ordered, true);
    assert.equal(store.segments[0].ordered, true); assert.equal(store.completeness, 'partial');
    await broker.save(store.exportState());
  }
});

test('SPA A to B to A restores saved order immediately while empty, without F5 or recollection', async () => {
  const broker = new CacheBroker(memory()), store = new IndexStore(), coordinator = new PersistentIndex(broker, store);
  const other = 'https://chatgpt.com/c/other';
  store.merge(snapshot([entry('a'), entry('b'), entry('c')], null)); await coordinator.flush();
  store.merge(snapshot([entry('other')], null, other)); await coordinator.restore(other, () => snapshot([entry('other')], null, other)); await coordinator.flush();
  store.merge(snapshot([], null)); assert.equal(await coordinator.restore(context, () => snapshot([], null)), true);
  assert.deepEqual(ids(store), ['a', 'b', 'c']); assert.equal(store.ordered, true); assert.equal(store.mounted.size, 0);
  assert.deepEqual(store.segments, [{ ids: ['a', 'b', 'c'], ordered: true }]);
  store.merge(snapshot([entry('c')], null)); await coordinator.flush();
  assert.deepEqual((await broker.load(context)).segments, [{ ids: ['a', 'b', 'c'], ordered: true }]);
  assert.deepEqual((await broker.load(other)).entries.map(e => e.id), ['other']); coordinator.dispose();
});

test('selected rebuild deletes active and quarantined witnesses, preserves other sessions and rejects stale writes after background restart', async () => {
  const storage = memory(), broker = new CacheBroker(storage), other = 'https://chatgpt.com/c/other';
  const stale = state([entry('old')]); stale.quarantine = [{ reason:'text-change', entries:[entry('bad')], segments:[{ids:['bad'],ordered:true}],ordered:true }];
  await broker.save(stale); await broker.save(state([entry('other')], null, other));
  const empty = await broker.reset(context); assert.equal(empty.generation,1); assert.deepEqual(empty.entries,[]);
  assert.deepEqual((await broker.load(context)).entries,[]); assert.equal((await broker.load(other)).entries[0].id,'other');
  await assert.rejects(broker.save(stale),/Stale/);
  const restarted = new CacheBroker(storage); await assert.rejects(restarted.save(stale),/Stale/);
  const fresh = state([entry('fresh')]); fresh.generation=empty.generation; await restarted.save(fresh);
  assert.deepEqual((await restarted.load(context)).entries.map(e=>e.id),['fresh']);
  const again = await restarted.reset(context); assert.equal(again.generation,2); await assert.rejects(restarted.save(fresh),/Stale/);
});
test('numbering persists the observed origin, survives unknown-branch reload, append bridging and search, but revokes on insertion or contradiction', async () => {
  const store = new IndexStore(); store.merge(snapshot([entry('a'),entry('b'),entry('c')],null));
  assert.equal(store.assignSessionNumbers(new Set(['a','c'])),false);
  assert.equal(store.assignSessionNumbers(new Set(['a','b','c'])),true);
  const saved=store.exportState(); assert.equal(validStoredIndex(saved),true);
  const reload=new IndexStore();reload.restoreState(saved,snapshot([entry('c')],null));
  assert.deepEqual(reload.ordinal('b'),{number:2,confirmed:true});assert.equal(reload.search('b')[0].id,'b');
  reload.merge(snapshot([entry('c'),entry('d')],null));reload.extendSessionNumbers(['c','d']);
  assert.deepEqual(reload.ordinal('d'),{number:4,confirmed:true});
  reload.merge(snapshot([entry('earlier'),entry('a')],null));assert.equal(reload.ordinal('a').confirmed,false);
  const broker=new CacheBroker(memory());await broker.save(saved);await broker.save(store.exportState());assert.deepEqual((await broker.load(context)).numbering.ids,['a','b','c']);
  store.merge(snapshot([entry('b','changed')],null));assert.equal(store.numberedIds.length,0);
});
test('cancelled or switched route reset acknowledgment cannot hydrate another conversation', async () => {
  const pending=deferred(),store=new IndexStore();store.merge(snapshot([entry('old')],null));
  const persistence=new PersistentIndex({load:async()=>undefined,save:async()=>{},reset:()=>pending.promise},store);
  const task=persistence.rebuild(context,()=>snapshot(store.entries,null,store.context),()=>true);
  await new Promise(resolve=>setImmediate(resolve));store.merge(snapshot([entry('other')],null,'https://chatgpt.com/c/other'));
  pending.resolve({...state([],null),generation:1});assert.equal(await task,false);assert.deepEqual(ids(store),['other']);persistence.dispose();
});

test('reset acknowledgment applies its committed generation after scrolling cancellation and uses the pre-reset epoch for continuation', async () => {
  for (const cancelled of [false,true]) {
    const store=new IndexStore();store.merge(snapshot([entry('old')],null));const epoch=store.epoch,gate=deferred();let live=true;
    const persist=new PersistentIndex({load:async()=>undefined,save:async()=>{},reset:()=>gate.promise},store);
    const pending=persist.rebuild(context,()=>snapshot([entry('new')],null),()=>live&&store.epoch===epoch);
    await new Promise(r=>setImmediate(r));if(cancelled)live=false;
    gate.resolve({...state([],null),generation:1});assert.equal(await pending,!cancelled);assert.equal(store.cacheGeneration,1);assert.deepEqual(ids(store),['new']);persist.dispose();
  }
});
test('a transient insertion revokes absolute numbering durably rather than resurrecting it from the broker', async () => {
  const store=new IndexStore();store.merge(snapshot([entry('a'),entry('b'),entry('c')],null));store.assignSessionNumbers(new Set(['a','b','c']));
  const storage=memory(),broker=new CacheBroker(storage);await broker.save(store.exportState());
  store.merge(snapshot([entry('a'),entry('transient','pending',false),entry('b'),entry('c')],null));assert.deepEqual(store.numberedIds,[]);
  await broker.save(store.exportState());const saved=await broker.load(context);assert.ok(!saved.numbering||!saved.numbering.ids.length);
  const reload=new IndexStore();reload.restoreState(saved,snapshot([entry('b')],null));assert.equal(reload.ordinal('b').confirmed,false);
});

test('an unaware passive tab cannot erase another tab session numbering within the same cache generation', async () => {
  const storage=memory(),broker=new CacheBroker(storage);const reset=await broker.reset(context);
  const a=new IndexStore();a.restoreState(reset,snapshot([entry('a'),entry('b'),entry('c')],null));
  const b=new IndexStore();b.restoreState(reset,snapshot([entry('c')],null));
  a.assignSessionNumbers(new Set(['a','b','c']));await broker.save(a.exportState());
  b.merge(snapshot([entry('c'),entry('d')],null));assert.equal(b.exportState().numbering,undefined);await broker.save(b.exportState());
  const merged=await broker.load(context);assert.deepEqual(merged.numbering.ids,['a','b','c']);
});
