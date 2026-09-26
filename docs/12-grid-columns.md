# Grid columns

A Grid column is one vertical slice of the Grid pane. It names a Field and carries presentation
only: header, width, alignment, and the cell's renderer. The Gantt's `gridColumns` option lists the
columns in display order.

This page shows the two ways to write a column: a plain column object, and the column helper. See
[`docs/05-consumer-api.md`](05-consumer-api.md) for the rest of the Gantt options, and
[`CONTEXT.md`](../CONTEXT.md) for the terms.

Every example below typechecks against the built package types on each CI run
(`scripts/check-doc-examples.mjs`).

<!-- doc-example-setup
interface SiteProps { owner?: string; cost: number }
declare const dataset: import('freegantt').Dataset<SiteProps>;
declare const container: HTMLElement;
declare const gantt: import('freegantt').Gantt<SiteProps>;
-->

## A column is a plain object

A column is plain data. A bare Field key is the short form. It takes its header and width from the
Field's own `column` defaults.

```ts
import { Gantt } from 'freegantt';

new Gantt({
  container,
  dataset,
  gridColumns: ['name', 'start', { field: 'cost', header: 'Budget', width: 96, align: 'end' }],
});
```

A plain object is a complete column. You never need the helper to show a column.

## A renderer reads the value before formatting

A `columnRenderer` paints the column's cells. It receives two readings of one cell:

- `value` is the string the grid paints, from the Field's own `formatValue`.
- `fieldValue` is the same Field value before formatting — what `entry.read(field)` answers.

In a plain column object, `fieldValue` is `unknown`. A column object cannot type its renderer from
its own `field` key, so a renderer that reads `fieldValue` must check or cast the value.

```ts
import { Gantt } from 'freegantt';

new Gantt({
  container,
  dataset,
  gridColumns: [
    // Reads `value` only, so no type is necessary.
    { field: 'owner', columnRenderer: ({ value }) => ({ text: value.toUpperCase() }) },
    // `fieldValue` is `unknown` here, so the renderer checks it.
    {
      field: 'cost',
      columnRenderer: ({ fieldValue }) => ({ text: typeof fieldValue === 'number' ? fieldValue.toFixed(2) : '' }),
    },
  ],
});
```

## The column helper types the renderer

`createGridColumnHelper(dataset)` reads the props type from your Dataset. Its `column(field, options)`
types the renderer from that key: `fieldValue` has the type `entry.read(field)` answers. This
includes an inline renderer, with no annotation.

```ts
import { Gantt, createGridColumnHelper } from 'freegantt';

const columnHelper = createGridColumnHelper(dataset);

new Gantt({
  container,
  dataset,
  gridColumns: [
    'name',
    // fieldValue: Instant | undefined
    columnHelper.column('start', {
      columnRenderer: ({ fieldValue }) => ({ text: fieldValue?.toString() ?? '' }),
    }),
    // fieldValue: number | undefined
    columnHelper.column('cost', {
      header: 'Budget',
      align: 'end',
      columnRenderer: ({ fieldValue }) => ({ text: fieldValue?.toFixed(2) ?? '' }),
    }),
  ],
});
```

The helper is optional. It adds types only. `column()` returns the same plain object you can write
by hand, so the two forms mix freely in one `gridColumns` list:

```ts
import { createGridColumnHelper } from 'freegantt';

const columnHelper = createGridColumnHelper(dataset);

const typed = columnHelper.column('cost', { header: 'Budget', width: 96 });

// OR

const plain = { field: 'cost', header: 'Budget', width: 96 };
```

`fieldValue` is `undefined` on a row with no Entry, such as a group row, and on an Entry with no
value for the Field. So its type always includes `undefined`.

### A named renderer

A renderer that you write once and use in more than one place takes `ColumnRendererContext<TValue>`.
Give it to `columnHelper.column()`. A plain column object does not accept it, because a plain
object's renderer reads `unknown`.

```ts
import { createGridColumnHelper, formatDate, type ColumnRendererContext, type Instant } from 'freegantt';

const columnHelper = createGridColumnHelper(dataset);

function dateCell({ fieldValue }: ColumnRendererContext<Instant>) {
  return { text: fieldValue === undefined ? '' : formatDate(dataset.timeZone, fieldValue) };
}

const gridColumns = [
  columnHelper.column('start', { columnRenderer: dateCell }),
  columnHelper.column('end', { columnRenderer: dateCell }),
];
```

A renderer for any value, such as the shipped `meter()` and `image()`, fits every key.

### What the helper checks

- A renderer for the wrong type does not compile. A `ColumnRendererContext<number>` renderer on the
  `owner` key, a `string`, is a type error.
- A key that is neither a core key nor a key of your props type does not compile.
- `width` and `flex` together do not compile, the same as in a plain object.

## When the helper gives no benefit

The helper types a key only when it knows the key's type. Use a plain column object for a key it
does not know:

- **A plugin's own Field**, such as `scheduling:progress`. Your props type does not name it.
- **A computed Field that your props type does not name.** A `compute` Field adds a key, but not a
  type.
- **An untyped Dataset.** With no props type, only the core keys have a type.
- **A renderer that reads only `value`.** It gets nothing from the type.

```ts
import { meter } from 'freegantt';

const gridColumns = [{ field: 'scheduling:progress', header: 'Done', columnRenderer: meter() }];
```

## Reading columns back

`gantt.gridColumns` and the `gridColumnsChange` event give back plain column objects. A renderer
reads `fieldValue` as `unknown` there. So you can read the list, change it, and write it back:

```ts
gantt.gridColumns = [...gantt.gridColumns, 'cost'];
```

## Why a helper, and not a typed column object

A typed column object needs one type per key, in one union: a `start` column, a `cost` column, and
so on. That union also needs a case for a key it does not know, such as a plugin's own key. A
known key such as `start` then matches two cases. TypeScript does not type an inline renderer when
two cases match, so the renderer's parameter becomes an implicit `any`.

A function call does not have this problem. The key is an argument, so TypeScript knows it before
it reads the renderer. Other libraries use the same approach:

- TanStack Table: `createColumnHelper()` and `columnHelper.accessor(key, …)`. Its column definitions
  are plain objects too, and each helper call has a plain-object equivalent.
- Vite: `defineConfig({ … })`. A plain exported object is also a valid config. The helper only adds
  types.
