# S5.7 handoff — in progress, checkpointed under a token budget stop

**Worktree:** `.claude/worktrees/agent-a09ec6af898841e8e` · **Branch:** `worktree-agent-a09ec6af898841e8e`
**Base:** fast-forwarded onto `s5-start` at `cc086d5` (S5.5 done) before starting — the worktree
had originally been branched stale, before S5.1–S5.5 landed on `s5-start`. Fixed with
`git merge s5-start --ff-only` as the first step. Verify a fresh agent's worktree is not stale the
same way before doing anything else — check `git merge-base --is-ancestor s5-start HEAD` or
`git log --oneline -5` against `s5-start`'s own tip.

This document is a checkpoint, written because the coordinator flagged the task as over budget
(450k+ tokens) and asked me to stop coding and hand off cleanly. The implementation is **largely
complete and all green** at the current commit — what remains is small and mechanical (see
"Remaining work" below), not open design work.

## TODO checklist status (`s5.7-grid-chrome.md` §4)

I did not tick these boxes in the spec file as I went (the task instructions said to — I missed
this; **do it now, retroactively, matching the state below**, one edit, in the file itself):

- [x] `GridColumn` gains `cellRenderer`, `resizable`, `movable` (and `editable`, honoured in S5.8) — **done**
- [x] `beforeGridColumnsChange` / `gridColumnsChange` in one commit sequence in `GanttShell` — **done**
- [x] `interaction/column-gestures.ts` resize + reorder over the shared pointer controller — **done**
- [x] Resizer grip, drop indicator, tokens, parts — **done**
- [x] Keyboard chords for move and resize, over the same commands — **done**
- [~] Exports; `pnpm api-report` — **exports done, `pnpm api-report` NOT run yet** (see below)
- [x] **Visible:** the harness hierarchy page resizes and reorders columns, and a status line prints
      each `gridColumnsChange` — **done**

## Remaining work, in order, for a fresh agent

1. **Run `pnpm api-report` and commit the `etc/freegantt.api.md` diff.** `pnpm build` was run
   successfully (last output in my transcript, all green — dist built, `.d.ts` generated) but I was
   stopped before running `pnpm api-report` itself. New public surface that should appear in the
   diff: `GridColumn.cellRenderer`/`.editable`/`.resizable`/`.movable`, `ColumnCellRenderer`,
   `ColumnCellRendererContext`, `GridColumnsChange`, `beforeGridColumnsChange`/`gridColumnsChange`
   on `GanttEventMap`. Everything needed is already exported from `src/api/index.ts` — this is
   purely "run the report generator and commit its output," no source change expected. If the
   report tool surfaces something unexpected, that is real signal — read it before committing.
2. **Tick the TODO boxes in `plans/s5-extensibility-and-editing/s5.7-grid-chrome.md` §4** to match
   the state above (all done except the api-report sub-item, which ticks once step 1 lands).
