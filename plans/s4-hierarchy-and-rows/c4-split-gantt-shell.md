# C4 — Split the rest of `GanttShell`

**Origin:** `plans/reviews/2026-08-31-s4-implement-glm.html` candidate 4, plus the S4.11 close-out note on shell width.
**When:** before S5 plugin wiring grows `view/gantt-shell.ts`. Not an S4 gate.
**Not this plan:** the staged commit pipeline. That work is S7 (`plans/03` §S7). Construction already uses `writeCommittedFieldRows`.

## 1. What already landed

| Job | Where it lives now |
|---|---|
| Today-landing policy (`panToToday` margin) | `view/today-landing.ts` — call `panToTodayLine(viewport, at, align, todayLineMarginTicks)` |
| Column lists and Field compares | `view/grid-columns.ts` — call `resolveGanttFields(dataset, gridColumns, bind)` |
| Collapse set | `view/collapse-state.ts` — owned by `TreeCollapse` |
| Tree collapse (keyboard, collapse-all, ancestor expand) | `view/tree-collapse.ts` — call `this.#treeCollapse.handleArrow('right')`, `expandAncestorsOf(entryId)`, `gantt.collapseAll()` / `gantt.expandAll()` |
| Twisty click | `view/attach-row-twisty.ts` — call `attachRowTwisty(panes.grid, { toggleCollapse })` |
| Gesture commit math | `view/gesture-pipeline.ts` |
| Dataset `change` subscription | `view/dataset-change-subscription.ts` |

`GanttShell` still owns construction, live config, `reveal()` geometry, selection, render input, and `#phase`.

Do not name a new module `GanttViewport`. `layout/` already owns `Viewport`. A search for `viewport` must keep one meaning.

## 2. Problem

The shell is the composition root. That is correct. The file is still a wide implementation: one edit for tree keys, one edit for columns, one edit for render, one edit for S5 plugin attach points. S5 will add more attach points. A second reason to change the same file is the risk.

The public `Gantt` façade stays. This plan does not merge `Gantt` into the shell (#7).

## 3. What to extract

Extract only a module that hides a rule. A thin forwarder fails the deletion test.

### 3.1 Tree collapse navigation — extract

**Job:** expand or collapse from the keyboard, expand ancestors for `reveal()`, and know which rows are expandable.

Today that job is `#tryTreeArrow`, `#firstChildOf`, `#expandAllRows`, `#isAncestorRow`, and the expand-ancestors branch of `reveal()`.

**Call site (keep this sentence true):**

```ts
this.#treeNav.handleArrow('right');
this.#treeNav.expandAncestorsOf(entryId);
gantt.collapseAll();
gantt.expandAll();
```

`collapseAll` / `expandAll` on `Gantt` also close the S4.11 C2 harness gap (`parentIdsWithChildren` in `harness/hierarchy.ts`). Targets are expandable planned rows, not a walk of raw `parentId`s. Grouped rows must collapse by row id.

**Name:** `TreeCollapse` in `view/tree-collapse.ts`. Glossary term is collapse, not navigation (navigation is pan/zoom). Category word last.

The module owns `CollapseState` plus the ancestor walk. The shell still calls `attachRowTwisty` and still sets `collapsed` from options. `#phase` stays on the shell.

### 3.2 Layout input for one frame — extract if `render()` stays a dump

**Job:** turn shell fields into `LayoutInput`. No geometry. No DOM.

**Call site:**

```ts
const input = layoutInputFromShell(this.#layoutFields);
this.#backend.sync(computeFrame(input, this.#layout.memory));
```

Only extract this if the object has a real invariant (row source + collapsed + columns + fieldCompares stay in one place). If the function is a field list with no rule, leave it in `render()`.

Do not split `computeFrame` here. That is the S4.11 C1 job (resolve rows once in `FrameLayout`). Do C1 in `layout/`, not in the shell.

### 3.3 Construction `#phase` — do not extract a class

`#phase: 'constructing' | 'live'` exists because `bind()` notifies before pane size exists (issue #91 §9-B). Hide the rule in `FrameScheduler` if a second caller appears. One boolean in the composition root is honest. A `PhaseMachine` type for two strings is speculative.

The store already takes its transaction runner in the constructor. That half of the temporal-coupling finding is closed.

## 4. What not to extract

| Piece | Why it stays |
|---|---|
| Theme, zoom, range, fit, overscan, `gridWidth` setters | They forward to `Viewport` / `PaneLayout`. Depth is already there. |
| `resolveGanttFields` | Already a module. The shell only stores the result. |
| `attachRowTwisty` | Already a module. |
| `runTransaction` stages | S7. See `plans/03` §S7. |
| A second `Viewport` type in `view/` | Name clash with `layout/viewport`. |

## 5. Order

1. [x] Publish `collapseAll` / `expandAll` on `Gantt` / `GanttShell`. Point the hierarchy harness at them. Drop `parentIdsWithChildren`.
2. [x] Move tree-arrow handling and reveal's ancestor expand into `TreeCollapse`. Keep `reveal()` on the shell: it still needs `barSpan`, `FrameLayout.rowTop`, and `Viewport.reveal`.
3. [x] Only then consider a `layoutInputFromShell` helper. **Left in `render()`** — no extra rule.
4. [x] Leave `#phase` until a second constructing-vs-live caller exists.

Each step is its own commit. Do not mix S7 pipeline files into these diffs.

## 6. Tests

- Tree keyboard tests stay in `view/gantt-shell.test.ts` or move next to `tree-collapse.ts` if they no longer need a mounted shell.
- `reveal` still expands a collapsed ancestor and does not pan to `y: 0` for a filtered-away row (`gantt-shell.test.ts`).
- Harness collapse-all no longer walks `dataset.entries.all` for parent ids.
- `view/` still does not import `interaction/` (depcruise).

## 7. Done when

- [x] S5 plugin attach points edit a small wiring list in `GanttShell`, not tree-collapse policy.
- [x] `gantt.collapseAll()` is the call the harness writes.
- [x] `transaction.ts` / `build-commit-change-set.ts` are unchanged by this work.

`layoutInputFromShell` was not extracted: `render()` is still a field list with no extra rule. `#phase` stays on the shell.
