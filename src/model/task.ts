// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

import type { TaskId, DependencyId } from './ids.js';
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
  /** 'auto': the engine may move it. 'pinned': the engine reports conflicts but never moves it. */
  scheduling: 'auto' | 'pinned';
  progress?: number;
  /** Interrupted work — renders as multiple bars on one row. */
  segments?: readonly TimeSpan[];
  /** Host-owned, typed via generic. */
  meta?: TMeta;
}

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/** First-class entity, never an array embedded on a task. */
export interface Dependency {
  id: DependencyId;
  predecessorId: TaskId;
  successorId: TaskId;
  type: DependencyType;
  /** Lag as a signed duration value in the dependency's own unit; negative is legal (plans/03 S3). */
  lag?: { value: number; unit: 'ms' | 'm' | 'h' | 'd' | 'w' };
}
