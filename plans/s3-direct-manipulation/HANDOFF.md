# S3 implementation handoff

Status as of 2026-08-30: **S3.4 (resize) is done and committed.** All five checks are green
(`pnpm vitest run` 586/586, `tsc --noEmit`, `eslint src harness`, `depcruise --config
.dependency-cruiser.cjs src harness`, `node scripts/guard-red-test.mjs`). Continue at **S3.5
(keyboard parity + async veto)** — read
[`s3.5-keyboard-parity-and-async-veto.md`](./s3.5-keyboard-parity-and-async-veto.md) before touching
anything.

## What landed this session

- **`src/layout/gesture-draft.ts`** — `draftForResize(input: DraftInput & { edge: 'start' | 'end' })`
  (D-S3-4): moves only the grabbed edge by the snapped/stepped calendar delta, holding the opposite
  edge fixed; clamps at zero length instead of letting the dragged edge cross the fixed one (the
  spec's "inverted span refused at the layout layer" — this file is that layer). Mirrors
  `draftForMove`'s snap/`'none'` branching exactly, just against one edge instead of both.
- **`src/render/backend.ts` / `src/render/dom/index.ts`** — `HitResult` grew an optional `edge`.
  `hitTest` now checks `elementFromPoint`'s result against `.fg-bar-handle` first (handles paint on
  top of bars); a hit there resolves to `{ itemId: paintedResizable, edge }` off the handle's own
  `data-edge` attribute (D-S3-8) — a parked (`hidden`) handle is never returned by
  `elementFromPoint`, so no extra guard was needed for that case. Falls through to the existing
  `.fg-bar` hit-test unchanged.
- **`src/interaction/entry-gesture-context.ts` / `entry-gestures.ts`** — `hitTest` now returns
  `EntryHit = { itemId, edge? }` instead of a bare `ItemId`; `entriesForGesture` takes a second
  `capability: 'move' | 'resize'` parameter. `onPointerDown` grabs a resize (`grabbedEdge` set) when
  the hit carries an `edge` and `can('resize', entry)`, else falls back to the existing move grab.
  `currentGesture()` replaces the old hardcoded `moveGesture()` and builds `{ kind: 'resize', edge }`
  or `{ kind: 'move' }` from that one piece of state — same pointer-gesture state machine as S3.3,
  now branching on what was grabbed instead of assuming move.
- **`src/view/gantt-shell.ts`** — `#entriesForGesture` takes the same `capability` param (defaults
  `'move'`, filters by `can(capability, …)` instead of a hardcoded `'move'`); `#draftFor` calls
  `draftForResize` for a `{ kind: 'resize' }` gesture; `#commitGesture` no longer bails out on
  non-move gestures — it builds the `EntryResize` payload (`{ ...span, entries, edge }`) and runs
  `beforeEntryResize` → commit → `entryResize`, the same shape `beforeEntryMove`/`entryMove` already
  had. The `hitTest`/`entriesForGesture` wiring in the constructor now passes `edge`/`capability`
  through instead of stripping them.
- **`src/view/event-bus.ts`** — introduced `EntryGestureEvent` (the shared `{ entry, start, end,
  entries }` shape `ProposedSpan` + `entries` already was) and made `EntryMove` a type alias for it
  rather than extending it; added `EntryResize extends EntryGestureEvent { edge }` — per D-S3-22,
  resize is *not* a subtype of move, both extend the same shared base. `beforeEntryResize`/
  `entryResize` added to `GanttEventMap`. Re-exported through `view/index.ts` and `api/index.ts`
  (`EntryGestureEvent`, `EntryResize` alongside the existing `EntryMove`).
- Tests: `layout/gesture-draft.test.ts` (`draftForResize` — empty input, single-edge move each
  direction, zero-length clamp each direction, multi-selection rigid step, `snap: 'none'` fallback);
  `interaction/entry-gestures.test.ts` (new `describe('… — resize (S3.4)')`: `[S3-A1]`'s resize half —
  a handle grab arms `{ kind: 'resize', edge }` and commits it; a resize-incapable handle grab falls
  back to a plain click); `render/dom/index.test.ts` (`hitTest` resolves a handle hit to
  `{ itemId, edge }`, and never reports an edge while the handle pair is parked);
  `api/gantt.test.ts` (new `describe('Gantt entryResize …')`: a real pointerdown-on-the-end-handle →
  drag → pointerup sequence fires `beforeEntryResize`/`entryResize` once, one dataset transaction,
  undo reverts in one step; `beforeEntryResize` returning `false` leaves the dataset untouched; a
  milestone never renders a resize handle to grab).
