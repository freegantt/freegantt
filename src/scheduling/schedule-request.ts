// scheduling/ — what a caller hands `schedule()`. Plain data only: the engine reads no store.
import type { EntryId, Duration, Instant } from '../model/index.js';
import type { ScheduleEntry, ScheduleField } from './schedule-entry.js';
import type { SchedulingPolicy } from './scheduling-policy.js';

export type { ScheduleEntry, ScheduleField } from './schedule-entry.js';

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
 * A date rule on one Entry. The engine reads one kind today. A new kind joins this union
 * with its own `kind` tag.
 */
export type ScheduleConstraint = {
  /** The Entry never starts before `date`. A dependency can still move it later. */
  readonly kind: 'startNoEarlierThan';
  readonly date: Instant;
};

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
  /** One constraint per Entry. An Entry with no incoming dependency never moves, so its constraint does not apply. */
  readonly constraints?: ReadonlyMap<EntryId, ScheduleConstraint>;
  /** Defaults to `pushAndPull`. */
  readonly successorMoves?: SuccessorMoves;
  /** Defaults to `defaultPolicy`. */
  readonly policy?: SchedulingPolicy;
}
