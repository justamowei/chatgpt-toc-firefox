import { IndexStore, type Entry, type NavigationAdapter, type Position, type Snapshot } from './core';
import { FIXTURE } from './config';
import { readTurns } from './turns';
type Direction = 'older' | 'newer';
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
    for (let current = node?.parentElement; current; current = current.parentElement) {
      const overflow = getComputedStyle(current).overflowY;
      if (/auto|scroll/.test(overflow) && current.scrollHeight > current.clientHeight + 2 && current.clientHeight > 100) return current;
    }
    const root = document.querySelector<HTMLElement>('main [data-scroll-root], [data-scroll-root]:has(main), main[data-scroll-root]');
    if (root && root.clientHeight > 100 && /auto|scroll/.test(getComputedStyle(root).overflowY)) return root;
    return document.scrollingElement as HTMLElement ?? document.documentElement;
  }
  private top(node: HTMLElement): number {
    const scroller = this.scroller(node);
    return scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
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
    return position;
  }
  async locate(id: string, signal: AbortSignal): Promise<boolean> {
    const node = this.nodes.get(id);
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
    node.scrollIntoView({ block: 'start', behavior: 'instant' });
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
    const node = this.nodes.get(position.id);
    if (!await this.locate(position.id, signal) || signal.aborted || !node?.isConnected) return false;
    const scroller = this.scroller(node);
    scroller.scrollTop += node.getBoundingClientRect().top - position.offset;
    return !signal.aborted && Math.abs(node.getBoundingClientRect().top - position.offset) <= 24;
  }
  direction(id: string): Direction {
    const targetId = this.returnWitness?.id === id ? this.returnWitness.anchorId ?? id : id;
    const target = this.store.entries.findIndex(e => e.id === targetId);
    const scroller = this.scroller(this.nodes.values().next().value);
    const viewport = scroller.getBoundingClientRect();
    const visible = this.store.entries.filter(e => {
      const node = this.nodes.get(e.id), rect = node?.getBoundingClientRect();
      return !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    // ChatGPT can keep the last two turns mounted while reading far earlier.
    const anchor = visible[0] ?? this.store.entries.find(e => this.mounted(e.id));
    const firstVisible = anchor ? this.store.entries.findIndex(e => e.id === anchor.id) : -1;
    return target >= 0 && firstVisible >= 0 && target < firstVisible ? 'older' : 'newer';
  }
  async load(direction: Direction, signal: AbortSignal, timeout: number): Promise<boolean> {
    if (signal.aborted) return false;
    if (this.store.context !== location.origin + location.pathname) throw new Error('Conversation changed');
    const epoch = this.store.epoch, context = location.origin + location.pathname;
    const before = new Set(this.store.entries.filter(e => e.stable).map(e => e.id));
    const first = this.nodes.values().next().value;
    const scroller = this.scroller(first);
    this.loadDirection = direction; this.loadSignal = signal;
    const scrollBefore = scroller.scrollTop;
    const step = Math.max(100, scroller.clientHeight * .7);
    // Overlap the preceding window; jumping to the opposite end skips prompts.
    scroller.scrollBy({ top: direction === 'older' ? -step : step, behavior: 'instant' });
    try {
      return await new Promise<boolean>(resolve => {
        let elapsed = 0, timer: ReturnType<typeof setTimeout>;
        const finish = (progress: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', aborted); resolve(progress); };
        const aborted = () => finish(false);
        const poll = () => {
          if (signal.aborted || this.store.epoch !== epoch || location.origin + location.pathname !== context) { finish(false); return; }
          this.refresh(direction);
          if (signal.aborted || this.store.epoch !== epoch) { finish(false); return; }
          const progressed = this.store.entries.some(e => e.stable && !before.has(e.id));
          // Moving through a long answer is progress even before a new prompt
          // appears. At a boundary, wait for delayed history hydration.
          if (elapsed >= Math.min(timeout - 50, 1800)) { finish(progressed || Math.abs(scroller.scrollTop - scrollBefore) > 2); return; }
          elapsed += 80; timer = setTimeout(poll, 80);
        };
        signal.addEventListener('abort', aborted, { once: true }); timer = setTimeout(poll, 80);
      });
    } finally { if (this.loadSignal === signal) { this.loadSignal = null; this.loadDirection = null; } }
  }
  clearHighlight(): void { this.highlightCleanup?.(); }
  clearReturnWitness(): void { this.returnWitness = null; }
  dispose(): void { this.clearHighlight(); this.clearReturnWitness(); this.nodes.clear(); }
}
