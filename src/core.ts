export type Completeness = 'unknown' | 'partial' | 'verified-complete';
export interface Entry { id: string; text: string; stable: boolean; slot?: string; }
export interface Snapshot { entries: Entry[]; context: string; branch: string | null; invalidated?: boolean; }
export interface CompleteProof { source: 'conversation-structure'; branch: string; exhausted: boolean; orderedIds: string[]; }
export interface Settings { auto: boolean; expanded: boolean; }
export const DEFAULT_SETTINGS: Settings = { auto: false, expanded: false };

export function validSettings(value: unknown): value is Settings {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 &&
    typeof (value as Settings).auto === 'boolean' && typeof (value as Settings).expanded === 'boolean';
}
export function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
export class IndexStore {
  entries: Entry[] = [];
  mounted = new Set<string>();
  completeness: Completeness = 'unknown';
  epoch = 0;
  context = '';
  branch: string | null = null;
  reset(context = this.context, branch: string | null = this.branch): void {
    this.epoch++; this.entries = []; this.mounted.clear(); this.completeness = 'unknown'; this.context = context; this.branch = branch;
  }
  merge(snapshot: Snapshot, direction: 'older' | 'newer' | 'observe' = 'observe'): boolean {
    let reset = snapshot.invalidated === true || this.context !== snapshot.context || this.branch !== snapshot.branch;
    if (!reset) {
      const byId = new Map(this.entries.map(e => [e.id, e]));
      const slots = new Map(this.entries.filter(e => e.slot).map(e => [e.slot!, e.id]));
      reset = snapshot.entries.some(e => {
        return e.slot && slots.has(e.slot) && slots.get(e.slot) !== e.id;
      });
      const previousCommon = this.entries.filter(e => snapshot.entries.some(item => item.id === e.id)).map(e => e.id);
      const nextCommon = snapshot.entries.filter(e => byId.has(e.id)).map(e => e.id).filter((id, i, ids) => ids.indexOf(id) === i);
      reset ||= previousCommon.some((id, i) => nextCommon[i] !== id);
      if (this.entries.length && snapshot.entries.length && !previousCommon.length && direction === 'observe') reset = true;
      if (this.branch === null && this.entries.some(e => !snapshot.entries.some(item => item.id === e.id))) reset = true;
    }
    if (reset) this.reset(snapshot.context, snapshot.branch);
    const unique = new Map<string, Entry>();
    for (const e of snapshot.entries) {
      if (!e.id || typeof e.text !== 'string') continue;
      unique.set(e.id, { ...e });
    }
    const items = [...unique.values()];
    this.mounted = new Set(items.map(e => e.id));
    // Unknown branch identities cannot safely retain offscreen history.
    this.entries = this.entries.filter(e => this.mounted.has(e.id) || (e.stable && this.branch !== null));
    if (this.entries.length && items.length && !items.some(item => this.entries.some(e => e.id === item.id))) {
      if (direction === 'observe') { this.reset(snapshot.context, snapshot.branch); reset = true; this.mounted = new Set(items.map(e => e.id)); }
      else { this.entries = direction === 'older' ? [...items, ...this.entries] : [...this.entries, ...items]; }
    }
    for (const item of items) {
      const existing = this.entries.findIndex(e => e.id === item.id);
      if (existing >= 0) { this.entries[existing] = item; continue; }
      const index = items.indexOf(item);
      const nextAnchor = items.slice(index + 1).find(e => this.entries.some(known => known.id === e.id));
      if (nextAnchor) this.entries.splice(this.entries.findIndex(e => e.id === nextAnchor.id), 0, item);
      else {
        const prevAnchor = items.slice(0, index).reverse().find(e => this.entries.some(known => known.id === e.id));
        if (prevAnchor) this.entries.splice(this.entries.findIndex(e => e.id === prevAnchor.id) + 1, 0, item);
        else this.entries.push(item);
      }
    }
    // Any observation can change the verified set; require fresh structural proof.
    this.completeness = this.entries.some(e => e.stable) ? 'partial' : 'unknown';
    return !!reset;
  }
  verifyComplete(proof: CompleteProof): boolean {
    const ids = this.entries.map(e => e.id);
    const valid = proof.source === 'conversation-structure' && !!proof.branch && proof.branch === this.branch && proof.exhausted && ids.length > 0 &&
      this.entries.every(e => e.stable) && new Set(proof.orderedIds).size === proof.orderedIds.length &&
      proof.orderedIds.length === ids.length && proof.orderedIds.every((id, i) => id === ids[i]);
    this.completeness = valid ? 'verified-complete' : this.entries.some(e => e.stable) ? 'partial' : 'unknown';
    return valid;
  }
  search(query: string): Entry[] {
    const needle = normalize(query);
    return needle ? this.entries.filter(e => normalize(e.text).includes(needle)) : [...this.entries];
  }
}

