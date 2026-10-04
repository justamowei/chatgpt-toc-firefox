import { IndexStore, type Entry, type NavigationAdapter, type Position, type Snapshot } from './core';
import { FIXTURE } from './config';
import { readTurns } from './turns';
import { HeightLedger } from './geometry';
type Direction = 'older' | 'newer';
type Hint = { y: number; extent: number };
type Bounds = { lower?: number; upper?: number; extent: number; attempts: Set<number>; hinted: boolean };
export interface LoadReport { phase: 'scan' | 'answer' | 'jump' | 'refine' | 'head' | 'sweep'; added: number; steps: number; }
type Attempt = { method: string; before: number; requested: number; after: number; heightBefore: number; heightAfter: number; scrollEvents: number; replaced: boolean };
export class DomAdapter implements NavigationAdapter {
  nodes = new Map<string, HTMLElement>();
  private transient = new WeakMap<HTMLElement, string>();
  private serial = 0;
  private lastContext = '';
  private routeStale = new WeakMap<HTMLElement, string>();
  private highlightCleanup: (() => void) | null = null;
  private returnWitness: Position | null = null;
  private loadDirection: Direction | null = null;
  private loadSignal: AbortSignal | null = null;
  private hints = new Map<string, Hint>();
  private hintEpoch = -1;
  private seek: Bounds | null = null;
  private geometry = new HeightLedger();
  private collection: { stage: 'head' | 'sweep' | 'done'; endId: string | null; headWitness: string | null } | null = null;
  private lastAttempt: Attempt | null = null;
  lastLoadReport: LoadReport = { phase: 'scan', added: 0, steps: 0 };
  constructor(private store: IndexStore, private refresh: (direction?: Direction) => void) {}
  read(): Snapshot {
    const context = location.origin + location.pathname;
    // A fresh chat receives /c/id after its first prompt; those same nodes are
    // part of the new chat. Only a previous conversation can leave stale turns.
    if (this.lastContext && context !== this.lastContext && /\/c\/[^/]+/.test(new URL(this.lastContext).pathname))
      for (const [id, node] of this.nodes) this.routeStale.set(node, id);
    this.lastContext = context;
    const entries: Entry[] = [], nodes = new Map<string, HTMLElement>();
    const main = document.querySelector('main') ?? document.body;
    for (const { node, role, stableId, slot, text } of readTurns()) {
      let id = stableId;
      if (!id) { id = this.transient.get(node) ?? `transient-${++this.serial}`; this.transient.set(node, id); }
      // SPA URL changes can precede replacing the old conversation DOM.
      if (this.routeStale.get(node) === id) continue;
      this.routeStale.delete(node);
      if (nodes.has(id)) continue;
      nodes.set(id, node);
      if (role === 'user') {
        entries.push({ id, text, stable: !!stableId, ...(slot ? { slot } : {}) });
      }
    }
    // Slots renumber during normal history loading. Version/order witnesses live
    // in IndexStore across unmounts; neither slots nor assistant placeholders
    // prove a branch switch.
    this.nodes = nodes;
    // Only the compiled localhost fixture has a trusted synthetic branch identity.
    const branch = FIXTURE ? main.getAttribute('data-fixture-branch') : null;
    return { entries, context, branch };
  }
  readRemoved(records: MutationRecord[]): Entry[][] {
    const groups: Entry[][] = [];
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (record.type !== 'childList' || !target?.closest('main') || target.closest('aside, nav, form, [role="textbox"], [contenteditable="true"], #chatgpt-toc-root')) continue;
      for (const root of record.removedNodes) {
        if (!(root instanceof HTMLElement) || root.matches('aside, nav, form, [role="textbox"], [contenteditable="true"]')) continue;
        const entries = readTurns([root]).filter(e => e.role === 'user' && e.stableId &&
          this.routeStale.get(e.node) !== e.stableId &&
          !this.store.entries.some(known => known.id === e.stableId) &&
          !this.store.quarantine.some(group => group.entries.some(known => known.id === e.stableId)))
          .map(e => ({ id: e.stableId!, text: e.text, stable: true, ...(e.slot ? { slot: e.slot } : {}) }));
        if (entries.length) groups.push(entries);
      }
    }
    return groups;
  }
  currentDirection(): Direction | undefined { return this.loadSignal && !this.loadSignal.aborted ? this.loadDirection ?? undefined : undefined; }
  mounted(id: string): boolean { return this.store.context === location.origin + location.pathname && !!this.nodes.get(id)?.isConnected; }
  canLocate(id: string): boolean {
    if (!this.mounted(id)) return false;
    const expected = this.store.entries.find(e => e.id === id);
    return !!expected?.stable && readTurns().some(e => e.role === 'user' && e.stableId === id && e.node === this.nodes.get(id) && e.text === expected.text);
  }
  private scroller(node?: HTMLElement): HTMLElement {
    // A marker can be an outer shell rather than the moving viewport. Resolve
    // the nearest live, scrollable ancestor of actual turns before global roots.
    // overflow:hidden permits programmatic scrolling on a marked viewport.
    const candidates = new Set<HTMLElement>();
    const anchors = [node, ...this.nodes.values(), ...document.querySelectorAll<HTMLElement>('main')];
    for (const anchor of anchors) if (anchor?.isConnected) for (let current: HTMLElement | null = anchor; current; current = current.parentElement) candidates.add(current);
    for (const root of document.querySelectorAll<HTMLElement>('[data-scroll-root]'))
      if (root.querySelector('main') || root.closest('main')) candidates.add(root);
    let stationary: HTMLElement | null = null;
    const scrollable: HTMLElement[] = [];
    for (const current of candidates) {
      const rect = current.getBoundingClientRect(), overflow = getComputedStyle(current).overflowY;
      if (current.clientHeight <= 100 || rect.height <= 100 || rect.bottom <= 0 || rect.top >= innerHeight ||
        !(/auto|scroll/.test(overflow) || (overflow === 'hidden' && current.hasAttribute('data-scroll-root')))) continue;
      if (current.scrollHeight > current.clientHeight + 2) scrollable.push(current);
      if (current.hasAttribute('data-scroll-root')) stationary ??= current;
    }
    return scrollable.find(root => root.hasAttribute('data-scroll-root')) ??
      scrollable.find(root => !root.closest('[data-testid^="conversation-turn-"], [data-turn-id][data-turn]')) ??
      stationary ?? document.scrollingElement as HTMLElement ?? document.documentElement;
  }
  // Position hints are plain numeric data, never detached DOM references. They
  // accelerate attempts; only exact remounted ID/role/text can report success.
  remember(): void {
    if (this.hintEpoch !== this.store.epoch) { this.hints.clear(); this.geometry.reset(); this.seek = null; this.collection = null; this.hintEpoch = this.store.epoch; }
    const allowed = new Set(this.store.entries.filter(e => e.stable).map(e => e.id));
    if (this.returnWitness) allowed.add(this.returnWitness.id);
    for (const id of this.hints.keys()) if (!allowed.has(id)) this.hints.delete(id);
    const scroller = this.scroller(this.nodes.values().next().value);
    const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
    for (const [id, node] of this.nodes) if (allowed.has(id) && node.isConnected) {
      const hint = { y: scroller.scrollTop + node.getBoundingClientRect().top - top, extent: Math.max(0, scroller.scrollHeight - scroller.clientHeight) };
      const old = this.hints.get(id);
      if (this.seek && old && Math.abs(old.y - hint.y) > 8) {
        this.seek.lower = undefined; this.seek.upper = undefined; this.seek.attempts.clear();
      }
      this.hints.set(id, hint);
    }
    const measured = readTurns().filter(t => t.stableId && t.node.isConnected).map(t => {
      const rect = t.node.getBoundingClientRect();
      return { id: t.stableId!, role: t.role, y: scroller.scrollTop + rect.top - top, height: rect.height };
    });
    // Each actual DOM window proves its own relative order even while global
    // cached order has gaps. A later inserted ID invalidates that old span's
    // successor until its new endpoints are measured together.
    this.geometry.observe(measured, measured.filter(t => t.role === 'user').map(t => t.id), scroller.clientWidth);
  }
  begin(collect = false): void {
    this.seek = null; this.lastAttempt = null; this.lastLoadReport = { phase: collect ? 'head' : 'scan', added: 0, steps: 0 };
    const scroller = this.scroller(this.nodes.values().next().value);
    this.collection = collect ? { stage: 'head', endId: this.returnWitness?.id ?? this.viewportWitness(scroller)[0]?.[0] ?? null, headWitness: null } : null;
  }
  get collectionFinished(): boolean { return this.collection?.stage === 'done'; }
  diagnostic(): object {
    const root = this.scroller(this.nodes.values().next().value);
    return { scroll: { tag: root.tagName, marked: root.hasAttribute('data-scroll-root'), overflow: getComputedStyle(root).overflowY,
      client: root.clientHeight, width: root.clientWidth, height: root.scrollHeight, top: root.scrollTop, connected: root.isConnected },
      geometry: this.geometry.diagnostic(), collection: this.collection?.stage ?? null, lastAttempt: this.lastAttempt };
  }
  private top(node: HTMLElement): number {
    const scroller = this.scroller(node);
    return scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
  }
  private viewport(scroller: HTMLElement): { top: number; bottom: number } {
    if (scroller === document.scrollingElement) return { top: 0, bottom: innerHeight };
    const top = scroller.getBoundingClientRect().top + scroller.clientTop;
    return { top: Math.max(0, top), bottom: Math.min(innerHeight, top + scroller.clientHeight) };
  }
  private async version(text: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async capture(signal?: AbortSignal): Promise<Position | null> {
    const candidates = [...this.nodes].filter(([id, node]) => !id.startsWith('transient-') && node.isConnected && node.getBoundingClientRect().bottom > Math.max(0, this.top(node)) && node.getBoundingClientRect().top < Math.min(innerHeight, this.scroller(node).getBoundingClientRect().bottom));
    candidates.sort((a, b) => Math.abs(a[1].getBoundingClientRect().top) - Math.abs(b[1].getBoundingClientRect().top));
    const candidate = candidates[0];
    if (!candidate) return null;
    const turns = readTurns();
    const index = turns.findIndex(e => e.stableId === candidate[0] && e.node === candidate[1]);
    const turn = turns[index];
    if (!turn) return null;
    const anchorId = turns.slice(0, index + 1).reverse().find(e => e.role === 'user' && e.stableId && this.canLocate(e.stableId))?.stableId ?? undefined;
    const context = location.origin + location.pathname, epoch = this.store.epoch;
    const position = { id: candidate[0], offset: candidate[1].getBoundingClientRect().top, role: turn.role, version: await this.version(turn.text), anchorId };
    if (signal?.aborted || context !== location.origin + location.pathname || epoch !== this.store.epoch || !candidate[1].isConnected ||
      !readTurns().some(e => e.stableId === position.id && e.node === candidate[1] && e.role === turn.role && e.text === turn.text)) return null;
    this.returnWitness = position;
    this.remember();
    return position;
  }
  async locate(id: string, signal: AbortSignal): Promise<boolean> {
    let node = this.nodes.get(id);
    if (signal.aborted || !this.mounted(id) || !node?.isConnected) return false;
    const turn = readTurns().find(e => e.stableId === id && e.node === node);
    if (!turn) return false;
    const expected = this.store.entries.find(e => e.id === id);
    if (expected && (turn.role !== 'user' || !this.canLocate(id))) return false;
    // Returning to an answer needs the captured role and SHA-256 version too.
    const witness = this.returnWitness?.id === id ? this.returnWitness : null;
    if (!expected && !witness) return false;
    const context = location.origin + location.pathname, epoch = this.store.epoch;
    if (witness && (witness.role !== turn.role || witness.version !== await this.version(turn.text))) return false;
    if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname || !this.mounted(id) ||
      !readTurns().some(e => e.node === node && e.stableId === id && e.role === turn.role && e.text === turn.text)) return false;
    let scrollWrites = 0, lastWrite = -Infinity;
    const place = (current: HTMLElement): void => {
      const root = this.scroller(current), viewport = this.viewport(root);
      root.scrollTo({ top: root.scrollTop + current.getBoundingClientRect().top - viewport.top - 16, behavior: 'instant' });
      lastWrite = performance.now(); scrollWrites++;
    };
    // Move just the live conversation viewport. scrollIntoView can move other
    // ancestors and the virtualizer may evict the target during that move.
    place(node);
    const settleStarted = performance.now();
    do {
      await new Promise<void>(resolve => setTimeout(resolve, 80));
      if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) return false;
      this.refresh(); node = this.nodes.get(id);
      if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) return false;
      if (node?.isConnected && readTurns().some(e => e.node === node && e.stableId === id && e.role === turn.role && e.text === turn.text)) {
        const root = this.scroller(node), viewport = this.viewport(root), rect = node.getBoundingClientRect();
        if (rect.bottom > viewport.top && rect.top < viewport.bottom && performance.now() - lastWrite >= 240) break;
        if (scrollWrites < 3 && performance.now() - lastWrite >= 320 && (rect.bottom <= viewport.top || rect.top >= viewport.bottom)) place(node);
      }
    } while (performance.now() - settleStarted < 1800);
    if (!node?.isConnected) return false;
    if (signal.aborted || !node.isConnected || (expected && !this.canLocate(id)) ||
      !readTurns().some(e => e.node === node && e.stableId === id && e.role === turn.role && e.text === turn.text)) return false;
    const rect = node.getBoundingClientRect(), top = Math.max(0, this.top(node));
    const bottom = Math.min(innerHeight, this.scroller(node).getBoundingClientRect().bottom);
    if (rect.bottom <= top || rect.top >= bottom) return false;
    this.highlightCleanup?.();
    const before = { marker: node.getAttribute('data-toc-located'), owner: node.getAttribute('data-chatgpt-toc-highlight') };
    node.setAttribute('data-toc-located', id); node.setAttribute('data-chatgpt-toc-highlight', id);
    const timer = setTimeout(() => this.highlightCleanup?.(), 1600);
    this.highlightCleanup = () => {
      clearTimeout(timer);
      if (before.owner === null) node.removeAttribute('data-chatgpt-toc-highlight'); else node.setAttribute('data-chatgpt-toc-highlight', before.owner);
      if (before.marker === null) node.removeAttribute('data-toc-located'); else node.setAttribute('data-toc-located', before.marker);
      this.highlightCleanup = null;
    };
    return true;
  }
  async restore(position: Position, signal: AbortSignal): Promise<boolean> {
    const epoch = this.store.epoch, context = location.origin + location.pathname;
    if (!await this.locate(position.id, signal) || signal.aborted) return false;
    let node = this.nodes.get(position.id);
    if (!node?.isConnected) return false;
    const turn = readTurns().find(t => t.node === node && t.stableId === position.id);
    if (!turn || (position.role && position.role !== turn.role) || (position.version && position.version !== await this.version(turn.text))) return false;
    let writes = 0, lastWrite = -Infinity;
    const adjust = (current: HTMLElement): void => {
      const root = this.scroller(current);
      root.scrollTop += current.getBoundingClientRect().top - position.offset;
      lastWrite = performance.now(); writes++;
    };
    if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) return false;
    node = this.nodes.get(position.id);
    if (!node?.isConnected || !readTurns().some(t => t.node === node && t.stableId === position.id && t.role === turn.role && t.text === turn.text)) return false;
    adjust(node);
    const started = performance.now();
    let stableSince = started, stableNode: HTMLElement | null = null, stableRoot: HTMLElement | null = null, stableTop = NaN;
    do {
      await new Promise<void>(resolve => setTimeout(resolve, 80));
      if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) return false;
      this.refresh();
      if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) return false;
      node = this.nodes.get(position.id);
      if (!node?.isConnected || !readTurns().some(t => t.node === node && t.stableId === position.id && t.role === turn.role && t.text === turn.text)) {
        stableNode = null; stableRoot = null; stableSince = performance.now(); continue;
      }
      const root = this.scroller(node), top = node.getBoundingClientRect().top, error = Math.abs(top - position.offset);
      if (node !== stableNode || root !== stableRoot || Math.abs(top - stableTop) > 2 || error > 24) stableSince = performance.now();
      stableNode = node; stableRoot = root; stableTop = top;
      if (error <= 24 && performance.now() - stableSince >= 600) return true;
      if (error > 24 && writes < 3 && performance.now() - lastWrite >= 400) { adjust(node); stableSince = performance.now(); }
    } while (performance.now() - started < 2400);
    return false;
  }
  direction(id: string): Direction {
    const targetId = this.returnWitness?.id === id ? this.returnWitness.anchorId ?? id : id;
    const target = this.store.entries.findIndex(e => e.id === targetId);
    const scroller = this.scroller(this.nodes.values().next().value);
    const viewport = this.viewport(scroller);
    const visible = this.store.entries.filter(e => {
      const node = this.nodes.get(e.id), rect = node?.getBoundingClientRect();
      return !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    // ChatGPT can keep the last two turns mounted while reading far earlier.
    const anchor = visible[0] ?? this.store.entries.find(e => this.mounted(e.id));
    const firstVisible = anchor ? this.store.entries.findIndex(e => e.id === anchor.id) : -1;
    return target >= 0 && firstVisible >= 0 && target < firstVisible ? 'older' : 'newer';
  }
  async load(direction: Direction, signal: AbortSignal, timeout: number, targetId: string | null = null): Promise<boolean> {
    if (signal.aborted) return false;
    if (this.store.context !== location.origin + location.pathname) throw new Error('Conversation changed');
    const epoch = this.store.epoch, context = location.origin + location.pathname;
    const before = new Set(this.store.entries.filter(e => e.stable).map(e => e.id));
    const first = this.nodes.values().next().value;
    const scroller = this.scroller(first);
    if (targetId === null && this.collection?.stage === 'done') return false;
    if (targetId === null && this.collection?.stage === 'sweep') {
      const end = this.collection.endId ? this.nodes.get(this.collection.endId) : null, viewport = this.viewport(scroller);
      if (end?.isConnected && end.getBoundingClientRect().bottom > viewport.top && end.getBoundingClientRect().top < viewport.bottom) {
        this.collection.stage = 'done'; return false;
      }
      direction = 'newer';
    }
    this.loadDirection = direction; this.loadSignal = signal;
    const scrollBefore = scroller.scrollTop, extentBefore = scroller.scrollHeight;
    const beforeNodes = this.viewportWitness(scroller);
    const beforeIds = [...this.nodes.keys()].join('|');
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    let phase: LoadReport['phase'] = 'scan';
    let method = 'overlap';
    let destination = scrollBefore + (direction === 'older' ? -1 : 1) * Math.max(100, scroller.clientHeight * .85);
    if (targetId !== null) {
      if (!this.seek) this.seek = { extent: max, attempts: new Set(), hinted: false };
      // A virtualizer can change its height model. Old bounds cannot prove a
      // new coordinate range; discard them and continue using verified mounts.
      if (Math.abs(this.seek.extent - max) > scroller.clientHeight * .5) {
        this.seek.lower = undefined; this.seek.upper = undefined; this.seek.extent = max;
        this.seek.attempts.clear();
      }
      const rank = this.store.entries.findIndex(e => e.id === (this.returnWitness?.id === targetId ? this.returnWitness.anchorId ?? targetId : targetId));
      const anchor = this.nearestPrompt(scroller);
      if (anchor && rank >= 0) {
        const current = this.store.entries.findIndex(e => e.id === anchor);
        const y = scrollBefore + this.nodes.get(anchor)!.getBoundingClientRect().top - this.top(this.nodes.get(anchor)!);
        // A below-viewport anchor is not at scrollTop. Bounds use the observed
        // prompt's actual coordinate, not the current scrollbar coordinate.
        if (current < rank) this.seek.lower = Math.max(0, Math.min(max, y));
        else if (current > rank) this.seek.upper = Math.max(0, Math.min(max, y));
        if (this.seek.lower !== undefined && this.seek.upper !== undefined && this.seek.lower >= this.seek.upper) {
          this.seek.lower = undefined; this.seek.upper = undefined;
        }
      }
      const hint = this.hints.get(targetId);
      const viewportTop = this.viewport(scroller).top;
      const estimate = this.store.ordered ? this.geometry.estimate(targetId, this.store.entries.flatMap(e => {
        const node = this.nodes.get(e.id);
        return node?.isConnected ? [{ id: e.id, y: scrollBefore + node.getBoundingClientRect().top - viewportTop }] : [];
      }), this.store.entries.map(e => e.id), scroller.clientWidth) : null;
      if (!this.seek.hinted && (estimate !== null || hint)) {
        this.seek.hinted = true; phase = 'jump';
        method = estimate !== null ? 'measured-turn-spans' : 'saved-position';
        destination = (estimate ?? (hint!.extent > 0 ? hint!.y * max / hint!.extent : hint!.y)) - scroller.clientHeight * .15;
      } else if (rank >= 0 && anchor) {
        const lower = this.seek.lower ?? 0, upper = this.seek.upper ?? max;
        if (upper - lower > scroller.clientHeight * 1.5) {
          phase = 'refine'; destination = (lower + upper) / 2;
          method = 'measured-bounds';
        }
      }
      destination = Math.max(0, Math.min(max, destination));
      const key = Math.round(destination / 16);
      if (phase !== 'scan' && (this.seek.attempts.has(key) || Math.abs(destination - scrollBefore) < scroller.clientHeight * .25)) {
        phase = 'scan'; destination = scrollBefore + (direction === 'older' ? -1 : 1) * Math.max(100, scroller.clientHeight * .85);
      }
      this.seek.attempts.add(Math.round(destination / 16));
    } else {
      if (this.collection?.stage === 'head') { phase = 'head'; method = 'repeat-head'; destination = 0; }
      else {
      if (this.collection?.stage === 'sweep') { phase = 'sweep'; method = 'head-overlap-sweep'; }
      const viewport = this.viewport(scroller);
      const turns = readTurns();
      for (const turn of turns) {
        if (turn.role !== 'assistant' || !turn.stableId || !turn.node.isConnected) continue;
        if (!turn.node.matches('[data-message-author-role="assistant"], [data-conversation-role="assistant"]')) continue;
        const rect = turn.node.getBoundingClientRect();
        const crossesTurn = (edge: number) => turns.some(other => other.node !== turn.node && other.stableId !== turn.stableId &&
          other.node.getBoundingClientRect().bottom > Math.min(viewport.top, edge) && other.node.getBoundingClientRect().top < Math.max(viewport.top, edge));
        // Skip only the interior of this exact mounted answer, retaining an
        // overlapping viewport at its edge. Never jump across unknown turns.
        if (direction === 'older' && rect.top < viewport.top - scroller.clientHeight * .5 && rect.bottom > viewport.top + scroller.clientHeight * .2 && !crossesTurn(rect.top)) {
          phase = 'answer'; destination = scrollBefore + rect.top - viewport.top + scroller.clientHeight * .2; break;
        }
        if (direction === 'newer' && rect.top < viewport.bottom - scroller.clientHeight * .2 && rect.bottom > viewport.bottom + scroller.clientHeight * .5 && !crossesTurn(rect.bottom)) {
          phase = 'answer'; destination = scrollBefore + rect.bottom - viewport.bottom - scroller.clientHeight * .2; break;
        }
      }
      }
    }
    this.lastLoadReport = { phase, added: this.lastLoadReport.added, steps: this.lastLoadReport.steps + 1 };
    const attempt: Attempt = { method, before: scrollBefore, requested: Math.max(0, Math.min(max, destination)), after: scrollBefore,
      heightBefore: extentBefore, heightAfter: extentBefore, scrollEvents: 0, replaced: false };
    this.lastAttempt = attempt;
    const observeScroll = () => { attempt.scrollEvents++; };
    scroller.addEventListener('scroll', observeScroll, { passive: true });
    try {
      scroller.scrollTo({ top: attempt.requested, behavior: 'instant' });
      return await new Promise<boolean>(resolve => {
        const started = performance.now();
        let stableSince = started, lastSignature = '', timer: ReturnType<typeof setTimeout>;
        const finish = (progress: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', aborted); resolve(progress); };
        const aborted = () => finish(false);
        const poll = () => {
          if (signal.aborted || this.store.epoch !== epoch || location.origin + location.pathname !== context) { finish(false); return; }
          this.refresh(direction);
          if (signal.aborted || this.store.epoch !== epoch) { finish(false); return; }
          attempt.after = scroller.scrollTop; attempt.heightAfter = scroller.scrollHeight;
          if (!scroller.isConnected || this.scroller(this.nodes.values().next().value) !== scroller) {
            attempt.replaced = true; finish(true); return;
          }
          const added = this.store.entries.filter(e => e.stable && !before.has(e.id)).length;
          const witnesses = this.viewportWitness(scroller);
          const signature = [...this.nodes.keys()].join('|') + ':' + Math.round(scroller.scrollTop) + ':' + scroller.scrollHeight;
          if (signature !== lastSignature) { stableSince = performance.now(); lastSignature = signature; }
          const moved = Math.abs(scroller.scrollTop - scrollBefore) > 2 || Math.abs(scroller.scrollHeight - extentBefore) > 8 ||
            witnesses.some(([id, y]) => beforeNodes.some(([oldId, oldY]) => id === oldId && Math.abs(y - oldY) > 8));
          const changedWindow = beforeIds !== [...this.nodes.keys()].join('|');
          const elapsed = performance.now() - started, settled = performance.now() - stableSince >= 120;
          const finishProgress = () => { this.lastLoadReport.added += added; finish(added > 0 || moved || changedWindow || attempt.scrollEvents > 0); };
          if (phase === 'head' && settled && elapsed >= 600 && witnesses.length > 0) {
            if (scroller.scrollTop <= 2) {
              const witness = witnesses.map(([id]) => id).join('|') + ':' + scroller.scrollHeight;
              if (this.collection?.headWitness === witness) { this.collection.stage = 'sweep'; this.lastLoadReport.added += added; finish(true); return; }
              if (this.collection) this.collection.headWitness = witness;
            } else if (this.collection) this.collection.headWitness = null;
            finishProgress(); return;
          }
          if (targetId !== null && this.mounted(targetId)) { finishProgress(); return; }
          // New mounted windows settle quickly. Traverse within long answers
          // without a fixed 1.8s penalty. Empty/loading windows keep waiting.
          const seekWindow = targetId !== null && (changedWindow || moved) && this.nearestPrompt(scroller) !== null;
          if (phase !== 'head' && settled && elapsed >= 240 && ((witnesses.length > 0 && (changedWindow || moved || attempt.scrollEvents > 0)) || seekWindow)) { finishProgress(); return; }
          if (elapsed >= Math.max(0, timeout - 200)) { finishProgress(); return; }
          timer = setTimeout(poll, 80);
        };
        signal.addEventListener('abort', aborted, { once: true }); timer = setTimeout(poll, 80);
      });
    } finally { scroller.removeEventListener('scroll', observeScroll); if (this.loadSignal === signal) { this.loadSignal = null; this.loadDirection = null; } }
  }
  private viewportWitness(scroller: HTMLElement): [string, number][] {
    const rect = this.viewport(scroller);
    return [...this.nodes].filter(([, node]) => node.isConnected && node.getBoundingClientRect().bottom > rect.top && node.getBoundingClientRect().top < rect.bottom)
      .map(([id, node]) => [id, node.getBoundingClientRect().top] as [string, number]);
  }
  private nearestPrompt(scroller: HTMLElement): string | null {
    const top = this.viewport(scroller).top;
    // Even an overscan/pinned turn may bound the target at its own measured y.
    // It never places that bound at scrollTop or proves viewport coverage.
    const candidates = this.store.entries.filter(e => this.nodes.get(e.id)?.isConnected);
    candidates.sort((a, b) => Math.abs(this.nodes.get(a.id)!.getBoundingClientRect().top - top) - Math.abs(this.nodes.get(b.id)!.getBoundingClientRect().top - top));
    return candidates[0]?.id ?? null;
  }
  clearHighlight(): void { this.highlightCleanup?.(); }
  clearReturnWitness(): void { this.returnWitness = null; }
  dispose(): void { this.clearHighlight(); this.clearReturnWitness(); this.nodes.clear(); this.hints.clear(); this.geometry.reset(); this.collection = null; this.seek = null; }
}
