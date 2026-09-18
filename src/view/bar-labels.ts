// view/ — binds this Gantt's own `barLabels` setting, and a row's own variant, to a Field (D-S4-13,
// #421 C5). `layout/` and `render/` never resolve a Field on their own: this file is the one door,
// the same job `grid-columns.ts` already does for a Grid column.

import type { Entry, FieldLookup, FormatContext } from '../model/index.js';
import { UnknownFieldError } from '../model/index.js';
import { stringifyPrimitive } from '../data/fields/field-types.js';
import type { BarLabelPolicy, BarLabels } from '../layout/index.js';
import { mergeBarLabels } from '../layout/index.js';

export interface ResolveBarLabelBind {
  timeZone: string;
  locale?: Intl.LocalesArgument;
}

/** Call: `resolveBarLabelText(entry, gantt.barLabels, variantFor(entry).barLabels, lookup, bind)`.
 *  The text one bar's label prints — the merged Field's own `formatValue`, the same door a Grid
 *  cell reads through. `''` when the merged policy names `'none'`, or the Entry has no value for
 *  the merged Field — never `'undefined'`, never a placeholder (#421 C5). */
export function resolveBarLabelText(
  entry: Entry,
  ganttBarLabels: BarLabels,
  variantBarLabels: BarLabels | undefined,
  lookup: FieldLookup,
  bind: ResolveBarLabelBind,
): string {
  const merged = mergeBarLabels(ganttBarLabels, variantBarLabels);
  if (merged.placement === 'none') return '';
  const field = lookup.get(merged.field);
  if (field === undefined) throw new UnknownFieldError(String(merged.field), 'barLabels');
  const value = entry.read(field.key);
  const formatCtx: FormatContext = { timeZone: bind.timeZone, locale: bind.locale ?? [] };
  if (field.formatValue) return field.formatValue(value, formatCtx, entry);
  return stringifyPrimitive(value);
}

/** Call: `resolveBarLabelPolicy(gantt.barLabels, variantFor(entry).barLabels)` — the placement
 *  policy alone, for `render/dom`'s own width-based `'fitBar'` decision. No Field lookup: `render/`
 *  never resolves one (D-S4-13). */
export function resolveBarLabelPolicy(
  ganttBarLabels: BarLabels,
  variantBarLabels: BarLabels | undefined,
): BarLabelPolicy {
  return mergeBarLabels(ganttBarLabels, variantBarLabels).placement;
}
