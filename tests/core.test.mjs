import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
await mkdir('artifacts/core', { recursive: true });
const compiled = await transform(await readFile('src/core.ts', 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' });
await writeFile('artifacts/core/core.mjs', compiled.code);
const { IndexStore, Navigator, validMessage, validSettings } = await import('../artifacts/core/core.mjs');
const entry = (id, text = id, stable = true) => ({ id, text, stable });
const snap = (entries, branch = 'branch-A', context = '/c/synthetic') => ({ entries, branch, context });
const ids = store => store.entries.map(e => e.id);
const limits = { totalMs: 100, batches: 3, batchMs: 25, noProgress: 3 };

test('CORE-01: identical text with different IDs survives; overlapping windows retain chronological order', () => {
  const s = new IndexStore();
  s.merge(snap([entry('c', 'same'), entry('d', 'same')]));
  s.merge(snap([entry('a'), entry('b'), entry('c', 'same')]), 'older');
  s.merge(snap([entry('d', 'same'), entry('e')]), 'newer');
  s.merge(snap([entry('d', 'same'), entry('e'), entry('e')]), 'newer');
  assert.deepEqual(ids(s), ['a', 'b', 'c', 'd', 'e']);
});
test('CORE-01: disjoint windows retain ordered segments until an observed ID bridge confirms their order', () => {
  const s = new IndexStore();
  s.merge(snap([entry('d'), entry('e')]));
  s.merge(snap([entry('a'), entry('b'), entry('c')]), 'older');
  assert.equal(s.ordered, false);
  assert.deepEqual(s.segments, [{ ids: ['d', 'e'], ordered: true }, { ids: ['a', 'b', 'c'], ordered: true }]);
  const epoch = s.epoch;
  assert.equal(s.merge(snap([entry('c'), entry('d')])), false);
  assert.deepEqual(ids(s), ['a', 'b', 'c', 'd', 'e']); assert.equal(s.ordered, true);
  assert.equal(s.epoch, epoch);
});
test('CORE-02: only exact structural branch proof marks complete; new IDs revoke proof', () => {
  const s = new IndexStore(); s.merge(snap([entry('a'), entry('b')]));
  const proof = { source: 'conversation-structure', branch: 'branch-A', exhausted: true, orderedIds: ['a', 'b'] };
  for (const invalid of [{ ...proof, exhausted: false }, { ...proof, branch: '' }, { ...proof, orderedIds: ['a', 'x', 'b'] }, { ...proof, orderedIds: ['b', 'a'] }, { ...proof, orderedIds: ['a', 'a'] }]) {
    assert.equal(s.verifyComplete(invalid), false); assert.equal(s.completeness, 'partial');
  }
  assert.equal(s.verifyComplete(proof), true);
  s.merge(snap([entry('b'), entry('c')]), 'newer');
  assert.equal(s.completeness, 'partial');
  assert.equal(s.verifyComplete(proof), false);
  const empty = new IndexStore(); empty.merge(snap([]));
  assert.equal(empty.verifyComplete({ ...proof, orderedIds: [] }), false);
});
test('CORE-03: branch/URL/explicit edit/order changes invalidate navigation epoch', () => {
  for (const changed of [snap([entry('a')], 'branch-B'), snap([entry('a')], 'branch-A', '/c/other'), { ...snap([entry('a', 'edited')]), invalidated: true }, snap([entry('b'), entry('a')])]) {
    const s = new IndexStore(); s.merge(snap([{ ...entry('a'), slot: 'turn-0' }, entry('b')]));
    const epoch = s.epoch; assert.equal(s.merge(changed), true); assert.ok(s.epoch > epoch);
    assert.deepEqual(ids(s), changed.entries.map(e => e.id));
  }
});
test('CORE-01: prefix appends are version contradictions and quarantine previous prompts', () => {
  const s = new IndexStore(); s.merge(snap([entry('a'), entry('b', 'partial')]));
  assert.equal(s.merge(snap([entry('b', 'partial expanded')])), true);
  assert.deepEqual(ids(s), ['b']); assert.equal(s.entries[0].text, 'partial expanded');
  assert.deepEqual(s.quarantine[0].entries.map(e => e.text), ['a', 'partial']);
  assert.equal(s.quarantine[0].reason, 'text-change');
});
test('CORE-03: unknown branches retain stable history; transient IDs remain mounted-only', () => {
  const unknown = new IndexStore(); unknown.merge(snap([entry('a'), entry('b')], null)); unknown.merge(snap([entry('b'), entry('c')], null));
  assert.deepEqual(ids(unknown), ['a', 'b', 'c']); assert.equal(unknown.branchConfidence, 'unverified');
  const s = new IndexStore(); s.merge(snap([entry('a', 'a', false), entry('b')])); s.merge(snap([entry('b')]));
  assert.deepEqual(ids(s), ['b']);
  s.merge(snap([entry('transient', 't', false)])); assert.equal(s.completeness, 'partial');
  assert.deepEqual(new Set(ids(s)), new Set(['b', 'transient']));
  s.merge(snap([])); assert.deepEqual(ids(s), ['b']);
});

test('SEEN-01: null-branch empty mounts, slot reuse and disconnected observations never cancel navigation', () => {
  const s = new IndexStore(); s.merge(snap([{ ...entry('a', 'same'), slot: 'turn-0' }, entry('b', 'same')], null));
  const epoch = s.epoch, revision = s.cacheRevision;
  assert.equal(s.merge(snap([], null)), false); assert.equal(s.mounted.size, 0);
  assert.deepEqual(ids(s), ['a', 'b']); assert.ok(s.cacheRevision > revision);
  assert.equal(s.merge(snap([{ ...entry('a', 'same'), slot: 'turn-99' }], null)), false);
  assert.equal(s.merge(snap([{ ...entry('x'), slot: 'turn-0' }, entry('y')], null)), false);
  assert.equal(s.epoch, epoch); assert.equal(s.quarantine.length, 0); assert.equal(s.ordered, false);
  assert.equal(s.search('same').length, 2); assert.equal(s.branchConfidence, 'unverified');
  const currentRevision = s.cacheRevision;
  s.merge(snap([{ ...entry('x'), slot: 'turn-0' }, entry('y')], null));
  assert.equal(s.cacheRevision, currentRevision);
});

test('SEEN-02: connected precedence ambiguity stays unconfirmed, and transitive contradiction quarantines it', () => {
  const s = new IndexStore(); s.merge(snap([entry('a'), entry('c')], null));
  s.merge(snap([entry('b'), entry('c')], null));
  assert.equal(s.segments.length, 1); assert.equal(s.segments[0].ordered, false); assert.equal(s.ordered, false);
  const epoch = s.epoch;
  s.merge(snap([entry('a'), entry('b'), entry('c')], null)); assert.equal(s.ordered, true); assert.equal(s.epoch, epoch);
  assert.equal(s.merge(snap([entry('c'), entry('a')], null)), true);
  assert.deepEqual(ids(s), ['c', 'a']); assert.deepEqual(s.quarantine[0].entries.map(e => e.id), ['a', 'b', 'c']);
  assert.equal(s.quarantine[0].reason, 'order-conflict'); assert.ok(s.epoch > epoch);
});

test('SEEN-03: long-unmounted stable versions and explicit invalidation remain searchable in quarantine', () => {
  const s = new IndexStore(); s.merge(snap([entry('a', 'original'), entry('b')], null));
  s.merge(snap([entry('x'), entry('y')], null)); s.merge(snap([], null));
  const epoch = s.epoch, revision = s.cacheRevision;
  assert.equal(s.merge(snap([entry('a', 'original appended')], null)), true);
  assert.equal(s.quarantine[0].reason, 'text-change'); assert.equal(s.quarantine[0].entries.length, 4);
  assert.equal(s.search('original').length, 1); assert.equal(s.searchObserved('original').length, 2);
  assert.equal(s.epoch, epoch + 1); assert.ok(s.cacheRevision > revision);
  assert.equal(s.merge({ ...snap([], null), invalidated: true }), true);
  assert.equal(s.entries.length, 0); assert.equal(s.quarantine.length, 2); assert.equal(s.searchObserved('').length, 5);
  assert.equal(s.completeness, 'partial');
  s.merge(snap([entry('z')], 'branch-B'));
  assert.equal(s.quarantine.length, 0); assert.equal(s.retainedCount, 1);
  s.merge({ ...snap([entry('z')], 'branch-B'), invalidated: true });
  s.merge(snap([entry('other')], 'branch-B', '/c/other'));
  assert.equal(s.quarantine.length, 0); assert.deepEqual(ids(s), ['other']);
});

test('SEEN-04: entry/character budgets include quarantined versions, stop collection and never evict prior data', () => {
  const s = new IndexStore({ entries: 3, characters: 100 });
  s.merge(snap([entry('a'), entry('b')], null)); s.merge(snap([entry('c'), entry('d')], null));
  assert.equal(s.limitReason, 'entries'); assert.deepEqual(new Set(ids(s)), new Set(['a', 'b', 'c']));
  assert.equal(s.retainedCount, 3); assert.deepEqual([...s.mounted], ['c', 'd']);
  const revision = s.cacheRevision;
  s.merge(snap([entry('d')], null)); assert.equal(s.searchObserved('').length, 3); assert.ok(s.cacheRevision > revision);
  assert.equal(s.merge(snap([entry('a', 'edit')], null)), true);
  assert.equal(s.entries.length, 0); assert.equal(s.searchObserved('').length, 3); assert.equal(s.retainedCount, 3);
  const chars = new IndexStore({ entries: 10, characters: 8 });
  chars.merge(snap([entry('a', '1234')], null));
  chars.merge(snap([entry('a', '12345')], null));
  assert.equal(chars.limitReason, 'characters'); assert.equal(chars.retainedCharacters, 4);
  assert.equal(chars.quarantine[0].entries[0].text, '1234');
  chars.merge(snap([entry('tiny', 'x')], null)); assert.equal(chars.retainedCharacters, 4);
  chars.reset(); assert.equal(chars.limitReason, null); assert.equal(chars.retainedCount, 0); assert.equal(chars.retainedCharacters, 0);
  chars.merge(snap([entry('tiny', 'x')], null)); assert.equal(chars.retainedCharacters, 1);
});

test('SEEN-05: retained records discard DOM references and transient identities cannot create branch contradictions', () => {
  const s = new IndexStore(), node = {}; node.self = node;
  s.merge(snap([{ ...entry('a'), node }, entry('temporary', 'tmp', false)], null));
  assert.deepEqual(Object.keys(s.entries[0]).sort(), ['id', 'stable', 'text']);
  const epoch = s.epoch;
  s.merge(snap([entry('temporary', 'different', false), entry('a')], null));
  assert.equal(s.epoch, epoch); assert.equal(s.quarantine.length, 0);
  s.merge(snap([], null)); assert.deepEqual(ids(s), ['a']); assert.equal(s.retainedCharacters, 1);
});

test('SEEN-06: all completed real IAB windows retain exact observed IDs/text across unloading and slot renumbering', async () => {
  const evidence = JSON.parse(await readFile(new URL('../docs/evidence/iab-2026-10-03/live-dom-evidence.json', import.meta.url), 'utf8'));
  const expected = new Map(evidence.expectedPrompts.map(e => [e.id, e.text]));
  const stores = new Map(), observed = new Map(); let frames = 0;
  for (const frame of evidence.snapshots.filter(s => s.context && !s.generating)) {
    const phase = frame.action.startsWith('cold-') ? 'cold' : 'warm';
    if (!stores.has(phase)) { stores.set(phase, new IndexStore()); observed.set(phase, new Map()); }
    const s = stores.get(phase), seen = observed.get(phase);
    const entries = frame.messages.filter(e => e.role === 'user').map(e => ({ id: e.id, text: e.text.trim(), stable: true, slot: e.slot }));
    const epoch = s.epoch, hadContext = !!s.context;
    s.merge({ context: frame.context, branch: null, entries });
    for (const e of entries) { assert.equal(e.text, expected.get(e.id)); seen.set(e.id, e.text); }
    assert.deepEqual(new Map(s.entries.map(e => [e.id, e.text])), seen);
    assert.equal(s.quarantine.length, 0); assert.equal(s.branchConfidence, 'unverified');
    if (hadContext) assert.equal(s.epoch, epoch, frame.action);
    s.merge({ context: frame.context, branch: null, entries: [] });
    assert.deepEqual(new Map(s.entries.map(e => [e.id, e.text])), seen); frames++;
  }
  assert.ok(frames >= 50);
  for (const s of stores.values()) {
    assert.equal(s.entries.length, 12); assert.equal(s.ordered, true);
    assert.deepEqual(ids(s), [...expected.keys()]); assert.equal(s.completeness, 'partial');
  }
});
test('CORE-03: cancellation and supersession settle even when adapter ignores AbortSignal', async () => {
  let resolveOld; let mounted = false; const located = [];
  const adapter = { mounted: id => id === 'new' || mounted, locate: id => { located.push(id); return true; }, direction: () => 'older', load: () => new Promise(resolve => { resolveOld = resolve; }) };
  const states = []; const nav = new Navigator(adapter, state => states.push(state), limits);
  const old = nav.run('old'); await new Promise(resolve => setTimeout(resolve, 5));
  nav.cancel(); assert.equal(await old, 'cancelled');
  const second = await nav.run('new'); assert.equal(second, 'located');
  mounted = true; resolveOld(true); await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(located, ['new']); assert.equal(nav.state, 'located');
});
test('async locate completion cannot overwrite a superseding navigation state', async () => {
  let completeOld, oldSignal;
  const states = [];
  const nav = new Navigator({ mounted: () => true, direction: () => 'older', load: async () => false,
    locate: (id, signal) => id === 'old' ? new Promise(resolve => { completeOld = resolve; oldSignal = signal; }) : Promise.resolve(true),
  }, state => states.push(state), limits);
  const old = nav.run('old'); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await nav.run('new'), 'located'); assert.equal(oldSignal.aborted, true);
  const count = states.length; completeOld(true);
  assert.equal(await old, 'cancelled'); assert.equal(nav.state, 'located'); assert.equal(states.length, count);
});
test('never-resolving async locate obeys total deadline both before and after a load', { timeout: 1000 }, async () => {
  for (const initiallyMounted of [true, false]) {
    let mounted = initiallyMounted, loads = 0, locateSignal;
    const nav = new Navigator({ mounted: () => mounted, direction: () => 'older',
      load: async () => { loads++; mounted = true; return true; },
      locate: (_id, signal) => { locateSignal = signal; return new Promise(() => {}); },
    }, () => {}, { ...limits, totalMs: 20 });
    const start = performance.now();
    assert.equal(await nav.run('target'), 'timed-out'); assert.equal(nav.state, 'timed-out');
    assert.equal(locateSignal.aborted, true); assert.equal(loads, initiallyMounted ? 0 : 1);
    assert.ok(performance.now() - start < 250);
  }
});
test('CORE-03: per-batch/total deadlines are enforced and no-progress stops after three loads', async () => {
  let loads = 0;
  const base = { mounted: () => false, locate: () => false, direction: () => 'older', load: async () => { loads++; return false; } };
  const stall = new Navigator(base, () => {}, limits); assert.equal(await stall.run('absent'), 'not-found'); assert.equal(loads, 3);
  const stuck = new Navigator({ ...base, load: () => new Promise(() => {}) }, () => {}, limits);
  const started = performance.now(); assert.equal(await stuck.run('absent'), 'timed-out'); assert.ok(performance.now() - started < 250);
  const total = new Navigator({ ...base, load: () => new Promise(() => {}) }, () => {}, { ...limits, totalMs: 15, batchMs: 100 });
  assert.equal(await total.run('absent'), 'timed-out');
});
test('navigation locates target that arrives in the third nominal no-progress batch', async () => {
  let loads = 0; let located = 0;
  const nav = new Navigator({ mounted: () => loads === 3, locate: () => { located++; return true; }, direction: () => 'older', load: async () => { loads++; return false; } }, () => {}, limits);
  assert.equal(await nav.run('target'), 'located'); assert.equal(located, 1);
});
test('batch timeout aborts adapter signal; superseded tasks report their own cancelled result', async () => {
  let signal;
  const adapter = { mounted: id => id === 'new', locate: () => true, direction: () => 'older', load: (_direction, value) => { signal = value; return new Promise(() => {}); } };
  const timed = new Navigator(adapter, () => {}, limits);
  assert.equal(await timed.run('old'), 'timed-out'); assert.equal(signal.aborted, true);
  const nav = new Navigator(adapter, () => {}, limits);
  const old = nav.run('old'); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(await nav.run('new'), 'located'); assert.equal(await old, 'cancelled');
});
test('CORE-04: NFKC case/whitespace search of 1,000 prompts, 20 repetitions p95 <=300ms', () => {
  const s = new IndexStore(); s.merge(snap(Array.from({ length: 1000 }, (_, i) => entry(`p-${i}`, `提問 ${i} Ｆｉｒｅｆｏｘ 測試`))));
  const timings = [];
  for (let i = 0; i < 20; i++) { const start = performance.now(); const results = s.search('  firefox   測試  '); timings.push(performance.now() - start); assert.equal(results.length, 1000); }
  const p95 = timings.sort((a, b) => a - b)[Math.ceil(timings.length * .95) - 1];
  console.log(JSON.stringify({ case: 'CORE-04', sample: 'synthetic-1000', repeats: 20, p95_ms: p95, failures: 0 }));
  assert.ok(p95 <= 300); assert.equal(s.search('提問 999').length, 1);
});
test('runtime schemas reject extra keys, fake commands and malformed settings', () => {
  assert.equal(validMessage({ kind: 'settings:get' }), true);
  assert.equal(validMessage({ kind: 'settings:get', url: 'https://evil.test' }), false);
  assert.equal(validMessage({ kind: 'settings:set', expanded: 'true' }), false);
  assert.equal(validMessage({ kind: 'eval', code: 'alert(1)' }), false);
  assert.equal(validSettings({ auto: false, expanded: true }), true);
  assert.equal(validSettings({ auto: false, expanded: true, token: 'no' }), false);
});
