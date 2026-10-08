// One attempt per conversation in a content lifetime; cached prompts and
// failed reads never trigger automatic scrolling. New DOM mounts stay eligible
// until the original successful empty-cache decision can actually start.
export class AutoCollection {
  private contexts = new Map<string, { cached: number | null; attempted: boolean }>();
  private context = '';
  private visit = 0;
  enter(context: string): number {
    this.context = context; this.visit++;
    const state = this.contexts.get(context) ?? { cached: null, attempted: false };
    state.cached = null; this.contexts.delete(context); this.contexts.set(context, state);
    if (this.contexts.size > 32) this.contexts.delete(this.contexts.keys().next().value!);
    return this.visit;
  }
  settle(visit: number, cached: number | null): void {
    if (visit !== this.visit) return;
    this.contexts.get(this.context)!.cached = cached;
  }
  eligible(visit: number, mountedUser: boolean, busy: boolean): boolean {
    const state = this.contexts.get(this.context);
    return visit === this.visit && !!state && state.cached === 0 && !state.attempted && mountedUser && !busy;
  }
  claim(visit: number, mountedUser: boolean, busy: boolean): boolean {
    if (!this.eligible(visit, mountedUser, busy)) return false;
    this.contexts.get(this.context)!.attempted = true; return true;
  }
  suppress(): void { const state = this.contexts.get(this.context); if (state) state.attempted = true; }
}
