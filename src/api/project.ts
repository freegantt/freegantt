// api/ is the only layer a consumer imports (plans/01 §1). Read-only project wrapper: entries + IANA zone (D6).

import type { Entry } from '../model/index.js';

export interface ProjectOptions {
  entries: readonly Entry[];
  /** IANA zone (D6) — all zone-aware date arithmetic (day boundaries, snapping, week starts) resolves
   * through it, so two users in different zones see identical day boundaries. */
  zone: string;
}

export class Project {
  readonly entries: readonly Entry[];
  readonly zone: string;

  constructor(options: ProjectOptions) {
    this.entries = options.entries;
    this.zone = options.zone;
  }
}
