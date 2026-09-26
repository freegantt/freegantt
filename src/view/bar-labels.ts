// view/ — binds this Gantt's own `barLabels` setting, and a row's own variant, to a Field (#421 C5).
// `layout/` and `render/` never resolve a Field on their own: this file is the one door,
// the same job `grid-columns.ts` already does for a Grid column.

import type { Entry, FieldKey, FieldLookup, FormatContext } from '../model/index.js';
import { stringifyPrimitive } from '../data/fields/field-types.js';
import type { BarLabelPolicy, BarLabels } from '../layout/index.js';
import { mergeBarLabels } from '../layout/index.js';

export interface ResolveBarLabelBind {
  timeZone: string;
  locale?: Intl.LocalesArgument;
}

/** What `resolveBarLabelText` reads outside itself — the Field registry, paired with the caller's
 *  own report sink (the same "one type" pairing `EntryRulePorts` already uses,
 *  `layout/entry-rule.ts`), so a caller cannot hand this a `lookup` with no way to say a field name
 *  came back unknown. */
export interface ResolveBarLabelPorts {
  /** The Field registry a bar label reads — the same door a Grid cell reads through. */
  lookup: FieldLookup;
  /** `barLabels.field` (on the Gantt, or on an `EntryVariant`) names a key no Field declares. Called
   *  once per field key; the caller holds the dedupe, never this function (#421). */
  reportUnknownField: (field: FieldKey) => void;
}

/** Call: `resolveBarLabelText(entry, gantt.barLabels, variantFor(entry).barLabels, ports, bind)`.
 *  The text one bar's label prints — the merged Field's own `formatValue`, the same door a Grid
 *  cell reads through. `''` when the merged policy names `'none'`, the merged Field is unknown, or
 *  the Entry has no value for the merged Field — never `'undefined'`, never a placeholder, never a
 *  throw (#421 C5). A merged Field this Dataset never declared reports once through
 *  `ports.reportUnknownField` and renders no label — the same report-and-carry-on
 *  `compileEntryRule` already gives an unknown match key, because this reads from inside
 *  `render()`'s own rAF callback, where a throw reaches no consumer. */
export function resolveBarLabelText(
  entry: Entry,
  ganttBarLabels: BarLabels,
  variantBarLabels: BarLabels | undefined,
  ports: ResolveBarLabelPorts,
  bind: ResolveBarLabelBind,
): string {
  const merged = mergeBarLabels(ganttBarLabels, variantBarLabels);
  if (merged.policy === 'none') return '';
  const field = ports.lookup.get(merged.field);
  if (field === undefined) {
    ports.reportUnknownField(merged.field);
    return '';
  }
  const value = entry.read(field.key);
  const formatCtx: FormatContext = { timeZone: bind.timeZone, locale: bind.locale ?? [] };
  if (field.formatValue) return field.formatValue(value, formatCtx, entry);
  return stringifyPrimitive(value);
}

/** Call: `resolveBarLabelPolicy(gantt.barLabels, variantFor(entry).barLabels)` — the placement
 *  policy alone, for `render/dom`'s own width-based `'fitBar'` decision. No Field lookup: `render/`
 *  never resolves one. */
export function resolveBarLabelPolicy(
  ganttBarLabels: BarLabels,
  variantBarLabels: BarLabels | undefined,
): BarLabelPolicy {
  return mergeBarLabels(ganttBarLabels, variantBarLabels).policy;
}