3. **Add an "API gaps found" section to `s5.7-grid-chrome.md`** (model it on
   `handoff-s5.6.md`'s "Two API gaps found and closed" section, which the original task brief
   pointed at as the template). Three real gaps I found and resolved — write these up there:
   - **`GridColumn.cellRenderer` can't literally be `layout/`'s `CellRenderer` type.** The spec's
     own code sample (`s5.7-grid-chrome.md` D-S5-17) writes `cellRenderer?: CellRenderer;` on
     `GridColumn` in `model/field.ts`, but `CellRenderer`/`CellRendererContext` live in
     `layout/renderer.ts` because their context names `FrameRow`/`ResolvedColumn` — and `model/`
     may import nothing (`model-is-leaf`, dependency-cruiser). Resolved by giving `GridColumn` a
     narrower `ColumnCellRenderer` type (`model/field.ts`, new): `(ctx: { entry?: Entry; value:
     string }) => ElementDescription | undefined` — no `row`/`column` args, since a per-column
     renderer already knows its own column from the closure that wrote it (the D-S5-17 sample
     itself only reads `value`/`entry`, which is what led me here). `view/gantt-shell.ts`'s
     `resolveCellRenderer` binding adapts the full `CellRendererContext` down to this shape when a
     column has its own `cellRenderer`.
   - **`GridColumnsChange` payload type is `GridColumn[]`, not `ResolvedColumn[]`, despite D-S5-18's
     own prose saying "resolved columns."** `ResolvedColumn` carries `format` (a render-time
     closure, layout-only, no public type) and uses `.key` not `.field`. The README's own example —
     `gantt.on('gridColumnsChange', ({ to }) => save(to.map((c) => c.field)))` — only works if `to`
     entries have `.field`, which only `GridColumn` has. Resolved by adding
     `view/grid-columns.ts#toGridColumn(column: ResolvedColumn): GridColumn`, which
     `GanttShell#commitGridColumns` uses to build the event payload — "resolved" describes where the
     *values* came from (Field defaults merged in), not the literal TypeScript type of the payload.
   - **Header cells cannot get real `tabIndex`/DOM focus yet.** I first wired "focused header cell"
     tracking via real `focusin`/`focusout` (`node.tabIndex = 0` on every header cell) — this broke
     the existing, locked S1.10 invariant test
     (`gantt-shell.test.ts` > `a11y roles and the one honest tab stop (S1.10, D-S1.10-5)`), which
     asserts the container is the *only* `tabindex="0"` node in the whole render tree until S5.11's
     roving-tabindex pattern lands. Fixed by tracking a JS-only "focused column" instead: a plain
     click on a header cell (no drag armed) calls the new
     `ColumnGestureContext.setFocusedColumn(columnKey | undefined)`
     (`interaction/column-gestures.ts`'s `onPointerUp` fallback, mirroring `entry-gestures.ts`'s own
     `if (drag.up(e)) return;` click path) — no DOM focus moves, `CommandContext.target` reads the
     JS state. This is the same posture a bar click already takes for *selection* (JS state, not
     DOM focus). **Read this before touching header-cell focus again** — the temptation to add
     `tabIndex` will recur and will break that test again.
4. **Update `plans/s5-extensibility-and-editing/README.md`'s step-map row for S5.7** — per the task
   brief: tick S5.7's own row/TODO references, do **not** touch the top-line "Status" summary
   sentence (S5.6 may finish before or after this branch merges; the human reconciles that line).
5. **Playwright e2e (`pnpm test:e2e`) — not attempted.** I did not try to stand up the harness dev
   server in this sandbox at all; say so plainly in the final report rather than claiming a result,
   per the task brief's own instruction. A fresh agent with more budget could reasonably attempt
   `e2e/grid-chrome.spec.ts` (new) covering a real drag in a real browser, but this was never
   started — no partial file exists.
6. **Final report** — once 1–5 land, write the completion report the original task brief asked for
   (files changed, verification results, API gaps, deviations, harness note) and tell the user the
   worktree path + branch name to merge.

## File-by-file status (everything touched, `git diff --stat s5-start...HEAD`)

All of these are **done** (compiling, linted, tested green at the current commit) unless noted:

