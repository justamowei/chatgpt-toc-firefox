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
export interface BoundaryStatus { physical: boolean; loading: boolean; rendering: boolean; stableMs: number; }

// This witness belongs to a collection direction, not to one bounded load.
// Compare geometry against the original witness: subpixel jitter is harmless,
// but accumulated drift, a remount, loading or streamed text resets the timer.
export class CollectionBoundaryWitness {
  private witness: BoundaryObservation | null = null;
  constructor(private tolerance = 2) {}
  reset(): void { this.witness = null; }
  observe(observation: BoundaryObservation): BoundaryStatus {
    const previous = this.witness;
    const eligible = !observation.aborted && observation.physical && !observation.loading && !observation.rendering &&
      !!observation.root && !!observation.node && !!observation.signature && observation.geometry.every(Number.isFinite);
    const same = previous && previous.root === observation.root && previous.node === observation.node && previous.signature === observation.signature &&
      previous.geometry.length === observation.geometry.length && previous.geometry.every((value, index) => Math.abs(value - observation.geometry[index]) <= this.tolerance);
    if (!eligible || !same) {
      this.reset();
      if (eligible) this.witness = { ...observation, geometry: [...observation.geometry] };
    }
    const stableMs = this.witness ? Math.max(0, observation.now - this.witness.now) : 0;
    return { physical: observation.physical, loading: observation.loading, rendering: observation.rendering, stableMs };
  }
}
