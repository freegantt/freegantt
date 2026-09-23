# FreeGantt — Consumer API (index)

This file points app authors at the consumer surface. It does not replace the spec.

## Start here

| Document | What it is |
| --- | --- |
| [`README.md`](../README.md) | Quick start, dates/ids, and the API as it ships on the current branch |
| [`CONTEXT.md`](../CONTEXT.md) | Glossary — one word per concept (Entry, Field, Row, Row source, Rollup, …) |
| [`etc/freegantt.api.md`](../etc/freegantt.api.md) | Generated TypeScript export list (api-extractor); the same public surface is also browsable as generated API docs on the Docusaurus site (`pnpm docs`) |
| [`docs/09-integration-pitfalls.md`](09-integration-pitfalls.md) | Traps real integrators hit — theme and an application's `dark` class, the zoom notification, `overscan`, the row click |
| [`docs/06-plugin-authoring.md`](06-plugin-authoring.md) | Plugin authoring guide — `definePlugin`, the two halves, every registration seam |
| [`docs/07-row-source-updates.md`](07-row-source-updates.md) | Change one row-source setting and keep the rest — toolbar controls that do not fight each other |

## What a Gantt shows

A Gantt is two panes on one set of rows. The **Grid pane** is on the left. The **Timeline pane** is on the right.

A **Grid column** is one vertical slice of the Grid pane. It names a Field and carries presentation only — header, width, order. Declaring a Field does not put it on the Grid pane. A Grid column on the Gantt does that.

The Timeline pane paints **Bars** on a time scale. A bar is paint, not identity (`CONTEXT.md`). Item is a retired word for Bar. The time axis is not a column. The whole view is a **Gantt**. Chart is a retired word.

## Undo, redo, and the `change` event

Undo and redo are ordinary commits. `dataset.undo()` and `dataset.redo()` return nothing; what
they did arrives on `dataset.on('change')` — the same channel a user edit uses — tagged
`origin: 'undo'` or `'redo'`.

```ts
import { Dataset, fieldRowsOf } from 'freegantt';

const dataset = new Dataset<{ cost: number }>({
  timeZone: 'Europe/Warsaw',
  entries: [ /* … */ ],
  fields: [{ key: 'cost', type: 'number' }], // `cost` is written below, so it is declared here
});

dataset.on('beforeChange', ({ changeSet }) => {
  if (changeSet.origin === 'undo' && !confirm('Undo this step?')) return false;
  // a refused undo throws MutationCancelledError and leaves history where it was
});

dataset.on('change', ({ changeSet }) => {
  if (changeSet.origin === 'user') return; // a user edit, not an undo/redo
  const verb = changeSet.origin === 'undo' ? 'undid' : 'redid';

  for (const row of fieldRowsOf(changeSet)) {
    // row: { store: 'entries', id, field, from, to }
    // on undo, from/to is inverted: `from` is the edit being reverted, `to` the restored value
    console.log(`${verb} ${String(row.id)} ${row.field}: ${row.from} -> ${row.to}`);
  }
  // changeSet.added / changeSet.removed carry the entries an undo restored or a redo removed
});

dataset.entries.update('t1', { cost: 200 }); // origin 'user'
dataset.undo(); // origin 'undo', cost 200 -> 500
dataset.redo(); // origin 'redo', cost 500 -> 200
```

`canUndo` / `canRedo` are already post-step inside a `change` handler — the History's cursor
moves on the `change` the undo commit emits, never on the `undo()` call — so one
handler can drive a toolbar:

<!-- doc-example-setup
// What the examples below stand on: a Dataset, a Gantt, and the app's own toolbar.
declare const dataset: import('freegantt').Dataset;
declare const gantt: import('freegantt').Gantt;
declare const undoButton: HTMLButtonElement;
declare const redoButton: HTMLButtonElement;
declare const isDark: boolean;
-->

```ts
dataset.on('change', () => {
  undoButton.disabled = !dataset.canUndo;
  redoButton.disabled = !dataset.canRedo;
});
```

