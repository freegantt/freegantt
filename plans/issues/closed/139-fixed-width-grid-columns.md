# #139 — Grid columns flex-resize instead of supporting fixed widths with overflow scroll

**Reported:** 2026-09-04. **Closed:** 2026-09-04.

## What the issue actually was

`GridColumn.width` already existed, and #126 (D-S1.8-13) already gave the grid pane its own
horizontal scroller for the case where fixed columns outgrow it. The mechanism was complete. What
was missing was the **default**: a column that named no width flexed, so the pane always squeezed
its columns to fit and the scroller had nothing to reach. The reporter's own words: "There is
currently also no way to trigger the need to scroll. Left pane will always resize so no scroll is
needed even if the columns become totally unreadable and non-sensical."

That is not how a planning grid behaves anywhere else. A column has a width, it keeps that width,
and the column set scrolls when it outgrows the pane. So the fix is to flip the default, not to add
a second way to say "fixed".

## Resolution

**A Grid column is fixed-width by default.** `resolveColumns` (`src/view/grid-columns.ts`) fills in
a width for every column that names neither `width` nor `flex`, so `gridContentWidth` sees a real
sum and `#126`'s scroller becomes reachable out of the box.

Three sources answer "how wide", most specific first:

1. This Gantt's own column — `{ field: 'cost', width: 200 }`.
2. The Field's `column.width` — where a Field's natural width lives. The core Fields now declare
   theirs (`src/data/fields/core-fields.ts`): Name `240` (it carries the tree indent and twisty on
   top of its text), Start/End `120`, Kind/Duration `100`.
3. `--fg-column-width` (fallback `120`), read off the container through `pixel-property.ts` by
   `ColumnChrome.defaultWidthPx()` — the same level-1 knob `--fg-column-min-width` beside it
   already is. Read on every rebind, never per render.

**`flex` is the one opt-out.** A column that names a `flex` shares whatever room the fixed columns
beside it leave, and never falls back to the default width — today's behaviour, now explicit.

**`width` and `flex` merge as a pair, not key by key.** Every other key in `columnFrom` merges this
Gantt's column over the Field's `column` default independently. These two answer one question
between them, so a column that sizes itself at all replaces the Field's sizing whole. Otherwise
`{ field: 'name', flex: 1 }` would silently lose to the `width: 240` the `name` Field declares.
Where one source names both, the width wins — `.fg-col-header[data-fixed]` already wins in the
stylesheet, so reporting a flex the paint cannot honour would only lie to `gridColumnsChange`.

## What did not change

- No new `GanttOptions` key. The default width is a level-1 `--fg-*` token, the same category
  `--fg-grid-pane-width` and `--fg-column-min-width` sit in.
- No new public type. `GridColumn.width`/`flex` are the same two keys they were.
- `layout/column.ts`'s `gridContentWidth` is untouched: fixed columns sum, flex columns contribute
  nothing, the pane widens only when the sum passes it. It simply has real widths to add up now.
- The pane leaves empty space when its columns do not fill it, rather than stretching the last one.
  A consumer who wants the fill behaviour asks the last column to `flex`.

## Tests

- `src/view/grid-columns.test.ts` — the default applies; `bind.defaultColumnWidth` replaces it; a
  `flex` column keeps no width; an authored width beats both.
- `src/api/gantt.test.ts` ("Gantt grid columns are fixed-width by default (#139)") — header and row
  cells paint the same pixel widths and carry `data-fixed`; the pane's `--fg-grid-content-width`
  passes `gridWidth`; a `flex` column still shares the leftover room.
- `e2e/grid-scroll.spec.ts` — in a real browser, four columns written as bare field names overflow
  the 220px pane and scroll to reach Duration, and a `flex` column fills the pane exactly instead.
  `harness/grid-scroll.html` carries both fixtures beside #126's hand-sized one.
