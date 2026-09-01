# #127 — Left pane min size, columns resize weird

**Reported:** 2026-09-01. **Closed:** 2026-09-01, Step 1 shipped.

## Resolution

`minGridWidth` is now a public, live-reconfigurable `GanttOptions`/`GanttShellOptions` property
(`src/api/gantt.ts`, `src/view/gantt-shell.ts`, `src/view/pane-layout.ts`), threaded down to
`PaneLayout`'s existing clamp. Default stays `0`, matching the doc comment `PaneLayout` already
carried ("Zero is authored, not nonsense") — a consumer opts a floor in explicitly, rather than
the library changing today's default behavior. `gantt.gridWidth = 0` stays a legal, explicit way
to collapse the pane; only the splitter drag (and any other assignment) is stopped from reaching
it by accident.

Raising `minGridWidth` above the current `gridWidth` re-clamps it through the same
`beforeGridWidthChange`/`gridWidthChange` commit sequence a splitter drag runs (`GanttShell`), so
a veto is still respected and the floor invariant holds even through a rollback. Documented in
`plans/02-public-api.md` §2/§3. Tests: `pane-layout.test.ts`, `gantt.test.ts`
("Gantt minGridWidth (#127)").

Step 3 (a collapse-toggle affordance) was **not** built — the issue only said "maybe," and the
plan below flagged it as a separate product/UX call needing confirmation first. Left as a future
follow-up if wanted; `gantt.gridWidth = 0` already covers the underlying mechanism.

## Original plan

## Current behavior (researched)

- `src/view/splitter.ts` `attachSplitter()` does the raw pointer-drag math
  and explicitly does **not** clamp — a comment states clamping is not this
  file's job.
- `src/view/pane-layout.ts` `PaneLayout` already supports a
  `PaneLayoutOptions.minGridWidth` and its `gridWidth` setter clamps via
  `Math.max(this.#minGridWidth, px)`. Default is `0`. A comment there notes
  "Zero is authored, not nonsense" — an explicit 0 is meant to be legal.
- **The bug:** nothing ever passes a non-zero `minGridWidth` in. `GanttShell`
  constructs `PaneLayout` (`gantt-shell.ts:312-315`) forwarding only
  `gridWidth`, never `minGridWidth`. `GanttOptions` (`api/gantt.ts:50`) has
  no `minGridWidth` field at all. So the clamp exists but is always a no-op,
  and dragging the splitter can take the grid pane to 0 by accident.
- No collapse/toggle affordance exists for the grid pane today. (The only
  "collapse" in the codebase is row/tree collapse — unrelated.)

## Plan

### Step 1 — Wire `minGridWidth` through (bug fix, no design decision needed)
- Add `minGridWidth?: number` to `GanttOptions` (`src/api/gantt.ts`), live
  getter/setter, mirroring the existing `gridWidth` pattern (including
  `beforeGridWidthChange`/`gridWidthChange` semantics if the setter should
  re-clamp a currently-out-of-range width).
- Thread it through `GanttShellOptions` into the `PaneLayout` construction
  at `gantt-shell.ts:312-315`.
- Once wired, the splitter drag automatically respects it — `PaneLayout`'s
  existing clamp does the work; no change needed in `splitter.ts`.

### Step 2 — Pick a default `minGridWidth`
- **Decision needed:** what's a sane default? `0` preserves today's
  (buggy-feeling) behavior; a small positive default (e.g. enough for one
  visible column plus its resize handle) fixes the "resizes weird" report
  out of the box. Check `src/view/grid-columns.ts` for any existing
  per-column minimum to anchor the number against, so the default isn't
  arbitrary.
- Document the default in `plans/02-public-api.md` next to `gridWidth`.

### Step 3 — Collapse toggle (optional follow-up, separate from the bug fix)
- `PaneLayout` already treats an *explicit* `gridWidth = 0` as legal (it's
  the min-clamp that stops the drag gesture, not a hard ban on zero). So a
  collapse toggle can already be built as "set `gantt.gridWidth = 0`
  programmatically" — no new capability needed at the data layer.
- What's missing is the affordance: a UI trigger (e.g. double-click the
  splitter, or a small chevron button) that toggles between 0 and the last
  non-zero width. This is a product/UX call — confirm with the user before
  building it, since the issue only says "maybe."
- If built: remember last non-zero `gridWidth` (likely in `GanttShell`
  state) so the toggle can restore it, and fire the existing
  `before*`/`*Change` events so it's undoable/observable like any other
  mutation.

## Acceptance
- Dragging the splitter cannot take the grid pane below `minGridWidth`.
- `gantt.gridWidth = 0` still works when set explicitly via the API
  (collapse stays possible on purpose).
- `minGridWidth` is live-reconfigurable like other `Gantt` options.
- (If Step 3 ships) a documented, discoverable way to collapse/expand the
  grid pane exists in the UI, not just via the API.
