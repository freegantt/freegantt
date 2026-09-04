// view/ — binds this Gantt's locale to declared Fields (D-S4-13). layout/ never learns FieldSource.

import type { Dataset, Entry, Field, FormatContext, GridColumn, GridColumnInput } from '../model/index.js';
import { FieldNotColumnableError, UnknownFieldError } from '../model/index.js';
import { createFieldContext } from '../data/fields/field-access.js';
import { stringifyPrimitive } from '../data/fields/core-fields.js';
import type { FieldLookup } from '../model/index.js';
import type { FieldCompare, ResolvedColumn } from '../layout/index.js';
import { pickDefined } from '../layout/index.js';

export const DEFAULT_GRID_COLUMNS: readonly GridColumnInput[] = Object.freeze(['name']);

export interface ResolveColumnsBind {
  timeZone: string;
  locale?: Intl.LocalesArgument;
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

function columnFrom(item: GridColumnInput, field: Field): Omit<ResolvedColumn, 'format'> {
  const input: GridColumn = typeof item === 'string' ? { field: item } : item;
  const defaults = field.column;
  if (defaults === undefined) throw new FieldNotColumnableError(String(field.key));
  const column: Omit<ResolvedColumn, 'format'> = {
    key: field.key,
    header: input.header ?? defaults.header ?? String(field.key),
    align: input.align ?? defaults.align ?? 'start',
    // S5.7, D-S5-18: default `true`, same merge order (this Gantt's own column, then the Field's
    // own `column` default) every other key here already follows.
    resizable: input.resizable ?? defaults.resizable ?? true,
    movable: input.movable ?? defaults.movable ?? true,
  };
  const candidates = {
    width: input.width ?? defaults.width,
    flex: input.flex ?? defaults.flex,
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
 *  `ResolvedColumn` (`format` is a render-time closure with no public type of its own, and never
 *  reaches a consumer). `key` becomes `field`; everything else a consumer might have authored rides
 *  straight through. */
export function toGridColumn(column: ResolvedColumn): GridColumn {
  const out: GridColumn = { field: column.key, header: column.header, align: column.align };
  if (column.width !== undefined) out.width = column.width;
  if (column.flex !== undefined) out.flex = column.flex;
  if (column.cellRenderer !== undefined) out.cellRenderer = column.cellRenderer;
  if (column.editable !== undefined) out.editable = column.editable;
  if (column.resizable !== undefined) out.resizable = column.resizable;
  if (column.movable !== undefined) out.movable = column.movable;
  if (column.tooltip !== undefined) out.tooltip = column.tooltip;
  return out;
}

function lookupOf(dataset: Pick<Dataset, 'field'>): FieldLookup {
  return { get: (key) => dataset.field(key) };
}

/** Call: `resolveColumns(gantt.gridColumns, { get: (key) => dataset.field(key) }, { timeZone, locale })`. */
export function resolveColumns(
  gridColumns: readonly GridColumnInput[],
  lookup: FieldLookup,
  bind: ResolveColumnsBind,
): readonly ResolvedColumn[] {
  const fieldCtx = createFieldContext(lookup, bind.timeZone);
  const locale: Intl.LocalesArgument = bind.locale ?? [];
  const formatCtx: FormatContext = { ...fieldCtx, locale };

  return gridColumns.map((item) => {
    const key = typeof item === 'string' ? item : item.field;
    const field = lookup.get(key);
    if (field === undefined) throw new UnknownFieldError(String(key));
    const column = columnFrom(item, field);
    return {
      ...column,
      format: (entry: Entry) => {
        const value = formatCtx.read(entry, field.key);
        if (field.formatValue) return field.formatValue(value, formatCtx);
        return stringifyPrimitive(value);
      },
    };
  });
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