- Updated `s3.4-resize.md`'s TODO boxes (all checked) and `README.md`'s step map (S3.4 `done`, S3.5
  `next`).
- **Committed and pushed to `s3-impl`.**

## Gotchas (carried forward + new)

1. **Don't let `view/` import `interaction/` or `time/`.** Unchanged.
2. **`view/` cannot call `dataset.transaction()` directly** — `commitEntryEdits` stays an injected
   callback from `api/gantt.ts`. Unchanged.
3. **No raw `requestAnimationFrame` outside `view/frame-scheduler.ts`.** Unchanged.
4. **`itemId(entryId)` is `${entryId}:0`, not the same string.** Unchanged.
5. **Test `PointerEvent`s need a consistent `pointerId`** across `down`/`move`/`up` in the same
   gesture. Unchanged.
6. **A drag integration test needs `setPointerCapture`/`releasePointerCapture` stubbed on the pane
   element.** Unchanged.
7. **DST midnight is not automatically DST-shifted.** Unchanged (S3.3's gotcha; `draftForResize`
   inherits the same `stepBy`/`stepsBetween` machinery, no new DST case needed for S3.4's own tests).
8. **Lint bans arithmetic (`+ - * / %`) on an `Instant`-typed value outside `time/`, including in test
   files** — but *comparisons* (`<`, `>`) are fine: `draftForResize`'s zero-length clamp compares
   `moved > entry.end` / `moved < entry.start` directly, no `time/` helper needed for that part.
9. **A resize test entry needs `end` set even for a `'milestone'` kind** — `Dataset`'s entry reader
   throws `InvalidInstantError` if `start`/`end` aren't both present or both absent; a milestone in a
   test fixture still needs `end: <same instant as start>` explicitly (there is no kind-based
   default in the reader).
10. **A milestone/derived-span entry never needs its own resize-refusal test in `entry-gestures.ts`**
    — capability is fully resolved before `interaction/` ever sees a hit (S3.2's `resizableItemId`
    only appears for `resize`-capable entries, so a handle to grab never exists for one). The
    `api/gantt.test.ts` milestone test asserts the handle stays `hidden`, not that a grab is refused
    mid-gesture — there's nothing to grab.
11. **This session hit a transient scare, not a real loss**: partway through, `git status` briefly
    reported a clean working tree while another commit (`00c7ef2`, co-authored by a "Cursor" agent —
    apparently another tool operating on this same checkout concurrently) landed and was followed by
    a `git reset` in the reflog. My uncommitted S3.4 edits reappeared on disk moments later (borne
    out by `git diff --stat` right after) and nothing was actually lost, but it's worth knowing this
    working directory is not exclusively mine this session — a future session should `git status`
    defensively if anything looks unfamiliar, and consider committing more frequently to shrink the
    window where a concurrent reset could actually cost work.
12. **Run all five checks** before marking a step done: `pnpm vitest run` (586/586), `tsc --noEmit`,
    `eslint src harness`, `depcruise --config .dependency-cruiser.cjs src harness`,
    `node scripts/guard-red-test.mjs`. All green as of this handoff.
13. **Write a fresh handoff before context runs low** — same as always.

## TODO — in priority order

1. **S3.5 (keyboard parity + async veto)** — read
   [`s3.5-keyboard-parity-and-async-veto.md`](./s3.5-keyboard-parity-and-async-veto.md) in full
   first. Not yet investigated by this session beyond the README's decision table (D-S3-13 keyboard
   map, D-S3-17 async pending, U6/U9 in the requirements table).
2. **Harness demo gaps** (not S3.4's or S3.5's own gate — standing ask, same note as the last two
   handoffs): no `Ctrl+Z`/`Ctrl+Shift+Z` keydown shortcut, no `Gantt({ dateLines: [...] })` demo, no
   UI to flip `gantt.interactions` live, and still no `kind: 'group'` entry in the demo fixture (so
   "a group's edges refuse" is proven only in `dom`/`api` tests, never visible in `harness/`).
3. Once S3.5 is done and the full check sequence is green, update its own TODO boxes, `README.md`
   (S3.5 `done`, S3.6 `next`), and this file, pointing at S3.6
   (`s3.6-extender-preview.md`).
