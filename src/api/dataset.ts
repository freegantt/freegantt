// api/ is the only layer a consumer imports (plans/01 §1). Read-only project wrapper: entries + IANA zone (D6).

import type { Entry } from '../model/index.js';

export interface ProjectOptions {
  entries: readonly Entry[];
  /** IANA timeZone (D6, plans/02 §2) — all zone-aware date arithmetic (day boundaries, snapping,
   * week starts) resolves through it, so two users in different zones see identical day boundaries.
   * Named to match plans/02's ProjectOptions — one name for this concept, not `zone` internally and
   * `timeZone` in the spec (#37). */
  timeZone: string;
}

export class Project {
  readonly entries: readonly Entry[];
  readonly timeZone: string;

  constructor(options: ProjectOptions) {
    this.entries = options.entries;
    this.timeZone = options.timeZone;
  }
}
