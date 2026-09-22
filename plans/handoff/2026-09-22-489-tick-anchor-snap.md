# Handoff: #489 tick anchor / snap unification — 2026-09-22

Branch `Pawel-IT/489-tick-anchor-snap`, worktree
`/home/pawel/orca/workspaces/freegantt/489-tick-anchor-snap`. Not pushed.

## Commits so far

- `7fc732ca` — Anchor the tick walk on the calendar, one walk for grid and snap (#489)
- `fa5db9b7` — Make gantt.snap opt-in; drop the dead ViewPreset.snap field (#489)
- `5eb74964` — Custom snap rule and tick tools on the public API (#489)

All three are real, finished commits (not WIP) — each was verified in isolation
(`pnpm typecheck && pnpm lint && pnpm test:node && pnpm test:dom` all green) before
committing, by staging that commit's files and stashing the rest with
`git stash push --keep-index -u`. See "How the split was built" below if a hunk needs
re-splitting later.

## What is done and proven

1. **Anchor fix.** `time/zone.ts` gained `tickFloor(zone, at, unit, increment)` and
   `nextTick(zone, boundary, unit, increment)` (`src/time/zone.ts:273-306`). A stepped tick
   counts from the start of the next larger calendar unit (`ANCHOR_UNIT` table,
   `src/time/zone.ts:283-289`: minute→hour, hour→day, day→week, month→year; `week`/`year`
   anchor to themselves — deliberately **not** the next entry in `UNIT_ORDER`, because a
   week's own floor is not a whole number of weeks from a month's start, which broke
   `increment: 1` for week-headed presets the first time I tried "next unit in
   `UNIT_ORDER`" — see the doc comment on `ANCHOR_UNIT` for why).
   `nextTick` resets at each anchor-unit boundary instead of striding across it — required
   the moment `increment` doesn't divide its anchor unit evenly (e.g. every 7 minutes: a
   raw `stepBy` would give `:63` instead of resetting to the next hour's `:00`). This was a
   second bug I found only via the property test on `snapInstant` membership — a naive
   "floor once, then `stepBy` forever" implementation passes `increment: 1` and the
   ruling's own dividing examples (6h, 15m, 3-month) but fails any non-dividing increment.
   `TimeScale.ticks` (`src/time/scale.ts:118-134`), `snapInstant` and `nextTickBoundary`
   (`src/time/snap.ts:29-46`) all read `tickFloor`/`nextTick` now — one walk.
2. **Opt-in snap default.** `GanttShell.snap` getter reads `this.#snap ?? 'none'`
   (`src/view/gantt-shell.ts:1495-1500`), not `?? preset.snap ?? 'tick'`. `ViewPreset.snap`
   is retired (`src/time/scale.ts` — the field no longer exists); `viewport.ts`'s
   `#presetWithCarriedSnap` zoom-ladder-carry mechanism is gone with it
   (`gantt.snap` already survives a zoom on its own, unchanged).
3. **Custom `SnapRule` + public tick tools.** `SnapRule = (zone: string, at: Instant) =>
   Instant` (`src/time/snap.ts:21-25`). `SnapUnit`/`SnapSetting` widen with it.
   `snapInstant`/`nextTickBoundary` are now exported from `api/index.ts`
   (`src/api/index.ts` — search `#489: the tick tools`), alongside the `SnapRule`/`SnapUnit`
   types. `etc/freegantt.api.md` regenerated and matches (`pnpm api-report` is clean).
4. **Harness.** Originally landed on `harness/editing.ts`. #497's five-themed-page rebuild
   delinked that file to `harness/e2e/editing.ts` (a Playwright fixture, not a nav page); the
   2026-09-22 follow-up session (see "What is left" below) moved the visible demo to
   `harness/editing-and-data.html` / `harness/gantt-toolbar.ts` to match.

**Tests that prove it**, all green at the final commit:
- `src/time/scale.test.ts` — new `describe('ticks() anchoring (#489)')` block: (a) ticks()
  from any two overlapping windows agree on every shared instant (fast-check, the literal
  pan-shift regression), (b) `increment: 1` still equals `startOf` directly (fast-check),
  (c) `snapInstant` always answers a member of the tick set `ticks()` draws, across
  `{minute,hour,day} × increment 1-6 × 5 zones` including DST zones (fast-check,
  `numRuns: 40`, ~2.5s).
- `src/time/snap.test.ts` — updated the two increment×3 tests to the new day-anchored
  expectations (19:00Z, not the old 17:00Z-style own-floor answer) and added an explicit
  6-hour-snap test.
- `src/layout/frame.test.ts` — two pre-existing grid tests (week/day, week/month headers)
  broke transiently when I first tried the wrong `ANCHOR_UNIT` (week→month); they pass
  again with the corrected table — this is the guard that would catch a regression here.
- Full suite: `pnpm test:node` 944/944, `pnpm test:dom` 1288/1288, `pnpm guards` all green,
  `pnpm typecheck`/`pnpm lint` clean, `pnpm build && pnpm api-report` clean.

## What is left

Nothing. A follow-up session (2026-09-22, after `origin/main` moved two merges ahead on
#497's five-themed-page harness rebuild) rebased this branch, closed every item below, and
ran the full gate. Final commits:

- `578ad284` — Anchor the tick walk on the calendar, one walk for grid and snap (#489)
- `cb254492` — Make gantt.snap opt-in; drop the dead ViewPreset.snap field (#489)
- `5b1befd9` — Custom snap rule and tick tools on the public API (#489)
- `59bdc0a8` — this handoff, as first written
- `cf1e9b0f` — Land the #489 demo on editing-and-data.html after the harness restructure (#489)

What the follow-up session did:

1. **Ran `FG_E2E_PORT=5186 pnpm verify:full`.** Verdict: `verify:full PASS — all 17 checks
   green, test:e2e included (96s).`
2. **Checked `e2e/` for a drag test relying on the old snap-on-by-default fallback.** None
   found. `e2e/direct-manipulation.spec.ts` drives `/e2e/editing.html`, which calls
   `applySnapChoice()` unconditionally on load — it always states `gantt.snap` itself, so
   the opt-in-default change never reaches it. `e2e/write-refusal.spec.ts` has a comment
   about snap-back risk on a small resize drag, but its assertion (`after.start >
   before.start`) holds under free dragging too, and is more robust with snap off, not
   less. No other `e2e/*.spec.ts` asserts an exact snapped date.
3. **Rebased onto `origin/main`** (`cbde4e0c` #497's five-themed-page rebuild, `9e6c86a2`
   #498). Conflicts were in `harness/gantt-toolbar.ts` (a duplicated/stale merge hunk —
   dropped, keeping only the `snap-rule`-aware `snapValue`) and `harness/e2e/editing.ts`
   (import-path/header only — `harness/editing.ts` had moved to `harness/e2e/editing.ts` as
   a delinked test fixture; kept that file's #489 content, fixed its now-one-level-deeper
   import paths).
4. **Moved the visible demo.** #497 delinked `harness/editing.ts` (→ `harness/e2e/editing.ts`)
   from the nav — it is a Playwright fixture now, not a page a reader opens. The demo needed
   a new home: `editing-and-data.html` owns dragging on the shared `gantt-toolbar.ts`, so the
   `sixHourPreset` (`tickUnit: 'hour', tickIncrement: 6`) splices into its
   `gantt.zoomPresets`, and "Every 6 hours" joins the toolbar's shared snap picker
   (`SNAP_CHOICES`/`readSnapChoice`/`snapValue` in `harness/gantt-toolbar.ts`) — public API
   only (`ViewPreset`, `gantt.zoomPresets`, `gantt.snap`), no harness workaround. To see it:
   open `editing-and-data.html`, zoom past "Hour" (or pick "Every 6 hours" straight off the
   time-scale picker) and pan — gridlines hold at 00/06/12/18; pick "Every 6 hours" off the
   Snap picker and drag a bar — it lands on one of those lines.
5. **Fixed a stale doc example `pnpm verify` caught.** README.md's "Dragging bars and
   snapping" section still named the retired `ViewPreset.snap` field (removed by
   `cb254492`, before this handoff was first written) — `check-doc-examples` failed on it.
   Rewrote the section against `gantt.snap`, including the new `SnapRule` escape hatch.

## Design decisions (with reasons)

- **`SnapRule` signature: `(zone: string, at: Instant) => Instant`.** Zone first, matching
  every other `time/` function's own convention (`formatDate(zone, ...)`,
  `snapInstant(zone, at, snap)`). The library passes `zone` in — an app author's rule reads
  `(at, zone) => nextTickBoundary(zone, at, 'hour', 6)` at the call site, never having to
  look up `dataset.timeZone` themselves.
- **`SnapUnit`/`SnapSetting` widened with `SnapRule` directly (union member), not a
  separate `snap: SnapRule` config key.** One place states "what a drag snaps to"; adding
  a second door (`gantt.snapRule`) would violate "one config tree per job"
  (`docs/agents/api.md` item 4).
- **A custom `SnapRule` falls back to the millisecond-delta translation** (like `'none'`)
  in `layout/gesture-draft.ts`'s `translationOf` and `#stepPx` — a rule has no
  `{unit,increment}` to count whole calendar steps in for the rigid multi-entry drag
  translation (D-S3-19). This means a `SnapRule`-snapped multi-entry drag translates by
  raw ms, not by a DST-safe calendar delta the way a `{unit,increment}` snap does. Not
  raised with the owner — flag this if it turns out to matter for a real `SnapRule`
  author.
- **Public tick tools are `snapInstant` (nearest) + `nextTickBoundary` (next-after`)`,
  not a new `tickFloor`/`nextTick` export.** `tickFloor`/`nextTick` stayed internal to
  `time/zone.ts`. The issue's ruling names "the next tick boundary instant" and "the tick
  width / nearest tick" — I read "nearest tick" as `snapInstant` and "next tick boundary"
  as `nextTickBoundary`, and did not additionally publish a raw floor function, since a
  consumer building a `SnapRule` can already get "the tick at or before `at`" by calling
  `snapInstant` twice around `at` if truly needed, or just use `nextTickBoundary` and
  compare. If the owner wants a public floor tool too, it is a one-line addition
  (`export { tickFloor } from './zone.js'` mirrored up through `time/index.ts` and
  `api/index.ts`) — I did not add it because the ruling's two named tools map cleanly to
  the two I published and I did not want to guess at a third.
- **`ViewPreset.snap` removed outright, not left as a dead/ignored field.** The ruling only
  said "reverse the fallback"; I inferred that a field nothing reads is worse than no
  field (project's own "never ship a dead API surface" ethos) and removed it, plus the
  `viewport.ts` zoom-ladder carry mechanism that existed solely to keep that field's value
  across a preset swap. This is the one place I made a call beyond the literal ruling text
  — flag it if the owner wanted `ViewPreset.snap` kept as an inert/reserved field.

## Open questions / stops

- None on the harness stop rule — the demo (now on `editing-and-data.html` /
  `gantt-toolbar.ts`) uses only public API (`ViewPreset`, `gantt.zoomPresets`, `gantt.snap`),
  no workaround.
- The `SnapRule`-and-multi-entry-drag interaction above (ms-delta fallback) is the one
  design call worth a second look from the owner if they read this closely.

## Files a fresh agent should read first

- `src/time/zone.ts:265-306` — `startOf`, `ANCHOR_UNIT`, `anchorUnit`, `nextTick`,
  `tickFloor`. The whole mechanism.
- `src/time/scale.ts:118-134` — `ticks()`, now reading `tickFloor`/`nextTick`.
- `src/time/snap.ts:1-46` — `SnapRule`, `SnapUnit`, `snapInstant`, `nextTickBoundary`.
- `src/view/gantt-shell.ts:1495-1516` — `get/set snap`, the opt-in default.
- `src/time/scale.test.ts` — the `describe('ticks() anchoring (#489)')` block, bottom of
  file, for the property tests and why the buffer/numRuns are sized as they are.
- `harness/editing-and-data.ts` (the `sixHourPreset` splice) and `harness/gantt-toolbar.ts`
  (`SNAP_CHOICES`/`readSnapChoice`/`snapValue`'s `sixHour` case) — the visible proof, on the
  themed page that replaced the old `harness/editing.ts`.
- The issue itself, `gh issue view 489 --comments`, for the four ownership rulings this
  build follows.

## Last verify/test result (verbatim)

Run after the rebase onto `origin/main` and the harness demo move, at commit `cf1e9b0f`:

```
FG_E2E_PORT=5186 pnpm verify:full
verify:full PASS — all 17 checks green, test:e2e included (96s).
```

Not pushed; no pull request opened, per the dispatch.
