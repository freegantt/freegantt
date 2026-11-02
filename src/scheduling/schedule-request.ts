// scheduling/ — what a caller hands `schedule()`. Plain data only: the engine reads no store.
import type { EntryId, Duration, Instant } from '../model/index.js';
import type { ScheduleCalendar } from './day-counting.js';
import type { ScheduleEntry, ScheduleField } from './schedule-entry.js';
import type { SchedulingPolicy } from './scheduling-policy.js';

export type { ScheduleEntry, ScheduleField } from './schedule-entry.js';
export type { ScheduleCalendar } from './day-counting.js';

/** Which end of a dependency drives which end of its successor. */
export type ScheduleDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/** One rule: the successor may not start or finish before the predecessor allows, plus the lag. A negative lag overlaps the two. */
export interface ScheduleDependency {
  readonly id: string;
  readonly fromId: EntryId;
  readonly toId: EntryId;
  readonly type: ScheduleDependencyType;
  readonly lag: Duration;
}

/** The dates a user just set on one Entry. A key that is absent was not touched. */
export type ProposedEntryDates = Partial<Record<ScheduleField, Instant>>;

/**
 * A date rule on one Entry. The precedence is: manually scheduled, then `mustStartOn`, then a
 * dependency, then `startNoEarlierThan`.
 */
export type ScheduleConstraint =
  | {
      /** The Entry never starts before `date`. A dependency can still move it later. */
      readonly kind: 'startNoEarlierThan';
      readonly date: Instant;
    }
  | {
      /** The Entry should finish by `date`. The engine never moves it to meet the date. A dependency that pushes the finish past it wins, and a diagnostic names the constraint. */
      readonly kind: 'finishNoLaterThan';
      readonly date: Instant;
    }
  | {
      /** The Entry starts on `date`. It wins over a dependency, and a dependency it breaks gives a diagnostic. */
      readonly kind: 'mustStartOn';
      readonly date: Instant;
    };

/** The name of a constraint rule. */
export type ScheduleConstraintKind = ScheduleConstraint['kind'];

/**
 * How a successor follows its predecessors. `pushAndPull` moves it to the earliest date its
 * dependencies and constraint allow, earlier too. `pushOnly` moves it later and never earlier.
 */
export type SuccessorMoves = 'pushAndPull' | 'pushOnly';

export interface ScheduleRequest {
  /** The schedule as it stands now, before the proposed dates apply. */
  readonly entries: readonly ScheduleEntry[];
  readonly dependencies: readonly ScheduleDependency[];
  /**
   * What the user just set, per Entry. A start with no end means the bar moved. A start and an end
   * mean the bar resized. An empty map asks for a full recompute.
   */
  readonly proposed?: ReadonlyMap<EntryId, ProposedEntryDates>;
  /** Entries the engine must never move. */
  readonly manuallyScheduled?: ReadonlySet<EntryId>;
  /** One constraint per Entry. A `startNoEarlierThan` floor moves an Entry that has no dependency, too. */
  readonly constraints?: ReadonlyMap<EntryId, ScheduleConstraint>;
  /**
   * The working calendars. With none, a day is 24 hours. With one, a lag counts workdays and a moved
   * Entry keeps its length in workdays. A lag counts in the calendar of its successor. That is the
   * default of Primavera P6. A week, a month and a year lag give an `unsupported-lag-unit` finding.
   */
  readonly calendar?: ScheduleCalendar;
  /** Defaults to `pushAndPull`. */
  readonly successorMoves?: SuccessorMoves;
  /** Defaults to `defaultPolicy`. */
  readonly policy?: SchedulingPolicy;
}
