import { CACHE_LIMITS, IndexStore, validStoredIndex, type Snapshot, type StoredGeneration, type StoredIndex } from './core';

export const CACHE_KEY = 'toc-index-v1';
export const GENERATIONS_KEY = 'toc-index-generations-v1';
export const PROFILE_LIMITS = { conversations: 12, characters: 6_000_000 };
export interface IndexBackend { load(context: string): Promise<unknown>; save(state: StoredIndex): Promise<void>; reset?(context: string): Promise<StoredIndex>; }
export type PersistenceStatus = 'loading' | 'pending' | 'saved' | 'error' | 'off';
interface LocalStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}
interface RecordCache { touched: number; state: StoredIndex; }
interface ProfileCache { version: 1; records: RecordCache[]; }
export function conversationContext(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://chatgpt.com' && !(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')) return null;
    if (!/^\/(?:g\/[^/]+\/)?c\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname)) return null;
    return parsed.origin + parsed.pathname;
  } catch { return null; }
}
function validProfile(value: unknown): value is ProfileCache {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as ProfileCache;
  if (Object.keys(profile).length !== 2 || profile.version !== 1 || !Array.isArray(profile.records) || profile.records.length > PROFILE_LIMITS.conversations) return false;
  const contexts = new Set<string>();
  for (const record of profile.records) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).length !== 2 ||
      !Number.isSafeInteger(record.touched) || record.touched < 0 || !validStoredIndex(record.state) ||
      conversationContext(record.state.context) !== record.state.context || contexts.has(record.state.context)) return false;
    contexts.add(record.state.context);
  }
  return JSON.stringify(profile).length <= PROFILE_LIMITS.characters;
}
const fingerprint = (state: StoredIndex): string => JSON.stringify(state);

// Preserve other tabs' stable witnesses and cached seek hints. Unknown branches
// remain candidates; contradictory bodies, order or known branches are isolated.
export function mergeStoredIndices(previous: StoredIndex, incoming: StoredIndex): StoredIndex {
  if (!validStoredIndex(previous) || !validStoredIndex(incoming) || previous.context !== incoming.context) return structuredClone(incoming);
  let active = structuredClone(incoming);
  const knownBranchChanged = previous.branch !== null && incoming.branch !== null && previous.branch !== incoming.branch;
  const generations: StoredGeneration[] = [...incoming.quarantine, ...previous.quarantine.map(generation =>
    knownBranchChanged && generation.reason === 'restored-unverified' ? { ...generation, reason: 'branch-change' as const } : generation)];
  if (previous.branch === null || incoming.branch === null || previous.branch === incoming.branch) {
    const store = new IndexStore();
    store.restoreState(previous, { context: incoming.context, branch: incoming.branch, entries: [] });
    const normalized = new IndexStore();
    normalized.restoreState(incoming, { context: incoming.context, branch: incoming.branch, entries: [] });
    const next = normalized.exportState();
    const observe = (state: StoredIndex) => {
      const entries = new Map(state.entries.map(entry => [entry.id, entry]));
      for (const segment of state.segments) {
        const items = segment.ids.map(id => entries.get(id)!);
        if (segment.ordered) store.merge({ context: state.context, branch: state.branch, entries: items });
        else for (const entry of items) store.merge({ context: state.context, branch: state.branch, entries: [entry] });
      }
    };
    observe(next);
    const incomingIds = new Set(incoming.entries.map(entry => entry.id));
    for (const id of next.recovery?.candidateIds ?? [])
      if ((!incomingIds.has(id) || incoming.recovery?.candidateIds.includes(id)) && store.canSeek(id)) store.recoveredIds.add(id);
    active = store.exportState();
    active.context = incoming.context; active.branch = incoming.branch;
    generations.unshift(...active.quarantine); active.quarantine = [];
  } else if (previous.entries.length) generations.push({ reason: 'branch-change', entries: previous.entries,
    segments: previous.segments, ordered: previous.segments.length <= 1 && previous.segments.every(segment => segment.ordered) });
  // Allocate retention to already stored witnesses first. Hitting a bound must
  // stop new collection, rather than silently replace another tab's history.
  const allowed = new Map<string, Set<string>>(); let retained = 0, retainedCharacters = 0;
  const consider = (entry: StoredIndex['entries'][number]) => {
    const texts = allowed.get(entry.id) ?? new Set<string>(); allowed.set(entry.id, texts);
    if (texts.has(entry.text)) return;
    if (retained >= CACHE_LIMITS.entries || retainedCharacters + entry.text.length > CACHE_LIMITS.characters) {
      active.limitReason ??= retained >= CACHE_LIMITS.entries ? 'entries' : 'characters'; return;
    }
    texts.add(entry.text); retained++; retainedCharacters += entry.text.length;
  };
  for (const entry of [...previous.entries, ...previous.quarantine.flatMap(generation => generation.entries),
    ...active.entries, ...generations.flatMap(generation => generation.entries)]) consider(entry);
  active.entries = active.entries.filter(entry => allowed.get(entry.id)?.has(entry.text));
  const activeIds = new Set(active.entries.map(entry => entry.id));
  if (active.recovery) {
    active.recovery.candidateIds = active.recovery.candidateIds.filter(id => activeIds.has(id));
    if (!active.recovery.candidateIds.length) delete active.recovery;
  }
  active.segments = active.segments.map(segment => ({ ids: segment.ids.filter(id => activeIds.has(id)), ordered: segment.ordered })).filter(segment => segment.ids.length);
  let count = active.entries.length, characters = active.entries.reduce((total, entry) => total + entry.text.length, 0);
  const seen = new Map<string, Set<string>>();
  for (const entry of active.entries) { const texts = seen.get(entry.id) ?? new Set(); texts.add(entry.text); seen.set(entry.id, texts); }
  active.quarantine = [];
  for (const generation of generations) {
    const entries = generation.entries.filter(entry => {
      if (!allowed.get(entry.id)?.has(entry.text)) return false;
      const texts = seen.get(entry.id) ?? new Set<string>(); seen.set(entry.id, texts);
      if (texts.has(entry.text)) return false;
      if (count >= CACHE_LIMITS.entries || characters + entry.text.length > CACHE_LIMITS.characters) {
        active.limitReason ??= count >= CACHE_LIMITS.entries ? 'entries' : 'characters'; return false;
      }
      texts.add(entry.text); count++; characters += entry.text.length; return true;
    });
    if (!entries.length) continue;
    const ids = new Set(entries.map(entry => entry.id));
    active.quarantine.push({ reason: generation.reason, entries: structuredClone(entries), ordered: generation.ordered,
      segments: generation.segments.map(segment => ({ ids: segment.ids.filter(id => ids.has(id)), ordered: segment.ordered })).filter(segment => segment.ids.length) });
  }
  if (incoming.generation) active.generation = incoming.generation;
  return active;
}

