// extensions/features/ — the float half of `scheduling()`: the two Fields it declares and the writes
// that keep them true. Core paints nothing from them. A consumer styles `critical` with a variant rule.

import { calculateFloat } from '../../api/schedule-facade.js';
import type { FloatRequest } from '../../api/schedule-facade.js';
import type { DataPlugin } from '../../api/gantt.js';
import type { EntryId } from '../../model/index.js';

/** The Field that holds the days an Entry can start later without moving the project finish. */
export const FLOAT_FIELD = 'float';
/** The Field that is true when an Entry has no float left. */
export const CRITICAL_FIELD = 'critical';

/** Both Fields are results the plugin writes. A user never types one. */
export function floatFields(): NonNullable<DataPlugin['fields']> {
  return [
    {
      key: FLOAT_FIELD,
      type: 'number',
      editable: 'api',
      column: { header: 'Float (days)', align: 'end', width: 110 },
    },
    {
      key: CRITICAL_FIELD,
      type: 'boolean',
      editable: 'api',
      column: { header: 'Critical', align: 'center', width: 80 },
    },
  ];
}

/** What an Entry holds in the two Fields now. */
export interface HeldFloat {
  readonly float?: unknown;
  readonly critical?: unknown;
}

/** The two values to write. `undefined` clears a Field. */
export interface FloatWrite {
  readonly float: number | undefined;
  readonly critical: boolean | undefined;
}

/**
 * The writes that make each listed Entry hold its analysed float. An Entry that already holds the right
 * values gives no write, so a repeat run commits nothing. An Entry with no float, like a summary, is cleared.
 */
export function floatWrites(
  request: FloatRequest,
  ids: Iterable<EntryId>,
  heldBy: (id: EntryId) => HeldFloat,
): Map<EntryId, FloatWrite> {
  const { entries } = calculateFloat(request);
  const writes = new Map<EntryId, FloatWrite>();
  for (const id of ids) {
    const answer = entries.get(id);
    const wanted: FloatWrite = { float: answer?.totalFloat, critical: answer?.critical };
    const held = heldBy(id);
    if (held.float !== wanted.float || held.critical !== wanted.critical) writes.set(id, wanted);
  }
  return writes;
}
