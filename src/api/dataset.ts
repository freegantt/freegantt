// api/ is the only layer a consumer imports (plans/01 §1). Read-only dataset wrapper: entries + IANA
// zone (D6).
//
// D-S2-2/OQ5: the real work moved to `data/`'s `DatasetState` in S2.1. This class is a thin façade —
// it constructs one `DatasetState` and delegates every read to it — the same structural/façade
// relationship this class already has with `model/dataset.ts`'s `Dataset` contract.

import type {
  Dataset as DatasetContract,
  DateOnlyEndRule,
  EntryInput,
  EntryStoreView,
} from '../model/index.js';
import { DatasetState } from '../data/index.js';

export interface DatasetOptions {
  /** What the consumer writes. Ids are plain strings and dates are any `InstantInput` — an ISO string,
   * a `Date`, epoch milliseconds, or an already-branded `Instant`. Read into `Entry` once, here. */
  entries: readonly EntryInput[];
  /** IANA timeZone (D6, plans/02 §2) — all zone-aware date arithmetic (day boundaries, snapping,
   * week starts) resolves through it, so two users in different zones see identical day boundaries.
   * It is also the zone a Plain (zoneless) date in `entries` resolves through.
   * Named to match plans/02's DatasetOptions — one name for this concept, not `zone` internally and
   * `timeZone` in the spec (#37). */
  timeZone: string;
  /** How a date-only `end` such as `'2026-09-08'` is read. Defaults to `'inclusive'`: the entry
   * covers through the 8th. `'exclusive'` reads it literally as the start of the 8th, matching
   * half-open storage exactly. Only date-only strings are affected — see `DateOnlyEndRule`. */
  dateOnlyEnd?: DateOnlyEndRule;
}

/** States the relationship instead of leaving it structural-by-coincidence (S1.7 §3.2): this class
 * and model/'s `Dataset` are the same concept at two altitudes, the way CONTEXT.md already treats `Gantt`. */
export class Dataset implements DatasetContract {
  #state: DatasetState;

  constructor(options: DatasetOptions) {
    this.#state = new DatasetState(options);
  }

  get entries(): EntryStoreView {
    return this.#state.entries;
  }

  get timeZone(): string {
    return this.#state.timeZone;
  }

  /** Kept, not just consumed: the rule has to read entries added after construction the same way
   * this constructor read these (mutation lands in S2.3, plans/03). */
  get dateOnlyEnd(): DateOnlyEndRule {
    return this.#state.dateOnlyEnd;
  }
}
