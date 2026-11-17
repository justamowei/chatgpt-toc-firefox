import test from 'node:test';
import assert from 'node:assert/strict';
import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
await mkdir('artifacts/collection-policy', { recursive: true });
for (const name of ['collection-policy', 'core']) {
  const compiled = await transform(await readFile(`src/${name}.ts`, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' });
  await writeFile(`artifacts/collection-policy/${name}.mjs`, compiled.code);
}
const { CollectionBoundaryWitness } = await import('../artifacts/collection-policy/collection-policy.mjs');
const { Navigator } = await import('../artifacts/collection-policy/core.mjs');
const domBuild = await build({ entryPoints: ['src/dom.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  tsconfigRaw: {}, define: { __FIXTURE__: 'false', __REVISION__: '"unit-test"' }, plugins: [{ name: 'synthetic-turn-reader', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (args.path === './turns') return { path: 'synthetic-turns', namespace: 'test' };
      let path = posix.normalize(args.kind === 'entry-point' ? args.path : posix.join(posix.dirname(args.importer), args.path));
      if (!path.endsWith('.ts')) path += '.ts';
      if (!path.startsWith('src/') || path.includes('\\')) throw new Error('Nonlocal unit-test import: ' + args.path);
      return { path, namespace: 'source' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function readTurns(){ globalThis.__collectionReadCount++; return globalThis.__collectionTurns; }', loader: 'js' }));
    builder.onLoad({ filter: /.*/, namespace: 'source' }, async args => ({ contents: await readFile(resolve(args.path), 'utf8'), loader: 'ts' }));
  } }] });
await writeFile('artifacts/collection-policy/dom.mjs', domBuild.outputFiles[0].text);
const { DomAdapter } = await import('../artifacts/collection-policy/dom.mjs');
const root = {}, node = {};
const sample = (now, override = {}) => ({ now, physical: true, loading: false, rendering: false, root, node,
  signature: 'user-first|answer-first', geometry: [40000, 650, 800, 0, 0, 650, 0, 100], ...override });
const limits = { totalMs: 200, collectionTotalMs: 300, batches: 40, collectionBatches: 40, batchMs: 50, noProgress: 3 };

test('a quiet physical edge records elapsed time through slow prepends', () => {
  const policy = new CollectionBoundaryWitness();
  policy.observe(sample(0));
  assert.equal(policy.observe(sample(34_000)).stableMs, 34_000);
  const older = { physical: false, signature: 'older|existing', geometry: [58000,650,800,6753.5,0,650,-100,100] };
  assert.equal(policy.observe(sample(35_000, older)).stableMs, 0);
  const edge = { signature: 'older|existing' };
  assert.equal(policy.observe(sample(38_000, edge)).stableMs, 0);
  assert.equal(policy.observe(sample(45_000, edge)).stableMs, 7000);
});

test('subpixel jitter preserves the observed wait while accumulated drift resets it', () => {
  const policy = new CollectionBoundaryWitness();
  policy.observe(sample(0));
  const jitter = sample(6000).geometry.map((value, index) => index >= 4 ? value + 1.2 : value);
  assert.equal(policy.observe(sample(6000, { geometry: jitter })).stableMs, 6000);
  const drift = sample(6000).geometry.map((value, index) => index === 5 ? value + 3 : value);
  assert.equal(policy.observe(sample(6200, { geometry: drift })).stableMs, 0);
});

test('busy, missing, changed, nonphysical and aborted observations reset the wait', () => {
  for (const override of [{ loading: true }, { rendering: true }, { physical: false }, { root: {} }, { node: {} },
    { signature: 'different-first' }, { aborted: true }, { node: null }]) {
    const policy = new CollectionBoundaryWitness();
    policy.observe(sample(0));
    assert.equal(policy.observe(sample(40000, override)).stableMs, 0);
    assert.equal(policy.observe(sample(40008)).stableMs, 0);
  }
});

test('COLLECTION-07: collection survives repeated empty middle batches and ends when the adapter supplies explicit completion', async () => {
  let calls = 0, finished = false;
  const adapter = { mounted: () => false, locate: () => false, direction: () => 'older', get collectionFinished() { return finished; },
    load: async () => { calls++; if (calls === 9) finished = true; return calls === 7; } };
  const nav = new Navigator(adapter, () => {}, limits);
  assert.equal(await nav.run(null), 'idle'); assert.equal(nav.lastStopReason, 'boundary'); assert.equal(calls, 9);
  assert.equal(await new Navigator({ ...adapter, collectionFinished: false }, () => {}, { ...limits, batches: 3 }).run('target'), 'not-found');
});

test('COLLECTION-08: unresolved middle/empty mount remains bounded by total deadline', async () => {
  let calls = 0, signal;
  const nav = new Navigator({ mounted: () => false, locate: () => false, direction: () => 'older',
    load: async (_direction, input) => { signal = input; calls++; await new Promise(resolve => setTimeout(resolve, 8)); return false; },
  }, () => {}, { ...limits, collectionTotalMs: 65 });
  assert.equal(await nav.run(null), 'timed-out'); assert.equal(nav.lastStopReason, 'time-limit');
  assert.ok(calls > 3); assert.equal(signal.aborted, true);
});

test('COLLECTION-09: stopping during a delayed mount prevents later success/state changes', async () => {
  let resolveLoad, signal, calls = 0, finished = false;
  const states = [];
  const nav = new Navigator({ mounted: () => false, locate: () => false, direction: () => 'older', get collectionFinished() { return finished; },
    load: (_direction, input) => { signal = input; calls++; return new Promise(resolve => { resolveLoad = resolve; }); },
  }, state => states.push(state), limits);
  const pending = nav.run(null); await new Promise(resolve => setTimeout(resolve, 0)); nav.cancel();
  assert.equal(await pending, 'cancelled'); assert.equal(signal.aborted, true);
  const before = [...states]; finished = true; resolveLoad(true); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(states, before); assert.equal(calls, 1); assert.equal(nav.lastStopReason, 'cancelled');
});

test('COLLECTION-10: batched locatable IDs match exact per-ID checks using one turn read', () => {
  const previousLocation = globalThis.location;
  globalThis.location = { origin: 'https://chatgpt.com', pathname: '/c/test' };
  try {
    const cases = ['good', 'wrong-text', 'wrong-node', 'disconnected', 'assistant', 'unstable', 'missing'];
    const store = { context: 'https://chatgpt.com/c/test', entries: cases.map(id => ({ id, text: id, stable: id !== 'unstable' })) };
    const adapter = new DomAdapter(store, () => {});
    globalThis.__collectionReadCount = 0;
    globalThis.__collectionTurns = cases.filter(id => id !== 'missing').map(id => {
      const node = { isConnected: id !== 'disconnected' };
      adapter.nodes.set(id, id === 'wrong-node' ? { isConnected: true } : node);
      return { stableId: id, node, role: id === 'assistant' ? 'assistant' : 'user', text: id === 'wrong-text' ? 'changed' : id };
    });
    const batch = adapter.locatableIds(); assert.equal(globalThis.__collectionReadCount, 1);
    assert.deepEqual([...batch], ['good']);
    for (const id of cases) assert.equal(batch.has(id), adapter.canLocate(id), id);
    store.context = 'https://chatgpt.com/c/other'; globalThis.__collectionReadCount = 0;
    assert.equal(adapter.locatableIds().size, 0); assert.equal(globalThis.__collectionReadCount, 0);
    for (const id of cases) assert.equal(adapter.canLocate(id), false, 'Stale routes cannot locate cached IDs');
  } finally {
    if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;
    delete globalThis.__collectionTurns; delete globalThis.__collectionReadCount;
  }
});
