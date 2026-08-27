// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

import type { EntryId } from './ids.js';
import type { Instant, InstantInput, TimeSpan, TimeSpanInput } from './time.js';

/** Open classification — see plans/01 §2.5. Shipped kinds ship; consumers add their own. */
export type EntryKind = 'span' | 'group' | 'milestone' | (string & {});

export interface Entry<TMeta = unknown> {
  id: EntryId;
  /** Hierarchy; roots have none. */
  parentId?: EntryId;
  /** Authored, never derived — see plans/01 §2.5. */
  kind: EntryKind;
  name: string;
  start: Instant;
  /** Exclusive — see plans/01 §5. */
  end: Instant;
  progress?: number;
  /** Interrupted work — renders as multiple bars on one row. */
  segments?: readonly TimeSpan[];
  /** Consumer-owned, typed via generic. */
  meta?: TMeta;
}

/**
 * What a consumer writes; `Entry` is what the library stores. The two differ only in how loose the input
 * may be: ids are plain strings (the `EntryId` brand is applied on the way in) and dates are any
 * `InstantInput`. An `Entry` is itself a valid `EntryInput`, so a consumer that already holds branded
 * values passes them through unchanged.
 *
 * `Dataset` reads this into `Entry` once, at construction, in the Dataset's own zone — see
 * `DateOnlyEndRule` for how a date-only `end` is read.
 */
export interface EntryInput<TMeta = unknown> {
  id: string;
  /** Hierarchy; roots have none. */
  parentId?: string;
  /** Authored, never derived — see plans/01 §2.5. Default 'span'. */
  kind?: EntryKind;
  name: string;
  start: InstantInput;
  /** Exclusive — see plans/01 §5 and `DateOnlyEndRule`. */
  end: InstantInput;
  progress?: number;
  /** Interrupted work — renders as multiple bars on one row. */
  segments?: readonly TimeSpanInput[];
  /** Consumer-owned, typed via generic. */
  meta?: TMeta;
}

/** What a consumer may change. Input-shaped, so dates stay loose the way `EntryInput`'s are: the store
 * reads them through `time/`'s `toInstant`/`toEndInstant` in the dataset's zone, exactly as
 * construction does. `id` is not editable — an id is identity. */
export type EntryEdit<TMeta = unknown> = Partial<Omit<EntryInput<TMeta>, 'id'>>;
