# A full-width layer that scrolls with the rows, and a row's box

Status: accepted, including `onRowLayout`. Additive. No breaking change.

## Need

A consumer app opens an HTML panel under one row. The panel is as wide as the whole Gantt.
The rows below it move down. A bar-less spacer entry plus the live `rowHeight` callback already moves the rows.
Two things are missing: a layer of the right width that follows vertical scroll, and a public getter for a row's top.

## Names

- `ctx.view.rowSpanLayer: MountLayer`. It spans the grid pane and the timeline pane. "Span" means the full width.
- `ctx.view.rowBox(id: EntryId | string): { top: number; height: number } | undefined`.
  Call site: `ctx.view.rowBox(task.id)` reads "the row box of this task". It sits beside `rowLayer`.
  The `string` form takes a row id. An entry id gives the row that holds the entry.
- `ctx.view.onRowLayout(callback): Disposer`. See "Re-position".

## Layer mechanics

DOM:

    .fg-container
      .fg-grid-pane  .fg-timeline-pane  .fg-overlay
      .fg-row-span-clip      new, sibling of the overlay
        .fg-row-span-layer   new, receives the transform

- `.fg-row-span-clip` is absolute. Its left and right edges are the container's edges.
  Its top is the header height (the `--fg-band-height` expression both panes already share).
  Its bottom is the container's bottom. It has `overflow: hidden` and `pointer-events: none`.
  The clip hides content that scrolled up under the sticky header.
- `.fg-row-span-layer` is inside the clip. It gets `transform: translateY(-visible.y)`.
  The renderer writes that transform in the same `sync()` line that moves `gridLayer`. One transform per frame. No scroll listener.
- The layer takes no horizontal transform, so a timeline pan leaves it still.
- Mounted content gets `pointer-events: auto` through a rule on `.fg-row-span-layer > *`. Everywhere else the pointer passes through to the panes.
- Stacking: above the panes and below the overlay, so a popup still covers a panel.
- Lifetime: same as `overlay` and `rowLayer`. The pane layout builds it. The shell tears it down with the container.
- `bounds` is the layer's client rect, transform included. It is the same meaning as `rowLayer.bounds`.
- `onResize` shares the one container `ResizeObserver`.
- Width: the vertical scrollbar of the timeline pane stays visible. The clip ends at the scrollbar edge when one shows.

## Row box

- `top` is a row's content-y. It equals the row-height index `topAt(index)`. That is the position inside `rowSpanLayer`.
- `height` is `heightAt(index)`.
- It answers from the layout index (`rowTop`, `rowHeightAt`), not the DOM. A virtualised row off screen still answers.
- `undefined` when the entry is hidden by a collapsed parent (`rowIndexForEntry` returns -1) or unknown.

## Re-position

I found no existing hook that fires when row tops change.
`navigationChange` fires on viewport moves. It does not fire for a row height change, a collapse, or a data edit.
A plugin could poll `rowBox` every frame, but that costs a frame loop in every consumer.

Smallest proposal: `ctx.view.onRowLayout(callback): Disposer`.
- The shell calls it after a frame that changed any row top or height. The frame already computes the row-height index, so the shell compares a cheap stamp.
- It does not fire for pure scroll. The layer follows scroll by itself.
- The callback runs after paint, so `rowBox` is already fresh.

Alternative: no new hook, and the consumer calls `rowBox` from `navigationChange` and its own data events. I do not recommend it. It misses the collapse case.

## Keyboard

Findings from the code:
- The keymap listens on the container. The layer sits inside the container, so a key in a mounted input bubbles to the keymap.
- `isEditableTarget` returns true for `INPUT`, `TEXTAREA` and contenteditable. The keymap then skips every binding without `captureInEditable`. Inputs and text areas are covered.
- A mounted `button` or `select` is not covered. Space or Enter on a button could trigger a Gantt command, and `preventDefault` would block the button.
- Proposal: the keymap and the pointer gestures also ignore any event whose target is inside `.fg-row-span-clip`, and `.fg-overlay` content stays as it is. This is one rule: "content a plugin mounted owns its own keys". I will test it with an input, a button and a select.
- Tab order: the clip comes after the timeline pane in DOM order, so Tab reaches it after the grid and timeline. "After the focused row" would need the content to sit inside the row, which the row reconciler forbids. I propose DOM order after the panes, and the consumer may focus its panel when it opens.

## Tests

- Unit: `rowBox` for a virtualised row, a collapsed row and an unknown id.
- Unit: the layer transform equals `-visible.y` after a vertical scroll.
- E2E: vertical follow, still on horizontal pan, clipped under the header, input keystrokes leave the selection alone, a button key press does the same.
- Harness: a click on a task opens a details panel under its row and pushes the rows below. Shots in light and dark.

## Docs

- `docs/06-plugin-authoring.md`: the layer table and an "inline panel under a row" recipe.
- `CHANGELOG.md`: Added.

## Questions that were answered

1. Do you accept the three names: `rowSpanLayer`, `rowBox`, `onRowLayout`?
2. Do you accept the new `onRowLayout` hook, as the one addition beyond the two approved getters?
3. Do you accept the "mounted content owns its own keys" rule for the keymap, to cover buttons and selects?
