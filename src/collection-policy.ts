export interface BoundaryObservation {
  now: number;
  physical: boolean;
  loading: boolean;
  rendering: boolean;
  root: object | null;
  node: object | null;
  signature: string;
  geometry: number[];
  aborted?: boolean;
}
export interface BoundaryStatus { physical: boolean; loading: boolean; rendering: boolean; stableMs: number; probes: number; confirmed: boolean; }

// This witness belongs to a collection direction, not to one bounded load.
// Compare geometry against the original witness: subpixel jitter is harmless,
// but accumulated drift, a semantic change or loading needs new proof.
export class CollectionBoundaryWitness {
  private witness: BoundaryObservation | null = null;
  private probes = 0;
  private lastProbe = -Infinity;
  private status: BoundaryStatus = { physical: false, loading: false, rendering: false, stableMs: 0, probes: 0, confirmed: false };
  constructor(private stableMs = 6000, private probeGapMs = 2400, private tolerance = 2) {}
  reset(): void { this.witness = null; this.probes = 0; this.lastProbe = -Infinity; }
  observe(observation: BoundaryObservation): BoundaryStatus {
    const previous = this.witness;
    const eligible = !observation.aborted && observation.physical && !observation.loading && !observation.rendering &&
      !!observation.root && !!observation.node && !!observation.signature && observation.geometry.every(Number.isFinite);
    const same = previous && previous.root === observation.root && previous.signature === observation.signature &&
      previous.geometry.length === observation.geometry.length && previous.geometry.every((value, index) => Math.abs(value - observation.geometry[index]) <= this.tolerance);
    if (!eligible || !same) {
      this.reset();
      if (eligible) this.witness = { ...observation, geometry: [...observation.geometry] };
    }
    const stableMs = this.witness ? Math.max(0, observation.now - this.witness.now) : 0;
    this.status = { physical: observation.physical, loading: observation.loading, rendering: observation.rendering,
      stableMs, probes: this.probes, confirmed: !!this.witness && stableMs >= this.stableMs && this.probes >= 2 };
    return { ...this.status };
  }
  shouldProbe(now: number): boolean {
    return !!this.witness && this.probes < 2 && now - this.witness.now >= this.probeGapMs && now - this.lastProbe >= this.probeGapMs;
  }
  recordProbe(now: number, clamped: boolean): void {
    if (!this.shouldProbe(now)) return;
    this.lastProbe = now;
    if (clamped) this.probes++;
  }
}
