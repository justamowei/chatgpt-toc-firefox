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
function probe(policy, now, override = {}) {
  const status = policy.observe(sample(now, override));
  if (policy.shouldProbe(now)) policy.recordProbe(now, true);
  return status;
}
const limits = { totalMs: 200, collectionTotalMs: 300, batches: 40, collectionBatches: 40, batchMs: 50, noProgress: 3 };

test('COLLECTION-01: a physical witness and spaced clamp probes survive several short batches', () => {
  const policy = new CollectionBoundaryWitness();
  assert.equal(probe(policy, 0).confirmed, false);
  // Simulated 2-second load boundaries never recreate the direction witness.
  for (const now of [2000, 2400, 4000, 4800]) assert.equal(probe(policy, now).confirmed, false);
  const status = probe(policy, 6000);
  assert.equal(status.confirmed, true); assert.equal(status.probes, 2); assert.equal(status.stableMs, 6000);
  policy.reset();
  assert.equal(probe(policy, 6100).confirmed, false, 'Switching from head to tail needs independent proof');
});

test('COLLECTION-02: rounded/subpixel jitter preserves proof while accumulated drift restarts it', () => {
  const policy = new CollectionBoundaryWitness();
  probe(policy, 0);
  for (let now = 80; now <= 6000; now += 80) {
    const jitter = now % 160 ? 1.2 : -.8;
    const geometry = sample(0).geometry.map((value, index) => index >= 4 ? value + jitter : value);
    probe(policy, now, { geometry });
  }
  assert.equal(probe(policy, 6100).confirmed, true);
  policy.reset(); probe(policy, 0);
  probe(policy, 2400, { geometry: sample(0).geometry.map((v, i) => i === 5 ? v + 1.5 : v) });
  const drift = probe(policy, 4800, { geometry: sample(0).geometry.map((v, i) => i === 5 ? v + 3 : v) });
  assert.equal(drift.stableMs, 0); assert.equal(drift.probes, 0); assert.equal(drift.confirmed, false);
});

test('COLLECTION-03: unresolved edge rendering and loading defer completion beyond many nominal batches', () => {
  for (const busy of ['rendering', 'loading']) {
    const policy = new CollectionBoundaryWitness();
    probe(policy, 0); probe(policy, 2400);
    for (let now = 4800; now <= 30000; now += 1200) {
      const status = probe(policy, now, { [busy]: true });
      assert.equal(status.confirmed, false); assert.equal(status.probes, 0); assert.equal(policy.shouldProbe(now), false);
    }
    probe(policy, 31000); probe(policy, 33400); probe(policy, 35800);
    assert.equal(probe(policy, 36999).confirmed, false);
    assert.equal(probe(policy, 37000).confirmed, true);
  }
});

test('COLLECTION-04: middle stalls and scroll-only movement cannot become boundary or prompt progress', () => {
  const policy = new CollectionBoundaryWitness();
  for (let now = 0; now <= 90000; now += 2000) {
    const status = probe(policy, now, { physical: false, geometry: [40000, 650, 800, 15000 + now / 100, 0, 650, -150, 800] });
    assert.equal(status.confirmed, false); assert.equal(status.stableMs, 0); assert.equal(policy.shouldProbe(now), false);
  }
});

test('COLLECTION-05: root, IDs, significant viewport drift and abort invalidate old clamp proof', () => {
  for (const override of [{ root: {} }, { signature: 'different-first' },
    { geometry: sample(0).geometry.map((v, i) => i >= 4 ? v + 8 : v) }, { aborted: true }, { node: null }]) {
    const policy = new CollectionBoundaryWitness();
    probe(policy, 0); probe(policy, 2400); probe(policy, 4800);
    const status = probe(policy, 5999, override);
    assert.equal(status.confirmed, false); assert.equal(status.probes, 0); assert.equal(status.stableMs, 0);
    assert.equal(probe(policy, 6001).confirmed, false);
  }
});

test('COLLECTION-06: clamp probes remain spaced under rapid polling and jitter', () => {
  const policy = new CollectionBoundaryWitness();
  for (let now = 0; now <= 4790; now += 10) probe(policy, now);
  assert.equal(probe(policy, 4799).probes, 1);
  probe(policy, 4800); assert.equal(probe(policy, 4810).probes, 2);
  assert.equal(policy.shouldProbe(5000), false); assert.equal(probe(policy, 6000).confirmed, true);
});

