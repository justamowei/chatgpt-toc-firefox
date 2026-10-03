// Replay real, neutral test prompts collected through the permitted IAB UI.
// This executes IndexStore locally, not the addon inside ChatGPT or Firefox.
import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const evidenceUrl = new URL('../docs/evidence/iab-2026-10-03/live-dom-evidence.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidenceUrl, 'utf8'));
// This is the regression's historical baseline, not the repaired implementation.
const baseline = '57d10a6acf9267615fed02813481965dbf4a4a75';
const source = execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'show', `${baseline}:src/core.ts`], { encoding: 'utf8', windowsHide: true });
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const { IndexStore } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const expected = new Map(evidence.expectedPrompts.map(e => [e.id, e.text]));
assert.equal(expected.size, 12);

let store, phase, previousSlots, previousPrompts, retained;
const trace = [];
for (const frame of evidence.snapshots.filter(s => s.context && !s.generating)) {
  const nextPhase = frame.action.startsWith('cold-') ? 'cold' : 'warm';
  if (phase !== nextPhase) {
    phase = nextPhase; store = new IndexStore(); retained = new Map();
    previousSlots = new Map(); previousPrompts = new Map();
  }
  const users = frame.messages.filter(e => e.role === 'user');
  const entries = users.map(e => ({ id: e.id, text: e.text.trim(), stable: true, slot: e.slot }));
  // These recorded nodes have explicit, role-owned data-message-id markers.
  for (const entry of entries) {
    assert.ok(entry.id && entry.text && expected.has(entry.id));
    assert.equal(entry.text, expected.get(entry.id));
  }
  const slots = new Map(frame.messages.filter(e => e.id && e.slot).map(e => [`${e.role}:${e.slot}`, e.id]));
  const prompts = new Map(entries.map(e => [e.id, e.text]));
  const invalidated = [...slots].some(([slot, id]) => previousSlots.has(slot) && previousSlots.get(slot) !== id) ||
    [...prompts].some(([id, text]) => previousPrompts.has(id) && previousPrompts.get(id) !== text && !text.startsWith(previousPrompts.get(id)));
  previousSlots = slots; previousPrompts = prompts;
  const beforeIds = store.entries.map(e => e.id), beforeEpoch = store.epoch;
  const reset = store.merge({ context: frame.context, branch: null, entries, invalidated }, 'observe');
  // The proof cache retains plain prompt data independently of current mounts.
  for (const entry of entries) retained.set(entry.id, entry.text);
  const afterIds = store.entries.map(e => e.id);
  trace.push({ phase, action: frame.action, mounted: entries.length, retained: retained.size,
    oldIndexCount: afterIds.length, beforeIds, afterIds, droppedIds: beforeIds.filter(id => !afterIds.includes(id)),
    overlapIds: beforeIds.filter(id => afterIds.includes(id)), invalidated, reset, beforeEpoch, afterEpoch: store.epoch });
}
const cold = trace.filter(t => t.phase === 'cold');
assert.equal(cold[0].retained, 4);
assert.equal(cold.at(-1).retained, 12);
assert.ok(trace.some(t => t.droppedIds.length && t.overlapIds.length && !t.invalidated && t.reset));
assert.ok(trace.some(t => t.retained === 12 && t.oldIndexCount === 2));
assert.equal(evidence.coldCollection.exactIdAndTextMatch, true);

const result = {
  source: 'real ChatGPT DOM in Codex IAB, locally replayed against historical baseline src/core.ts', baseline,
  addonExecutedInIab: false, firefoxAcceptance: false, runtimeImplementationChanged: false,
  expectedPrompts: expected.size, recordedFrames: evidence.snapshots.length, replayedFrames: trace.length,
  coldInitialRetained: cold[0].retained, coldFinalRetained: cold.at(-1).retained,
  overlapResetWithoutAdapterInvalidation: trace.filter(t => t.droppedIds.length && t.overlapIds.length && !t.invalidated && t.reset).length,
  textVersionMismatches: 0, trace,
};
const output = new URL('../docs/evidence/iab-2026-10-03/replay-result.json', import.meta.url);
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, trace: undefined }, null, 2));