`updated` also carries plugin-store rows (`store: 'plugin:…'`, whole-value, no `field` key).
`fieldRowsOf(changeSet)` filters to Field rows. `dataset.replay(changeSet)` is the write path
the built-in undo/redo use, published so a consumer can write their own History against
`on('change')`, `invertChangeSet`, `fieldRowsOf`, and `replay` alone.

## Hierarchy and rows

### Dataset

- `fields`, `fieldTypes`, `aggregators` — declare consumer Fields beside core's. `{ key: 'due', type: 'date' }` names a shipped type with no local `fieldTypes` entry. Core Fields name those types (`name` is `text`, `start`/`end` are `date`, `duration` is `duration`). `currency({ code: 'EUR' })` is a factory, not a seeded name: `{ key: 'cost', type: currency({ code: 'EUR' }), rollUp: 'sum' }`. Field key `start` cannot be redeclared (`IllegalCoreFieldOverrideError` except `editable`); type name `date` is replaceable at construction via `fieldTypes`, and `registerType('date')` still throws.
- A parent rolls up because it has children. An Entry carries no stored classification, so nothing opts a row in or out by kind.
- `entries.get(id)?.read(key)`, `dataset.field(key)`, `dataset.fields.all` — `read` is the one value door
- `plugins` — a plugin with a `data` half installs here

### Gantt

- `gridColumns` — which Fields this view shows, in order. `columnRenderer` stays on the column. `meter()` and `image()` are the shipped column renderers; default alt is the Field's formatted value, and `{ alt: 'Logo' }` is a static override for a column that is one picture. Store a URL; let `formatValue` return the caption so alt (and tooltip) speak the name, not the URL.
- Grid columns are fixed-width. A column takes its own `width`, else its Field's `column.width`, else `--fg-column-width` (120). When the set outgrows the grid pane, the pane scrolls horizontally to reach it. Give a column `flex` instead to have it share the pane's leftover room.
- The grid pane never sits wider than its columns — a splitter drag stops at the last column's edge, and a `gridWidth` past it is capped to it. Narrower is always fine: the columns overflow and the pane scrolls. A `flex` column lifts the cap, since it has no fixed edge.
- `gridWidth: 'fitColumns'` — size the grid pane to its columns and keep it there, instead of hand-computing the number. Live, and re-measured whenever the columns change. Reads back in px. A Splitter drag ends it; a `flex` column leaves nothing to fit, so the pane keeps the width it has.
- `gridResizable: false` — lock the grid pane: the splitter no longer drags and shows no resize cursor, and no column paints a resizer grip, whatever its own `resizable` says. Default `true`. Live. Locks the gesture, not the value — `gantt.gridWidth = 240` and `gantt.gridColumns = […]` still write. Neither `beforeGridWidthChange` nor `beforeGridColumnsChange` fires for a gesture that can no longer arm — this is what keeps a `gridWidth: 'fitColumns'` pane from turning into a fixed px width on a stray drag.
- `fit` — how dense the time axis is. `'pane'` (default) fills the measured pane with the whole range; `'preset'` uses the showing preset's own density and ignores the pane; `{ unit: 'day', widthPx: 14 }` paints one day 14px wide; a bare `number` is pixels per millisecond, what `zoomTo`/`zoomBy` write. Live, on a `Gantt` and on a `TimeScaleModel` alike.
- Reach for the `{ unit, widthPx }` form whenever the sentence you have is "a day tile is 14 pixels". Writing that as a number means `14 / 86_400_000`, which claims every day is 24 hours — false in any zone that observes DST, and false for a month or a year in every zone. The library resolves the real length through the dataset's zone, so you never own that arithmetic. `increment` defaults to 1: `{ unit: 'week', increment: 2, widthPx: 90 }` reads "a fortnight is 90 pixels". One density spans the whole scale, so the stated width lands on the unit at the range start and each later unit follows its own calendar length — a 23-hour day paints narrower than the days beside it. The preset's `minTickWidthPx` floor still applies, so a page that wants tiles below the shipped floor brings its own preset (`harness/e2e/bar-label-fit.ts`).
- `overscan` — the culling buffer around the visible window: `verticalRows` whole rows above and below, `horizontalPx` px left and right. Live. Default `{ verticalRows: 2, horizontalPx: 128 }`.
- `rowSource` — what rows are (`entries` tree, `group` by value, or `custom` resolve). Reads back
  resolved, and one setting changes by spreading that value — see
  [Row source updates](07-row-source-updates.md).