// The single background instance owns this queue, including loads, writes,
// pruning and clear. Content pages never overwrite a shared profile directly.
export class CacheBroker implements IndexBackend {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: LocalStorage, private now: () => number = Date.now) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work); this.queue = task.catch(() => {}); return task;
  }
  private async profile(): Promise<ProfileCache> {
    const result = await this.storage.get(CACHE_KEY);
    if (result[CACHE_KEY] === undefined) return { version: 1, records: [] };
    if (!validProfile(result[CACHE_KEY])) throw new Error('Invalid stored profile; refusing to replace it');
    return structuredClone(result[CACHE_KEY]);
  }
  private async generations(): Promise<Record<string, number>> {
    const data = (await this.storage.get(GENERATIONS_KEY))[GENERATIONS_KEY];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    if (Object.entries(data).some(([context, stamp]) => conversationContext(context) !== context || !Number.isSafeInteger(stamp) || (stamp as number) < 1)) throw new Error('Invalid cache generations');
    return { ...data } as Record<string, number>;
  }
  reset(context: string): Promise<StoredIndex> {
    return this.serial(async () => {
      if (conversationContext(context) !== context) throw new Error('Invalid reset context');
      const profile = await this.profile(), stamps = await this.generations();
      if (!Object.hasOwn(stamps, context) && Object.keys(stamps).length >= 5000) throw new Error('Reset generation capacity reached');
      const generation = (stamps[context] ?? 0) + 1;
      if (!Number.isSafeInteger(generation)) throw new Error('Reset generation exhausted');
      const empty: StoredIndex = { version: 1, context, branch: null, entries: [], segments: [], quarantine: [], limitReason: null, generation };
      stamps[context] = generation;
      profile.records = profile.records.filter(record => record.state.context !== context);
      await this.storage.set({ [CACHE_KEY]: profile, [GENERATIONS_KEY]: stamps });
      return empty;
    });
  }
  load(context: string): Promise<unknown> {
    return this.serial(async () => {
      if (conversationContext(context) !== context) return undefined;
      const profile = await this.profile(), record = profile.records.find(record => record.state.context === context);
      if (!record) {
        const generation = (await this.generations())[context];
        return generation ? { version: 1, context, branch: null, entries: [], segments: [], quarantine: [], limitReason: null, generation } : undefined;
      }
      record.touched = Math.max(0, Math.floor(this.now()));
      await this.storage.set({ [CACHE_KEY]: profile });
      return structuredClone(record.state);
    });
  }
  save(state: StoredIndex): Promise<void> {
    // Clone before joining the queue so subsequent caller mutation cannot alter a queued write.
    if (!validStoredIndex(state) || conversationContext(state.context) !== state.context) return Promise.reject(new Error('Invalid conversation cache'));
    const next = structuredClone(state);
    return this.serial(async () => {
      const profile = await this.profile(), previous = profile.records.find(record => record.state.context === next.context);
      const stamp = (await this.generations())[next.context] ?? 0;
      if ((next.generation ?? 0) !== stamp) throw new Error('Stale cache generation');
      const merged = previous ? mergeStoredIndices(previous.state, next) : next;
      if (previous && fingerprint(previous.state) === fingerprint(merged)) return;
      if (JSON.stringify({ version: 1, records: [{ touched: 0, state: merged }] }).length > PROFILE_LIMITS.characters)
        throw new Error('Conversation cache exceeds serialized profile budget');
      const records = profile.records.filter(record => record.state.context !== next.context).sort((a, b) => b.touched - a.touched);
      records.unshift({ touched: Math.max(0, Math.floor(this.now())), state: merged });
      records.splice(PROFILE_LIMITS.conversations);
      const bounded: ProfileCache = { version: 1, records };
      while (records.length && JSON.stringify(bounded).length > PROFILE_LIMITS.characters) records.pop();
      await this.storage.set({ [CACHE_KEY]: bounded });
    });
  }
  clear(): Promise<void> { return this.serial(() => Promise.all([this.storage.remove(CACHE_KEY), this.storage.remove(GENERATIONS_KEY)]).then(() => {})); }
}

