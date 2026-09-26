// api/ — the typed way to write a Grid column. A column object is plain data, and `gridColumns`
// takes it as is; this helper only adds the type of the column's own Field value.

import type {
  ColumnRenderer,
  CoreFieldValues,
  FieldValue,
  GridColumn,
  GridColumnBase,
  GridColumnSizing,
} from '../model/index.js';
import type { Dataset } from './dataset.js';

/** A Field key the helper can type: a core key, or a key the Dataset's `TProps` declares. */
export type TypedGridColumnKey<TProps> = keyof CoreFieldValues | (keyof TProps & string);

/** What `columnHelper.column(field, options)` takes after the key: every Grid column option, with
 *  `columnRenderer` typed from that key's own Field value. */
export type TypedGridColumnOptions<TValue> = Omit<GridColumnBase, 'field' | 'columnRenderer'> & {
  columnRenderer?: ColumnRenderer<TValue>;
} & GridColumnSizing;

/** Writes Grid columns for one Dataset. Each column's `columnRenderer` reads `fieldValue` as the
 *  type `entry.read(field)` answers for that key. */
export interface GridColumnHelper<TProps> {
  /** Call: `columnHelper.column('start', { width: 72, columnRenderer: ({ fieldValue }) => … })`.
   *  Returns the same column object as `{ field: 'start', width: 72, columnRenderer }`. */
  column<K extends TypedGridColumnKey<TProps>>(
    field: K,
    options?: TypedGridColumnOptions<Exclude<FieldValue<TProps, K>, undefined>>,
  ): GridColumn;
}

/**
 * Call: `const columnHelper = createGridColumnHelper(dataset)`.
 *
 * Optional. A plain column object is a complete Grid column, and its renderer reads `fieldValue`
 * as `unknown`. The helper reads `TProps` from the Dataset, so `columnHelper.column(key, …)` types
 * that renderer from the key — an inline renderer included, with no annotation. The Dataset is not
 * read at runtime.
 *
 * ```ts
 * const columnHelper = createGridColumnHelper(dataset);
 * const gridColumns = [
 *   'name',
 *   columnHelper.column('start', { columnRenderer: ({ fieldValue }) => … }), // Instant | undefined
 *   { field: 'scheduling:progress', columnRenderer: meter() },                // a plugin key: plain object
 * ];
 * ```
 */
export function createGridColumnHelper<TProps>(dataset: Dataset<TProps>): GridColumnHelper<TProps>;
// The one public signature above takes the Dataset for its `TProps`. The body never reads it.
export function createGridColumnHelper<TProps>(): GridColumnHelper<TProps> {
  return {
    column(field, options) {
      // The grid calls a renderer with `entry.read(field)`, the value this key's own type names. So a
      // renderer typed on that key widens to the stored `unknown` renderer with no loss. `field` goes
      // last, so an untyped caller's own `options.field` never replaces the key.
      return { ...options, field } as GridColumn;
    },
  };
}
