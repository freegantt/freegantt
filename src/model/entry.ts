// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

import type { EntryId } from './ids.js';
import type { Instant, TimeSpan } from './time.js';

/** Open classification — see plans/01 §2.5. Shipped kinds ship; hosts add their own. */
export type EntryKind = 'span' | 'group' | 'milestone' | (string & {});

export interface Entry<TMeta = unknown> {
  id: EntryId;
  /** Hierarchy; roots have none. */
  parentId?: EntryId;
  /** Authored, never derived — see plans/01 §2.5. Default 'span'. */
  kind?: EntryKind;
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