| File | Status |
|---|---|
| `src/model/field.ts` | done — `ColumnCellRenderer`/`ColumnCellRendererContext` (new), `GridColumn.cellRenderer/editable/resizable/movable` |
| `src/model/index.ts` | done — exports the two new model types |
| `src/layout/column.ts` | done — `ResolvedColumn.cellRenderer/resizable/movable/editable` (all optional), `FrameColumn.resizable/movable` |
| `src/layout/frame.ts` | done — `columnsForFrame` carries `resizable`/`movable` into `FrameColumn` |
| `src/render/backend.ts` | done — `InteractionState.columnResizePreview`/`columnReorderPreview` |
| `src/render/dom/index.ts` | done — resizer grip + label wrapper in header cell, `data-resizable-off`/`data-movable-off`, resize-preview paint (header cell + every mounted body cell for that column, via `[data-field=…]`), reorder paint (`data-drop="before"/"after"` on the target header cell, `null` → last column; plus the grabbed cell's own `translateX` + `data-dragging`, #140) |
| `src/render/dom/index.test.ts` | done — one new test: per-column `cellRenderer` beats the library default for its own column, sibling column unaffected |
| `src/view/column-gesture-context.ts` | done — new file, `ColumnGestureContext` interface (mirrors `entry-gesture-context.ts`'s own split) |
| `src/view/grid-columns.ts` | done — `columnFrom` merges the four new keys; new `toGridColumn` (resolved → public shape) |
| `src/view/grid-columns.test.ts` | done — merge tests for the four keys, `toGridColumn` test |
| `src/view/event-bus.ts` | done — `GridColumnsChange`, `beforeGridColumnsChange`/`gridColumnsChange` on `GanttEventMap` |
| `src/view/index.ts` | done — re-exports `GridColumnsChange`, `ColumnGestureContext`, `ColumnGestureCommit` |
| `src/view/core-commands.ts` | done — `CoreCommandPorts.isColumnResizable/isColumnMovable/resizeColumnStep/moveColumnStep`, four new registered commands (`freegantt.resizeColumnWider/Narrower`, `.moveColumnRight/Left`) gated on `ctx.target.kind === 'header'` |
| `src/view/core-commands.test.ts` | done — mock ports extended; new describe block for the four column commands |
| `src/view/gantt-shell.ts` | done — the bulk of the work: `AttachColumnGestures` DI type (mirrors `AttachEntryGestures`), `#commitGridColumns`/`#commitColumnWidth`/`#commitColumnReorder` (the one commit sequence), `#previewColumnWidth`/`#previewColumnReorder` (paint-only), `#isColumnResizable`/`#isColumnMovable`/`#minColumnWidthPx`/`#currentColumnWidthPx`, `#resizeColumnStep`/`#moveColumnStep`, `#focusedHeaderColumnKey` + `#buildCommandContext`'s `target`, per-column `resolveCellRenderer` precedence, default keybindings (`Shift+ArrowRight/Left`, `Alt+ArrowRight/Left`) in `#registerCoreCommands` |
| `src/interaction/column-gestures.ts` | done — new file, `attachColumnGestures`: one `createPointerGesture` instance, resize (grip) vs. reorder (cell body) split by what pointerdown hit, plain-click fallback sets the focused column |
| `src/interaction/column-gestures.test.ts` | done — new file, 10 tests: resize commit, veto restore, floor clamp, Escape cancel, resizable:false refusal, reorder drop (mid-list and end-of-list), movable:false refusal, click-to-focus (hit and miss) |
| `src/interaction/index.ts` | done — exports `attachColumnGestures`, `ColumnGestureContext` |
| `src/api/gantt.ts` | done — wires `columnGestures: attachColumnGestures` into the `GanttShell` options (same DI pattern as `entryGestures`/`keyboardEditing`); `buildCommandContext`'s existing `...parts` spread already carries `target` through with no change needed there |
| `src/api/gantt.test.ts` | done — 5 new tests: assignment fires the pair with resolved-`GridColumn` payloads, veto leaves `gridColumns` untouched, a **real** resize drag on the rendered grip fires the same pair, `resizable:false`/`movable:false` refuse the drag end-to-end |
| `src/api/index.ts` | done — re-exports `GridColumnsChange`, `ColumnCellRenderer`, `ColumnCellRendererContext` |
| `src/view/styles.ts` | done — `.fg-column-resizer` (grip, `--fg-column-resizer-hit` widens only the hit target), `.fg-col-header[data-drop]` (drop indicator), `.fg-col-header[data-dragging]` (the grabbed cell during a reorder, #140), `[data-resizable-off]`/`[data-movable-off]`, `.fg-col-header-label`; `--fg-column-min-width` documented as JS-read-only (same posture `--fg-splitter-width` already takes — no stylesheet rule needs it) |
| `harness/hierarchy.ts` | done — `#grid-columns-readout` status line + a `logLine` entry on every `gridColumnsChange`, wired in `bindGantt()` (survives the dataset-import remount path too) |
| `harness/hierarchy.html` | done — the readout `<p>`, its CSS, and a one-line addition to the page's intro `<p>` mentioning the drag/keyboard affordances |

## Verification at the current commit (`30e07c1`)

Run in this order, all from the worktree root:

- `pnpm typecheck` — **pass**, clean.
- `pnpm lint` — **pass**, clean.
- `pnpm boundaries` — **pass**, "no dependency violations found (239 modules, 995 dependencies cruised)".
- `pnpm test:node` — **pass**, 51 files / 484 tests.
- `pnpm test:dom` — **pass**, 36 files / 461 tests. (One test — `render/dom/index.test.ts`'s
  existing "a barRenderer that throws falls back to the default label" — prints a `console.error`
  to stderr; that is expected, dev-mode-logged behavior the test itself asserts on, not a failure.)
- `pnpm guards` — **pass** (run right before this checkpoint, one commit earlier — not re-run at
  `30e07c1` itself, but nothing in that last commit touches anything guards check: only
  `harness/hierarchy.ts`/`.html` and `src/api/index.ts` re-exports changed). Re-run it as your first
  step to be sure.
- `pnpm build` — **pass**, ran successfully (harness + library + `.d.ts` all built clean). This was
  the last command I ran before the stop — its output is in my transcript, not re-verified fresh at
  `30e07c1`, but nothing has changed source-wise since.
- `pnpm api-report` — **not run**. This is the one real gap; see "Remaining work" #1.
- `pnpm test:e2e` — **not attempted at all**, in either direction. Say this plainly in the final
  report; do not claim a result.

## Things worth knowing that aren't in the code comments

- **The worktree was stale at the start** (see the header above) — branched before S5.1–S5.5 landed
  on `s5-start`. A `git merge s5-start --ff-only` fixed it with zero conflicts since the worktree
  branch had no commits of its own yet. If a fresh agent inherits this same worktree, it is already
  fixed (current branch tip is a normal descendant of `s5-start`'s `cc086d5`).
- **Resize/reorder needs no per-Gantt harness wiring beyond the status line.** `GridColumn.resizable`
  and `.movable` default `true`, and `api/gantt.ts` always wires `attachColumnGestures` — so once a
  Gantt is constructed normally, dragging a column edge or a header just works. The harness change
  is *only* the visible status line the TODO's "Visible" line asks for.
- **The floor for resize (`--fg-column-min-width`, default 40) deliberately follows `minGridWidth`'s
  own pattern exactly**: read live via `readPixelProperty` off the container, applied once, at the
  point a raw px delta becomes a width (both in the pointer-drag commit and in the keyboard step).
  It does **not** appear in the base stylesheet (`styles.ts`) — same posture `--fg-splitter-width`/
  `--fg-grid-pane-width` already take: JS-read-only, no CSS rule needs the value itself.
- **`no-flow-layout-rows` (dependency-cruiser custom eslint rule, `eslint/rules/no-flow-layout-rows.cjs`)
  bans `getBoundingClientRect()`/`offsetHeight`/`clientHeight` anywhere under `src/view/**` or
  `src/render/dom/**`, but *not* `src/interaction/**`.** I hit this once (`gantt-shell.ts`'s keyboard
  resize-step needed the current on-screen width of a possibly-flex column) — fixed by using
  `getComputedStyle(cell).width` there instead (not banned), while `interaction/column-gestures.ts`
  freely uses `getBoundingClientRect()` for its own pointer-drag geometry (exempt file scope). If you
  need DOM measurement inside `view/` or `render/dom/`, `getComputedStyle` is the escape valve this
  rule leaves open.
- **`api/gantt.test.ts`'s real end-to-end drag tests rely on happy-dom's zero-filled
  `getBoundingClientRect()`.** happy-dom (this repo's DOM test environment, not jsdom) returns an
  all-zero rect for every real element with no explicit override. The resize test's math accounts
  for this (`grabbedStartWidthPx` starts at 0, so a commit width is exactly the drag's own `dx`,
  floored). The reorder-refusal test doesn't depend on rects at all. If you add more real end-to-end
  drag tests, either lean on the same zero-rect fact (simplest) or stub
  `element.getBoundingClientRect` per node the way
  `src/interaction/column-gestures.test.ts`'s own `makeHeaderPane` helper does.
- **`pointer-gesture.ts`'s `setPointerCapture` gets called on the *pane* argument, not the specific
  child element a pointerdown landed on.** I initially stubbed `setPointerCapture` on the grip/header
  cell in `api/gantt.test.ts` and got `pane.setPointerCapture is not a function` — the pane here is
  `.fg-grid-header` (the whole header row), not the individual cell. Stub it there.