- `rowSource.filter` and `groupBy` take the `Entry` alone, and read a value off it: `(entry) => entry.read('team') === 'Blue'`. `sort.compare(a, b, fields)` compares two *values* of `sort.field`, not two Entries, and its third argument is a `FieldContext` — the dataset `timeZone`, for a comparer that needs the zone to read a date.
- `collapsed`, `collapse()`, `expand()`, `toggleCollapse()`, `collapseAll()`, `expandAll()`, `collapseStateOf(id)` — per-Gantt view state; `collapseStateOf` reads back `'collapsed' | 'expanded' | 'leaf' | undefined`
- Events: `beforeCollapseChange` / `collapseChange`
- `scroll` — pass the same `ScrollAxis` instances (`{ x?, y? }`) into a new `Gantt` after `destroy()` so pane scroll survives remount (for example after the app rebuilds the Dataset). Do not copy `scrollTop` off the pane.
- `variants` — the rules this Gantt paints rows with; `bar()`, `summary()`, `diamond()` are core's own shipped looks.
- `gantt.variantFor(entry): ResolvedVariant` — the whole variant this Gantt resolved for one row, never `entry.variant`: an Entry belongs to a `Dataset`, a variant resolves per Gantt, and two Gantts on one Dataset may answer differently for the same row.

### Naming

Use **`gantt.rowSource`**, not `gantt.rows`. The config names the source; `Row` is the derived track
(`CONTEXT.md`). `rowSource` matches the `RowSource` type and leaves `rows` free for a future getter
of resolved rows.

### Published types

`Field`, `FieldType`, `FieldTypeName`, `FieldKey`, `FieldContext`, `Aggregator`, `GridColumn`, `GridColumnInput`,
`RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `CustomRow`,
`RowSourceCommon`, `CustomRowInput`,
`CollapseChange`, `DatasetHierarchy`, and the hierarchy error classes re-exported from `freegantt`.
`FieldSource` retired (a Field key is the whole address) and `SerializedField` retired (the
library holds no save format) — neither is in `etc/freegantt.api.md`.

## Plugins

FreeGantt takes one plugin type with two halves. `definePlugin`
writes it: a `data` half installs on a `Dataset`, a `view`-only half installs on
a `Gantt`. Install at construction (`plugins: [...]`), or reconfigure a `Gantt`'s
plugins live (`gantt.plugins = [...]`). The [plugin authoring guide](06-plugin-authoring.md) covers both
halves, every registration seam, the registration gate, disposal, `requires`, and
the errors an author meets. `tooltips()`, `contextMenu()`, and
`inlineEditing()` are the three built-in plugins that ship with the package,
none of them loaded unless a consumer installs them.

## Styling and theming

Restyling a Gantt — the `--fg-*` token reference, the Parts list, `data-flag`, and how to style
date lines and the Today line — moved to its own page:
[Styling and theming](10-styling-and-theming.md).

## Harness demos

Run `pnpm dev` and open `http://localhost:5173`.

| Page | Demonstrates |
| --- | --- |
| `harness/generic.html` | Tree `rowSource`, `gridColumns`, field rollup (`cost`), live row-source switch, selection, timeline toolbar |
| `harness/e2e/data.html` | Transactions, undo/redo, `change` events |

The [Architecture pages](architecture/index.md) map what the code does now — the files, the classes,
the call order. Run `pnpm docs` to read them, and everything else, as the site. The API reference is
generated from TSDoc comments via TypeDoc, so it never drifts from the source.
