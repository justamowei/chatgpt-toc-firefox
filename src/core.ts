export type Completeness = 'unknown' | 'partial' | 'verified-complete';
export interface Entry { id: string; text: string; stable: boolean; slot?: string; }
export interface Snapshot { entries: Entry[]; context: string; branch: string | null; invalidated?: boolean; messages?: { id: string; role: 'user' | 'assistant'; apiId: string | null }[]; }
export interface CompleteProof { source: 'conversation-structure'; branch: string; exhausted: boolean; orderedIds: string[]; }
export interface Settings { auto: boolean; expanded: boolean; }
export const DEFAULT_SETTINGS: Settings = { auto: false, expanded: false };

export function validSettings(value: unknown): value is Settings {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 &&
    typeof (value as Settings).auto === 'boolean' && typeof (value as Settings).expanded === 'boolean';
}
export function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
export type BranchConfidence = 'verified' | 'unverified';
export interface ObservedSegment { ids: string[]; ordered: boolean; }
export type QuarantineReason = 'text-change' | 'order-conflict' | 'invalidated';
export interface QuarantinedGeneration { epoch: number; reason: QuarantineReason; entries: Entry[]; segments: ObservedSegment[]; ordered: boolean; }
export interface CacheLimits { entries: number; characters: number; }
export const CACHE_LIMITS: CacheLimits = { entries: 5_000, characters: 5_000_000 };

type OrderGraph = Map<string, Set<string>>;
function removeGraphVertex(graph: OrderGraph, id: string): void {
  const successors = graph.get(id)!;
  for (const edges of graph.values()) if (edges.delete(id)) for (const next of successors) edges.add(next);
  graph.delete(id);
}
function orderedGraph(graph: OrderGraph): { ids: string[]; ordered: boolean; cycle: boolean } {
  const incoming = new Map([...graph.keys()].map(id => [id, 0]));
  for (const edges of graph.values()) for (const id of edges) incoming.set(id, incoming.get(id)! + 1);
  const ready = [...incoming].filter(([, count]) => !count).map(([id]) => id), ids: string[] = [];
  let ordered = true;
  for (let cursor = 0; cursor < ready.length; cursor++) {
    if (ready.length - cursor !== 1) ordered = false;
    const id = ready[cursor]; ids.push(id);
    for (const next of graph.get(id)!) {
      const count = incoming.get(next)! - 1; incoming.set(next, count);
      if (!count) ready.push(next);
    }
  }
  return { ids, ordered: ordered && ids.length === graph.size, cycle: ids.length !== graph.size };
}

