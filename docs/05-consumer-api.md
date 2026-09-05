# FreeGantt — Consumer API (index)

This file points app authors at the consumer surface. It does not replace the spec.

## Start here

| Document | What it is |
| --- | --- |
| [`README.md`](../README.md) | Quick start, dates/ids, and the API as it ships on the current branch |
| [`plans/02-public-api.md`](../plans/02-public-api.md) | Full public API design — events, errors, serialization, customization ladder |
| [`CONTEXT.md`](../CONTEXT.md) | Glossary — one word per concept (Entry, Field, Row, Row source, Rollup, …) |
| [`etc/freegantt.api.md`](../etc/freegantt.api.md) | Generated TypeScript export list (api-extractor) |

## S4 surface (hierarchy and rows)

These landed in slice S4. Details and examples live in `plans/02-public-api.md` §4.2–§4.3.

### Dataset

- `fields`, `fieldTypes`, `aggregators` — declare consumer Fields beside core's
- `rollUpKinds` — which Entry kinds get rolled-up parent values (default `['group']`; `'none'` opts out)
- `hierarchy: { autoGroup: true }` — promote a `'span'` parent to `'group'` when it gains its first child
- `entries.fieldValue(id, key)`, `dataset.field(key)`, `dataset.fields.all`
- `toJSON()` / `fromJSON(doc, { aggregators })` — `schema: 2`

### Gantt

- `gridColumns` — which columnable Fields this view shows, in order
- Grid columns are fixed-width (#139). A column takes its own `width`, else its Field's `column.width`, else `--fg-column-width` (120). When the set outgrows the grid pane, the pane scrolls horizontally to reach it (#126). Give a column `flex` instead to have it share the pane's leftover room.
- The grid pane never sits wider than its columns (#139) — a splitter drag stops at the last column's edge, and a `gridWidth` past it is capped to it. Narrower is always fine: the columns overflow and the pane scrolls. A `flex` column lifts the cap, since it has no fixed edge.
- `gridWidth: 'fitColumns'` (#157) — size the grid pane to its columns and keep it there, instead of hand-computing the number. Live, and re-measured whenever the columns change. Reads back in px. A Splitter drag ends it; a `flex` column leaves nothing to fit, so the pane keeps the width it has.
- `rowSource` — what rows are (`entries` tree, `group` by value, or `custom` resolve)
- `rowSource.filter` / `groupBy` / `sort.compare` — receive the bound Field reader as a second argument (`(entry, fields) => fields.read(entry, 'team')`). One-argument callbacks still work.
- `rowSource.heightMode: 'pack'` — stack overlaps into lanes (on the row source, not on `Gantt`)
- `collapsed`, `collapse()`, `expand()`, `toggleCollapse()`, `collapseAll()`, `expandAll()` — per-Gantt view state
- Events: `beforeCollapseChange` / `collapseChange`
- `scroll` — pass the same `ScrollModel` into a new `Gantt` after `destroy()` so pane scroll survives remount (for example after `Dataset.fromJSON`). Do not copy `scrollTop` off the pane.

### Naming

Use **`gantt.rowSource`**, not `gantt.rows`. The config names the source; `Row` is the derived track
(`CONTEXT.md`). `rowSource` matches the `RowSource` type and leaves `rows` free for a future getter
of resolved rows.

### Published types (S4)

`Field`, `FieldSource`, `FieldType`, `FieldKey`, `FieldContext`, `Aggregator`, `GridColumn`, `GridColumnInput`,
`RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `CustomRow`,
`RowSourceCommon`, `RowHeightMode`, `CustomRowInput`,
`CollapseChange`, `DatasetHierarchy`, `SerializedField`, and the S4 error classes re-exported from
`freegantt`.

## Harness demos

Run `pnpm dev` and open `http://localhost:5173`.

| Page | Demonstrates |
| --- | --- |
| `harness/index.html` | Tree `rowSource`, `gridColumns`, field rollup (`cost`), live row-source switch, selection, timeline toolbar |
| `harness/data.html` | Transactions, undo/redo, `change` events |

Internal module maps under `harness/docs/` are for maintainers and may lag the current slice.
