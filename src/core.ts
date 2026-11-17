export type Completeness = 'unknown' | 'partial' | 'verified-complete';
export interface Entry { id: string; text: string; stable: boolean; slot?: string; literalSpeakerLabel?: true; }
export interface Snapshot { entries: Entry[]; context: string; branch: string | null; invalidated?: boolean; disputedUserIds?: ReadonlySet<string>; observedHeadId?: string; submittedAppend?: { epoch: number; after: string; id: string }; messages?: { id: string; role: 'user' | 'assistant'; apiId: string | null }[]; }
export interface CompleteProof { source: 'conversation-structure'; branch: string; exhausted: boolean; orderedIds: string[]; }
export interface Settings { auto: boolean; expanded: boolean; collectionMinutes: number; collectionWaitMinutes: number; }
export const DEFAULT_SETTINGS: Settings = { auto: true, expanded: false, collectionMinutes: 10, collectionWaitMinutes: 1 };

const MAX_COLLECTION_MINUTES = 20;

export function validCollectionMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_COLLECTION_MINUTES;
}

export function validCollectionWaitMinutes(value: unknown): boolean {
  return validCollectionMinutes(value) && value <= 10;
}

export function validSettings(value: unknown): value is Settings {
  return exactKeys(value, ['auto', 'expanded', 'collectionMinutes', 'collectionWaitMinutes']) &&
    typeof value.auto === 'boolean' && typeof value.expanded === 'boolean' &&
    validCollectionMinutes(value.collectionMinutes) && validCollectionWaitMinutes(value.collectionWaitMinutes);
}
export function normalizeSettings(value: unknown): Settings {
  if (validSettings(value)) return { ...value };
  if (exactKeys(value, ['auto', 'expanded', 'collectionMinutes']) &&
    typeof value.auto === 'boolean' && typeof value.expanded === 'boolean' && validCollectionMinutes(value.collectionMinutes)) {
    return { ...DEFAULT_SETTINGS, auto: value.auto, expanded: value.expanded, collectionMinutes: value.collectionMinutes };
  }
  if (exactKeys(value, ['auto', 'expanded']) && typeof value.auto === 'boolean' && typeof value.expanded === 'boolean') {
    return { ...DEFAULT_SETTINGS, auto: value.auto, expanded: value.expanded };
  }
  return { ...DEFAULT_SETTINGS };
}
export function isSpeakerLabel(text: string): boolean {
  return /^(?:你說|您說|You said)\s*:$/iu.test(text.normalize('NFKC').trim());
}
export function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
export type BranchConfidence = 'verified' | 'unverified';
export interface ObservedSegment { ids: string[]; ordered: boolean; }
export type QuarantineReason = 'text-change' | 'order-conflict' | 'invalidated' | 'restored-unverified' | 'branch-change';
export interface QuarantinedGeneration { epoch: number; reason: QuarantineReason; entries: Entry[]; segments: ObservedSegment[]; ordered: boolean; }
export interface CacheLimits { entries: number; characters: number; }
export const CACHE_LIMITS: CacheLimits = { entries: 5_000, characters: 5_000_000 };
export interface StoredGeneration { reason: QuarantineReason; entries: Entry[]; segments: ObservedSegment[]; ordered: boolean; }
export interface StoredIndex {
  version: 1; context: string; branch: string | null; entries: Entry[]; segments: ObservedSegment[];
  quarantine: StoredGeneration[]; limitReason: 'entries' | 'characters' | null;
  recovery?: { candidateIds: string[] };
  observedHeadId?: string;
}
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function validStoredIndex(value: unknown): value is StoredIndex {
  if (!exactKeys(value, ['version', 'context', 'branch', 'entries', 'segments', 'quarantine', 'limitReason', ...(Object.hasOwn(value ?? {}, 'recovery') ? ['recovery'] : []),
    ...(Object.hasOwn(value ?? {}, 'observedHeadId') ? ['observedHeadId'] : [])]) || value.version !== 1 ||
    typeof value.context !== 'string' || !value.context || value.context.length > 2048 ||
    !(value.branch === null || typeof value.branch === 'string' && !!value.branch && value.branch.length <= 4096) ||
    ![null, 'entries', 'characters'].includes(value.limitReason as null) || !Array.isArray(value.quarantine) || value.quarantine.length > CACHE_LIMITS.entries) return false;
  let count = 0, characters = 0;
  const group = (entries: unknown, segments: unknown): boolean => {
    if (!Array.isArray(entries) || !Array.isArray(segments) || entries.length > CACHE_LIMITS.entries || segments.length > entries.length) return false;
    const ids = new Set<string>();
    for (const entry of entries) {
      if (!exactKeys(entry, ['id', 'text', 'stable',
        ...(Object.hasOwn(entry ?? {}, 'slot') ? ['slot'] : []),
        ...(Object.hasOwn(entry ?? {}, 'literalSpeakerLabel') ? ['literalSpeakerLabel'] : [])]) ||
        typeof entry.id !== 'string' || !entry.id || entry.id.length > 512 || ids.has(entry.id) ||
        typeof entry.text !== 'string' || entry.stable !== true ||
        (Object.hasOwn(entry, 'literalSpeakerLabel') && (entry.literalSpeakerLabel !== true || !isSpeakerLabel(entry.text))) ||
        (Object.hasOwn(entry, 'slot') && (typeof entry.slot !== 'string' || !entry.slot || entry.slot.length > 512))) return false;
      ids.add(entry.id); count++; characters += entry.text.length;
      if (count > CACHE_LIMITS.entries || characters > CACHE_LIMITS.characters) return false;
    }
    const seen = new Set<string>();
    for (const segment of segments) {
      if (!exactKeys(segment, ['ids', 'ordered']) || !Array.isArray(segment.ids) || !segment.ids.length || typeof segment.ordered !== 'boolean') return false;
      for (const id of segment.ids) { if (typeof id !== 'string' || !ids.has(id) || seen.has(id)) return false; seen.add(id); }
    }
    return seen.size === ids.size;
  };
  if (!group(value.entries, value.segments)) return false;
  if (Object.hasOwn(value, 'observedHeadId') && !(value.entries as Entry[]).some(entry => entry.id === value.observedHeadId)) return false;
  if (Object.hasOwn(value, 'recovery')) {
    if (!exactKeys(value.recovery, ['candidateIds']) || !Array.isArray(value.recovery.candidateIds)) return false;
    const ids = new Set((value.entries as Entry[]).map(entry => entry.id)), candidates = value.recovery.candidateIds;
    if (candidates.length > ids.size || new Set(candidates).size !== candidates.length || candidates.some(id => typeof id !== 'string' || !ids.has(id))) return false;
  }
  for (const generation of value.quarantine) if (!exactKeys(generation, ['reason', 'entries', 'segments', 'ordered']) ||
    !['text-change', 'order-conflict', 'invalidated', 'restored-unverified', 'branch-change'].includes(generation.reason as string) ||
    typeof generation.ordered !== 'boolean' || !group(generation.entries, generation.segments) ||
    generation.ordered && (generation.segments as ObservedSegment[]).length > 1 ||
    generation.ordered && (generation.segments as ObservedSegment[]).some(segment => !segment.ordered)) return false;
  return true;
}

