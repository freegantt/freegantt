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
4. **Harness.** `harness/editing.ts` adds a custom `sixHourPreset` (`tickUnit: 'hour',
   tickIncrement: 6`) spliced into `gantt.zoomPresets` right after `'hour'`, plus a
   matching "Every 6 hours" option in the snap picker (`harness/editing.html`'s
   `#snap-unit` select). This is the visible proof: zoom to it, pan — gridlines stay on
   00/06/12/18; pick that snap and drag — the bar lands on one of them.

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

1. **Run `FG_E2E_PORT=5186 pnpm verify:full`** and report the verdict line verbatim — I did
   not run this (browser/e2e gate) before the context-budget stop. Everything short of it
   (verify's own non-e2e chain: typecheck, lint, unit+dom tests, guards, build, api-report)
   is green as reported above, so I'd expect `verify:full` to pass, but say so as an
   expectation, not a result, until it actually runs.
2. **Optional**: `e2e/direct-manipulation.spec.ts` or similar may be worth a read for a
   snap-behavior assertion that assumed the old default-on fallback — I did not find one
   grepping for `snap` in `e2e/`, but I did not run the e2e suite itself.
3. Nothing else is known-incomplete. If `verify:full` fails, the most likely culprits given
   what changed: a doc-example checker (`check-doc-examples`) choking on the `gantt.snap`
   code sample in `plans/02-public-api.md` (I edited one line there), or an e2e page that
   drags a bar and expected it to snap with no `gantt.snap` stated (now free-dragging).

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

- None on the harness stop rule — `harness/editing.ts`'s custom preset and snap-picker
  option both use only public API (`ViewPreset`, `gantt.zoomPresets`, `gantt.snap`), no
  workaround.
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
- `harness/editing.ts` — the `sixHourPreset` and `applySnapChoice` additions, for the
  visible proof.
- The issue itself, `gh issue view 489 --comments`, for the four ownership rulings this
  build follows.

## Last verify/test result (verbatim)

`pnpm verify:full` was **not run** — stopped for the context-budget handoff before reaching
it. The last commands actually run, each reported PASS/green above:

```
pnpm typecheck   -> clean (tsc --noEmit, no errors)
pnpm lint        -> clean (eslint ., no errors)
pnpm test:node   -> Test Files  63 passed (63) / Tests  944 passed (944)
pnpm test:dom    -> Test Files  65 passed (65) / Tests  1288 passed (1288)
pnpm guards      -> all guard suites + rule tests + red tests passed
pnpm build       -> ✓ built in 2.25s (dist/api/index.js + .d.ts)
pnpm api-report  -> API Extractor completed successfully (etc/freegantt.api.md matches)
```

Next step for whoever picks this up: run
`FG_E2E_PORT=5186 pnpm verify:full > /tmp/claude-1000/v489.log 2>&1; tail -3 /tmp/claude-1000/v489.log`
and report that verdict line verbatim, as the original dispatch asked.
