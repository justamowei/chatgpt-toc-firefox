import { IndexStore, type Entry, type NavigationAdapter, type Position, type Snapshot } from './core';
import { FIXTURE } from './config';
type Direction = 'older' | 'newer';
export class DomAdapter implements NavigationAdapter {
  nodes = new Map<string, HTMLElement>();
  private transient = new WeakMap<HTMLElement, string>();
  private serial = 0;
  private previousSlots = new Map<string, string>();
  private previousPrompts = new Map<string, string>();
  private previousContext = '';
  private highlightCleanup: (() => void) | null = null;
  private loadDirection: Direction | null = null;
  private loadSignal: AbortSignal | null = null;
  constructor(private store: IndexStore, private refresh: (direction?: Direction) => void) {}
  read(): Snapshot {
    const context = location.origin + location.pathname;
    const entries: Entry[] = [], nodes = new Map<string, HTMLElement>(), slots = new Map<string, string>(), prompts = new Map<string, string>();
    const main = document.querySelector('main') ?? document.body;
    for (const node of main.querySelectorAll<HTMLElement>('[data-message-author-role]')) {
      const role = node.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') continue;
      const stableId = node.getAttribute('data-message-id') ?? node.closest('[data-message-id]')?.getAttribute('data-message-id');
      let id = stableId;
      if (!id) { id = this.transient.get(node) ?? `transient-${++this.serial}`; this.transient.set(node, id); }
      if (nodes.has(id)) continue;
      nodes.set(id, node);
      const slot = node.closest('[data-testid^="conversation-turn-"]')?.getAttribute('data-testid');
      if (slot && stableId) slots.set(`${role}:${slot}`, stableId);
      if (role === 'user') {
        const text = node.textContent?.trim() || '〔附件或非文字提問〕';
        prompts.set(id, text); entries.push({ id, text, stable: !!stableId, ...(slot ? { slot } : {}) });
      }
    }
    const invalidated = context === this.previousContext && ([...slots].some(([slot, id]) => this.previousSlots.has(slot) && this.previousSlots.get(slot) !== id) ||
      [...prompts].some(([id, text]) => { const before = this.previousPrompts.get(id); return before !== undefined && before !== text && !text.startsWith(before); }));
    this.previousContext = context; this.previousSlots = slots; this.previousPrompts = prompts; this.nodes = nodes;
    // Only the compiled localhost fixture has a trusted synthetic branch identity.
    const branch = FIXTURE ? main.getAttribute('data-fixture-branch') : null;
    return { entries, context, branch, invalidated };
  }
  currentDirection(): Direction | undefined { return this.loadSignal && !this.loadSignal.aborted ? this.loadDirection ?? undefined : undefined; }
  mounted(id: string): boolean { return this.store.context === location.origin + location.pathname && !!this.nodes.get(id)?.isConnected; }
  private scroller(node?: HTMLElement): HTMLElement {
    for (let current = node?.parentElement; current; current = current.parentElement) {
      const overflow = getComputedStyle(current).overflowY;
      if (/auto|scroll/.test(overflow) && current.scrollHeight > current.clientHeight + 2 && current.clientHeight > 100) return current;
    }
    return document.scrollingElement as HTMLElement ?? document.documentElement;
  }
  private top(node: HTMLElement): number {
    const scroller = this.scroller(node);
    return scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
  }
  capture(): Position | null {
    const candidates = [...this.nodes].filter(([id, node]) => !id.startsWith('transient-') && node.isConnected && node.getBoundingClientRect().bottom > Math.max(0, this.top(node)) && node.getBoundingClientRect().top < Math.min(innerHeight, this.scroller(node).getBoundingClientRect().bottom));
    candidates.sort((a, b) => Math.abs(a[1].getBoundingClientRect().top) - Math.abs(b[1].getBoundingClientRect().top));
    const candidate = candidates[0];
    return candidate ? { id: candidate[0], offset: candidate[1].getBoundingClientRect().top } : null;
  }
  locate(id: string, signal: AbortSignal): boolean {
    const node = this.nodes.get(id);
    if (signal.aborted || !this.mounted(id) || !node?.isConnected) return false;
    node.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (signal.aborted || !node.isConnected) return false;
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
  restore(position: Position, signal: AbortSignal): boolean {
    const node = this.nodes.get(position.id);
    if (!this.locate(position.id, signal) || signal.aborted || !node?.isConnected) return false;
    const scroller = this.scroller(node);
    scroller.scrollTop += node.getBoundingClientRect().top - position.offset;
    return !signal.aborted && Math.abs(node.getBoundingClientRect().top - position.offset) <= 24;
  }
  direction(id: string): Direction {
    const target = this.store.entries.findIndex(e => e.id === id);
    const firstMounted = this.store.entries.findIndex(e => this.mounted(e.id));
    return target >= 0 && target < firstMounted ? 'older' : 'newer';
  }
  async load(direction: Direction, signal: AbortSignal, timeout: number): Promise<boolean> {
    if (signal.aborted) return false;
    if (this.store.context !== location.origin + location.pathname) throw new Error('Conversation changed');
    const epoch = this.store.epoch, context = location.origin + location.pathname;
    const before = new Set(this.store.entries.filter(e => e.stable).map(e => e.id));
    const first = this.nodes.values().next().value;
    const scroller = this.scroller(first);
    this.loadDirection = direction; this.loadSignal = signal;
    scroller.scrollTo({ top: direction === 'older' ? 0 : scroller.scrollHeight, behavior: 'instant' });
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
          if (progressed || elapsed >= Math.min(timeout - 50, 2000)) { finish(progressed); return; }
          elapsed += 80; timer = setTimeout(poll, 80);
        };
        signal.addEventListener('abort', aborted, { once: true }); timer = setTimeout(poll, 80);
      });
    } finally { if (this.loadSignal === signal) { this.loadSignal = null; this.loadDirection = null; } }
  }
  clearHighlight(): void { this.highlightCleanup?.(); }
  dispose(): void { this.clearHighlight(); this.nodes.clear(); this.previousSlots.clear(); this.previousPrompts.clear(); }
}
