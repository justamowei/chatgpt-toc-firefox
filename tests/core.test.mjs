import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
await mkdir('artifacts/core', { recursive: true });
await build({ entryPoints: ['src/core.ts'], outfile: 'artifacts/core/core.mjs', bundle: true, platform: 'node', format: 'esm' });
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
test('CORE-01: disjoint older batches keep their internal order; unanchored observations reset', () => {
  const s = new IndexStore();
  s.merge(snap([entry('d'), entry('e')]));
  s.merge(snap([entry('a'), entry('b'), entry('c')]), 'older');
  assert.deepEqual(ids(s), ['a', 'b', 'c', 'd', 'e']);
  const epoch = s.epoch;
  assert.equal(s.merge(snap([entry('x'), entry('y')])), true);
  assert.deepEqual(ids(s), ['x', 'y']);
  assert.ok(s.epoch > epoch);
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
test('CORE-03: branch/URL/explicit edit/slot/order changes invalidate old history and epoch', () => {
  for (const changed of [snap([entry('a')], 'branch-B'), snap([entry('a')], 'branch-A', '/c/other'), { ...snap([entry('a', 'edited')]), invalidated: true }, snap([{ ...entry('x'), slot: 'turn-0' }]), snap([entry('b'), entry('a')])]) {
    const s = new IndexStore(); s.merge(snap([{ ...entry('a'), slot: 'turn-0' }, entry('b')]));
    const epoch = s.epoch; assert.equal(s.merge(changed), true); assert.ok(s.epoch > epoch);
    assert.deepEqual(ids(s), changed.entries.map(e => e.id));
  }
});
test('CORE-01: incremental text updates of one ID preserve other stable prompts', () => {
  const s = new IndexStore(); s.merge(snap([entry('a'), entry('b', 'partial')]));
  s.merge(snap([entry('b', 'partial expanded')])); assert.deepEqual(ids(s), ['a', 'b']); assert.equal(s.entries[1].text, 'partial expanded');
});
test('CORE-03: unknown branches and transient IDs never retain unmounted history', () => {
  const unknown = new IndexStore(); unknown.merge(snap([entry('a'), entry('b')], null)); unknown.merge(snap([entry('b'), entry('c')], null));
  assert.deepEqual(ids(unknown), ['b', 'c']); assert.equal(unknown.branch, null);
  const s = new IndexStore(); s.merge(snap([entry('a', 'a', false), entry('b')])); s.merge(snap([entry('b')]));
  assert.deepEqual(ids(s), ['b']);
  s.merge(snap([entry('transient', 't', false)])); assert.equal(s.completeness, 'unknown');
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
