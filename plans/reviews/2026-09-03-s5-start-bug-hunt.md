# Bug hunt — `s5-start` (2026-09-03)

**Scope:** `origin/s5-start...HEAD` (23 commits: S5.4 QC, S5.5 tooltips/context menu, S5.6 decorations/time façade, S5.7 grid chrome). Working tree also has uncommitted `src/view/styles.ts` (center-align + resizer `::after` paint). Automated Bugbot on branch changes reported **no bugs**. This hunt is a manual pass over the shipped behaviour.

**Method:** read the new modules against I2 (two Gantts independent), D-S5-13/14 (menu = commands for the target), D-S5-17/18 (column chrome), and the plugin host seams. Tests were checked for coverage of the same paths, not treated as proof that the path is correct.

## Verdict

The slice gates and unit tests are green for the cases they cover. Three defects will show up as soon as a consumer mounts a Gantt that is not the whole page, right-clicks a bar that is not the current selection, or uses two Gantts. Fix the first two before S5.8 (inline edit builds on the same popup + command path).

## Findings (highest first)

### B1 — `contextMenu()` hijacks every `contextmenu` on the document

**Severity:** high · **I2 / library-first** · `src/extensions/features/context-menu.ts:118-123`

```ts
const onContextMenu = (event: MouseEvent): void => {
  event.preventDefault();
  const bar = event.target instanceof Node ? barUnder(event.target) : undefined;
  openAt(new DOMRect(event.clientX, event.clientY, 0, 0), bar ? entryForBar(bar) : undefined);
};
document.addEventListener('contextmenu', onContextMenu);
```

`preventDefault()` always runs. There is no check that the event target sits in this Gantt. Effects:

1. A right-click anywhere on the page (page chrome, a second widget, a form) opens this Gantt's menu and blocks the browser menu.
2. Two Gantts both listen. One right-click opens two menus and both call `preventDefault()`.

`tooltips()` has the same document-level `pointerover`/`pointerout`/`focusin`/`focusout` with no host check (`tooltips.ts:115-118`). Hovering a `.fg-bar` that belongs to Gantt B can still run Gantt A's handler. If the two Datasets share an entry id, A's overlay opens a tooltip anchored on B's bar.

**Root cause:** `PluginContext` has no host-element seam (`overlay.contains` / `gantt` has no public container). S5.5's own rule is to close that gap in `src/api/`, not to listen on `document`. `Overlay.elementForEntry` already scopes to one container (I2); the pointer path does not.

**Tests:** `context-menu.test.ts` and `tooltips.test.ts` both document the document-level choice and never mount a second Gantt or click outside the container.

**Fix direction:** listen on this Gantt's container (close an API gap if the plugin cannot reach it), and only `preventDefault` when the target is inside that container.

---

### B2 — Menu click runs the command for the selection, not for the right-clicked bar

**Severity:** high · **D-S5-14** · `src/extensions/features/context-menu.ts:63-93` + `src/extensions/commands.ts:46-51`

`openAt` builds `available` with `commandCtx.entry` from the bar under the pointer. The click handler then calls `ctx.commands.run(command)`, which rebuilds context from `#buildCommandContext()` (first selected entry, or none).

Sequence:

1. Selection is empty (or a different row).
2. Right-click a bar. The menu shows `freegantt.collapseRow` because `when` saw that bar's entry.
3. Click the item. `run()` sees no `ctx.entry` (or the selected one). `when` declines. Silent no-op.

D-S5-14's point is that the mouse path and the keyboard path are one command. Here the menu *lists* commands for the pointer target and *runs* commands for the selection. `Shift+F10` is consistent with `run()` (both use selection). The pointer path is not.

**Tests:** "Enter/click runs the command" registers a command with no `when` and also sets `gantt.selection` to the same entry. It never clicks `collapseRow` after a right-click with an empty selection.

**Fix direction:** `runResolved(id, commandCtx)` with the same context `available()` used, or set selection to the right-clicked entry before `run()` (and emit the usual `beforeSelectionChange` pair if that is the product rule).

---

### B3 — "Focused header column" never clears when the pointer leaves the header

**Severity:** medium · **D-S5-18 / D-S5-26** · `src/interaction/column-gestures.ts:138-146` · `src/view/gantt-shell.ts:1077-1087`

A plain click on a header cell stores `#focusedHeaderColumnKey`. `onPointerUp` only runs on the header pane. A later click on a bar, a body cell, or empty timeline does not clear it.

`#buildCommandContext` still attaches `{ target: { kind: 'header', columnKey } }`. `Shift+ArrowLeft` / `Shift+ArrowRight` then resize that column while the user is working on the timeline. The spec ties those chords to a focused header cell. JS focus is not the same as "the header still has the user's attention."

