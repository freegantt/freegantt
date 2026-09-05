# #157 — No way to say "size the grid pane to its columns"

**Reported:** 2026-09-04. **Closed:** 2026-09-04.

## What the issue actually was

#139 made a Grid column fixed-width and capped the grid pane at its columns' own right edge. Between
them, the pane's correct width became a fact the library computes — `totalColumnWidth`
(`src/layout/column.ts`) — and a consumer had no way to ask for it.

Our own first consumer showed it. `harness/index.html` authored `--fg-grid-pane-width: 720px`
against columns that end at 700: a number hand-tuned to one column set. Over-shooting *did* land on
a fitted pane, because #139's ceiling brought 720 down to 700 — but that is a hack. You have to
guess a number large enough; "large enough" is a property of a column set you may not control; guess
too small and you silently get a scrolling pane instead, with nothing to say which you asked for.

## Resolution

**`gridWidth` takes `'fitColumns'`** (`GridWidth = number | 'fitColumns'`, exported from `api/`). The
pane sits on the columns' edge and keeps sitting there.

- **It is a standing instruction, not a width read once.** `GanttShell` remembers it
  (`#gridWidthFollowsColumns`) and re-measures on every `#bindColumns` — a column resize, a hidden
  column, a plugin-registered column all move the pane, *in both directions*. #139's ceiling only
  ever brought a pane in; a fitted pane widens with a widened set too.
- **The getter still answers in px.** The consumer asked how wide the pane is, and that is a
  question about pixels. `'fitColumns'` is a way in, not a value to read back — the same shape
  `range: 'fitDataset'` already has.
- **One commit sequence.** Fitting goes through `#commitGridWidth`, so it fires
  `beforeGridWidthChange`/`gridWidthChange` and is vetoable exactly like a drag or an assignment.
- **A Splitter drag ends it.** A completed drag is the consumer changing their mind, so the pane
  keeps the width it was dragged to and stops following. A vetoed drag commits nothing, so it ends
  nothing either — `#commitGridWidth` now returns whether the change survived, which is how the
  drag's own commit knows.
- **`PaneLayout` is untouched.** It holds the px the shell resolves to and still knows nothing about
  columns ("structure and one number only", its file header). Only `GanttShell` sees both.

## A `flex` column: fall back, don't reject

A column set holding a `flex` column has no fitted width — a flex column has no width until the pane
lays it out, which is the point of asking to flex. This is the same fact #139's ceiling already
reads off `totalColumnWidth`'s `undefined`.

The issue asked whether to reject the combination as unrepresentable. It cannot be rejected in the
type system — a column set is runtime data, and a plugin can register a flex column into a set that
had none — so rejecting means throwing at runtime, over a combination that is legal a moment later.
Instead, **the pane keeps the width it has**: `--fg-grid-pane-width` at construction, or whatever it
was fitted to before. The instruction stands; the moment the set names an edge again, the pane sits
on it. Same rule as #139's ceiling, which simply does not apply when there is no edge.

## What did not change

- `minGridWidth` (#127) still floors the Splitter drag and nothing else. A fitted width is a written
  width: nothing floors it.
- `layout/column.ts` is untouched. `totalColumnWidth` already answered the question; `GanttShell`
  now reads it for a second purpose (`#columnsWidth`).
- No new CSS property, no new event, no new config tree. `--fg-grid-pane-width` stays the level-1
  way to author a px width.

## Tests

`src/api/gantt.test.ts` (#157, beside #139's own):

- `'fitColumns'` opens the pane on the columns' edge, before the first paint (240 + 120 = 360, a
  number the test's consumer never says).
- It widens with the columns, not only in — `['name'] → ['name','start'] → ['name']` walks
  240 → 360 → 240.
- Assigning it live fires `gridWidthChange` with `{ from: 200, to: 360 }`.
- A Splitter drag ends it: after dragging to 300, a wider column set leaves the pane at 300.
- A vetoed drag leaves it standing: the next column change still re-fits.
- A `flex` column leaves the pane at its authored width.

`e2e/pane-resize.spec.ts`: the harness pane matches its own painted column headers, and re-measures
when the Budget column is toggled at runtime — a real column set changing under a pane that was
never told a number.

## Acceptance

`harness/index.html` no longer authors `--fg-grid-pane-width`, and `harness/main.ts` says
`gridWidth: 'fitColumns'` instead.
