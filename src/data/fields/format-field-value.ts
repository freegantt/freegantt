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

/** Call: `createFormatContext(dataset.timeZone, locale)`, where `locale` is already the resolved
 *  argument (this Gantt's effective locale, or the Dataset's `locale ?? this.locale`). The one
 *  place a `FormatContext` is built, so a Grid cell, a bar label and a direct
 *  `dataset.formatFieldValue` call never format with two contexts. A missing `locale` reads as the
 *  runtime's own. */
export function createFormatContext(timeZone: string, locale?: Intl.LocalesArgument): FormatContext {
  return { timeZone, locale: locale ?? [] };
}
