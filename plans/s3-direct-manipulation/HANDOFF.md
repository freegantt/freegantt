# S3 implementation handoff

Status as of 2026-08-30: **S3.3 (drag-move) is done and committed.** All five checks are green
(`pnpm vitest run` 572/572, `tsc --noEmit`, `eslint src harness`, `depcruise --config
.dependency-cruiser.cjs src harness`, `node scripts/guard-red-test.mjs`). Continue at **S3.4
(resize)** — read [`s3.4-resize.md`](./s3.4-resize.md) before touching anything.

## What landed this session

Picked up from a prior handoff where S3.3's core (gesture math, pointer stream, shell wiring,
commit path) was already written but untested at the integration level. This session closed out
the remaining TODOs:

- **`src/time/snap.test.ts`** (new) — `snapInstant` (round-down, round-up, `'none'` passthrough,
  a larger increment pushing the upper boundary farther away) and `stepsBetween` (zero, forward,
  backward, spring-forward and fall-back DST crossings preserving wall-clock time). 9/9.
- **`src/layout/gesture-draft.test.ts`** (new) — `draftForMove` (empty entries, single entry,
  multi-entry rigid group, `snap: 'none'` ms fallback, a DST-crossing day-snapped drag) and
  `previewOffsets` (dx/dWidth sign and magnitude, the `extra` flag, an id with no matching
  original entry skipped). 9/9. **Gotcha hit and fixed**: my first DST test assumed midnight
  instantly becomes DST-shifted the day of a spring-forward transition — wrong, the US transition
  is at 2am local, so midnight-to-midnight stays on the pre-transition offset. Rewrote using a
  noon-anchored entry, which cleanly demonstrates the 23-hour (not 24-hour) elapsed time and wall
  clock preserved.
