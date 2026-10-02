import { normalize, type Entry, type Snapshot } from './core';
import type { HistorySnapshot } from './history';

// A complete server snapshot is separate from the conservative mounted index.
// Matching the currently mounted subset is not proof of the entire UI branch.
export function apiIdentity(id: string, role: 'user' | 'assistant' = 'user'): string {
  for (const prefix of [`turn-key:${role}:`, `turn:${role}:`, `message:${role}:`]) {
    if (id.startsWith(prefix)) return id.slice(prefix.length);
  }
  return id;
}
function sameText(a: string, b: string): boolean { return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim(); }
export class FullHistoryIndex {
  snapshot: HistorySnapshot | null = null;
  context = '';
  revision = 0;
  matched = 0;
  binding: 'unconfirmed' | 'subset-matched' = 'unconfirmed';
  private previouslyBound = false;
  clear(): void {
    this.snapshot = null; this.context = ''; this.matched = 0; this.binding = 'unconfirmed'; this.previouslyBound = false; this.revision++;
  }
  install(snapshot: HistorySnapshot, observation: Snapshot): boolean {
    this.clear(); this.snapshot = snapshot; this.context = observation.context;
    return !this.observe(observation);
  }
  // true means a contradiction, route change, or observed edit revoked a snapshot.
  observe(observation: Snapshot): boolean {
    const snapshot = this.snapshot;
    if (!snapshot) return false;
    if (observation.context !== this.context || observation.invalidated) { this.clear(); return true; }
    const byId = new Map(snapshot.entries.map((entry, index) => [entry.id, { entry, index }]));
    let matched = 0, last = -1, missing = false;
    for (const observed of observation.entries) {
      if (!observed.stable) { missing = true; continue; }
      const known = byId.get(apiIdentity(observed.id));
      if (!known) { missing = true; continue; }
      if (known.index <= last || (!sameText(observed.text, known.entry.text) && !sameText(observed.text, known.entry.screenText ?? known.entry.text))) { this.clear(); return true; }
      last = known.index; matched++;
    }
    // Once some identities bind this renderer to the server path, an additional
    // unknown mounted prompt contradicts that path (new prompt/edit/branch).
    if (missing && (matched || this.previouslyBound)) { this.clear(); return true; }
    const serverMessages = new Map((snapshot.messages ?? []).map((message, index) => [message.id, { role: message.role, index }]));
    let previousMessage = -1;
    for (const observed of observation.messages ?? []) {
      // Shared turn keys are not assistant API message IDs. Only the explicit
      // message identity owned by this role is evidence of regeneration.
      if (!observed.apiId) continue;
      const known = serverMessages.get(observed.apiId);
      if (!known || known.role !== observed.role || known.index <= previousMessage) { this.clear(); return true; }
      previousMessage = known.index;
    }
    if (matched) this.previouslyBound = true;
    this.matched = matched;
    this.binding = matched && !missing ? 'subset-matched' : 'unconfirmed';
    return false;
  }
  entries(): Entry[] {
    return this.snapshot ? this.snapshot.entries.map(entry => ({ ...entry, stable: this.binding === 'subset-matched' })) : [];
  }
  search(query: string): Entry[] {
    const needle = normalize(query);
    return this.entries().filter(entry => !needle || normalize(entry.text).includes(needle));
  }
}