// Old versions saved the label as plain prompt text, including offscreen rows.
export function discardLegacySpeakerLabels(state: StoredIndex): StoredIndex {
  const clean = <T extends { entries: Entry[]; segments: ObservedSegment[] }>(group: T): T => {
    const entries = group.entries.filter(entry => entry.literalSpeakerLabel || !isSpeakerLabel(entry.text));
    if (entries.length === group.entries.length) return group;
    const ids = new Set(entries.map(entry => entry.id));
    const segments = group.segments.map(segment => ({
      ...segment, ids: segment.ids.filter(id => ids.has(id)),
    })).filter(segment => segment.ids.length);
    return { ...group, entries, segments };
  };
  const active = clean(state), quarantine = state.quarantine.map(clean).filter(group => group.entries.length);
  if (active === state && quarantine.length === state.quarantine.length &&
    quarantine.every((group, index) => group === state.quarantine[index])) return state;
  const cleaned = { ...active, quarantine };
  const ids = new Set(active.entries.map(entry => entry.id));
  if (cleaned.observedHeadId && !ids.has(cleaned.observedHeadId)) delete cleaned.observedHeadId;
  if (cleaned.recovery) {
    const candidateIds = cleaned.recovery.candidateIds.filter(id => ids.has(id));
    if (candidateIds.length) cleaned.recovery = { candidateIds };
    else delete cleaned.recovery;
  }
  return cleaned;
}

