// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

import type { TaskId } from './ids.js';
import type { Instant, TimeSpan } from './time.js';

/** Open classification — see plans/01 §2.5. Shipped kinds ship; hosts add their own. */
export type TaskKind = 'task' | 'group' | 'milestone' | (string & {});

export interface Task<TMeta = unknown> {
  id: TaskId;
  /** Hierarchy; roots have none. */
  parentId?: TaskId;
  /** Authored, never derived — see plans/01 §2.5. Default 'task'. */
  kind?: TaskKind;
  name: string;
  start: Instant;
  /** Exclusive — see plans/01 §5. */
  end: Instant;
  progress?: number;
  /** Interrupted work — renders as multiple bars on one row. */
  segments?: readonly TimeSpan[];
  /** Host-owned, typed via generic. */
  meta?: TMeta;
}
