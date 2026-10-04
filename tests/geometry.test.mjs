import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';

const compiled = await transform(await readFile(new URL('../src/geometry.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'esm', target: 'es2022',
});
const { HeightLedger } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const user = (id, y, height = 30) => ({ id, role: 'user', y, height });
const answer = (id, y, height) => ({ id, role: 'assistant', y, height });
const order = ['a', 'b', 'c', 'd'];

test('GEOMETRY-01: actual user spans include differing answer heights, prompt heights and spacing', () => {
  const ledger = new HeightLedger();
  ledger.observe([user('a', 100), answer('answer-a', 150, 75), user('b', 280, 50)], order, 800);
  ledger.observe([user('b', 1280, 50), answer('answer-b', 1360, 900), user('c', 2500)], order, 800);
  ledger.observe([user('c', 500), answer('answer-c', 550, 190), user('d', 830)], order, 800);
  assert.deepEqual(ledger.diagnostic(), { measuredTurns: 7, measuredAnswers: 3, measuredSpans: 3 });
  assert.equal(ledger.estimate('d', [{ id: 'a', y: 100 }], order, 800), 1830);
  assert.equal(ledger.estimate('a', [{ id: 'd', y: 1830 }], order, 800), 100);
  // The same chain follows the current anchor's translation, never historical absolute y.
  assert.equal(ledger.estimate('d', [{ id: 'a', y: 700 }], order, 800), 2430);
  assert.equal(ledger.estimate('a', [{ id: 'd', y: -170 }], order, 800), -1900);
});

test('GEOMETRY-02: isolated assistant heights cannot invent missing user spans', () => {
  const ledger = new HeightLedger();
  ledger.observe([user('a', 0), answer('answer-a', 40, 1000)], order, 800);
  ledger.observe([user('b', 1300), answer('answer-b', 1350, 500)], order, 800);
  assert.equal(ledger.estimate('b', [{ id: 'a', y: 0 }], order, 800), null);
  assert.equal(ledger.diagnostic().measuredSpans, 0);
});

test('GEOMETRY-03: width tolerance applies to every link and fresh observations replace old spans', () => {
  const ledger = new HeightLedger();
  ledger.observe([user('a', 0), user('b', 200)], order, 800);
  ledger.observe([user('b', 200), user('c', 700)], order, 804);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 50 }], order, 808), 750);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 50 }], order, 809), null);
  assert.equal(ledger.estimate('a', [{ id: 'c', y: 750 }], order, 795), null);
  ledger.observe([user('a', 0), user('b', 350), user('c', 1150)], order, 1000);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 50 }], order, 1000), 1200);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 50 }], order, 800), null);
});

test('GEOMETRY-04: unknown order gaps, changed successors and unknown mounted users reject shortcuts', () => {
  const ledger = new HeightLedger();
  ledger.observe([user('a', 0), user('b', 200), user('c', 700)], order, 800);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 0 }], ['a', 'x', 'b', 'c', 'd'], 800), null);
  assert.equal(ledger.estimate('a', [{ id: 'c', y: 700 }], ['a', 'x', 'b', 'c', 'd'], 800), null);
  ledger.observe([user('a', 0), user('c', 700)], order, 800);
  assert.equal(ledger.diagnostic().measuredSpans, 2);
  const gap = new HeightLedger();
  gap.observe([user('a', 0), user('x', 100), user('b', 200)], order, 800);
  assert.equal(gap.estimate('b', [{ id: 'a', y: 0 }], order, 800), null);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 0 }], ['a', 'b', 'b', 'c'], 800), null);
});

test('GEOMETRY-05: select the shortest connected anchor and try the other direction across gaps', () => {
  const ledger = new HeightLedger();
  ledger.observe([user('a', 0), user('b', 200), user('c', 700), user('d', 1000)], order, 800);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 2000 }, { id: 'b', y: 250 }, { id: 'd', y: 1000 }], order, 800), 750);
  assert.equal(ledger.estimate('b', [{ id: 'a', y: 0 }, { id: 'd', y: 1000 }], ['a', 'x', 'b', 'c', 'd'], 800), 200);
  assert.equal(ledger.estimate('c', [{ id: 'c', y: -25 }], [], NaN), -25);
});

test('GEOMETRY-06: invalid coordinates and contradictory spans fail conservatively', () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    const ledger = new HeightLedger();
    ledger.observe([user('a', 0), user('b', invalid)], order, 800);
    assert.equal(ledger.estimate('b', [{ id: 'a', y: 0 }], order, 800), null);
    assert.equal(ledger.estimate('b', [{ id: 'b', y: invalid }], order, 800), null);
  }
  for (const width of [0, -1, NaN, Infinity]) {
    const ledger = new HeightLedger();
    ledger.observe([user('a', 0), user('b', 100)], order, width);
    assert.equal(ledger.estimate('b', [{ id: 'a', y: 0 }], order, 800), null);
  }
  for (const nextY of [0, -100, NaN, Infinity]) {
    const ledger = new HeightLedger();
    ledger.observe([user('a', 0), user('b', 100)], order, 800);
    ledger.observe([user('a', 0), user('b', nextY)], order, 800);
    assert.equal(ledger.estimate('b', [{ id: 'a', y: 0 }], order, 800), null);
  }
  const ledger = new HeightLedger();
  ledger.observe([user('a', 0), user('a', 1), user('b', 100)], order, 800);
  assert.equal(ledger.diagnostic().measuredSpans, 0);
});