type OrderGraph = Map<string, Set<string>>;
function removeGraphVertex(graph: OrderGraph, id: string): void {
  const successors = graph.get(id)!;
  for (const edges of graph.values()) if (edges.delete(id)) for (const next of successors) edges.add(next);
  graph.delete(id);
}
function orderedGraph(graph: OrderGraph, preferredFirst?: string): { ids: string[]; ordered: boolean; cycle: boolean } {
  const incoming = new Map([...graph.keys()].map(id => [id, 0]));
  for (const edges of graph.values()) for (const id of edges) incoming.set(id, incoming.get(id)! + 1);
  const ready = [...incoming].filter(([, count]) => !count).map(([id]) => id), ids: string[] = [];
  if (preferredFirst && incoming.get(preferredFirst) === 0) {
    ready.splice(ready.indexOf(preferredFirst), 1);
    ready.unshift(preferredFirst);
  }
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
  // Restored IDs require a live body witness independently of saved ordering.
  // Neither identity recovery nor ordering supplies a completeness proof.
  readonly recoveredIds = new Set<string>();
  private seekableIds = new Set<string>();
  private graph: OrderGraph = new Map();
  private observedHeadId?: string;
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
  canSeek(id: string): boolean { return this.seekableIds.has(id); }
  knownStableTail(): string | undefined {
    if (!this.ordered) return undefined;
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].stable) return this.entries[i].id;
  }
  seekDirection(id: string, anchorIds: Iterable<string> = this.mounted): 'older' | 'newer' | null {
    const target = this.entries.findIndex(entry => entry.id === id);
    if (target < 0 || !this.canSeek(id)) return null;
    for (const anchorId of anchorIds) {
      const anchor = this.entries.findIndex(entry => entry.id === anchorId);
      const segment = this.graphSegments().find(segment => segment.ids.includes(id) && segment.ids.includes(anchorId));
      if (anchor >= 0 && anchor !== target && segment?.ordered) return segment.ids.indexOf(id) < segment.ids.indexOf(anchorId) ? 'older' : 'newer';
    }
    return null;
  }
  exportState(): StoredIndex {
    const copy = (entries: Entry[]) => entries.filter(entry => entry.stable).map(({ id, text, slot, literalSpeakerLabel }) => ({
      id, text, stable: true, ...(slot ? { slot } : {}), ...(literalSpeakerLabel ? { literalSpeakerLabel } : {}),
    }));
    const segments = (source: ObservedSegment[], entries: Entry[]) => {
      const ids = new Set(entries.map(entry => entry.id));
      return source.map(segment => ({ ids: segment.ids.filter(id => ids.has(id)), ordered: segment.ordered })).filter(segment => segment.ids.length);
    };
    const entries = copy(this.entries);
    return { version: 1, context: this.context, branch: this.branch, entries, segments: segments(this.graphSegments(), entries),
      quarantine: this.quarantine.map(generation => { const entries = copy(generation.entries); return {
        reason: generation.reason, entries, segments: segments(generation.segments, entries), ordered: generation.ordered,
      }; }).filter(generation => generation.entries.length), limitReason: this.limitReason,
      ...(this.observedHeadId ? { observedHeadId: this.observedHeadId } : {}),
      ...(this.recoveredIds.size ? { recovery: { candidateIds: entries.filter(entry => this.recoveredIds.has(entry.id)).map(entry => entry.id) } } : {}) };
  }
  restoreState(value: unknown, snapshot: Snapshot): boolean {
    if (!validStoredIndex(value) || value.context !== snapshot.context) return false;
    const state = discardLegacySpeakerLabels(structuredClone(value)), current = new Map(snapshot.entries.filter(entry => entry.stable).map(entry => [entry.id, entry.text]));
    const ambiguous = new Set<string>();
    for (const entry of snapshot.entries) if (entry.stable && current.get(entry.id) !== entry.text) ambiguous.add(entry.id);
    const overlap = state.entries.filter(entry => current.has(entry.id));
    const trusted = !snapshot.invalidated && snapshot.branch !== null && snapshot.branch === state.branch && overlap.length > 0 &&
      overlap.every(entry => current.get(entry.id) === entry.text);
    this.reset(snapshot.context, snapshot.branch);
    const branchChanged = snapshot.branch !== null && state.branch !== null && snapshot.branch !== state.branch;
    const blocked = snapshot.invalidated || branchChanged;
    const generations: StoredGeneration[] = [];
    const active = new Map(state.entries.map(entry => [entry.id, entry]));
    const legacyTexts = new Map<string, Set<string>>();
    for (const generation of state.quarantine) if (generation.reason === 'restored-unverified') for (const entry of generation.entries) {
      const texts = legacyTexts.get(entry.id) ?? new Set<string>(); texts.add(entry.text); legacyTexts.set(entry.id, texts);
    }
    const ingest = (generation: StoredGeneration, legacy: boolean): void => {
      if (blocked) {
        generations.push({ ...generation, reason: snapshot.invalidated ? 'invalidated' : 'branch-change' }); return;
      }
      // A unique live body refreshes the existing ID, keeping its order.
      // Only simultaneous ambiguity or incompatible legacy witnesses isolate.
      const conflicts = generation.entries.filter(entry => ambiguous.has(entry.id) ||
        legacy && (legacyTexts.get(entry.id)!.size > 1 || active.has(entry.id) && active.get(entry.id)!.text !== entry.text));
      const disputedIds = new Set(conflicts.map(entry => entry.id));
      if (conflicts.length) generations.push({
        entries: conflicts, reason: 'text-change', ordered: conflicts.length === 1,
        segments: conflicts.map(entry => ({ ids: [entry.id], ordered: true })),
      });
      const existing = new Map(this.entries.map(entry => [entry.id, entry]));
      for (const entry of generation.entries) if (!existing.has(entry.id) && !disputedIds.has(entry.id)) {
        this.entries.push(entry); existing.set(entry.id, entry); this.graph.set(entry.id, new Set());
        if (legacy || !trusted || state.recovery?.candidateIds.includes(entry.id)) this.recoveredIds.add(entry.id);
      }
      for (const segment of generation.segments) if (segment.ordered) {
        const ids = segment.ids.filter(id => !disputedIds.has(id));
        for (let i = 1; i < ids.length; i++) this.graph.get(ids[i - 1])!.add(ids[i]);
      }
    };
    // v032 put the unmounted prefix in restored-unverified quarantine. Recover
    // those exact IDs before the current tail, keeping each segment's hint.
    for (const generation of state.quarantine) {
      if (generation.reason === 'restored-unverified') ingest(generation, true); else generations.push(generation);
    }
    if (state.entries.length) ingest({ reason: 'restored-unverified', entries: state.entries, segments: state.segments,
      ordered: state.segments.length <= 1 && state.segments.every(segment => segment.ordered) }, false);
    if (orderedGraph(this.graph).cycle) {
      generations.push({ reason: 'order-conflict', entries: this.entries, segments: [...state.segments], ordered: false });
      this.entries = []; this.graph.clear(); this.recoveredIds.clear();
      // Conflicting legacy and active segments can overlap. Every archived ID
      // still needs one schema-valid segment after the cached graph is rejected.
      generations[generations.length - 1].segments = generations[generations.length - 1].entries.map(entry => ({ ids: [entry.id], ordered: true }));
    }
    // Exact current DOM observations replace identical search-only witnesses.
    // This keeps repeated F5 restores from duplicating the same prompt.
    const seen = new Map<string, Set<string>>();
    const retainedById = new Map(this.entries.map(entry => [entry.id, entry]));
    for (const generation of generations) {
      const entries = generation.entries.filter(entry => {
        const retained = retainedById.get(entry.id);
        if (!blocked && generation.reason === 'text-change' && retained && !ambiguous.has(entry.id) && !snapshot.disputedUserIds?.has(entry.id)) return false;
        if (!ambiguous.has(entry.id) && current.get(entry.id) === entry.text || retained?.text === entry.text) return false;
        const texts = seen.get(entry.id) ?? new Set<string>(); seen.set(entry.id, texts);
        if (texts.has(entry.text)) return false; texts.add(entry.text); return true;
      });
      const ids = new Set(entries.map(entry => entry.id));
      if (entries.length) this.quarantine.push({ epoch: this.epoch++, reason: generation.reason, entries,
        segments: generation.segments.map(segment => ({ ids: segment.ids.filter(id => ids.has(id)), ordered: segment.ordered })).filter(segment => segment.ids.length), ordered: generation.ordered });
    }
    this.count = this.entries.length + this.quarantine.reduce((count, generation) => count + generation.entries.length, 0);
    this.characters = [...this.entries, ...this.quarantine.flatMap(generation => generation.entries)].reduce((count, entry) => count + entry.text.length, 0);
    this.limitReason = this.count >= this.limits.entries ? 'entries' : this.characters >= this.limits.characters ? 'characters' : null;
    if (state.observedHeadId && this.graph.has(state.observedHeadId)) this.observedHeadId = state.observedHeadId;
    this.reorder(); this.merge(snapshot); this.completeness = this.retainedCount ? 'partial' : 'unknown'; this.cacheRevision++;
    return true;
  }
  reset(context = this.context, branch: string | null = this.branch): void {
    this.epoch++; this.entries = []; this.mounted.clear(); this.completeness = 'unknown'; this.context = context; this.branch = branch;
    this.graph.clear(); this.observedHeadId = undefined; this.segments = []; this.ordered = true; this.quarantine = []; this.recoveredIds.clear(); this.seekableIds.clear();
    this.count = 0; this.characters = 0; this.limitReason = null; this.cacheRevision++;
  }
  merge(snapshot: Snapshot, _direction: 'older' | 'newer' | 'observe' = 'observe'): boolean {
    let reset = this.context !== snapshot.context || this.branch !== snapshot.branch;
    if (reset) this.reset(snapshot.context, snapshot.branch);
    const unique = new Map<string, Entry>();
    const ambiguous = new Set<string>();
    for (const e of snapshot.entries) {
      if (!e || typeof e.id !== 'string' || !e.id || typeof e.text !== 'string') continue;
      if (unique.has(e.id) && unique.get(e.id)!.text !== e.text) ambiguous.add(e.id);
      // Copy only plain prompt fields, never adapter-owned nodes or other properties.
      unique.set(e.id, { id: e.id, text: e.text, stable: e.stable === true, ...(typeof e.slot === 'string' && e.slot ? { slot: e.slot } : {}),
        ...(e.literalSpeakerLabel === true && isSpeakerLabel(e.text) ? { literalSpeakerLabel: true } : {}) });
    }
    for (const id of ambiguous) unique.delete(id);
    const items = [...unique.values()];
    let changed = this.mounted.size !== unique.size || items.some(e => !this.mounted.has(e.id));
    this.mounted = new Set(items.map(e => e.id));
    const hadRecoveredCandidates = this.recoveredIds.size > 0;
    if (hadRecoveredCandidates) {
      const retained = new Map(this.entries.map(entry => [entry.id, entry]));
      for (const item of items) if (item.stable && retained.get(item.id)?.text === item.text && this.recoveredIds.delete(item.id)) changed = true;
    }
    // Remove legacy body copies superseded by an existing active ID. If a
    // legacy row has no active counterpart, keep it until its body is witnessed.
    const currentTexts = new Map(items.filter(entry => entry.stable).map(entry => [entry.id, entry.text]));
    const activeIds = new Set(this.entries.filter(entry => entry.stable && !snapshot.disputedUserIds?.has(entry.id) &&
      !ambiguous.has(entry.id)).map(entry => entry.id));
    let promoted = false;
    this.quarantine = this.quarantine.flatMap(generation => {
      if (generation.reason !== 'restored-unverified' && generation.reason !== 'text-change') return [generation];
      const entries = generation.entries.filter(entry => {
        const superseded = generation.reason === 'text-change' && !snapshot.invalidated && activeIds.has(entry.id);
        if (!superseded && currentTexts.get(entry.id) !== entry.text) return true;
        this.count--; this.characters -= entry.text.length; changed = true; promoted = true; return false;
      });
      if (entries.length === generation.entries.length) return [generation];
      const ids = new Set(entries.map(entry => entry.id));
      return entries.length ? [{ ...generation, entries, segments: generation.segments.map(segment => ({
        ids: segment.ids.filter(id => ids.has(id)), ordered: segment.ordered,
      })).filter(segment => segment.ids.length) }] : [];
    });
    if (promoted && this.limitReason && this.count < this.limits.entries && this.characters < this.limits.characters) this.limitReason = null;
    const byId = new Map(this.entries.map(e => [e.id, e]));
    // One shared identity is not a new branch. Retire only that identity,
    // preserving unrelated prompts and letting live bodies show separately.
    const disputed = this.entries.filter(e => e.stable && snapshot.disputedUserIds?.has(e.id));
    if (disputed.length) {
      for (const entry of disputed) {
        byId.delete(entry.id);
        this.removeVertex(entry.id);
        this.recoveredIds.delete(entry.id);
      }
      this.quarantine.push({ epoch: this.epoch, reason: 'invalidated', entries: disputed,
        segments: disputed.map(entry => ({ ids: [entry.id], ordered: true })), ordered: disputed.length === 1 });
      changed = true;
    }
    // Keep version witnesses for every retained stable ID, including long-unmounted prompts.
    const textChanged = [...ambiguous].some(id => byId.get(id)?.stable) || items.some(e => e.stable && byId.get(e.id)?.stable && byId.get(e.id)!.text !== e.text);
    const candidate = new Map([...this.graph].map(([id, edges]) => [id, new Set(edges)]));
    for (const e of this.entries) if (!e.stable) removeGraphVertex(candidate, e.id);
    for (const e of items) if (!candidate.has(e.id)) candidate.set(e.id, new Set());
    for (let i = 1; i < items.length; i++) candidate.get(items[i - 1].id)!.add(items[i].id);
    const orderChanged = orderedGraph(candidate).cycle;
    const append = snapshot.submittedAppend;
    // A locally submitted prompt may replace the old tail before both can
    // coexist. Only an unseen stable ID with a retained predecessor can bridge.
    let appendEdge = false;
    if (!reset && !snapshot.invalidated && !textChanged && !orderChanged && append?.epoch === this.epoch &&
      byId.get(append.after)?.stable && !byId.has(append.id) &&
      items.at(-1)?.id === append.id && items.at(-1)?.stable) {
      candidate.get(append.after)!.add(append.id);
      appendEdge = !orderedGraph(candidate).cycle;
    }
    if (!reset && snapshot.invalidated) {
      this.isolate('invalidated');
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
        const bodyChanged = existing.stable && item.stable && existing.text !== item.text;
        // Each unambiguous message ID has one live directory entry. Retain the
        // graph vertex and replace its body rather than archiving a duplicate.
        const extra = item.text.length - existing.text.length;
        if (this.characters + extra > this.limits.characters) { changed = this.markLimit('characters') || changed; continue; }
        if (bodyChanged) this.recoveredIds.delete(item.id);
        if (existing.text !== item.text || existing.stable !== item.stable || existing.slot !== item.slot || existing.literalSpeakerLabel !== item.literalSpeakerLabel) {
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
    // A virtualized window can present stale or pinned nodes in a different
    // order. Reject that order evidence only; keep the already indexed turns.
    const observedIds = orderChanged && !reset ? [] : items.map(e => e.id).filter(id => byId.has(id));
    for (let i = 1; i < observedIds.length; i++) {
      const edges = this.graph.get(observedIds[i - 1])!;
      if (!edges.has(observedIds[i])) { edges.add(observedIds[i]); changed = true; }
    }
    if (appendEdge && append && byId.has(append.after) && byId.has(append.id)) {
      this.graph.get(append.after)!.add(append.id);
      changed = true;
    }
    const head = snapshot.observedHeadId;
    if (!snapshot.invalidated && !orderChanged && head && currentTexts.has(head) && byId.get(head)?.stable &&
      !snapshot.disputedUserIds?.has(head) && head !== this.observedHeadId) {
      this.observedHeadId = head;
      changed = true;
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
    if (this.observedHeadId === id) this.observedHeadId = undefined;
  }
  private isolate(reason: QuarantineReason): void {
    const stable = this.entries.filter(e => e.stable), ids = new Set(stable.map(e => e.id));
    if (stable.length) this.quarantine.push({ epoch: this.epoch, reason, entries: stable,
      segments: this.segments.map(s => ({ ids: s.ids.filter(id => ids.has(id)), ordered: s.ordered })).filter(s => s.ids.length), ordered: this.ordered });
    for (const e of this.entries) if (!e.stable) { this.count--; this.characters -= e.text.length; }
    this.epoch++; this.entries = []; this.graph.clear(); this.observedHeadId = undefined; this.segments = []; this.ordered = true; this.recoveredIds.clear();
  }
  private graphSegments(): ObservedSegment[] {
    const neighbors = new Map([...this.graph.keys()].map(id => [id, new Set<string>()]));
    for (const [id, edges] of this.graph) for (const next of edges) { neighbors.get(id)!.add(next); neighbors.get(next)!.add(id); }
    const visited = new Set<string>(), components: string[][] = [];
    for (const id of this.graph.keys()) {
      if (visited.has(id)) continue;
      const component = [id]; visited.add(id);
      for (let i = 0; i < component.length; i++) for (const next of neighbors.get(component[i])!) if (!visited.has(next)) { visited.add(next); component.push(next); }
      components.push(component);
    }
    // The first prompt in the loaded range places its component first in
    // the directory. It adds no ordering edges to other components.
    const head = this.observedHeadId;
    const headIndex = head ? components.findIndex(component => component.includes(head)) : -1;
    if (headIndex > 0) components.unshift(components.splice(headIndex, 1)[0]);
    return components.map(component => {
      const local = orderedGraph(new Map(component.map(id => [id, this.graph.get(id)!])), head);
      return { ids: local.ids, ordered: local.ordered };
    });
  }
  private reorder(): void {
    this.seekableIds = new Set(this.entries.filter(entry => entry.stable).map(entry => entry.id));
    // Reloads and unknown branches do not revoke observed precedence.
    // Actual contradictions invalidate that evidence in merge().
    this.segments = this.graphSegments();
    this.ordered = orderedGraph(this.graph).ordered;
    const byId = new Map(this.entries.map(e => [e.id, e]));
    // Grouped presentation order is deliberately not asserted as conversation order.
    this.entries = this.segments.flatMap(segment => segment.ids.map(id => byId.get(id)!));
  }
  verifyComplete(proof: CompleteProof): boolean {
    const ids = this.entries.map(e => e.id);
    const valid = proof.source === 'conversation-structure' && !!proof.branch && proof.branch === this.branch && proof.exhausted && ids.length > 0 &&
      this.ordered && this.recoveredIds.size === 0 && !this.quarantine.length && !this.limitReason && this.entries.every(e => e.stable) && new Set(proof.orderedIds).size === proof.orderedIds.length &&
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
  readonly collectionFinished?: boolean;
  readonly collectionWaitExpired?: boolean;
  mounted(id: string): boolean;
  locate(id: string, signal: AbortSignal): boolean | Promise<boolean>;
  load(direction: 'older' | 'newer', signal: AbortSignal, timeout: number, targetId?: string | null): Promise<boolean>;
  direction(id: string): 'older' | 'newer';
  reverseUnconfirmed?(id: string): boolean;
}
export interface Limits { totalMs: number; collectionTotalMs?: number; batches: number; collectionBatches?: number; batchMs: number; noProgress: number; }
export const NAV_LIMITS: Limits = { totalMs: 60_000, collectionTotalMs: 600_000, batches: 60, collectionBatches: 4800, batchMs: 8_000, noProgress: 3 };
export type NavStopReason = 'none' | 'located' | 'not-found' | 'stalled' | 'boundary' | 'wait-limit' | 'batch-limit' | 'time-limit' | 'batch-timeout' | 'cancelled' | 'unsupported';
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
  async run(id: string | null, collectionTotalMs?: number, mountedOnly = false): Promise<NavState> {
    this.cancel();
    const generation = ++this.generation, controller = new AbortController(); this.controller = controller;
    const live = () => generation === this.generation && !controller.signal.aborted;
    const started = performance.now();
    const override = typeof collectionTotalMs === 'number' && Number.isFinite(collectionTotalMs) && collectionTotalMs > 0
      ? Math.min(MAX_COLLECTION_MINUTES * 60_000, collectionTotalMs) : undefined;
    const totalMs = id === null ? override ?? this.limits.collectionTotalMs ?? this.limits.totalMs : this.limits.totalMs;
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
        if (id !== null && mountedOnly) return this.finish('not-found', generation, 'stalled');
        if (performance.now() - started >= totalMs) return this.finish('timed-out', generation, 'time-limit');
        // Check after locating the previous batch's result so the final stalled
        // or permitted load still gets one chance to verify its exact target.
        if (id === null && this.adapter.collectionFinished === true) return this.finish('idle', generation, 'boundary');
        if (id === null && this.adapter.collectionWaitExpired === true) return this.finish('idle', generation, 'wait-limit');
        // An empty collection batch can be a slow mount, streamed answer or a
        // retryable middle stall. A loaded-edge wait has its own bound;
        // the total/batch bounds still stop unknown or broken renderers.
        if (id !== null && stalls >= this.limits.noProgress) {
          if (this.adapter.reverseUnconfirmed?.(id)) stalls = 0;
          else return this.finish('not-found', generation, 'stalled');
        }
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

export type RuntimeMessage = { kind: 'settings:get' } | { kind: 'settings:set'; expanded: boolean } | { kind: 'auto:set'; enabled: boolean } | { kind: 'collection:set'; minutes: number; waitMinutes?: number } | { kind: 'options:open' } |
  { kind: 'cache:get' | 'cache:clear-page'; context: string } | { kind: 'cache:set'; state: StoredIndex } | { kind: 'cache:clear' };
export function validMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>, keys = Object.keys(v);
  if (v.kind === 'settings:get' || v.kind === 'options:open' || v.kind === 'cache:clear') return keys.length === 1;
  if (v.kind === 'cache:get' || v.kind === 'cache:clear-page') return keys.length === 2 && typeof v.context === 'string' && v.context.length <= 2048;
  if (v.kind === 'cache:set') return keys.length === 2 && validStoredIndex(v.state);
  if (v.kind === 'settings:set') return keys.length === 2 && typeof v.expanded === 'boolean';
  if (v.kind === 'auto:set') return keys.length === 2 && typeof v.enabled === 'boolean';
  if (v.kind === 'collection:set') return validCollectionMinutes(v.minutes) &&
    (Object.hasOwn(v, 'waitMinutes') ? exactKeys(v, ['kind', 'minutes', 'waitMinutes']) && validCollectionWaitMinutes(v.waitMinutes) : exactKeys(v, ['kind', 'minutes']));
  return false;
}