export type NavState = 'idle' | 'loading' | 'located' | 'cancelled' | 'timed-out' | 'unsupported' | 'not-found';
export interface Position { id: string; offset: number; }
export interface NavigationAdapter {
  mounted(id: string): boolean;
  locate(id: string, signal: AbortSignal): boolean;
  load(direction: 'older' | 'newer', signal: AbortSignal, timeout: number): Promise<boolean>;
  direction(id: string): 'older' | 'newer';
}
export interface Limits { totalMs: number; batches: number; batchMs: number; noProgress: number; }
export const NAV_LIMITS: Limits = { totalMs: 60_000, batches: 20, batchMs: 8_000, noProgress: 3 };
export class Navigator {
  state: NavState = 'idle';
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private adapter: NavigationAdapter, private changed: (state: NavState) => void, private limits: Limits = NAV_LIMITS) {}
  cancel(): void {
    this.generation++; this.controller?.abort(); this.controller = null;
    if (this.state === 'loading') this.setState('cancelled');
  }
  private setState(state: NavState): void { this.state = state; this.changed(state); }
  async run(id: string | null): Promise<NavState> {
    this.cancel();
    const generation = ++this.generation, controller = new AbortController(); this.controller = controller;
    const live = () => generation === this.generation && !controller.signal.aborted;
    const started = performance.now();
    this.setState('loading');
    const totalTimer = setTimeout(() => controller.abort(), this.limits.totalMs);
    try {
      let stalls = 0;
      for (let batch = 0; batch <= this.limits.batches; batch++) {
        if (!live()) return generation === this.generation ? this.finish('timed-out', generation) : 'cancelled';
        if (id !== null && this.adapter.mounted(id)) return this.finish(this.adapter.locate(id, controller.signal) ? 'located' : 'not-found', generation);
        if (batch === this.limits.batches || performance.now() - started >= this.limits.totalMs) return this.finish('timed-out', generation);
        const timeout = Math.min(this.limits.batchMs, this.limits.totalMs - (performance.now() - started));
        const progressed = await boundedLoad(
          () => this.adapter.load(id === null ? 'older' : this.adapter.direction(id), controller.signal, timeout), controller, timeout,
        );
        if (!live()) return generation === this.generation ? this.finish('timed-out', generation) : 'cancelled';
        if (id !== null && this.adapter.mounted(id)) return this.finish(this.adapter.locate(id, controller.signal) ? 'located' : 'not-found', generation);
        stalls = progressed ? 0 : stalls + 1;
        if (stalls >= this.limits.noProgress) return this.finish(id === null ? 'idle' : 'not-found', generation);
      }
      return this.finish('timed-out', generation);
    } catch (error) {
      if (!live()) return generation === this.generation ? this.finish('timed-out', generation) : 'cancelled';
      return this.finish(error instanceof DeadlineError ? 'timed-out' : 'unsupported', generation);
    } finally {
      clearTimeout(totalTimer);
      controller.abort();
      if (generation === this.generation) this.controller = null;
    }
  }
  private finish(state: NavState, generation: number): NavState {
    if (generation !== this.generation) return 'cancelled';
    this.setState(state); return state;
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
