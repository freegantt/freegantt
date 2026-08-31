// view/ — binds this Gantt's locale to declared Fields (D-S4-13). layout/ never learns FieldSource.

import type { Entry, Field, FieldKey, FormatContext, GridColumn, GridColumnInput } from '../model/index.js';
import { FieldNotColumnableError, UnknownFieldError } from '../model/index.js';
import { createFieldContext } from '../data/fields/field-access.js';
import type { FieldLookup } from '../data/fields/field-access.js';
import type { ResolvedField } from '../data/fields/field-registry.js';
import type { FieldCompare, ResolvedColumn } from '../layout/index.js';

export const DEFAULT_GRID_COLUMNS: readonly GridColumnInput[] = Object.freeze(['name']);

export interface ResolveColumnsBind {
  timeZone: string;
  locale?: Intl.LocalesArgument;
}

function lookupFrom(fields: readonly Field[]): FieldLookup {
  const map = new Map<string, ResolvedField>();
  for (const field of fields) map.set(String(field.key), field as ResolvedField);
  return { get: (key) => map.get(String(key)) };
}

function asColumn(input: GridColumnInput): GridColumn {
  return typeof input === 'string' ? { field: input } : input;
}

function formatUnknown(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function defaultCompareStored(locale: Intl.LocalesArgument): (a: unknown, b: unknown) => number {
  const collator = new Intl.Collator(locale);
  return (a, b) => {
    if (Object.is(a, b)) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
    return 0;
  };
}

function mergeColumn(input: GridColumn, field: Field): Omit<GridColumn, 'field'> & { field: FieldKey } {
  const defaults = field.column;
  if (defaults === undefined) throw new FieldNotColumnableError(String(field.key));
  const merged: Omit<GridColumn, 'field'> & { field: FieldKey } = {
    field: field.key,
    header: input.header ?? defaults.header ?? String(field.key),
    align: input.align ?? defaults.align ?? 'start',
  };
  const width = input.width ?? defaults.width;
  if (width !== undefined) merged.width = width;
  const flex = input.flex ?? defaults.flex;
  if (flex !== undefined) merged.flex = flex;
  return merged;
}

/** Call: `resolveColumns(gantt.gridColumns, dataset.fields.all, { timeZone, locale })`. */
export function resolveColumns(
  gridColumns: readonly GridColumnInput[],
  fields: readonly Field[],
  bind: ResolveColumnsBind,
): readonly ResolvedColumn[] {
  const lookup = lookupFrom(fields);
  const fieldCtx = createFieldContext(lookup, bind.timeZone);
  const locale: Intl.LocalesArgument = bind.locale ?? [];
  const formatCtx: FormatContext = { ...fieldCtx, locale };

  return gridColumns.map((item) => {
    const input = asColumn(item);
    const field = lookup.get(input.field);
    if (field === undefined) throw new UnknownFieldError(String(input.field));
    const merged = mergeColumn(input, field);
    const column: ResolvedColumn = {
      key: merged.field,
      header: merged.header ?? String(merged.field),
      align: merged.align ?? 'start',
      format: (entry: Entry) => {
        const value = formatCtx.read(entry, field.key);
        if (field.formatValue) return field.formatValue(value, formatCtx);
        return formatUnknown(value);
      },
    };
    if (merged.width !== undefined) column.width = merged.width;
    if (merged.flex !== undefined) column.flex = merged.flex;
    return column;
  });
}

/** Call: `resolveFieldCompares(dataset.fields.all, { locale })` — every declared Field, not the Grid. */
export function resolveFieldCompares(
  fields: readonly Field[],
  bind: { locale?: Intl.LocalesArgument },
): readonly FieldCompare[] {
  const locale: Intl.LocalesArgument = bind.locale ?? [];
  const fallback = defaultCompareStored(locale);
  return fields.map((field) => ({
    key: field.key,
    compareStored: (a, b) => {
      if (field.compare === undefined) return fallback(a, b);
      return field.compare(a, b);
    },
  }));
}
