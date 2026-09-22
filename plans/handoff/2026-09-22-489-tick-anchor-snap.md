# Handoff: #489 tick anchor / snap unification — 2026-09-22

## Follow-up: gantt.preset resolves against this Gantt's own zoomPresets (owner ruling, 2026-09-22)

Closes the gap the "Left alone" note below flagged: `harness/timeline-toolbar.ts:114`'s one line,
`gantt.preset = presetSelect.value`, threw `UnknownPresetError` for the custom `sixHour` rung. The
owner ruled `gantt.preset = '<id>'` should also find a preset in this Gantt's own `zoomPresets`, not
only the shipped table, so a custom preset and a shipped preset work the same way through this door.

Commits:
- Public API change: `PresetRef`/`PresetId`, `resolvePreset`'s new `ladder` param,
  `UnknownPresetError`'s new shape — see below for the exact signatures.

What changed, by file:
- `src/time/presets.ts` — `PresetId = ShippedPresetId | (string & {})` (new, exported);
  `PresetRef = PresetId | ViewPreset` (was `ShippedPresetId | ViewPreset`). `resolvePreset(ref,
  operation, ladder?)` takes an optional third param, a `readonly ViewPreset[]` searched by `id`
  before the shipped `presets` table.
- `src/layout/viewport/viewport.ts` — `set preset` now calls `resolvePreset(ref, 'gantt.preset',
  this.#zoomPresets)`, so `gantt.preset` searches this Gantt's own ladder first. **Precedence: the
  ladder wins on a shared id** (owner ruling — a consumer who put a preset on their own ladder meant
  it). `set zoomPresets` is unchanged: it still resolves each ref shipped-only (defining the ladder
  has no existing ladder to search against).
- `src/layout/viewport/time-scale-model.ts` — `set preset` unchanged in behavior (still
  shipped-only, no ladder passed) — this model can be shared across `Gantt` instances with
  different ladders, so it has none of its own. Doc comment now says so explicitly.
- `src/model/errors.ts` — `UnknownPresetError` reshaped: `constructor(presetId, ladderIds,
  shippedIds, operation)`, replacing the old `constructor(presetId, available)`. It also used to
  hardcode "gantt.preset:" in the message regardless of caller — now honest per-door, like
  `InvalidPresetError` already was. Message names which table(s) it searched; `ladderIds` is `[]`
  for a shipped-only door (`gantt.zoomPresets`, `TimeScaleModel.preset`), so the message then names
  only the shipped table.
- `harness/timeline-toolbar.ts`, `harness/gantt-toolbar.ts` — removed the `as PresetRef` cast on
  `gantt.preset = presetSelect.value`; a plain `string` now satisfies `PresetRef` directly (no
  narrowing needed since `PresetId` accepts any string, with autocomplete kept for the shipped ids).
- `CONTEXT.md` ("Preset reference"), `plans/02-public-api.md` (`UnknownPresetError` paragraph),
  `plans/s1.9-presets-and-zoom/README.md` (Q9 — records the Design #11 reversal, scoped to
  `gantt.preset` only, citing #489 and the 2026-09-22 owner ruling).
- Tests: `src/time/presets.test.ts` (ladder precedence, fallback, shared-id-wins, error's
  `ladderIds`/`shippedIds`), `src/layout/viewport/viewport.test.ts` (the red test —
  `viewport.preset = 'sixHour'` after a `zoomPresets` splice — plus precedence and the still-throws
  case), `src/layout/viewport/time-scale-model.test.ts` (pins the *unchanged* shipped-only
  behavior), `src/api/gantt.test.ts` (one Gantt-level integration test), `e2e/editing-and-data.spec.ts`
  (picking "Every 6 hours" off the harness picker switches preset with no page error).
- `harness/six-hour-preset.ts` **left where it is, at harness root** — checked against the
  coordinator's harness-layout rule (test-only fixtures live under `harness/e2e/`, themed demo
  pages own the root). It is not test-only: `harness/editing-and-data.ts` (the themed demo page) and
  `harness/e2e/editing.ts` (the e2e fixture) both import it, the same shared-root pattern
  `timeline-toolbar.ts`, `change-log.ts` and `plugins/lock-entries.ts` already use to hand code down
  into `harness/e2e/`. Moving it under `harness/e2e/` would take it away from the demo page that owns
  the feature, against the rule's own "a demo change goes on the themed page that owns the feature."
  No file moved.

Final public signatures:
```ts
export type PresetId = ShippedPresetId | (string & {});
export type PresetRef = PresetId | ViewPreset;

export class UnknownPresetError extends FreeGanttError {
  readonly presetId: string;
  readonly ladderIds: readonly string[];
  readonly shippedIds: readonly string[];
  readonly operation: string;
}
```
`gantt.preset` setter is unchanged in shape (`set preset(ref: PresetRef)`); only its resolution
order changed (ladder, then shipped table).

`pnpm build && pnpm api-report`: clean (`etc/freegantt.api.md` regenerated and committed with this
change).

---

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

