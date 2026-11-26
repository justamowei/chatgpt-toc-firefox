import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import assert from 'node:assert/strict';
const source = await readFile('src/core.ts', 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const { IndexStore } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const evidence = JSON.parse(await readFile('docs/evidence/iab-2026-10-03/live-dom-evidence.json', 'utf8'));
const expected = evidence.expectedPrompts.map(e => ({ id: e.id, text: e.text }));
const frames = JSON.parse(await readFile(process.argv[2] || 'artifacts/iab-cache-fix/frames.json', 'utf8'));
const store = new IndexStore(), trace = [];
for (const frame of frames) {
  store.merge({ entries: frame.entries, context: 'self-generated-live-test', branch: null });
  trace.push({ action: frame.action, mounted: store.mounted.size, observed: store.entries.length, ordered: store.ordered, quarantined: store.quarantine.length });
}
assert.deepEqual(store.entries.map(e => ({ id: e.id, text: e.text })), expected);
assert.equal(store.entries.length, 12); assert.equal(store.mounted.size, 2);
assert.equal(store.quarantine.length, 0); assert.equal(store.ordered, true);
assert.notEqual(store.completeness, 'verified-complete');
const result = { source: 'current production readTurns executed read-only on real ChatGPT DOM in Codex IAB; current IndexStore replayed locally', addonExecutedInIab: false, firefoxLiveAcceptance: false, frames: frames.length, observed: 12, finalMounted: 2, exactIdTextOrder: true, trace };
await writeFile('artifacts/iab-cache-fix/replay-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
