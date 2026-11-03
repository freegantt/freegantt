// scheduling/ — what `schedule()` answers: the moves it makes and the conflicts it reports.
import type { EntryId, Instant } from '../model/index.js';
import type { ScheduleConstraintKind, ScheduleField } from './schedule-request.js';

/** One date the engine moves. The engine never writes a date the user proposed. */
export interface ScheduleChange {
  readonly id: EntryId;
  readonly field: ScheduleField;
  readonly from: Instant;
  readonly to: Instant;
}

/** These Entries form a loop of dependencies. The engine moves none of them. */
export interface CycleDiagnostic {
  readonly code: 'cycle';
  /** Exactly the members of the loop, in request order. Entries that only depend on the loop are absent. */
  readonly entryIds: readonly EntryId[];
}

/** Why a dependency could not move its successor. */
export type BlockReason =
  /** The Entry is manually scheduled. */
  | 'manuallyScheduled'
  /** The Entry has a `mustStartOn` constraint, and the constraint wins over the dependency. */
  | 'mustStartOn'
  /** The user proposed a date the move would change. */
  | 'proposed'
  /** The policy lets no date of this Entry move. */
  | 'policy'
  /** The move would put the end before the start. */
  | 'inverted';

/** A dependency wants an Entry to move and the engine did not move it. */
export interface BlockedMoveDiagnostic {
  readonly code: 'blocked-move';
  readonly reason: BlockReason;
  readonly entryId: EntryId;
  readonly dependencyIds: readonly string[];
  /** What the engine would have done. */
  readonly wouldChange: readonly ScheduleChange[];
}

/** An Entry breaks its constraint. The engine did not move it, because a higher rule wins. */
export interface ConstraintViolationDiagnostic {
  readonly code: 'constraint-violated';
  /** The rule the Entry breaks. A `startNoEarlierThan` floor never breaks, because the engine moves the Entry later. */
  readonly constraint: Exclude<ScheduleConstraintKind, 'startNoEarlierThan'>;
  readonly entryId: EntryId;
  /** The dependencies that hold the Entry at its date. Empty when no dependency is involved. */
  readonly dependencyIds: readonly string[];
}

/** The engine skipped a dependency it cannot read. */
export interface InvalidDependencyDiagnostic {
  readonly code: 'unknown-entry' | 'unsupported-lag-unit';
  readonly dependencyId: string;
}

export type ScheduleDiagnostic =
  CycleDiagnostic | BlockedMoveDiagnostic | ConstraintViolationDiagnostic | InvalidDependencyDiagnostic;

export interface ScheduleResult {
  /** The dates to write, in request order. The user's proposed dates are not in it. */
  readonly patch: readonly ScheduleChange[];
  readonly diagnostics: readonly ScheduleDiagnostic[];
}