export function runtimeIndexBackend(send: (message: unknown) => Promise<unknown> = message => browser.runtime.sendMessage(message)): IndexBackend {
  return { load: async context => {
    const result = await send({ kind: 'cache:read', context });
    if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).length !== 2) throw new Error('Cache read rejected');
    const reply = result as { kind?: string; state?: unknown };
    if (reply.kind !== 'cache:result' || !(reply.state === null || validStoredIndex(reply.state) && reply.state.context === context)) throw new Error('Invalid cache reply');
    return reply.state ?? undefined;
  }, reset: async context => {
    const state = await send({ kind: 'cache:reset', context });
    if (!validStoredIndex(state) || state.context !== context || !state.generation) throw new Error('Cache reset rejected');
    return state;
  }, save: async state => {
    const result = await send({ kind: 'cache:set', state });
    if (result !== true) throw new Error('Cache write rejected');
  } };
}

export class PersistentIndex {
  private context = '';
  private hydration: { context: string; cachedEntries: number } | null = null;
  get loadedHistory(): { context: string; cachedEntries: number } | null { return this.hydration; }
  private generation = 0;
  private writeGeneration = 0;
  private lastState = '';
  private savedState = '';
  private scheduledRevision = -1;
  private loading = false;
  private rebuilding: number | null = null;
  private pendingSchedule = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private currentStatus: PersistenceStatus = 'off';
  get status(): PersistenceStatus { return this.currentStatus; }
  private setStatus(status: PersistenceStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status; this.options.onStatus?.(status);
  }
  constructor(private backend: IndexBackend, private store: IndexStore,
    private options: { incognito?: boolean; debounceMs?: number; onStatus?: (status: PersistenceStatus) => void } = {}) {}
  invalidate(): void {
    this.hydration = null; this.rebuilding = null;
    this.generation++; this.writeGeneration++; clearTimeout(this.timer); this.timer = undefined;
    this.lastState = ''; this.savedState = ''; this.scheduledRevision = -1; this.loading = false; this.pendingSchedule = false;
  }
  async rebuild(context: string, current: () => Snapshot, live: () => boolean): Promise<boolean> {
    this.invalidate(); this.context = context;
    const generation = this.generation;
    this.rebuilding = generation; this.setStatus('loading');
    try {
      await this.queue;
      if (!live() || generation !== this.generation) return false;
      if (!this.backend.reset || this.options.incognito) throw new Error('Cache reset unavailable');
      const state = await this.backend.reset(context);
      if (this.closed || generation !== this.generation || current().context !== context || this.store.context !== context) return false;
      // A reset already committed by the broker remains authoritative even if
      // the user cancelled scrolling while its acknowledgment was in flight.
      const shouldContinue = live();
      this.store.restoreState(state, current()); this.setStatus('pending'); return shouldContinue;
    } catch (error) { if (generation === this.generation) this.setStatus('error'); throw error; }
    finally { if (this.rebuilding === generation) { this.rebuilding = null; if (generation === this.generation) { this.loading = false; this.pendingSchedule = false; this.scheduledRevision = -1; this.schedule(); } } }
  }
  async restore(context: string, current: () => Snapshot): Promise<boolean> {
    const generation = ++this.generation, writeGeneration = this.writeGeneration, revision = this.store.cacheRevision;
    this.hydration = null; this.rebuilding = null;
    this.context = context; this.lastState = ''; this.savedState = ''; this.scheduledRevision = -1;
    if (this.closed || this.options.incognito || conversationContext(context) !== context) { this.setStatus('off'); return false; }
    this.loading = true;
    this.setStatus('loading');
    clearTimeout(this.timer); this.timer = undefined;
    try {
      const loaded = await this.backend.load(context);
      if (this.closed || generation !== this.generation || writeGeneration !== this.writeGeneration) return false;
      const snapshot = current();
      if (snapshot.context !== context || this.store.context !== context) return false;
      if (loaded === undefined) { this.hydration = { context, cachedEntries: 0 }; this.setStatus('pending'); return false; }
      if (!validStoredIndex(loaded)) { this.setStatus('error'); return false; }
      this.hydration = { context, cachedEntries: loaded.entries.length + loaded.quarantine.reduce((n, group) => n + group.entries.length, 0) };
      const observed = this.store.exportState();
      if (loaded.generation) observed.generation = loaded.generation;
      const state = this.store.cacheRevision === revision ? loaded : mergeStoredIndices(loaded, observed);
      const restored = this.store.restoreState(state, snapshot);
      this.lastState = restored ? fingerprint(loaded) : '';
      this.savedState = this.lastState;
      this.setStatus(restored && fingerprint(this.store.exportState()) === this.savedState ? 'saved' : 'pending');
      return restored;
    } catch (error) {
      if (!this.closed && generation === this.generation) this.setStatus('error');
      throw error;
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        if (this.pendingSchedule) { this.pendingSchedule = false; this.scheduledRevision = -1; this.schedule(); }
      }
    }
  }
  schedule(context = this.store.context): void {
    if (this.closed || this.options.incognito || conversationContext(context) !== context || this.store.context !== context) { this.setStatus('off'); return; }
    // Flush the old route before its store is reset; callers should invoke
    // flush before route reset. Scheduling never captures unrelated routes.
    if (this.context !== context) { this.generation++; this.context = context; this.lastState = ''; this.savedState = ''; this.loading = false; this.scheduledRevision = -1; }
    if (this.scheduledRevision === this.store.cacheRevision) return;
    this.scheduledRevision = this.store.cacheRevision;
    if (this.loading || this.rebuilding) { this.pendingSchedule = true; return; }
    // Continuous scroll must still reach storage; export/stringify at most
    // once per interval, rather than once per DOM or scroll observation.
    if (this.timer !== undefined) return;
    this.setStatus('pending');
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(() => {}); }, this.options.debounceMs ?? 400);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
    this.writeGeneration++;
    if (this.closed || this.options.incognito || conversationContext(this.store.context) !== this.store.context) { this.setStatus('off'); return this.queue; }
    if (this.rebuilding) { this.pendingSchedule = true; return this.queue; }
    const state = this.store.exportState(), key = fingerprint(state);
    if (!validStoredIndex(state)) { this.setStatus('error'); return this.queue; }
    if (key === this.lastState) { if (key === this.savedState) this.setStatus('saved'); return this.queue; }
    this.lastState = key;
    const generation = this.generation, revision = this.store.cacheRevision;
    this.setStatus('pending');
    const task = this.queue.then(() => this.backend.save(state)).then(() => {
      this.savedState = key;
      if (!this.closed && generation === this.generation && state.context === this.store.context)
        this.setStatus(revision === this.store.cacheRevision ? 'saved' : 'pending');
    });
    this.queue = task.catch(() => {
      if (this.lastState === key) this.lastState = '';
      if (!this.closed && generation === this.generation && state.context === this.store.context) this.setStatus('error');
    });
    return task;
  }
  dispose(): void { clearTimeout(this.timer); this.closed = true; this.generation++; this.setStatus('off'); }
}
