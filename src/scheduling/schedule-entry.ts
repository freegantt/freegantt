// scheduling/ — the Entry dates the engine reads and moves. Its own file so the policy and the
// request can both name them without importing each other.
import type { Entry } from '../model/index.js';

/** The two dates the engine may move. */
export type ScheduleField = 'start' | 'end';

/** What the engine reads of an Entry. A live `Entry` fits. */
export type ScheduleEntry = Pick<Entry, 'id' | 'start' | 'end' | 'hasChildren'>;