test('COLLECTION-07: collection survives repeated empty middle batches and ends only on explicit physical proof', async () => {
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


test('COLLECTION-11: equivalent remounted shells preserve semantic edge proof', () => {
  const policy = new CollectionBoundaryWitness();
  probe(policy, 0); probe(policy, 2400, {node:{}}); probe(policy, 4800, {node:{}});
  assert.equal(probe(policy, 6000, {node:{}}).confirmed, true);
  assert.equal(probe(policy, 6001, {signature:'changed-user-text'}).confirmed, false);
});

function syntheticCollection({rebuild=false, tailPad=0, reflow=false} = {}) {
  const previous = {location:globalThis.location, document:globalThis.document,getComputedStyle:globalThis.getComputedStyle};
  globalThis.location = {origin:'https://chatgpt.com',pathname:'/c/unit-collection'};
  globalThis.getComputedStyle=()=>({visibility:'visible',opacity:'1'});
  const root = {scrollTop:0,scrollHeight:2000,clientHeight:650,clientWidth:800,isConnected:true,
    contains:()=>true, scrollTo({top}) { this.scrollTop=Math.max(0,Math.min(top,this.scrollHeight-this.clientHeight)); }};
  const writes=[];
  const rawScroll=root.scrollTo.bind(root);
  root.scrollTo=({top})=>{writes.push(top);rawScroll({top});};
  const node={isConnected:true,contains:()=>false,scrollIntoView(){throw new Error('Physical edge must not realign a turn');},
    getBoundingClientRect(){return {top:rebuild? -100:0,bottom:rebuild? 650-tailPad:100,width:800,height:100};}};
  globalThis.document={scrollingElement:root,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
  const store={epoch:0,context:'https://chatgpt.com/c/unit-collection',entries:[{id:'u',text:'prompt',stable:true}]};
  const adapter=new DomAdapter(store,()=>{if(reflow){root.scrollHeight+=37;}});
  adapter.scroller=()=>root; adapter.viewport=()=>({top:0,bottom:root.clientHeight}); adapter.frontier=()=>[{node,ids:['u']}];
  adapter.begin(true,rebuild);
  adapter.collection.boundary=new CollectionBoundaryWitness(20,5);
  return {adapter,root,writes,restore(){
    for(const key of ['location','document','getComputedStyle']) {if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}
  }};
}

test('COLLECTION-12: original collection confirms head then completes without sweeping to tail', async () => {
  const setup=syntheticCollection();
  try {
    await setup.adapter.load('older',new AbortController().signal,1500);
    assert.equal(setup.adapter.collectionFinished,true);
    assert.equal(setup.adapter.lastLoadReport.phase,'head');
    assert.ok(setup.writes.length>=2);assert.ok(setup.writes.every(top=>top<0));
  } finally {setup.restore();}
});

test('COLLECTION-13: rebuild tail follows reflow beyond a viewport of padding without turn alignment', async () => {
  const setup=syntheticCollection({rebuild:true,tailPad:950,reflow:true});
  try {
    await setup.adapter.load('older',new AbortController().signal,1500);
    assert.equal(setup.adapter.collection.stage,'head');assert.equal(setup.adapter.collectionFinished,false);
    assert.equal(setup.adapter.lastLoadReport.phase,'tail');
    assert.ok(setup.writes.length>=3);assert.ok(setup.writes.every(top=>top>=2000));
    assert.equal(setup.root.scrollTop,setup.root.scrollHeight-setup.root.clientHeight);
  } finally {setup.restore();}
});

test('COLLECTION-14: aborting tail preparation prevents all later scroll writes', async () => {
  const setup=syntheticCollection({rebuild:true,reflow:true});const controller=new AbortController();
  try {
    const pending=setup.adapter.load('older',controller.signal,1500);
    controller.abort();assert.equal(await pending,false);
    const count=setup.writes.length;await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(setup.writes.length,count);assert.equal(setup.adapter.collectionFinished,false);
  } finally {setup.restore();}
});


function syntheticLoader({hidden=false,answer=false,top=0}={}) {
  return {isConnected:true,parentElement:null,
    closest(selector){if(hidden&&selector.includes('[hidden]'))return this;if(answer&&selector.includes('conversation-turn-'))return {};return null;},
    getBoundingClientRect(){return {top,bottom:top+20,width:100,height:20};}};
}

test('COLLECTION-15: visible outward history sibling blocks head, then removal allows completion',async()=>{
  const setup=syntheticCollection();const loader=syntheticLoader();
  try {
    globalThis.document.querySelectorAll=selector=>selector.startsWith('main [aria-busy')?[loader]:[];
    await setup.adapter.load('older',new AbortController().signal,500);
    assert.equal(setup.adapter.collectionFinished,false);
    globalThis.document.querySelectorAll=()=>[];
    await setup.adapter.load('older',new AbortController().signal,1500);
    assert.equal(setup.adapter.collectionFinished,true);
  } finally {setup.restore();}
});

test('COLLECTION-16: hidden, remote tail and answer indicators do not block a stable head',async()=>{
  const setup=syntheticCollection();
  try {
    const loaders=[syntheticLoader({hidden:true}),syntheticLoader({top:1000}),syntheticLoader({answer:true})];
    globalThis.document.querySelectorAll=selector=>selector.startsWith('main [aria-busy')?loaders:[];
    await setup.adapter.load('older',new AbortController().signal,1500);
    assert.equal(setup.adapter.collectionFinished,true);
  } finally {setup.restore();}
});