`isResizable` / `isMovable` default to `true` when the key is missing (`column-chrome.ts:91-97`). After `gridColumns` drops that field, the stale key still enables the chords; `resizeStep` then commits a no-op width change through the event pair.

**Fix direction:** clear the focused column on a pointerdown that is not a header cell (same posture as selection-on-empty-timeline), and treat an unknown key as not capable (`?? false`).

---

### B4 — Default tooltip omits "any column marked `tooltip: true`"

**Severity:** medium · **D-S5-13** · `src/extensions/features/tooltips.ts:32-42`

The decision text: the popup shows the entry's name, its dates, **and any column marked `tooltip: true`**. `defaultContent` only paints name + dates. `GridColumn` has no `tooltip` flag. No test asks for extra columns in the tooltip.

Either the flag is missing from `GridColumn` (and from the default body), or D-S5-13 over-promises. Record the choice in the S5.5 spec; do not leave the sentence as a silent skip.

---

### B5 — `Field.column` can carry `cellRenderer`

**Severity:** medium · **D-S5-17** · `src/model/field.ts:70` · `src/view/grid-columns.ts:46-49`

D-S5-17: `cellRenderer` sits on the Gantt's column, never on the Field. `data/` must not hold a renderer. `Field.column` is `Omit<GridColumn, 'field'>`, so a Field declaration may include `cellRenderer`. `columnFrom` merges `defaults.cellRenderer` from that Field.

A consumer who puts a function on `dataset.fields` gets a working paint path that the decision forbids, and a serialization hole if anything ever writes `Field.column` to JSON.

**Fix direction:** keep `cellRenderer` off `Field.column` (a narrower column-defaults type), and stop merging it in `columnFrom`.

---

### B6 — Column pointer stream has no `pointercancel` (and never leaves the header pane before arm)

**Severity:** low–medium · **D-S5-18** · `src/interaction/column-gestures.ts:156-159`

Listeners: `pointerdown` / `pointermove` / `pointerup` on the header pane, Escape on the container. `createPointerGesture` documents `pointercancel` as a cancel path, but nothing feeds it (entry gestures have the same gap).

Until the 4px threshold, there is no pointer capture. A resize that leaves the short header before arm never sees `pointermove`. After arm, capture on the header pane is enough.

A browser cancel (touch interrupt, drag into a scrollbar) can leave `grabbedKind` set and a live width/drop preview stuck until the next successful gesture or Escape.

**Fix direction:** listen for `pointercancel` and call the same cancel path as Escape; consider capturing earlier or listening on `document` for move/up once a pointer is down, matching how far a resize actually travels.

---

### B7 — `headerRenderer` is still a silent no-op

**Severity:** low · **I11 / plans/02 §4 level 3** · carried from S5.4

S5.7 paints per-column `cellRenderer`. `headerRenderer` / `resolveHeader` still have no production paint caller. A consumer who sets `gantt.headerRenderer` sees no change. Not new in this hunt; still open on this branch.

---

## What looks solid

- One `beforeGridColumnsChange` → apply → `gridColumnsChange` sequence in `ColumnChrome.commit`, shared by assignment, resize, and reorder. Veto skips `apply` and the gesture cancel path restores paint.
- Per-column `cellRenderer` beats Gantt-wide, which beats a plugin slot (`gantt-shell.ts` `resolveCellRenderer`).
- Resize floor, `resizable: false` / `movable: false` refuse, keyboard chords share `commitWidth` / `commitReorder`.
- Popup Escape now opts into `captureInEditable: true`, and the shell has a document-capture keymap fallback when the target is outside the container (the S5.4 QC F1 pair).
- Decoration memo key includes provider identity and a scale sample (`972f8e7`). `Dataset.time` binds the zone once.

## Test gaps that hid B1–B3

| Missing case | Would have caught |
|---|---|
| Right-click outside the Gantt container; assert the browser event is not cancelled and no menu opens | B1 |
| Two Gantts with `contextMenu()` / `tooltips()`; interact with one | B1 / I2 |
| Right-click bar A with empty selection; click `freegantt.collapseRow` | B2 |
| Click a header, then click a bar, then `Shift+ArrowRight` | B3 |
| Default tooltip includes a `tooltip: true` column (or a spec note that the flag is deferred) | B4 |

## Summary

- **7 findings.** 2 high (B1 document hijack, B2 menu `run()` context), 3 medium (B3 sticky header focus, B4 tooltip columns, B5 Field-held renderer), 2 low/carried (B6 pointercancel, B7 headerRenderer).
- **Worst:** B1. A shipped plugin takes over the page context menu. That is not something a unit test on a lone attached container will show.
- Bugbot: 0 findings. Do not treat that as a clean branch.
