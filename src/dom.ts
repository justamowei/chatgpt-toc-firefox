import { IndexStore, type Entry, type NavigationAdapter, type Position, type Snapshot } from './core';
import { FIXTURE } from './config';
import { readTurns } from './turns';
type Direction = 'older' | 'newer';
type Hint = { y: number; extent: number };
type Bounds = { lower?: number; upper?: number; extent: number; attempts: Set<number>; hinted: boolean };
export interface LoadReport { phase: 'scan' | 'answer' | 'jump' | 'refine'; added: number; steps: number; }
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
    const root = document.querySelector<HTMLElement>('main [data-scroll-root], [data-scroll-root]:has(main), main[data-scroll-root]');
    if (root && root.clientHeight > 100 && /auto|scroll/.test(getComputedStyle(root).overflowY)) return root;
    for (let current = node?.parentElement; current; current = current.parentElement) {
      const overflow = getComputedStyle(current).overflowY;
      if (/auto|scroll/.test(overflow) && current.scrollHeight > current.clientHeight + 2 && current.clientHeight > 100) return current;
    }
    return document.scrollingElement as HTMLElement ?? document.documentElement;
  }
  // Position hints are plain numeric data, never detached DOM references. They
  // accelerate attempts; only exact remounted ID/role/text can report success.
  remember(): void {
    if (this.hintEpoch !== this.store.epoch) { this.hints.clear(); this.seek = null; this.hintEpoch = this.store.epoch; }
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
  }
  begin(): void { this.seek = null; this.lastLoadReport = { phase: 'scan', added: 0, steps: 0 }; }
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
    node.scrollIntoView({ block: 'start', behavior: 'instant' });
    // Scrolling can asynchronously evict even the node that was mounted just
    // before scrollIntoView. Wait for its exact replacement before success.
    const settleStarted = performance.now();
    do {
      await new Promise<void>(resolve => setTimeout(resolve, 80));
      if (signal.aborted || epoch !== this.store.epoch || context !== location.origin + location.pathname) return false;
      this.refresh(); node = this.nodes.get(id);
      if (node?.isConnected && performance.now() - settleStarted >= 120 && readTurns().some(e => e.node === node && e.stableId === id && e.role === turn.role && e.text === turn.text)) break;
    } while (performance.now() - settleStarted < 1200);
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
    this.loadDirection = direction; this.loadSignal = signal;
    const scrollBefore = scroller.scrollTop, extentBefore = scroller.scrollHeight;
    const beforeNodes = this.viewportWitness(scroller);
    const beforeIds = [...this.nodes.keys()].join('|');
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    let phase: LoadReport['phase'] = 'scan';
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
      if (!this.seek.hinted && hint) {
        this.seek.hinted = true; phase = 'jump';
        destination = (hint.extent > 0 ? hint.y * max / hint.extent : hint.y) - scroller.clientHeight * .15;
      } else if (rank >= 0 && anchor) {
        const lower = this.seek.lower ?? 0, upper = this.seek.upper ?? max;
        if (upper - lower > scroller.clientHeight * 1.5) {
          phase = 'refine'; destination = (lower + upper) / 2;
        }
      }
      destination = Math.max(0, Math.min(max, destination));
      const key = Math.round(destination / 16);
      if (phase !== 'scan' && (this.seek.attempts.has(key) || Math.abs(destination - scrollBefore) < scroller.clientHeight * .25)) {
        phase = 'scan'; destination = scrollBefore + (direction === 'older' ? -1 : 1) * Math.max(100, scroller.clientHeight * .85);
      }
      this.seek.attempts.add(Math.round(destination / 16));
    } else {
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
    this.lastLoadReport = { phase, added: this.lastLoadReport.added, steps: this.lastLoadReport.steps + 1 };
    scroller.scrollTo({ top: Math.max(0, Math.min(max, destination)), behavior: 'instant' });
    try {
      return await new Promise<boolean>(resolve => {
        const started = performance.now();
        let stableSince = started, lastSignature = '', timer: ReturnType<typeof setTimeout>;
        const finish = (progress: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', aborted); resolve(progress); };
        const aborted = () => finish(false);
        const poll = () => {
          if (signal.aborted || this.store.epoch !== epoch || location.origin + location.pathname !== context) { finish(false); return; }
          this.refresh(direction);
          if (signal.aborted || this.store.epoch !== epoch) { finish(false); return; }
          const added = this.store.entries.filter(e => e.stable && !before.has(e.id)).length;
          const witnesses = this.viewportWitness(scroller);
          const signature = [...this.nodes.keys()].join('|') + ':' + Math.round(scroller.scrollTop) + ':' + scroller.scrollHeight;
          if (signature !== lastSignature) { stableSince = performance.now(); lastSignature = signature; }
          const moved = Math.abs(scroller.scrollTop - scrollBefore) > 2 || Math.abs(scroller.scrollHeight - extentBefore) > 8 ||
            witnesses.some(([id, y]) => beforeNodes.some(([oldId, oldY]) => id === oldId && Math.abs(y - oldY) > 8));
          const changedWindow = beforeIds !== [...this.nodes.keys()].join('|');
          const elapsed = performance.now() - started, settled = performance.now() - stableSince >= 120;
          const finishProgress = () => { this.lastLoadReport.added += added; finish(added > 0 || moved || changedWindow); };
          if (targetId !== null && this.mounted(targetId)) { finishProgress(); return; }
          // New mounted windows settle quickly. Traverse within long answers
          // without a fixed 1.8s penalty. Empty/loading windows keep waiting.
          const seekWindow = targetId !== null && (changedWindow || moved) && this.nearestPrompt(scroller) !== null;
          if (settled && elapsed >= 240 && ((witnesses.length > 0 && (changedWindow || moved)) || seekWindow)) { finishProgress(); return; }
          if (elapsed >= Math.max(0, timeout - 200)) { finishProgress(); return; }
          timer = setTimeout(poll, 80);
        };
        signal.addEventListener('abort', aborted, { once: true }); timer = setTimeout(poll, 80);
      });
    } finally { if (this.loadSignal === signal) { this.loadSignal = null; this.loadDirection = null; } }
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
  dispose(): void { this.clearHighlight(); this.clearReturnWitness(); this.nodes.clear(); this.hints.clear(); this.seek = null; }
}
