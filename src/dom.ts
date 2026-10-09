import { IndexStore, type Entry, type NavigationAdapter, type Position, type Snapshot } from './core';
import { FIXTURE } from './config';
import { readTurns } from './turns';
import { HeightLedger } from './geometry';
import { CollectionBoundaryWitness } from './collection-policy';
type Direction = 'older' | 'newer';
export interface LoadReport { phase: 'scan' | 'answer' | 'jump' | 'refine' | 'head' | 'sweep'; added: number; steps: number; }
type Attempt = { method: string; before: number; requested: number; after: number; heightBefore: number; heightAfter: number; scrollEvents: number; replaced: boolean;
  boundary?: { physical: boolean; stableMs: number; probes: number; loading: boolean; rendering: boolean; confirmed: boolean } };
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
  private unconfirmedDirection: Direction = 'older';
  private reversedUnconfirmed = false;
  private hintEpoch = -1;
  private geometry = new HeightLedger();
  private adjacent = new Map<string, string>();
  private collection: { stage: 'head' | 'done'; boundary: CollectionBoundaryWitness; lastRenderActivity: number; anchor?: { root: HTMLElement; signature: string } } | null = null;
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
      if (nodes.has(id)) {
        // Expose contradictory copies to IndexStore instead of silently choosing
        // one same-ID body during a renderer transition.
        if (role === 'user' && entries.some(entry => entry.id === id && entry.text !== text))
          entries.push({ id, text, stable: !!stableId, ...(slot ? { slot } : {}) });
        continue;
      }
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
  locatableIds(): Set<string> {
    const ids = new Set<string>();
    if (this.store.context !== location.origin + location.pathname) return ids;
    const expected = new Map(this.store.entries.filter(entry => entry.stable).map(entry => [entry.id, entry]));
    for (const turn of readTurns()) {
      const id = turn.stableId;
      if (id && turn.role === 'user' && turn.node.isConnected && this.nodes.get(id) === turn.node && expected.get(id)?.text === turn.text) ids.add(id);
    }
    return ids;
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
  // Height measurements remain diagnostic; anchor walking never navigates
  // using stale absolute positions in ChatGPT's changing virtual height model.
  remember(): void {
    if (this.hintEpoch !== this.store.epoch) { this.geometry.reset(); this.adjacent.clear(); this.collection = null; this.hintEpoch = this.store.epoch; }
    const scroller = this.scroller(this.nodes.values().next().value);
    const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
    const measured = readTurns().filter(t => t.stableId && t.node.isConnected).map(t => {
      const rect = t.node.getBoundingClientRect();
      return { id: t.stableId!, role: t.role, y: scroller.scrollTop + rect.top - top, height: rect.height };
    });
    // With confirmed global order, preserve adjacent spans across gappy windows
    // and pinned tail turns. While order is ambiguous, record local DOM pairs;
    // an inserted ID invalidates their successor until both endpoints coexist.
    this.geometry.observe(measured, this.store.ordered ? this.store.entries.map(e => e.id)
      : measured.filter(t => t.role === 'user').map(t => t.id), scroller.clientWidth);
  }
  begin(collect = false): void {
    this.unconfirmedDirection = 'older'; this.reversedUnconfirmed = false;
    this.lastAttempt = null; this.lastLoadReport = { phase: collect ? 'head' : 'scan', added: 0, steps: 0 };
    this.collection = collect ? { stage: 'head', boundary: new CollectionBoundaryWitness(), lastRenderActivity: -Infinity } : null;
  }
  get collectionFinished(): boolean { return this.collection?.stage === 'done'; }
  diagnostic(): object {
    const root = this.scroller(this.nodes.values().next().value);
    return { scroll: { tag: root.tagName, marked: root.hasAttribute('data-scroll-root'), overflow: getComputedStyle(root).overflowY,
      client: root.clientHeight, width: root.clientWidth, height: root.scrollHeight, top: root.scrollTop, connected: root.isConnected },
      geometry: this.geometry.diagnostic(), adjacentWitnesses: this.adjacent.size, collection: this.collection?.stage ?? null, lastAttempt: this.lastAttempt };
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
      // Let the browser resolve all scrolling ancestors and lazy turn shells,
      // just as selecting an already mounted message does.
      this.shell(current).scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
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
    return this.directionHint(id) ?? this.unconfirmedDirection;
  }
  reverseUnconfirmed(id: string): boolean {
    if (this.reversedUnconfirmed || this.directionHint(id) !== null) return false;
    this.reversedUnconfirmed = true; this.unconfirmedDirection = 'newer'; return true;
  }
  private directionHint(id: string): Direction | null {
    const targetId = this.returnWitness?.id === id ? this.returnWitness.anchorId ?? id : id;
    const scroller = this.scroller(this.nodes.values().next().value);
    const viewport = this.viewport(scroller);
    const visible = this.store.entries.filter(e => {
      const node = this.nodes.get(e.id), rect = node?.getBoundingClientRect();
      return !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    // ChatGPT can keep the last two turns mounted while reading far earlier.
    const anchor = visible[0] ?? this.store.entries.find(e => this.mounted(e.id));
    return this.store.seekDirection(targetId, anchor ? [anchor.id] : this.store.mounted);
  }
  private shell(node: HTMLElement): HTMLElement {
    return node.closest<HTMLElement>('[data-testid^="conversation-turn-"], [data-turn-id][data-turn], [data-turn-key]') ?? node;
  }
  private frontier(root: HTMLElement): { node: HTMLElement; ids: string[] }[] {
    const shells = new Map<HTMLElement, string[]>();
    for (const turn of readTurns()) if (turn.stableId && turn.node.isConnected) {
      const shell = this.shell(turn.node);
      if (!shell.isConnected || shell.getBoundingClientRect().height <= 0) continue;
      const ids = shells.get(shell) ?? []; ids.push(turn.stableId); shells.set(shell, ids);
    }
    const windows: { node: HTMLElement; ids: string[] }[][] = [];
    let previous: HTMLElement | null = null;
    for (const [node, ids] of shells) {
      const rect = node.getBoundingClientRect(), before = previous?.getBoundingClientRect();
      // Slots are only local continuity hints, never message identity or proof
      // of complete history. Large spacers and skipped slots split pinned tails.
      const slot = Number(node.getAttribute('data-testid')?.match(/^conversation-turn-(\d+)$/)?.[1]);
      const prevSlot = Number(previous?.getAttribute('data-testid')?.match(/^conversation-turn-(\d+)$/)?.[1]);
      const split = !before || rect.top - before.bottom > Math.max(100, root.clientHeight * .35) ||
        (Number.isFinite(slot) && Number.isFinite(prevSlot) && slot > prevSlot + (previous ? shells.get(previous)?.length ?? 1 : 1));
      if (split) windows.push([]);
      windows[windows.length - 1].push({ node, ids }); previous = node;
    }
    const userIds = new Set(this.store.entries.filter(e => e.stable).map(e => e.id));
    const users = (window: typeof windows[number]) => window.flatMap(item => item.ids).filter(id => userIds.has(id));
    // Remember only physically continuous local user pairs. A later large
    // layout gap can then be crossed using its live mounted neighbor, while a
    // disjoint pinned tail never supplies this witness in a cold conversation.
    for (const window of windows) {
      const ids = users(window);
      for (let i = 1; i < ids.length; i++) if (this.adjacent.has(ids[i - 1]) || this.adjacent.size < 5000) this.adjacent.set(ids[i - 1], ids[i]);
    }
    if (this.store.ordered) for (let i = 1; i < windows.length;) {
      const left = users(windows[i - 1]).at(-1), right = users(windows[i])[0];
      const rank = left ? this.store.entries.findIndex(e => e.id === left) : -1;
      if (left && right && this.adjacent.get(left) === right && this.store.entries[rank + 1]?.id === right) {
        windows[i - 1].push(...windows[i]); windows.splice(i, 1);
      } else i++;
    }
    const viewport = this.viewport(root);
    const distance = (window: typeof windows[number]) => Math.min(...window.map(({ node }) => {
      const rect = node.getBoundingClientRect();
      return rect.bottom >= viewport.top && rect.top <= viewport.bottom ? 0 : Math.min(Math.abs(rect.top - viewport.bottom), Math.abs(rect.bottom - viewport.top));
    }));
    windows.sort((a, b) => distance(a) - distance(b));
    return windows[0] ?? [];
  }
  private boundaryLoading(root: HTMLElement, viewport: { top: number; bottom: number }): boolean {
    // Hidden progress placeholders never describe pending visible history.
    // Root/main busy flags and visible loaders in the conversation do.
    const candidates = new Set<Element>([root, ...document.querySelectorAll('main[aria-busy="true"], main [aria-busy="true"], main [data-loading="true"], main [role="progressbar"], main [data-testid="loading-conversation"]')]);
    for (const node of candidates) {
      if (node === root && node.getAttribute('aria-busy') !== 'true' && node.getAttribute('data-loading') !== 'true') continue;
      if (node.closest('aside, nav, form, [aria-hidden="true"], [hidden], #chatgpt-toc-root')) continue;
      let visible = true;
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) { visible = false; break; }
      }
      const rect = node.getBoundingClientRect();
      if (visible && rect.width > 0 && rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom) return true;
    }
    return false;
  }
  async load(direction: Direction, signal: AbortSignal, timeout: number, targetId: string | null = null): Promise<boolean> {
    if (signal.aborted) return false;
    const epoch = this.store.epoch, context = location.origin + location.pathname;
    if (this.store.context !== context) throw new Error('Conversation changed');
    if (targetId === null && this.collection?.stage === 'done') return false;
    if (targetId === null && this.collection) direction = 'older';
    const root = this.scroller(this.nodes.values().next().value);
    const window = this.frontier(root), edge = direction === 'older' ? window[0] : window.at(-1);
    const signature = (items: typeof window) => items.flatMap(item => item.ids).join('|');
    const beforeSignature = signature(window), before = new Set(this.store.entries.map(e => e.id));
    const phase: LoadReport['phase'] = targetId === null && this.collection ? direction === 'older' ? 'head' : 'sweep' : 'scan';
    this.lastLoadReport = { phase, added: this.lastLoadReport.added, steps: this.lastLoadReport.steps + 1 };
    this.loadDirection = direction; this.loadSignal = signal;
    const attempt: Attempt = { method: edge ? 'mounted-edge-anchor' : 'wait-for-mounted-anchor', before: root.scrollTop,
      requested: root.scrollTop, after: root.scrollTop, heightBefore: root.scrollHeight, heightAfter: root.scrollHeight, scrollEvents: 0, replaced: false };
    this.lastAttempt = attempt;
    const observeScroll = () => { attempt.scrollEvents++; };
    const collection = targetId === null ? this.collection : null;
    const main = document.querySelector('main');
    // A mounted ID can remain unchanged while its answer streams, or while a
    // placeholder is replaced. These mutations defer boundary proof without
    // pretending that changed text or layout discovered another prompt.
    const renderObserver = collection && main ? new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        return target && !target.closest('aside, nav, form, [role="textbox"], [contenteditable="true"], #chatgpt-toc-root');
      });
      if (relevant && this.collection === collection && !signal.aborted) {
        collection.lastRenderActivity = performance.now(); collection.boundary.reset();
      }
    }) : null;
    // Geometry handles style/class changes with the same 2px tolerance; counting
    // every cosmetic mutation as rendering would make small jitter stall proof.
    if (main) renderObserver?.observe(main, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['aria-busy', 'data-loading'] });
    // Ancestors can differ from the old inferred root. Events are diagnostic
    // only; scroll pixels and events never prove a new mounted window.
    document.addEventListener('scroll', observeScroll, { capture: true, passive: true });
    try {
      if (edge?.node.isConnected && !signal.aborted && (!collection?.anchor || collection.anchor.root !== root || collection.anchor.signature !== beforeSignature)) {
        edge.node.scrollIntoView({ block: direction === 'older' ? 'start' : 'end', inline: 'nearest', behavior: 'instant' });
        attempt.requested = root.scrollTop;
        if (collection) collection.anchor = { root, signature: beforeSignature };
      }
      return await new Promise<boolean>(resolve => {
        const started = performance.now();
        let timer: ReturnType<typeof setTimeout>, nudged = false, finished = false, lastNudgeAt = 0;
        let changedSince = started, last = beforeSignature;
        const finish = (progress: boolean) => {
          if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', aborted); resolve(progress);
        };
        const aborted = () => finish(false);
        const poll = () => {
          if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) { finish(false); return; }
          this.refresh(direction);
          if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) { finish(false); return; }
          const currentRoot = this.scroller(this.nodes.values().next().value), current = this.frontier(currentRoot), currentSignature = signature(current);
          attempt.after = currentRoot.scrollTop; attempt.heightAfter = currentRoot.scrollHeight;
          attempt.replaced ||= currentRoot !== root || !root.isConnected;
          const added = this.store.entries.filter(e => e.stable && !before.has(e.id)).length;
          const now = performance.now(), elapsed = now - started;
          if (currentSignature !== last) { last = currentSignature; changedSince = performance.now(); }
          const boundary = direction === 'older' ? current[0] : current.at(-1);
          const viewport = this.viewport(currentRoot), rect = boundary?.node.getBoundingClientRect();
          const loading = this.boundaryLoading(currentRoot, viewport);
          const physical = !!rect && (direction === 'older'
            ? currentRoot.scrollTop <= 2 && rect.top >= viewport.top - 2 && rect.top < viewport.bottom
            : currentRoot.scrollTop + currentRoot.clientHeight >= currentRoot.scrollHeight - 2 && rect.bottom <= viewport.bottom + 2 && rect.bottom > viewport.top);
          const boundaryStatus = collection?.boundary.observe({ now, physical, loading,
            rendering: now - collection.lastRenderActivity < 320, root: currentRoot, node: boundary?.node ?? null, signature: currentSignature,
            geometry: [currentRoot.scrollHeight, currentRoot.clientHeight, currentRoot.clientWidth, currentRoot.scrollTop,
              viewport.top, viewport.bottom, rect?.top ?? NaN, rect?.bottom ?? NaN] });
          if (boundaryStatus) attempt.boundary = { ...boundaryStatus, stableMs: Math.round(boundaryStatus.stableMs) };
          if (current.length && (added > 0 || currentSignature !== beforeSignature) && elapsed >= 320 && performance.now() - changedSince >= 160) {
            this.lastLoadReport.added += added;
            finish(true); return;
          }
          if (targetId !== null && this.mounted(targetId)) { this.lastLoadReport.added += added; finish(added > 0 || currentSignature !== beforeSignature); return; }
          // A stalled middle window is not the start of a conversation. Probe
          // the same direction and allow slow mounts; reverse only after a live
          // physical boundary stays stable for six seconds and two clamp probes.
          const repeatBoundaryProbe = collection?.boundary.shouldProbe(now) ?? false;
          if (currentSignature === beforeSignature && boundary?.node.isConnected && rect && ((collection ? !physical && currentRoot.scrollTop > 2 && elapsed - lastNudgeAt >= 640 : !nudged && elapsed >= 640) || repeatBoundaryProbe)) {
            nudged = true; lastNudgeAt = elapsed;
            // Once anchored, continue from the current position; never re-align the
            // same shell between batches. A real head probe stays clamped at zero.
            const step = Math.max(80, currentRoot.clientHeight * .45);
            const top = direction === 'older' ? (physical ? -step : currentRoot.scrollTop - step)
              : currentRoot.scrollTop + rect.bottom - viewport.bottom + step;
            currentRoot.scrollTo({ top, behavior: 'instant' }); attempt.requested = top;
            collection?.boundary.recordProbe(now, physical && !loading && Math.abs(currentRoot.scrollTop - attempt.after) <= 2);
          }
          if (collection && this.collection === collection && boundaryStatus?.confirmed) {
            collection.stage = 'done'; collection.boundary.reset();
            this.lastLoadReport.added += added; finish(added > 0 || currentSignature !== beforeSignature); return;
          }
          if (elapsed >= Math.min(targetId === null ? 6500 : 1600, Math.max(0, timeout - 200)) && current.length) {
            this.lastLoadReport.added += added;
            finish(added > 0 || currentSignature !== beforeSignature); return;
          }
          if (elapsed >= Math.max(0, timeout - 200)) { finish(false); return; }
          timer = setTimeout(poll, 80);
        };
        signal.addEventListener('abort', aborted, { once: true }); timer = setTimeout(poll, 80);
      });
    } finally {
      renderObserver?.disconnect();
      if (signal.aborted && collection) collection.boundary.reset();
      document.removeEventListener('scroll', observeScroll, { capture: true });
      if (this.loadSignal === signal) { this.loadSignal = null; this.loadDirection = null; }
    }
  }
  clearHighlight(): void { this.highlightCleanup?.(); }
  clearReturnWitness(): void { this.returnWitness = null; }
  dispose(): void { this.clearHighlight(); this.clearReturnWitness(); this.nodes.clear(); this.geometry.reset(); this.adjacent.clear(); this.collection = null; }
}
