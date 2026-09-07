// view/ — binds this Gantt's locale to declared Fields (D-S4-13). layout/ never learns FieldSource.

import type { Dataset, Entry, Field, FormatContext, GridColumn, GridColumnInput } from '../model/index.js';
import { FieldNotColumnableError, UnknownFieldError } from '../model/index.js';
import { createFieldContext } from '../data/fields/field-access.js';
import { stringifyPrimitive } from '../data/fields/core-fields.js';
import type { FieldLookup } from '../model/index.js';
import type { FieldCompare, ResolvedColumn } from '../layout/index.js';
import { pickDefined } from '../layout/index.js';

export const DEFAULT_GRID_COLUMNS: readonly GridColumnInput[] = Object.freeze(['name']);

/** #139: what a column measures when nobody names a width for it. A Grid column is fixed-width by
 *  default — it keeps the width it was given, and the column set scrolls the pane once it outgrows
 *  it (#126). `flex` is the opt-out: a column that names one shares the leftover room instead. */
export const DEFAULT_COLUMN_WIDTH_PX = 120;

export interface ResolveColumnsBind {
  timeZone: string;
  locale?: Intl.LocalesArgument;
  /** #139: the fallback width for a column that names neither `width` nor `flex`. `GanttShell`
   *  reads it off `--fg-column-width`; a caller that omits it gets `DEFAULT_COLUMN_WIDTH_PX`. */
  defaultColumnWidth?: number;
}

