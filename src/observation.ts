// Session-local equality tokens preserve relationships without exporting text,
// message IDs, conversation URLs or typed input.
export class PageObservation {
  private controller: AbortController | null = null;
  private observer: MutationObserver | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private started = 0;
  private events: object[] = [];
  private dropped = 0;
  private serial = 0;
  private nodes = new WeakMap<object, number>();
  private values = new Map<string, number>();
  get active(): boolean { return this.controller !== null; }
  private token(value: object | string): number {
    const map = typeof value === 'string' ? this.values : this.nodes;
    const existing = (map as Map<object | string, number>).get(value);
    if (existing !== undefined) return existing;
    const id = ++this.serial;
    (map as Map<object | string, number>).set(value, id);
    return id;
  }
  private push(value: object): void {
    if (this.events.length >= 2000) { this.events.shift(); this.dropped++; }
    this.events.push({ ms: Math.round(performance.now() - this.started), ...value });
  }
  note(kind: string, id?: string): void {
    if (!this.active) return;
    this.push({ kind, ...(id ? { target: this.token('key:' + id) } : {}) });
    this.schedule();
  }
  private schedule(): void {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => { this.timer = undefined; if (this.active) this.sample(); }, 100);
  }
  private sample(): void {
    const roots = new Set<HTMLElement>();
    const turns = [...document.querySelectorAll<HTMLElement>('main [data-user-message-bubble], main [data-conversation-role="assistant"], main [data-message-author-role]')]
      .filter(node => !node.closest('#chatgpt-toc-root, aside, nav, form')).slice(0, 150);
    const messages = turns.map(node => {
      const role = node.hasAttribute('data-user-message-bubble') ? 'user' :
        node.getAttribute('data-message-author-role') ?? 'assistant';
      const message = node.closest('[data-message-id]')?.getAttribute('data-message-id');
      const turn = node.closest('[data-turn-key]')?.getAttribute('data-turn-key');
      const key = message ?? (turn ? 'turn-key:' + role + ':' + turn : undefined);
      for (let parent = node.parentElement; parent; parent = parent.parentElement)
        if (parent.clientHeight > 100 && parent.scrollHeight > parent.clientHeight + 2) roots.add(parent);
      const rect = node.getBoundingClientRect();
      return { node: this.token(node), role, key: key ? this.token('key:' + key) : null,
        body: this.token('body:' + (node.textContent ?? '').trim()), x: rect.x, y: rect.y,
        width: rect.width, height: rect.height, connected: node.isConnected };
    });
    this.push({ kind: 'snapshot', messages, containers: [...roots].map(root => {
      const rect = root.getBoundingClientRect(), style = getComputedStyle(root);
      return { node: this.token(root), tag: root.tagName, top: root.scrollTop, height: root.scrollHeight,
        client: root.clientHeight, x: rect.x, y: rect.y, width: rect.width,
        overflow: style.overflowY, anchor: style.overflowAnchor };
    }) });
  }
  start(): void {
    this.stop();
    this.events = []; this.dropped = 0; this.serial = 0;
    this.nodes = new WeakMap(); this.values = new Map(); this.started = performance.now();
    const controller = this.controller = new AbortController();
    document.addEventListener('scroll', event => {
      if (event.composedPath().some(node => node instanceof Element && node.id === 'chatgpt-toc-root')) return;
      const root = event.target === document ? document.scrollingElement : event.target;
      if (root instanceof HTMLElement) {
        this.push({ kind: 'scroll', container: this.token(root), top: root.scrollTop,
          height: root.scrollHeight, client: root.clientHeight });
        this.schedule();
      }
    }, { capture: true, passive: true, signal: controller.signal });
    document.addEventListener('keydown', event => {
      if (['Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown'].includes(event.key)) this.note('key-' + event.key);
    }, { capture: true, signal: controller.signal });
    document.addEventListener('wheel', () => this.note('wheel'), { capture: true, passive: true, signal: controller.signal });
    this.observer = new MutationObserver(records => {
      const relevant = records.filter(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        return target?.closest('main') && !target.closest('#chatgpt-toc-root, form, [contenteditable="true"]');
      });
      if (relevant.length) { this.push({ kind: 'mutation', count: relevant.length }); this.schedule(); }
    });
    this.observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['data-turn-key', 'data-message-id', 'style', 'class'] });
    this.note('start'); this.sample();
  }
  stop(): void {
    if (this.active) { this.sample(); this.push({ kind: 'stop' }); }
    this.controller?.abort(); this.controller = null; this.observer?.disconnect(); this.observer = null;
    clearTimeout(this.timer); this.timer = undefined; this.values.clear();
  }
  export(): object {
    return { schema: 1, active: this.active, dropped: this.dropped, events: [...this.events] };
  }
}
