// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// Moved from view/gantt-shell.ts's DatasetLike (S1.7 §3.2): layout/ needs this shape for Viewport.bind
// and may not import view/ (I1). Renamed off the naming skill's checks — CONTEXT.md's term is
// Dataset, and api/dataset.ts's Dataset class already implements this exact shape.

import type { Entry } from './entry.js';

export interface Dataset {
  readonly entries: readonly Entry[];
  readonly timeZone: string;
}
