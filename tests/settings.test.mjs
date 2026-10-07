import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('artifacts/settings', { recursive: true });
const result = await transform(await readFile('src/core.ts', 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' });
await writeFile('artifacts/settings/core.mjs', result.code);
const { DEFAULT_SETTINGS, normalizeSettings, validSettings, validMessage } = await import('../artifacts/settings/core.mjs');

test('default settings use ten minutes and legacy exact settings preserve explicit preferences', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { auto: true, expanded: false, collectionMinutes: 10 });
  for (const auto of [true, false]) for (const expanded of [true, false]) {
    assert.deepEqual(normalizeSettings({ auto, expanded }), { auto, expanded, collectionMinutes: 10 });
  }
  for (const collectionMinutes of [1, 3, 10]) {
    const source = { auto: false, expanded: true, collectionMinutes };
    assert.equal(validSettings(source), true); assert.deepEqual(normalizeSettings(source), source);
    assert.notEqual(normalizeSettings(source), source);
  }
});

test('settings and collection runtime schemas strictly reject malformed or unbounded input', () => {
  for (const collectionMinutes of [0, 11, -1, 1.1, Infinity, NaN, '10', false, null, undefined]) {
    assert.equal(validSettings({ auto: true, expanded: false, collectionMinutes }), false);
    assert.equal(validMessage({ kind: 'collection:set', minutes: collectionMinutes }), false);
  }
  assert.equal(validMessage({ kind: 'collection:set', minutes: 1 }), true);
  assert.equal(validMessage({ kind: 'collection:set', minutes: 10 }), true);
  assert.equal(validMessage({ kind: 'collection:set', minutes: 5, auto: false }), false);
  assert.equal(validMessage({ kind: 'collection:set', collectionMinutes: 5 }), false);
  for (const value of [null, [], {}, { auto: 'false', expanded: true }, { auto: false, expanded: true, extra: true },
    { auto: false, expanded: true, collectionMinutes: 10, extra: true }]) {
    assert.equal(validSettings(value), false); assert.deepEqual(normalizeSettings(value), DEFAULT_SETTINGS);
  }
  const normalized = normalizeSettings(undefined); normalized.collectionMinutes = 1;
  assert.equal(DEFAULT_SETTINGS.collectionMinutes, 10);
});
