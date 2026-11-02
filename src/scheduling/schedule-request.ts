// scheduling/ — what a caller hands `schedule()`. Plain data only: the engine reads no store.
import type { Entry, EntryId, Duration, Instant } from '../model/index.js';
import type { SchedulingPolicy } from './scheduling-policy.js';

/** Which end of a dependency drives which end of its successor. */
export type ScheduleDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/** The two dates the engine may move. */
export type ScheduleField = 'start' | 'end';

/** One rule: the successor may not start or finish before the predecessor allows, plus the lag. A negative lag overlaps the two. */
export interface ScheduleDependency {
  readonly id: string;
  readonly fromId: EntryId;
  readonly toId: EntryId;
  readonly type: ScheduleDependencyType;
  readonly lag: Duration;
}

/** What the engine reads of an Entry. A live `Entry` fits. */
export type ScheduleEntry = Pick<Entry, 'id' | 'start' | 'end' | 'hasChildren'>;

/** The dates a user just set on one Entry. A key that is absent was not touched. */
export type ProposedEntryDates = Partial<Record<ScheduleField, Instant>>;

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
  readonly pinned?: ReadonlySet<EntryId>;
  /** Defaults to `defaultPolicy`. */
  readonly policy?: SchedulingPolicy;
}
