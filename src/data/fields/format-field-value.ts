// data/ — the one read for a Field's displayed text. `view/` calls it for a Grid cell and a bar
// label; the Gantt's own `formatFieldValue` method calls it too, so all three never disagree.

import type { Entry, Field, FormatContext } from '../../model/index.js';
import { stringifyPrimitive } from './field-types.js';

/** Call: `formatFieldValue(field, entry, ctx)`. The text a Field shows for one Entry: its own
 *  `formatValue`, or the plain text of a primitive value. The grid, the bar label, and
 *  `gantt.formatFieldValue` all read through this one function, so they never disagree. */
export function formatFieldValue(field: Field, entry: Entry, ctx: FormatContext): string {
  const value = entry.read(field.key);
  if (field.formatValue) return field.formatValue(value, ctx, entry);
  return stringifyPrimitive(value);
}