export class IndexStore {
  entries: Entry[] = [];
  mounted = new Set<string>();
  completeness: Completeness = 'unknown';
  epoch = 0;
  context = '';
  branch: string | null = null;
  cacheRevision = 0;
  ordered = true;
  segments: ObservedSegment[] = [];
  quarantine: QuarantinedGeneration[] = [];
  limitReason: 'entries' | 'characters' | null = null;
  private graph: OrderGraph = new Map();
  private count = 0;
  private characters = 0;
  private limits: CacheLimits;
  constructor(limits: Partial<CacheLimits> = {}) {
    this.limits = { ...CACHE_LIMITS, ...limits };
    for (const value of Object.values(this.limits)) if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Cache limits must be non-negative safe integers');
  }
  get branchConfidence(): BranchConfidence { return this.branch === null ? 'unverified' : 'verified'; }
  get retainedCount(): number { return this.count; }
  get retainedCharacters(): number { return this.characters; }
  reset(context = this.context, branch: string | null = this.branch): void {
    this.epoch++; this.entries = []; this.mounted.clear(); this.completeness = 'unknown'; this.context = context; this.branch = branch;
    this.graph.clear(); this.segments = []; this.ordered = true; this.quarantine = [];
    this.count = 0; this.characters = 0; this.limitReason = null; this.cacheRevision++;
  }
  merge(snapshot: Snapshot, _direction: 'older' | 'newer' | 'observe' = 'observe'): boolean {
    let reset = this.context !== snapshot.context || this.branch !== snapshot.branch;
    if (reset) this.reset(snapshot.context, snapshot.branch);
    const unique = new Map<string, Entry>();
    for (const e of snapshot.entries) {
      if (!e || typeof e.id !== 'string' || !e.id || typeof e.text !== 'string') continue;
      // Copy only plain prompt fields, never adapter-owned nodes or other properties.
      unique.set(e.id, { id: e.id, text: e.text, stable: e.stable === true, ...(typeof e.slot === 'string' && e.slot ? { slot: e.slot } : {}) });
    }
    const items = [...unique.values()];
    let changed = this.mounted.size !== unique.size || items.some(e => !this.mounted.has(e.id));
    this.mounted = new Set(items.map(e => e.id));
    const byId = new Map(this.entries.map(e => [e.id, e]));
    // Keep version witnesses for every retained stable ID, including long-unmounted prompts.
    const textChanged = items.some(e => e.stable && byId.get(e.id)?.stable && byId.get(e.id)!.text !== e.text);
    const candidate = new Map([...this.graph].map(([id, edges]) => [id, new Set(edges)]));
    for (const e of this.entries) if (!e.stable) removeGraphVertex(candidate, e.id);
    for (const e of items) if (!candidate.has(e.id)) candidate.set(e.id, new Set());
    for (let i = 1; i < items.length; i++) candidate.get(items[i - 1].id)!.add(items[i].id);
    const orderChanged = orderedGraph(candidate).cycle;
    if (!reset && (snapshot.invalidated || textChanged || orderChanged)) {
      this.isolate(snapshot.invalidated ? 'invalidated' : textChanged ? 'text-change' : 'order-conflict');
      byId.clear(); reset = true; changed = true;
    }
    // Unstable IDs are useful for current mounts only; they never become historical identity.
    for (const [id, e] of byId) if (!e.stable) {
      byId.delete(id); this.count--; this.characters -= e.text.length; this.removeVertex(id); changed = true;
    }
    for (const item of items) {
      const existing = byId.get(item.id);
      if (existing) {
        if (existing.stable && !item.stable) continue;
        const extra = item.text.length - existing.text.length;
        if (this.characters + extra > this.limits.characters) { changed = this.markLimit('characters') || changed; continue; }
        if (existing.text !== item.text || existing.stable !== item.stable || existing.slot !== item.slot) {
          byId.set(item.id, item); this.characters += extra; changed = true;
        }
        continue;
      }
      if (this.limitReason) continue;
      const reason = this.count >= this.limits.entries ? 'entries' : this.characters + item.text.length > this.limits.characters ? 'characters' : null;
      if (reason) { changed = this.markLimit(reason) || changed; continue; }
      byId.set(item.id, item); this.graph.set(item.id, new Set()); this.count++; this.characters += item.text.length; changed = true;
    }
    // DOM order is precedence evidence, even when a window skips unmounted messages.
    // Scroll direction, slot numbering and first-seen time are not ordering proof.
    const observedIds = items.map(e => e.id).filter(id => byId.has(id));
    for (let i = 1; i < observedIds.length; i++) {
      const edges = this.graph.get(observedIds[i - 1])!;
      if (!edges.has(observedIds[i])) { edges.add(observedIds[i]); changed = true; }
    }
    this.entries = [...byId.values()];
    if (changed) this.reorder();
    const previousCompleteness = this.completeness;
    this.completeness = this.entries.some(e => e.stable) || this.quarantine.length ? 'partial' : 'unknown';
    if (changed || previousCompleteness !== this.completeness) this.cacheRevision++;
    return !!reset;
  }
  private markLimit(reason: 'entries' | 'characters'): boolean {
    if (this.limitReason !== null) return false;
    this.limitReason = reason; return true;
  }
  private removeVertex(id: string): void {
    removeGraphVertex(this.graph, id);
  }
  private isolate(reason: QuarantineReason): void {
    const stable = this.entries.filter(e => e.stable), ids = new Set(stable.map(e => e.id));
    if (stable.length) this.quarantine.push({ epoch: this.epoch, reason, entries: stable,
      segments: this.segments.map(s => ({ ids: s.ids.filter(id => ids.has(id)), ordered: s.ordered })).filter(s => s.ids.length), ordered: this.ordered });
    for (const e of this.entries) if (!e.stable) { this.count--; this.characters -= e.text.length; }
    this.epoch++; this.entries = []; this.graph.clear(); this.segments = []; this.ordered = true;
  }
  private reorder(): void {
    const global = orderedGraph(this.graph), neighbors = new Map([...this.graph.keys()].map(id => [id, new Set<string>()]));
    for (const [id, edges] of this.graph) for (const next of edges) { neighbors.get(id)!.add(next); neighbors.get(next)!.add(id); }
    const visited = new Set<string>(), components: string[][] = [];
    for (const id of this.graph.keys()) {
      if (visited.has(id)) continue;
      const component = [id]; visited.add(id);
      for (let i = 0; i < component.length; i++) for (const next of neighbors.get(component[i])!) if (!visited.has(next)) { visited.add(next); component.push(next); }
      components.push(component);
    }
    this.segments = components.map(component => {
      const local = orderedGraph(new Map(component.map(id => [id, this.graph.get(id)!])));
      return { ids: local.ids, ordered: local.ordered };
    });
    this.ordered = global.ordered;
    const byId = new Map(this.entries.map(e => [e.id, e]));
    // Grouped presentation order is deliberately not asserted as conversation order.
    this.entries = this.segments.flatMap(segment => segment.ids.map(id => byId.get(id)!));
  }
  verifyComplete(proof: CompleteProof): boolean {
    const ids = this.entries.map(e => e.id);
    const valid = proof.source === 'conversation-structure' && !!proof.branch && proof.branch === this.branch && proof.exhausted && ids.length > 0 &&
      this.ordered && !this.quarantine.length && !this.limitReason && this.entries.every(e => e.stable) && new Set(proof.orderedIds).size === proof.orderedIds.length &&
      proof.orderedIds.length === ids.length && proof.orderedIds.every((id, i) => id === ids[i]);
    const completeness = valid ? 'verified-complete' : this.entries.some(e => e.stable) || this.quarantine.length ? 'partial' : 'unknown';
    if (this.completeness !== completeness) this.cacheRevision++;
    this.completeness = completeness;
    return valid;
  }
  search(query: string): Entry[] {
    const needle = normalize(query);
    return needle ? this.entries.filter(e => normalize(e.text).includes(needle)) : [...this.entries];
  }
  searchObserved(query: string): Entry[] {
    const needle = normalize(query), entries = [...this.entries, ...this.quarantine.flatMap(generation => generation.entries)];
    return needle ? entries.filter(e => normalize(e.text).includes(needle)) : entries;
  }
}

