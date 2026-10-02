import { IndexStore, type Entry, type NavigationAdapter, type Position, type Snapshot } from './core';
import { FIXTURE } from './config';
import { readTurns } from './turns';
import { apiIdentity } from './full-index';
type Direction = 'older' | 'newer';
export class DomAdapter implements NavigationAdapter {
  nodes = new Map<string, HTMLElement>();
  private transient = new WeakMap<HTMLElement, string>();
  private serial = 0;
  private previousSlots = new Map<string, string>();
  private previousPrompts = new Map<string, string>();
  private previousAnswers = new Map<string, string>();
  private previousContext = '';
  private highlightCleanup: (() => void) | null = null;
  private loadDirection: Direction | null = null;
  private loadSignal: AbortSignal | null = null;
  private history: Entry[] | null = null;
  private historyRevision = 0;
  private historyMessageIds: string[] = [];
  private historyAnswers = new Map<string, string>();
  private awaitingHistory = false;
  private targetId: string | null = null;
  constructor(private store: IndexStore, private refresh: (direction?: Direction) => void) {}
  read(): Snapshot {
    const context = location.origin + location.pathname;
    const entries: Entry[] = [], nodes = new Map<string, HTMLElement>(), slots = new Map<string, string>(), prompts = new Map<string, string>(), answers = new Map<string, string>();
    const main = document.querySelector('main') ?? document.body;
    const messages: NonNullable<Snapshot['messages']> = [];
    for (const { node, role, stableId, apiId, slot, text } of readTurns()) {
      let id = stableId;
      if (!id) { id = this.transient.get(node) ?? `transient-${++this.serial}`; this.transient.set(node, id); }
      if (nodes.has(id)) continue;
      nodes.set(id, node);
      messages.push({ id, role, apiId });
      if (slot && stableId) slots.set(`${role}:${slot}`, stableId);
      if (role === 'user') {
        prompts.set(id, text); entries.push({ id, text, stable: !!stableId, ...(slot ? { slot } : {}) });
      } else answers.set(id, text);
    }
    const trackingAnswers = this.history !== null || this.awaitingHistory;
    const invalidated = context === this.previousContext && ([...slots].some(([slot, id]) => this.previousSlots.has(slot) && this.previousSlots.get(slot) !== id) ||
      [...prompts].some(([id, text]) => { const before = this.previousPrompts.get(id); return before !== undefined && before !== text; }) ||
      (trackingAnswers && ([...answers].some(([id, text]) => { const before = this.historyAnswers.get(id); return before !== undefined && before !== text; }) || this.historyAnswers.size > 10_000)));
    if (trackingAnswers) for (const [id, text] of answers) this.historyAnswers.set(id, text);
    this.previousContext = context; this.previousSlots = slots; this.previousPrompts = prompts; this.previousAnswers = answers; this.nodes = nodes;
    // Only the compiled localhost fixture has a trusted synthetic branch identity.
    const branch = FIXTURE ? main.getAttribute('data-fixture-branch') : null;
    return { entries, context, branch, invalidated, messages };
  }
  currentDirection(): Direction | undefined { return this.loadSignal && !this.loadSignal.aborted ? this.loadDirection ?? undefined : undefined; }
  beginHistoryRead(): void { this.awaitingHistory = true; this.historyAnswers = new Map(this.previousAnswers); }
  endHistoryRead(): void { this.awaitingHistory = false; if (!this.history) this.historyAnswers.clear(); }
  useHistory(entries: Entry[] | null, revision: number, messageIds: string[] = []): void {
    if (!entries && !this.awaitingHistory) this.historyAnswers.clear();
    else if (entries && !this.awaitingHistory && (!this.history || this.historyRevision !== revision)) this.historyAnswers = new Map(this.previousAnswers);
    this.history = entries; this.historyRevision = revision; this.historyMessageIds = messageIds;
  }
  navigationEpoch(): number { return this.history ? this.historyRevision : this.store.epoch; }
  target(id: string | null): void { this.targetId = id; }
  canonical(id: string): string { return this.history ? apiIdentity(id) : id; }
  private node(id: string): HTMLElement | undefined {
    return this.nodes.get(id) ?? (this.history ? this.nodes.get(`turn-key:user:${id}`) ?? this.nodes.get(`turn:user:${id}`) ?? this.nodes.get(`message:user:${id}`) : undefined);
  }
  mounted(id: string): boolean { return this.store.context === location.origin + location.pathname && !!this.node(id)?.isConnected; }
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
    const node = this.node(id);
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
    const node = this.node(position.id);
    if (!this.locate(position.id, signal) || signal.aborted || !node?.isConnected) return false;
    const scroller = this.scroller(node);
    scroller.scrollTop += node.getBoundingClientRect().top - position.offset;
    return !signal.aborted && Math.abs(node.getBoundingClientRect().top - position.offset) <= 24;
  }
  direction(id: string): Direction {
    const entries = this.history ? this.historyMessageIds.length ? this.historyMessageIds : this.history.map(e => e.id) : this.store.entries.map(e => e.id);
    const canonical = this.history ? apiIdentity(apiIdentity(id, 'assistant')) : id;
    const target = entries.indexOf(canonical);
    const mounted = this.history ? new Set([...this.nodes.keys()].map(id => apiIdentity(apiIdentity(id, 'assistant')))) : new Set(this.nodes.keys());
    const firstMounted = entries.findIndex(id => mounted.has(id));
    return target >= 0 && target < firstMounted ? 'older' : 'newer';
  }
  async load(direction: Direction, signal: AbortSignal, timeout: number): Promise<boolean> {
    if (signal.aborted) return false;
    if (this.store.context !== location.origin + location.pathname) throw new Error('Conversation changed');
    const epoch = this.navigationEpoch(), context = location.origin + location.pathname;
    const before = new Set(this.nodes.keys());
    const first = this.nodes.values().next().value;
    const scroller = this.scroller(first);
    this.loadDirection = direction; this.loadSignal = signal;
    const beforeTop = scroller.scrollTop;
    const rawTarget = this.targetId && apiIdentity(apiIdentity(this.targetId, 'assistant'));
    const shell = this.history && rawTarget ? [...document.querySelectorAll<HTMLElement>('main [data-turn-key], main [data-turn-id][data-turn="user"], main [data-message-id][data-message-author-role="user"]')]
      .find(node => !node.closest('aside, nav, form') && [node.getAttribute('data-turn-key'), node.getAttribute('data-turn-id'), node.getAttribute('data-message-id')].includes(rawTarget)) : undefined;
    if (shell) shell.scrollIntoView({ block: 'start', behavior: 'instant' });
    else scroller.scrollTo({ top: this.history ? scroller.scrollTop + (direction === 'older' ? -1 : 1) * Math.max(100, scroller.clientHeight * .65) : direction === 'older' ? 0 : scroller.scrollHeight, behavior: 'instant' });
    try {
      return await new Promise<boolean>(resolve => {
        let elapsed = 0, timer: ReturnType<typeof setTimeout>;
        const finish = (progress: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', aborted); resolve(progress); };
        const aborted = () => finish(false);
        const poll = () => {
          if (signal.aborted || this.navigationEpoch() !== epoch || location.origin + location.pathname !== context) { finish(false); return; }
          this.refresh(direction);
          if (signal.aborted || this.navigationEpoch() !== epoch) { finish(false); return; }
          const progressed = [...this.nodes.keys()].some(id => !before.has(id));
          if (progressed || elapsed >= Math.min(timeout - 50, this.history ? 450 : 2000)) { finish(progressed || (this.history !== null && !shell && Math.abs(scroller.scrollTop - beforeTop) > 2)); return; }
          elapsed += 80; timer = setTimeout(poll, 80);
        };
        signal.addEventListener('abort', aborted, { once: true }); timer = setTimeout(poll, 80);
      });
    } finally { if (this.loadSignal === signal) { this.loadSignal = null; this.loadDirection = null; } }
  }
  clearHighlight(): void { this.highlightCleanup?.(); }
  dispose(): void { this.clearHighlight(); this.nodes.clear(); this.previousSlots.clear(); this.previousPrompts.clear(); this.previousAnswers.clear(); this.historyAnswers.clear(); this.historyMessageIds = []; this.history = null; this.awaitingHistory = false; }
}