- **`src/api/gantt.test.ts`** — new `describe('Gantt entryMove (S3.3, ...)')` block: a real
  pointerdown/move/up sequence dispatched on the mounted `.fg-timeline-pane` (same
  `document.elementFromPoint` stub pattern S3.1/S3.2 already use, plus a `setPointerCapture`/
  `releasePointerCapture` stub on the pane — `attachPointerGesture` calls these and jsdom/happy-dom
  doesn't implement them). Asserts `beforeEntryMove`/`entryMove` both fire once, `dataset.on('change')`
  fires exactly once (one transaction, D-S3-16), the dataset's entry actually changed to the
  proposed span, and `dataset.undo()` reverts it in one step (`[S3-A6]`). A second test confirms
  `beforeEntryMove` returning `false` leaves the dataset untouched and `canUndo` `false`.
- **`src/data/history.property.test.ts`** — added a `'move'` `SimpleOp` (writes `{start, end}`
  together in one `update()` call, via `addMs` from `time/` since raw arithmetic on an `Instant` is
  banned outside `time/`, I10) to the existing arbitrary, distinct from the pre-existing
  `'update-start'`/`'update-end'` ops which each touch one field alone. This is what a gesture
  commit actually writes per row, so the existing undo-all-restores-byte-identical property now
  exercises that exact shape, not just single-field edits composed in one transaction.
- **`src/view/splitter.ts` / `splitter.test.ts`** — mechanical `SplitterHooks` → `SplitterContext`
  rename (D-S3-5), no behavior change. This was TODO 6, optional/low-priority; did it since it was
  quick and bundled with S3.3 per the decision.
- Updated `s3.3-drag-move.md`'s TODO boxes (all checked) and `README.md`'s step map (S3.3 `done`,
  S3.4 `next`).
- **Committed and pushed to `s3-impl`.**

## What was already on the branch before this session (for context)

Two commits landed between the previous handoff and this session's start, neither reflected in
that handoff's text (it had said "not committed yet" — stale by the time I read it):
`0d5dc18` (S3.3 core) and `4105b08` ("Smooth drag preview, snap only on commit" — the live preview
now tracks the pointer at full pixel resolution and only the commit-time value snaps; also fixed
`fixtures/demo-dataset.ts`'s midnight-drift bug and added a Snap control to the harness). Worth
knowing if `git log` looks unfamiliar against an older handoff copy.

## TODO — in priority order

1. **S3.4 (resize)** — read [`s3.4-resize.md`](./s3.4-resize.md) in full first. Needs
   `draftForResize(input: DraftInput & { edge: 'start' | 'end' })` in `layout/gesture-draft.ts`
   (zero-length clamp; inverted span refused at the layout layer — the spec's own words, not yet
   investigated exactly where "layout layer" means here, check S3.3's `draftForMove` neighbors),
   edge detection in `entry-gestures.ts` from the handle's `data-edge` attribute (handles already
   exist from S3.2 — `.fg-bar-handle[data-edge="start"/"end"]` — this step wires them to a drag,
   doesn't create them), and `beforeEntryResize`/`entryResize` on `GanttEventMap` (not a subtype of
   `EntryMove` — shared fields only, per D-S3-22). Milestones and derived-span kinds (`'group'`)
   must refuse resize via `can('resize')`, same capability seam S3.2 already built.
2. **Harness demo gaps** (not S3.4's own gate, but flagged by the user as a standing ask — see
   `plans/s3-direct-manipulation/README.md`'s step map, which puts the *formal* harness/e2e gate at
   S3.8, `s3.8-cursor-line-harness-gate.md`). Don't block S3.4 on this, but note for whoever reaches
   S3.8: `harness/main.ts` already has Undo/Redo buttons wired to `dataset.canUndo`/`undo()`/
   `redo()` (contrary to an older handoff's claim they were missing) and a Snap control, but still
   no `Ctrl+Z`/`Ctrl+Shift+Z` keydown shortcut, no `Gantt({ dateLines: [...] })` demo (S1.13 still
   has zero harness-visible surface — grep confirms zero `dateLines`/`DateLine` usage under
   `harness/` as of this handoff), and no UI to flip `gantt.interactions` live.
3. Once S3.4 is done and the full check sequence is green, update `s3.4-resize.md`'s TODO boxes,
   `README.md` (S3.4 `done`, S3.5 `next`), and this file, pointing at S3.5
   (`s3.5-keyboard-parity-and-async-veto.md`).

## Gotchas (carried forward + new)

1. **Don't let `view/` import `interaction/` or `time/`.** Unchanged from last handoff.
2. **`view/` cannot call `dataset.transaction()` directly** — `commitEntryEdits` stays an injected
   callback from `api/gantt.ts`. Unchanged.
3. **No raw `requestAnimationFrame` outside `view/frame-scheduler.ts`.** Unchanged.
4. **`itemId(entryId)` is `${entryId}:0`, not the same string.** Unchanged.
5. **Test `PointerEvent`s need a consistent `pointerId`** across `down`/`move`/`up` in the same
   gesture. Unchanged — the new `gantt.test.ts` drag tests all use `pointerId: 1` throughout.
6. **A drag integration test needs `setPointerCapture`/`releasePointerCapture` stubbed on the pane
   element**, not just `document.elementFromPoint` — jsdom/happy-dom implement neither, and
   `attachPointerGesture` calls both unconditionally on arm/release. `entry-gestures.test.ts` had
   this already (`mockPointerCapture`); `gantt.test.ts`'s new tests needed their own
   `stubPointerCapture` helper for the same reason, one level up (the real `.fg-timeline-pane`
   element, not a bare test `pane` div).
7. **DST midnight is not automatically DST-shifted** — the US spring-forward transition happens at
   2am local, not midnight, so a day-boundary snap computed for an early-morning instant can land
   on the *pre-transition* offset even on the transition's own calendar day. A DST test that wants
   to see the offset actually change needs an anchor time later than the transition hour (noon is
   a safe choice) — see `layout/gesture-draft.test.ts`'s DST case for the worked example.
8. **`freegantt/no-instant-arithmetic` and `no-magic-time-constants` lint rules apply inside test
   files too**, not just `src/` non-test code — caught by the pre-commit/eslint hook when I first
   wrote `current.start + op.deltaMs` in `history.property.test.ts` and `1 / 60_000` in
   `gesture-draft.test.ts`. Use `addMs`/`MS.MINUTE` etc. from `time/index.js` instead, same as
   production code would.
9. **Pre-commit hook auto-formats; `protect-spec.sh` may block small `.dependency-cruiser.cjs`
   edits** — use full-file `Write` if needed. Unchanged, not touched this session.
10. **Run all five checks** before marking a step done: `pnpm vitest run`, `tsc --noEmit`,
    `eslint src harness`, `depcruise --config .dependency-cruiser.cjs src harness`,
    `node scripts/guard-red-test.mjs`. All five are green as of this handoff, now including a real
    end-to-end drag-to-commit-to-undo path (`api/gantt.test.ts`'s new tests close the gap the
    previous handoff flagged).
11. **Write a fresh handoff before context runs low** — same as always.