export type NavState = 'idle' | 'loading' | 'located' | 'cancelled' | 'timed-out' | 'unsupported' | 'not-found';
export interface Position { id: string; offset: number; role?: 'user' | 'assistant'; version?: string; anchorId?: string; }
export interface NavigationAdapter {
  mounted(id: string): boolean;
  locate(id: string, signal: AbortSignal): boolean | Promise<boolean>;
  load(direction: 'older' | 'newer', signal: AbortSignal, timeout: number, targetId?: string | null): Promise<boolean>;
  direction(id: string): 'older' | 'newer';
}
export interface Limits { totalMs: number; collectionTotalMs?: number; batches: number; collectionBatches?: number; batchMs: number; noProgress: number; }
export const NAV_LIMITS: Limits = { totalMs: 60_000, collectionTotalMs: 300_000, batches: 60, collectionBatches: 2400, batchMs: 8_000, noProgress: 3 };
export type NavStopReason = 'none' | 'located' | 'not-found' | 'stalled' | 'batch-limit' | 'time-limit' | 'batch-timeout' | 'cancelled' | 'unsupported';
export class Navigator {
  state: NavState = 'idle';
  lastStopReason: NavStopReason = 'none';
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private adapter: NavigationAdapter, private changed: (state: NavState) => void, private limits: Limits = NAV_LIMITS) {}
  cancel(): void {
    this.generation++; this.controller?.abort(); this.controller = null;
    if (this.state === 'loading') { this.lastStopReason = 'cancelled'; this.setState('cancelled'); }
  }
  private setState(state: NavState): void { this.state = state; this.changed(state); }
  async run(id: string | null): Promise<NavState> {
    this.cancel();
    const generation = ++this.generation, controller = new AbortController(); this.controller = controller;
    const live = () => generation === this.generation && !controller.signal.aborted;
    const started = performance.now();
    const totalMs = id === null ? this.limits.collectionTotalMs ?? this.limits.totalMs : this.limits.totalMs;
    this.lastStopReason = 'none'; this.setState('loading');
    let totalExpired = false;
    const totalTimer = setTimeout(() => { totalExpired = true; controller.abort(); }, totalMs);
    const batchLimit = id === null ? this.limits.collectionBatches ?? this.limits.batches : this.limits.batches;
    // Timer delays round fractional milliseconds. Track which bound is active
    // instead of guessing its origin from the elapsed time after it fires.
    let activeDeadline: 'time-limit' | 'batch-timeout' = 'time-limit';
    const timeoutReason = (): NavStopReason => totalExpired ? 'time-limit' : activeDeadline;
    try {
      let stalls = 0;
      for (let batch = 0; batch <= batchLimit; batch++) {
        if (!live()) return generation === this.generation ? this.finish('timed-out', generation, timeoutReason()) : 'cancelled';
        if (id !== null && this.adapter.mounted(id)) {
          activeDeadline = 'time-limit';
          const located = await boundedLoad(() => Promise.resolve(this.adapter.locate(id, controller.signal)), controller,
            Math.max(1, totalMs - (performance.now() - started)));
          if (!live()) return generation === this.generation ? this.finish('timed-out', generation, timeoutReason()) : 'cancelled';
          if (located) return this.finish('located', generation, 'located');
          // scrollIntoView can evict or replace a mounted node before exact-ID
          // verification finishes. A failed attempt is not proof of absence;
          // keep seeking within the same cancellation and load limits.
        }
        if (performance.now() - started >= totalMs) return this.finish('timed-out', generation, 'time-limit');
        // Check after locating the previous batch's result so the final stalled
        // or permitted load still gets one chance to verify its exact target.
        if (stalls >= this.limits.noProgress) return this.finish(id === null ? 'idle' : 'not-found', generation, 'stalled');
        if (batch === batchLimit) return this.finish('timed-out', generation, 'batch-limit');
        const remaining = totalMs - (performance.now() - started);
        const timeout = Math.min(this.limits.batchMs, remaining);
        activeDeadline = remaining <= this.limits.batchMs ? 'time-limit' : 'batch-timeout';
        const progressed = await boundedLoad(
          () => this.adapter.load(id === null ? 'older' : this.adapter.direction(id), controller.signal, timeout, id), controller, timeout,
        );
        if (!live()) return generation === this.generation ? this.finish('timed-out', generation, timeoutReason()) : 'cancelled';
        stalls = progressed ? 0 : stalls + 1;
      }
      return this.finish('timed-out', generation, 'batch-limit');
    } catch (error) {
      if (!live()) return generation === this.generation ? this.finish('timed-out', generation, timeoutReason()) : 'cancelled';
      return this.finish(error instanceof DeadlineError ? 'timed-out' : 'unsupported', generation, error instanceof DeadlineError ? timeoutReason() : 'unsupported');
    } finally {
      clearTimeout(totalTimer);
      controller.abort();
      if (generation === this.generation) this.controller = null;
    }
  }
  private finish(state: NavState, generation: number, reason: NavStopReason): NavState {
    if (generation !== this.generation) return 'cancelled';
    this.lastStopReason = reason; this.setState(state); return state;
  }
}

class DeadlineError extends Error {}
async function boundedLoad(load: () => Promise<boolean>, controller: AbortController, timeout: number): Promise<boolean> {
  const signal = controller.signal;
  if (signal.aborted) throw new DeadlineError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let aborted: (() => void) | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => { if (signal.aborted) throw new DeadlineError(); return load(); }), new Promise<never>((_, reject) => {
      aborted = () => reject(new DeadlineError());
      signal.addEventListener('abort', aborted, { once: true });
      timer = setTimeout(() => { controller.abort(); reject(new DeadlineError()); }, timeout);
    })]);
  } finally { clearTimeout(timer); if (aborted) signal.removeEventListener('abort', aborted); }
}

export type RuntimeMessage = { kind: 'settings:get' } | { kind: 'settings:set'; expanded: boolean } | { kind: 'auto:set'; enabled: boolean } | { kind: 'options:open' };
export function validMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>, keys = Object.keys(v);
  if (v.kind === 'settings:get' || v.kind === 'options:open') return keys.length === 1;
  if (v.kind === 'settings:set') return keys.length === 2 && typeof v.expanded === 'boolean';
  if (v.kind === 'auto:set') return keys.length === 2 && typeof v.enabled === 'boolean';
  return false;
}
