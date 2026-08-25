// api/ is the only layer a consumer imports (plans/01 §1). Read-only dataset wrapper: entries + IANA zone (D6).

import type { Dataset as DatasetContract, Entry } from '../model/index.js';

export interface DatasetOptions {
  entries: readonly Entry[];
  /** IANA timeZone (D6, plans/02 §2) — all zone-aware date arithmetic (day boundaries, snapping,
   * week starts) resolves through it, so two users in different zones see identical day boundaries.
   * Named to match plans/02's DatasetOptions — one name for this concept, not `zone` internally and
   * `timeZone` in the spec (#37). */
  timeZone: string;
}

/** States the relationship instead of leaving it structural-by-coincidence (S1.7 §3.2): this class
 * and model/'s `Dataset` are the same concept at two altitudes, the way CONTEXT.md already treats `Gantt`. */
export class Dataset implements DatasetContract {
  readonly entries: readonly Entry[];
  readonly timeZone: string;

  constructor(options: DatasetOptions) {
    this.entries = options.entries;
    this.timeZone = options.timeZone;
  }
}