function defaultCompareStored(locale: Intl.LocalesArgument): (a: unknown, b: unknown) => number {
  const collator = new Intl.Collator(locale);
  return (a, b) => {
    if (Object.is(a, b)) return 0;
    if (a === undefined || a === null) return 1;
    if (b === undefined || b === null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
    return 0;
  };
}

function columnFrom(
  item: GridColumnInput,
  field: Field,
  defaultWidthPx: number,
): Omit<ResolvedColumn, 'format'> {
  const input: GridColumn = typeof item === 'string' ? { field: item } : item;
  const defaults = field.column;
  if (defaults === undefined) throw new FieldNotColumnableError(String(field.key));
  const column: Omit<ResolvedColumn, 'format'> = {
    field: field.key,
    header: input.header ?? defaults.header ?? String(field.key),
    align: input.align ?? defaults.align ?? 'start',
    // S5.7, D-S5-18: default `true`, same merge order (this Gantt's own column, then the Field's
    // own `column` default) every other key here already follows.
    resizable: input.resizable ?? defaults.resizable ?? true,
    movable: input.movable ?? defaults.movable ?? true,
  };
  // #139: a Grid column is fixed-width by default. `flex` is the one opt-out — a column that names
  // one shares the pane's leftover room instead, and never falls back to `defaultWidthPx`.
  // `width` and `flex` answer one question between them, so they merge as a pair rather than key by
  // key: a column that sizes itself at all replaces the Field's sizing whole. Otherwise a Gantt
  // asking for `flex: 1` would silently lose to a `width` the Field happened to declare — `width`
  // and `flex` are each exclusive on their own object (#249), but two individually-legal objects
  // still recombine into an illegal pair on a key-by-key merge.
  const sizedHere = input.width !== undefined || input.flex !== undefined;
  const flex = sizedHere ? input.flex : defaults.flex;
  const authoredWidth = sizedHere ? input.width : defaults.width;
  const candidates = {
    width: flex === undefined ? (authoredWidth ?? defaultWidthPx) : authoredWidth,
    flex,
    // S5.7, D-S5-17: per-column `cellRenderer` comes only from this Gantt's own column —
    // `Field.column` (`defaults`) cannot carry one (`model/field.ts`'s narrower default set).
    cellRenderer: input.cellRenderer,
    tooltip: input.tooltip ?? defaults.tooltip,
    // S5.8 honours this; S5.7 only carries it through resolution (spec's own I11 exemption —
    // `editable` shares `GridColumn`'s type ahead of the step that reads it).
    editable: input.editable ?? defaults.editable,
  };
  return {
    ...column,
    ...pickDefined(candidates, ['width', 'flex', 'cellRenderer', 'tooltip', 'editable']),
  };
}

/** S5.7, D-S5-18: `GridColumnsChange`'s payload shape — the public `GridColumn`, not the layout-only
 *  `ResolvedColumn`. It drops `format`, a render-time closure with no public type of its own that
 *  never reaches a consumer. Everything else a consumer might have authored rides straight through,
 *  under the name it was authored with (D-S5-37, #194). */
export function toGridColumn(column: ResolvedColumn): GridColumn {
  const shared = {
    field: column.field,
    header: column.header,
    align: column.align,
    ...pickDefined(column, ['cellRenderer', 'editable', 'resizable', 'movable', 'tooltip']),
  };
  // `GridColumn`'s sizing pair is exclusive (#249), so `shared` cannot carry `width` or `flex` — one
  // literal per branch is the only construction `tsc` checks against that union; a single `out`
  // mutated by two `if`s would still compile carrying both keys (a probe confirmed this).
  if (column.width !== undefined) return { ...shared, width: column.width };
  if (column.flex !== undefined) return { ...shared, flex: column.flex };
  return shared;
}

function lookupOf(dataset: Pick<Dataset, 'field'>): FieldLookup {
  return { get: (key) => dataset.field(key) };
}

/** Call: `resolveColumns(gantt.gridColumns, { get: (key) => dataset.field(key) }, { timeZone, locale })`.
 *  What comes back is what the Gantt paints. A column that declares `hidden: true` (D-S5-34) stays
 *  out of the result. It therefore stays out of everything downstream — the frame, the pane width,
 *  `ctx.view.resolvedColumns()`, and the two column gestures. It is still resolved first, so a
 *  misspelled field or a Field with no `column` throws where the column is declared. A mistake that
 *  waited for the column to be shown would report the wrong moment. */
export function resolveColumns(
  gridColumns: readonly GridColumnInput[],
  lookup: FieldLookup,
  bind: ResolveColumnsBind,
): readonly ResolvedColumn[] {
  const fieldCtx = createFieldContext(lookup, bind.timeZone);
  const locale: Intl.LocalesArgument = bind.locale ?? [];
  const formatCtx: FormatContext = { ...fieldCtx, locale };
  const defaultWidthPx = bind.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH_PX;

  return gridColumns.flatMap((item) => {
    const key = typeof item === 'string' ? item : item.field;
    const field = lookup.get(key);
    if (field === undefined) throw new UnknownFieldError(String(key), 'gridColumns');
    const column = columnFrom(item, field, defaultWidthPx);
    if (isHidden(item)) return [];
    return [
      {
        ...column,
        format: (entry: Entry) => {
          const value = formatCtx.read(entry, field.key);
          if (field.formatValue) return field.formatValue(value, formatCtx, entry);
          return stringifyPrimitive(value);
        },
      },
    ];
  });
}

/** D-S5-34. A bare field key is never hidden — only the object form carries the key. */
export function isHidden(item: GridColumnInput): boolean {
  return typeof item !== 'string' && item.hidden === true;
}

/** Call: `resolveFieldCompares(lookup, fields, { timeZone, locale })` — every declared Field, not the Grid. */
export function resolveFieldCompares(
  lookup: FieldLookup,
  fields: readonly Field[],
  bind: ResolveColumnsBind,
): readonly FieldCompare[] {
  const fieldCtx = createFieldContext(lookup, bind.timeZone);
  const locale: Intl.LocalesArgument = bind.locale ?? [];
  const fallback = defaultCompareStored(locale);
  return fields.map((field) => ({
    key: field.key,
    readStored: (entry: Entry) => fieldCtx.read(entry, field.key),
    compareStored: (a, b) => {
      if (field.compare === undefined) return fallback(a, b);
      return field.compare(a, b);
    },
  }));
}

/** Call: `resolveGanttFields(dataset, gantt.gridColumns, { timeZone, locale })`.
 *  One locale. Two lists leave: visible columns, and every Field's compare (D-S4-13). */
export function resolveGanttFields(
  dataset: Pick<Dataset, 'field' | 'fields' | 'timeZone'>,
  gridColumns: readonly GridColumnInput[],
  bind: ResolveColumnsBind,
): { columns: readonly ResolvedColumn[]; fieldCompares: readonly FieldCompare[] } {
  const lookup = lookupOf(dataset);
  return {
    columns: resolveColumns(gridColumns, lookup, bind),
    fieldCompares: resolveFieldCompares(lookup, dataset.fields.all, bind),
  };
}
