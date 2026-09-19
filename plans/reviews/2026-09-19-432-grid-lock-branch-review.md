# Branch review — `Pawel-IT/issue-432-grid-lock` (#432 `gridResizable`)

- **Date:** 2026-09-19
- **Branch:** `Pawel-IT/issue-432-grid-lock`
- **Fixed point for the reviewed change:** `b7eafce4...827a78f8` (`git diff b7eafce4...HEAD` is empty; the change is the single commit `827a78f8`)
- **Change under review:** `827a78f8 Add gantt.gridResizable to lock the grid pane's resize gestures (#432)`
- **Scope note:** the branch sits three commits ahead of `main` (`83444d5d`). It also carries `b7eafce4` (#445 overlay stacking) and `f90ccd5b` (#431 null date message). Those two are unrelated to #432 and already have their own review artifacts under `plans/reviews/`. This report reviews the #432 commit only. If the branch is merged as-is, it also carries the other two changesets to `main` — worth confirming that is intended.
- **Format note:** the `pk-branch-review` skill asks for a Tailwind HTML report; the user asked for this Markdown path. The user's path wins.

## What the change does

`GanttOptionsBase` gains `gridResizable?: boolean`, default `true`, next to `gridWidth`/`minGridWidth` (`src/api/gantt.ts:108-116`). `GanttShell` holds `#gridResizable` (`src/view/gantt-shell.ts:433`), read before the first bind (`:623`). `#applyGridResizable` (`:2092-2118`) attaches or detaches the splitter, sets `tabIndex` to `0`/`-1`, and sets/removes `data-resize-off` (cursor `default`, `src/view/styles.ts:351`). `#bindColumns` remaps every resolved column to `resizable: false` while locked (`:2335-2337`), which reaches both the renderer (`data-resizable-off`, CSS `display:none`, `src/view/styles.ts:332`) and the resize gesture gate (`src/interaction/column-gestures.ts:152`). Twelve dom unit tests (`src/api/gantt.test.ts:1614+`) and four Playwright tests (`e2e/pane-resize.spec.ts:153-224`) cover it.

## Verdicts on the three questions

### Q1 — Is `GanttOptions` the right home, and is `gridResizable` the right name?

**Home: correct.** `Capabilities` is a per-Entry rule bag: `CapabilityRule = boolean | ((entry: Entry) => ...)` (`src/model/capabilities.ts:21`), resolved per row against `EntryVariant.can` (`:5-8`, `:44-45`). A grid-pane lock names no Entry, so it would be an odd boolean living in an entry-level union. `gridWidth`/`minGridWidth` already sit at the top level, so `gridResizable` next to them is one config tree for the grid width. The plan records the same reasoning (`plans/02-public-api.md:230`). No change needed.

**Name: acceptable.** The call site reads truthfully: `new Gantt({ gridResizable: false })` — "the grid is not resizable". It mirrors `GridColumn.resizable` one level up, and both affordances (pane width via the Splitter, column widths via the grips) belong to the Grid pane, so one word covers them. Caveats, none blocking: "resize" now names three things a reader can meet on the Gantt (entry-bar `capabilities.resize`, per-column `GridColumn.resizable`, and this), but the `grid` prefix disambiguates each; and the glossary deliberately avoids "Resizer" as a *name for the Splitter* (`CONTEXT.md:300`) — `gridResizable` does not rename the Splitter, it names a property. The plausible alternative `gridPaneResizable` would mis-describe the column-grip half, so the current name is the better of the two. No rename recommended.

### Q2 — Does the lock stop the affordance painting, not just the gesture?

**Mostly yes, with one real gap (F1).**

- Splitter cursor: painted off. `.fg-splitter[data-resize-off] { cursor: default; }` (`src/view/styles.ts:351`), attribute set at `src/view/gantt-shell.ts:2116`.
- Splitter gesture: off. `#splitterAttachment?.detach()` removes the pointer and keyboard listeners (`src/view/splitter.ts:135-141`).
- Column grip paint: off. `resizable:false` on every resolved column (`src/view/gantt-shell.ts:2336`) → `data-resizable-off` on the header (`src/render/dom/index.ts:897-898`) → `.fg-column-resizer { display: none }` (`src/view/styles.ts:332`).
- Column grip gesture: off, through the same resolved columns (`isResizable`, `src/interaction/column-gestures.ts:152`), so the unit test that dispatches pointer events on the hidden grip is honest.

The gap is accessibility: when the lock arrives **live** (the e2e's own path, and the harness checkbox), `attachSplitter` has already written `role="separator"`, `aria-label="Resize grid pane"`, `aria-orientation="vertical"` and the `aria-value*` trio (`src/view/splitter.ts:130-132`). `detach()` does not remove them, and `#applyGridResizable` only sets `tabIndex=-1` and `data-resize-off` (`src/view/gantt-shell.ts:2110-2117`). A screen reader still meets a widget named "Resize grid pane" with values that cannot be operated — the same "affordance that does nothing reads as a bug" the issue is about. Details in **F1**.

### Q3 — Does the e2e pin the `gridWidth: 'fitColumns'` consequence?

**No. The e2e case cannot fail for the reason its name claims (F2), and the sibling locked-drag case is non-discriminating too (F3).** The unit test at `src/api/gantt.test.ts:1760-1777` *does* pin it, by adding a column and asserting the pane grows.

The harness opens with `gridWidth: 'fitColumns'` (`harness/main.ts:86`), i.e. the pane already sits exactly on the #139 ceiling. The e2e drags the splitter **rightward** (`+300`, `e2e/pane-resize.spec.ts:211`). `GridPaneWidth.#withinSplitterBounds` clamps that to the ceiling (`src/view/grid-pane-width.ts:139-141`), so the committed px equals the current width and the pane width does not move — with the lock or without it. The final step (hide Budget → pane shrinks) does not rescue it: a *fixed* px width is still clamped down by the ceiling on every rebind (`resizeToColumns`, `src/view/grid-pane-width.ts:115-119`), so a fixed-width pane shrinks on a column hide too. Probed directly:

```
FIXED   300 (columns name+start) -> hide start -> 240
FIT     360 (columns name+start) -> hide start -> 240   (identical)
```

Only *growth* separates the two modes: a fixed pane does not grow when the column set grows, `'fitColumns'` does. So the e2e test's own rationale — "a fixed width does not re-measure when the column set changes" (`e2e/pane-resize.spec.ts:218-221`) — is false for a shrink. Fix direction: after the locked drag, **show** a hidden column (or add one) and assert the pane grows, and/or drag **left** so the no-drag assertion is real (the existing U4 test drags `-120` for exactly this reason, `e2e/pane-resize.spec.ts:133-135`).

## Findings

Severity is my reading: **High** = wrong behaviour or a false test that can hide a regression; **Medium** = real defect or misleading contract; **Low** = polish.

### F1 — Live lock leaves a dead resize widget in the accessibility tree (High)

**Files:** `src/view/gantt-shell.ts:2092-2118`, `src/view/splitter.ts:129-143`, `src/view/pane-layout.ts:159`.

**Problem.** Locking a Gantt that was already unlocked detaches the splitter's listeners and sets `tabIndex=-1`, but leaves `role="separator"`, `aria-label="Resize grid pane"`, `aria-orientation`, and `aria-valuemin/max/now` in the DOM. Nothing removes them until the Gantt is destroyed. The splitter stays in the accessibility tree as a named, valued resize widget that cannot be focused or operated. The issue's own acceptance line is "the affordance stops painting when it's off"; the accessibility tree is part of the surface a user perceives.

**Evidence (probe, jsdom):**

```
UNLOCKED     {"role":"separator","label":"Resize grid pane","orientation":"vertical","now":"360","min":"40","max":"360","tabIndex":0,"off":null}
LOCKED_LIVE  {"role":"separator","label":"Resize grid pane","orientation":"vertical","now":"360","min":"40","max":"360","tabIndex":-1,"off":""}
```

(The constructor-locked path differs: `attachSplitter` never runs, so the label/value trio is absent and only the bare `role="separator"` from `pane-layout.ts:159` remains.)

**Recommendation.** Make the locked state own the a11y story: in the lock branch, remove `aria-label`/`aria-orientation`/`aria-value*` and either `role` or `aria-hidden="true"` (a purely decorative divider); restore them on unlock. Better still, put this behind the seam in F5 so `splitter.ts` owns it.

### F2 — The `fitColumns` e2e case proves nothing about the lock (High)

**Files:** `e2e/pane-resize.spec.ts:203-224`; `src/view/grid-pane-width.ts:102-104`, `115-119`, `139-141`.

**Problem.** As set out under Q3: the test drags rightward into the #139 ceiling, and its "hide Budget shrinks the pane" step passes whether the pane is `'fitColumns'` or a fixed px, because the ceiling clamps a fixed pane down too. Neither assertion distinguishes the two modes, so the test can stay green while the exact failure mode (#157 converting to fixed px) regresses. The inline comment asserting otherwise is factually wrong.

**Recommendation.** Replace the hide step with a grow step: after the locked drag, show/add a column and assert the pane gets wider. The existing unit test (`src/api/gantt.test.ts:1760-1777`) is the model. The cheapest e2e edit is to hide Budget *first*, then lock and drag, then show Budget and expect growth past the pre-show width.

### F3 — The locked-drag e2e cases drag into the ceiling (Medium)

**Files:** `e2e/pane-resize.spec.ts:154-167`, `:203-224`.

**Problem.** `dragSplitterBy(page, 200)` / `(page, 300)` move rightward while the pane sits on its columns' edge, so the width assertion passes even with no lock. The tests do discriminate on the *paint* half (cursor/grip), but the names and comments claim a no-drag behaviour the assertions do not prove.

**Recommendation.** Drag left, or drag left from a pre-widened pane. The existing U4 test already uses the correct direction (`e2e/pane-resize.spec.ts:133-135`).

### F4 — The lock override leaks into `beforeGridColumnsChange`/`gridColumnsChange` `from` (Medium)

**Files:** `src/view/gantt-shell.ts:2335-2337`, `src/view/column-chrome.ts:405-413`, `src/view/grid-columns.ts:86-99` (pick at `:91`).

**Problem.** `#bindColumns` writes the locked columns into `ColumnChrome`'s `#resolvedColumns` (`setResolvedColumns`, `gantt-shell.ts:2335`). `#commitDeclared` builds the event's `from` from those same resolved columns (`column-chrome.ts:411`), and `toGridColumn` copies `resizable` through (`grid-columns.ts:91`). `to` is built from a fresh, *un*-overridden resolution (`column-chrome.ts:406,412`). So while locked, a programmatic column write reports `from` columns with `resizable: false` and `to` columns with the real authored value — a `resizable` flip the consumer never made. The payload contract says these are "the consumer's own authored columns" (`column-chrome.ts:375-380`).

**Evidence (probe, locked Gantt, `hideGridColumn('start')`):**

```
from: [ {field:'name', resizable:false, ...}, {field:'start', resizable:false, ...} ]
to:   [ {field:'name', resizable:true,  ...}, {field:'start', hidden:true} ]
```

**Recommendation.** Keep `#resolvedColumns` authored; apply the lock as a gate at the two places that read it (render + gesture), or build `from` from an un-overridden resolution. This is the same root as F5.

### F5 — The splitter's disabled DOM/ARIA has two owners (Low, design opportunity)

**Files:** `src/view/gantt-shell.ts:2092-2118`, `src/view/splitter.ts:44-143`, `src/view/styles.ts:351`.

**Problem.** `splitter.ts` owns the splitter's listeners and ARIA; `GanttShell#applyGridResizable` owns its `tabIndex` and the `data-resize-off` attribute name; `styles.ts` owns the cursor. One lifecycle (attach / enable / disable / detach) is spread across three files, and the ARIA gap in F1 exists precisely because no single owner knows what "a locked splitter" is. The `SplitterAttachment` interface (`splitter.ts:18-24`) already exists as the seam.

**Recommendation.** Have `attachSplitter` return a `setEnabled(enabled: boolean)` (or expose the whole enabled lifecycle) and let `#applyGridResizable` call it; move the attribute/cursor/tabIndex and the F1 ARIA handling behind that seam. The interface stays small and the lock's DOM knowledge gains locality.

## Standards axis

No hard rule violations found. Specifics:

- **Layering:** `src/view/` touches DOM; `api/` holds the type; no cross-layer import added. Clean.
- **Naming:** `gridResizable` follows the `grid*` family and the call site reads true (Q1). No new generic word collides in one place.
- **I14 (capabilities gate gestures *and* affordances from one resolution):** the grid-pane lock is a second, non-Entry resolution. That is legitimate here — I14 governs Entry capabilities, and the plan states the distinction (`plans/02-public-api.md:230`) — but it is the reason F4's leak needs a single owner.
- **Hot path:** no frame-path work added; `#bindColumns` allocation on rebind is off the hot path.
- **Config-live rule:** honored, with a test (`src/api/gantt.test.ts` live toggles).
- **Smell baseline:** no duplicated logic, no feature envy, no speculative generality. `#applyGridResizable` is a small, single-purpose owner of the toggle.

## Spec axis

The change implements the issue faithfully:

- One parameter, both affordances off: yes.
- `true` default, additive: yes, tested.
- No splitter drag / no resize cursor: yes (F1 is the a11y remainder).
- No column grip paints, whatever the column says: yes, tested.
- `before*` events do not fire for gestures that cannot arm: yes, tested.
- Programmatic writes still land: yes, tested.
- Per-column `resizable` keeps meaning underneath: yes, tested.
- `'fitColumns'` stays standing under a locked drag: implemented and unit-tested; the *e2e* proof is broken (F2).

No scope creep in the #432 commit. Docs updated in `plans/02-public-api.md:144,230`, `docs/05-consumer-api.md:90`, and the generated `etc/freegantt.api.md`.

## Harness review (`CLAUDE.md` stop rule)

`harness/main.ts:190-194` wires the checkbox straight to `gantt.gridResizable = !lockGridCheckbox.checked`; `harness/index.html:71-78` adds the control. No workaround, defense, fallback, or re-derivation of library behaviour. No API gap exposed. Clean.

## Gate

`pnpm verify:full` was run; verdict recorded below.

`pnpm verify:full` was run on `827a78f8` with a redirect to `/tmp/v432.log`. Verdict line:

```
verify:full PASS — all 16 checks green, test:e2e included (71s).
```

A green gate does not contradict F2/F3: the e2e suite passes because the assertions cannot fail, not because the lock is proven by them.

## Pass 2 — independent verification

A fresh sub-agent (cold start, no inherited reading) opened every cited file and reproduced the behavioural claims with throwaway probes, then deleted them. Verdicts:

| Finding | Verdict | Deciding evidence |
| --- | --- | --- |
| F1 | **Confirmed** | `splitter.ts:135-141` detach removes only listeners; `gantt-shell.ts:2114-2115` lock branch sets only `tabIndex=-1` + `data-resize-off`. Probe reproduced `label:"Resize grid pane"` surviving a live lock. |
| F2 | **Confirmed** | `e2e/pane-resize.spec.ts:211` drags `+300` into the ceiling; `grid-pane-width.ts:115-119,139-141` clamps a fixed px pane down on a hide too. Probe: `FIXED 300 -> 240`, `FIT 360 -> 240`, `UNLOCKED_DRAG 360 -> afterDrag 360 -> afterHide 240`. |
| F3 | **Confirmed** | `e2e/pane-resize.spec.ts:164,211` drag rightward from an edge-sitting `fitColumns` pane; an unlocked drag also leaves the width unchanged. Cursor/grip assertions still discriminate; "no drag" does not. |
| F4 | **Confirmed** | `gantt-shell.ts:2335-2337` writes the override into `#resolvedColumns`; `column-chrome.ts:411` builds `from` from it while `:406,412` builds `to` fresh. Probe: `from name resizable:false` vs `to name resizable:true`. |
| F5 | **Confirmed** | The mechanism is as described (`gantt-shell.ts:2092-2117` owns `tabIndex`/`data-resize-off`; `splitter.ts:44-143` owns listeners/ARIA; `styles.ts:348-351` owns cursor). The reviewer's one caveat: whether "two owners" is a *defect* is a judgement call, not a run-settled fact. |

Reviewer's least-certain finding: **F5** — the mechanism is verified, but its status as a defect versus acceptable separation is judgement. F1–F4 are behaviourally reproduced. No probe files were left behind.