test('GEOMETRY-07: measurement and span budgets stop growth, retain old data and reset completely', () => {
  const ledger = new HeightLedger();
  const ids = Array.from({ length: 6000 }, (_, i) => `user-${i}`);
  const items = ids.flatMap((id, i) => [user(id, i * 200), answer(`answer-${i}`, i * 200 + 40, 100)]);
  ledger.observe(items, ids, 800);
  assert.deepEqual(ledger.diagnostic(), { measuredTurns: 10000, measuredAnswers: 5000, measuredSpans: 5000 });
  assert.equal(ledger.estimate('user-5000', [{ id: 'user-0', y: 50 }], ids, 800), 1000050);
  assert.equal(ledger.estimate('user-5001', [{ id: 'user-0', y: 50 }], ids, 800), null);
  ledger.observe([user('user-0', 0), user('user-1', 300), answer('answer-0', 40, 200)], ids, 800);
  assert.equal(ledger.estimate('user-1', [{ id: 'user-0', y: 50 }], ids, 800), 350);
  assert.deepEqual(ledger.diagnostic(), { measuredTurns: 10000, measuredAnswers: 5000, measuredSpans: 5000 });
  ledger.reset();
  assert.deepEqual(ledger.diagnostic(), { measuredTurns: 0, measuredAnswers: 0, measuredSpans: 0 });
  assert.equal(ledger.estimate('user-1', [{ id: 'user-0', y: 50 }], ids, 800), null);
  ledger.observe([user('new-a', 0), user('new-b', 150)], ['new-a', 'new-b'], 700);
  assert.equal(ledger.estimate('new-b', [{ id: 'new-a', y: 10 }], ['new-a', 'new-b'], 700), 160);
});

test('GEOMETRY-08: stored measurements copy scalars and never retain input arrays or node references', () => {
  const ledger = new HeightLedger();
  const node = {}; node.self = node;
  const first = { ...user('a', 0), node, extra: { node } };
  const items = [first, user('b', 200), { ...answer('answer-a', 40, 120), node }];
  const ids = ['a', 'b'];
  ledger.observe(items, ids, 800);
  first.y = 9000; first.height = 9999; items.length = 0; ids.reverse();
  assert.equal(ledger.estimate('b', [{ id: 'a', y: 50, node }], ['a', 'b'], 800), 250);
  // TypeScript private fields remain inspectable after esbuild; assert the complete retained schema.
  assert.deepEqual([...ledger.measurements.values()], [
    { height: 30, width: 800, role: 'user' },
    { height: 30, width: 800, role: 'user' },
    { height: 120, width: 800, role: 'assistant' },
  ]);
  assert.deepEqual([...ledger.spans.values()], [{ nextId: 'b', distance: 200, width: 800 }]);
  assert.equal(JSON.stringify([...ledger.measurements.values(), ...ledger.spans.values()]).includes('node'), false);
});

test('GEOMETRY-09: window-local order collects spans during global ambiguity and replaces pinned-tail shortcuts', () => {
  const ledger = new HeightLedger();
  const headWithPinnedTail = [user('a', 0), user('b', 200), user('tail', 1400)];
  // An empty global order records body heights but cannot prove any user span.
  ledger.observe(headWithPinnedTail, [], 800);
  assert.equal(ledger.diagnostic().measuredSpans, 0);
  // The same-window DOM order can measure links even before the cached order is complete.
  ledger.observe(headWithPinnedTail, ['a', 'b', 'tail'], 800);
  assert.equal(ledger.diagnostic().measuredSpans, 2);
  const fullOrder = ['a', 'b', 'c', 'd', 'tail'];
  // New cached IDs expose the old b->tail shortcut. It cannot cross c or d.
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 50 }, { id: 'tail', y: 1450 }], fullOrder, 800), null);
  assert.equal(ledger.estimate('tail', [{ id: 'a', y: 50 }], fullOrder, 800), null);
  // A later coexisting window updates b's successor and fills the remaining exact links.
  ledger.observe([user('b', 200), user('c', 700), user('d', 1000), user('tail', 1400)], ['b', 'c', 'd', 'tail'], 800);
  assert.equal(ledger.diagnostic().measuredSpans, 4);
  assert.equal(ledger.estimate('c', [{ id: 'a', y: 50 }], fullOrder, 800), 750);
  assert.equal(ledger.estimate('c', [{ id: 'tail', y: 1450 }], fullOrder, 800), 750);
  assert.equal(ledger.estimate('tail', [{ id: 'a', y: 50 }], fullOrder, 800), 1450);
});