Nothing. A third session (2026-09-22) ran `ocr review --from origin/main --to HEAD` against
the state this handoff describes and fixed every finding it raised. Final commits:

- `c46de8bd` — Never shorten a tick stride that leaves its anchor container (#489)
- `6603c52c` — Document TimeScale.ticks' InvalidSnapIncrementError, drop the stale MAX_TICKS
  cap claim (#489)
- `57c54d9e` — Add SnapRule coverage: snapInstant's own tests, and a gesture-level drag (#489)
- `e775c9bd` — Fix two doc comments still naming the retired ViewPreset.snap (#489)
- `9667c06c` — Fix the sixHour ladder order and share the preset between harness pages (#489)

What that OCR pass found and fixed:

1. **Core bug (confirmed by the owner): `nextTick` shortened a stride that left its anchor
   container.** `{day, 10}` (anchor: week) gave 7-day ticks, `{hour, 30}` (anchor: day) gave
   daily ticks, `{minute, 90}` (anchor: hour) gave hourly ticks — the reset that "hours count
   from the day they fall in" needs for a *fitting* stride (one that stays inside its
   container) was firing for a stride that does not fit too, silently capping it at the
   container's own span. Fixed by branching on `stepFitsAnchorContainer` (`increment` less
   than the container's own size in `unit`s): a fitting stride still resets at each container
   start; a non-fitting one counts on continuously from a fixed calendar origin
   (`1970-01-01T00:00` local, floored to `unit`) instead, so the stated increment always
   survives and the lines still never move on a pan. `tickFloor` and `nextTick`
   (`src/time/zone.ts`) both read this now — one rule, both directions.
   - Rule chosen for `month`/`week`/`year` too, since the ruling flagged `{month, 18}` as a
     case to sanity-check: the same fits/doesn't-fit split applies (`month`'s container is
     `year`, 12 months; `week`/`year` anchor to themselves, so they always "fit" — one
     container per tick, nothing to spill into). No shipped preset or harness demo exercises
     an `{month, 18}`-shaped non-fitting month stride, so this is a read of the rule's own
     logic, not a test of that exact case — the property tests do cover `day`/`hour`/`minute`
     non-fitting strides directly, across a DST zone.
2. **Performance: `tickFloor` walked one tick at a time from its anchor start** — up to
   60,000 iterations for a millisecond tick anchored on its minute, on every render and every
   pointer move. Rewritten as arithmetic: one `startOf`/`stepBy` pair plus an exact
   (possibly fractional) unit-count division, O(1) regardless of `unit` or how far the
   instant sits from its anchor/origin. A test proves 10,000 calls to a millisecond-level
   `tickFloor` stay well under a frame budget.
3. **`TimeScale.ticks` contract change undocumented.** `ticks()` throws
   `InvalidSnapIncrementError` for a bad increment (via the same `tickFloor`), where
   `time/presets.ts` still described the old MAX_TICKS-capping behavior. Documented the throw
   on `TimeScale.ticks` itself and corrected both stale comments — no behavior change, since
   every shipped/custom preset already rejects a bad increment at registration.
4. **`SnapRule` had no test.** Added: the rule's answer returns verbatim, `zone`/`at` pass
   through unchanged, a rule returning `at` is not re-rounded, and a rule built from
   `nextTickBoundary` (the documented real-author shape) — plus one gesture-level test in
   `gantt.test.ts` proving a real pointer drag with a custom `SnapRule` commits on the
   boundary the rule chose.
5. **Stale docs still named the retired `ViewPreset.snap`** in `src/time/snap.ts` and
   `src/layout/gesture-draft.ts`'s `DraftInput.snap` doc — both now name `gantt.snap`.
6. **Harness: the sixHour zoom ladder wasn't monotonic.** Splicing `sixHourPreset` right
   after "hour" put it before "hourDayWeek" (still a 1-hour, 56px/h tick — denser than
   sixHour's own 8px/h), so `zoomOut()` from sixHour landed back on a denser rung. Now
   splices after "hourDayWeek" instead.
7. **Harness: the `sixHourPreset` literal was duplicated** across
   `harness/editing-and-data.ts` and `harness/e2e/editing.ts`. Both now import
   `sixHourPreset`/`zoomPresetsWithSixHour` from a new `harness/six-hour-preset.ts`, which
   also guards the ladder lookup against `-1`. `harness/gantt-toolbar.ts`'s snap-picker
   comment called 6 hours "non-dividing" — 6 divides a day's 24 hours evenly, so reworded to
   "stepped".

Left alone, per the dispatch: `harness/timeline-toolbar.ts:114`'s preset picker still throws
`UnknownPresetError` when a reader picks "sixHour" off the dropdown on
`e2e/editing.html` (`resolvePreset` only resolves a string against the shipped presets
table, not a Gantt's own `zoomPresets`). This may be an API gap; the owner decides it.

`FG_E2E_PORT=5186 pnpm verify:full` after this pass: `verify:full PASS — all 17 checks green,
test:e2e included (102s).`

---

### Prior session (2026-09-22, before the OCR pass above)

A follow-up session (2026-09-22, after `origin/main` moved two merges ahead on
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
