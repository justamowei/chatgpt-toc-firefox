export interface HeightObservation { id: string; role: 'user' | 'assistant'; y: number; height: number; }
export interface MountedUserPosition { id: string; y: number; }
export interface HeightDiagnostic { measuredTurns: number; measuredAnswers: number; measuredSpans: number; }

const MAX_MEASUREMENTS = 10_000;
const MAX_SPANS = 5_000;
const WIDTH_TOLERANCE = 8;
type Measurement = { height: number; width: number; role: 'user' | 'assistant' };
type Span = { nextId: string; distance: number; width: number };
const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

function ranksFor(ids: string[]): Map<string, number> | null {
  const ranks = new Map<string, number>();
  for (let rank = 0; rank < ids.length; rank++) {
    const id = ids[rank];
    if (typeof id !== 'string' || !id || ranks.has(id)) return null;
    ranks.set(id, rank);
  }
  return ranks;
}

/** Numeric geometry for one context/epoch. The caller resets it on context or epoch changes. */
export class HeightLedger {
  private measurements = new Map<string, Measurement>();
  private spans = new Map<string, Span>();

  observe(items: HeightObservation[], orderedUserIds: string[], width: number): void {
    if (!positive(width)) return;
    // Copy scalar fields only: adapter-owned DOM nodes must never survive an observation.
    const users = new Map<string, number>();
    let ambiguousUsers = false;
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !item.id || (item.role !== 'user' && item.role !== 'assistant')) continue;
      if (positive(item.height) && (this.measurements.has(item.id) || this.measurements.size < MAX_MEASUREMENTS)) {
        this.measurements.set(item.id, { height: item.height, width, role: item.role });
      }
      if (item.role === 'user') {
        if (users.has(item.id) || !Number.isFinite(item.y)) ambiguousUsers = true;
        users.set(item.id, item.y);
      }
    }
    const ranks = ranksFor(orderedUserIds);
    if (!ranks) return;
    const byY = [...users].sort((a, b) => a[1] - b[1]);
    const visualRanks = new Map(byY.map(([id], rank) => [id, rank]));
    for (const [id, y] of users) {
      const rank = ranks.get(id);
      if (rank === undefined || rank + 1 >= orderedUserIds.length) continue;
      const nextId = orderedUserIds[rank + 1];
      const nextY = users.get(nextId);
      if (nextY === undefined) continue;
      const distance = nextY - y;
      // Both endpoints must coexist and be adjacent in the known order and visual window.
      // Unknown mounted users between them, duplicated IDs and invalid coordinates deny proof.
      if (ambiguousUsers || !positive(distance) || visualRanks.get(nextId)! !== visualRanks.get(id)! + 1) {
        this.spans.delete(id);
        continue;
      }
      if (this.spans.has(id) || this.spans.size < MAX_SPANS) this.spans.set(id, { nextId, distance, width });
    }
  }

  estimate(targetId: string, mounted: MountedUserPosition[], orderedUserIds: string[], width: number): number | null {
    const anchors = new Map<string, number>();
    for (const item of mounted) if (item && typeof item.id === 'string' && Number.isFinite(item.y)) anchors.set(item.id, item.y);
    const direct = anchors.get(targetId);
    if (direct !== undefined) return direct;
    if (!positive(width)) return null;
    const ranks = ranksFor(orderedUserIds), targetRank = ranks?.get(targetId);
    if (!ranks || targetRank === undefined) return null;
    let left = targetRank, right = targetRank, before = 0, after = 0;
    let leftOpen = true, rightOpen = true;
    // Walk outward by rank so the first connected anchor has the shortest reliable chain.
    // A gap closes only that direction; an anchor on the other side may still be reliable.
    while (leftOpen || rightOpen) {
      if (leftOpen) {
        if (left === 0) leftOpen = false;
        else {
          const span = this.validSpan(orderedUserIds[left - 1], orderedUserIds[left], width);
          if (!span) leftOpen = false;
          else {
            before += span.distance; left--;
            if (!Number.isFinite(before)) leftOpen = false;
            else {
              const y = anchors.get(orderedUserIds[left]);
              if (y !== undefined && Number.isFinite(y + before)) return y + before;
            }
          }
        }
      }
      if (rightOpen) {
        if (right + 1 >= orderedUserIds.length) rightOpen = false;
        else {
          const span = this.validSpan(orderedUserIds[right], orderedUserIds[right + 1], width);
          if (!span) rightOpen = false;
          else {
            after += span.distance; right++;
            if (!Number.isFinite(after)) rightOpen = false;
            else {
              const y = anchors.get(orderedUserIds[right]);
              if (y !== undefined && Number.isFinite(y - after)) return y - after;
            }
          }
        }
      }
    }
    return null;
  }

  observedUser(id: string, width: number): boolean {
    const measuredWidth = this.observedUserWidth(id);
    return measuredWidth !== null && positive(width) && Math.abs(measuredWidth - width) <= WIDTH_TOLERANCE;
  }

  observedUserWidth(id: string): number | null {
    const measurement = this.measurements.get(id);
    return measurement?.role === 'user' ? measurement.width : null;
  }

  diagnostic(): HeightDiagnostic {
    let measuredAnswers = 0;
    for (const measurement of this.measurements.values()) if (measurement.role === 'assistant') measuredAnswers++;
    return { measuredTurns: this.measurements.size, measuredAnswers, measuredSpans: this.spans.size };
  }

  reset(): void { this.measurements.clear(); this.spans.clear(); }

  private validSpan(id: string, nextId: string, width: number): Span | null {
    const span = this.spans.get(id);
    return span && span.nextId === nextId && positive(span.distance) && positive(span.width) &&
      Math.abs(span.width - width) <= WIDTH_TOLERANCE ? span : null;
  }
}
