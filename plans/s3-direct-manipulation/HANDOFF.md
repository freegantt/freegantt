# S3 implementation handoff

Status as of 2026-08-30, end of a session that implemented **S3.1** plus its two prerequisite
boundary changes. Next session should read `plans/s3-direct-manipulation/README.md` in full (it's
~1000 lines but every decision matters) before touching `src/`, then continue at **S3.2**.

## What landed this session (commit `9ce93ad` on `s3-impl`)

- **P3**, closed: `INT --> MODEL` arrow added (`.dependency-cruiser.cjs`, `plans/01-domain-architecture.md`
  §1), so `interaction/` can name `Entry`/`EntryId`/`ItemId`. Guard-red-test fixture added proving the
  widening stays to one arrow (`interaction/` still can't reach `layout/`/`time/`/`render/`).
- **A second boundary gap found and fixed, not anticipated by the spec's own §0**: `view/` has no
  legal path to import `interaction/` (`INT --> VIEW` is the only drawn edge; `extensions/` doesn't
  exist until S5). Fix, approved by the user the same way P3 was: added `API --> INT`, and
  `GanttShell` takes its pointer-gesture attachment by **constructor injection** — a structurally-typed
  `AttachEntryGestures` option (see the big comment above it in `src/view/gantt-shell.ts`), not an
  import. `api/gantt.ts` is the one file that actually imports `interaction/` and passes
  `attachEntryGestures` in. **If a later step (S3.3+) needs to wire more interaction/ pieces into the
  shell, use the same injection pattern — do not add a static `view/ -> interaction/` import.** This is
  documented in `plans/01-domain-architecture.md` §1 and in the README's P3 section (a note was added
  after the original P3 prose).
- **S3.1 (Selection)**, all five checklist boxes ticked:
  - `Gantt.selection` get/set (`src/api/gantt.ts`), `GanttShell.selection` (`src/view/gantt-shell.ts`)
    owns the real logic — `#proposeSelection` does the before/after event dance with a same-set no-op
    check.
  - `beforeSelectionChange`/`selectionChange` on `GanttEventMap` (`src/view/event-bus.ts`), sync veto
    only (selection has no async-veto path — that's `beforeEntryMove`/`beforeEntryResize`, D-S3-17,
    S3.3/S3.4).
  - `InteractionState.selectedItemIds` written by the shell from `#selection` via `itemId()`; the
    shell also rebuilds `#itemEntryIds: Map<ItemId, EntryId>` every `render()` from `frame.bars`
    (today `itemId(entryId)` is 1:1 since `layout/frame.ts` doesn't yet lay out segments as separate
    items — the map is there so this stays correct the moment segments do land).
  - `render/dom/index.ts`'s `applyState` is real now: diffs `hoveredItemId`/`selectedItemIds` against
    what it last painted and touches only the changed bars (`paintDataState`, D-S3-7's projection).
    Only `hovered`/`selected` tokens exist so far — `dragging`/`ghost`/`pending` need `ItemPreview`
    (S3.3+) and are not wired.
  - `--fg-selection-color` token added to both palettes in `src/view/styles.ts`, plus the
    `.fg-bar[data-state~="selected"]` rule. Picked a hue distinct from `--fg-bar-fill` on purpose (an
    outline the same colour as the bar's own fill would be invisible).
  - `src/interaction/entry-gestures.ts` exports `attachEntryGestures` — **S3.1's own reduced context**
    (`EntrySelectionContext`: `hitTest`/`entryIdFor`/`canSelect`/`rowOrder`/`selection`), deliberately
    *not* the full seven-member `EntryGestureContext` from D-S3-5 — that type is S3.3's job
    (`entry-gesture-context.ts` doesn't exist yet). Don't be surprised the file doesn't match D-S3-5's
    interface yet; growing it incrementally is intentional (CLAUDE.md: no premature abstraction).
    `canSelect` is hardcoded `() => true` in the shell's wiring today — S3.2 replaces that with a real
    `view/capability.ts` call.
  - Harness: `harness/main.ts`/`index.html` (not `editing.html` — that's S3.8) got a `#selection-readout`
    line wired to `selectionChange`.
- Tests added: `src/interaction/entry-gestures.test.ts` (pointer semantics, no DOM layout needed —
  `hitTest`/`entryIdFor` are faked), `src/render/dom/index.test.ts` (applyState diffing), a `describe`
  block in `src/api/gantt.test.ts` tagged `[S3-A1]` (the acceptance id `plans/s3-direct-manipulation/
  README.md` §6 says selection's assertions belong under, even though selection isn't one of the three
  "gesture" tests `[S3-A1]` otherwise covers).
- Full suite: 525 tests passing, `tsc --noEmit` clean, `eslint` clean, `depcruise` clean,
  `node scripts/guard-red-test.mjs` clean. `.slice` is still `S1.13` — it only bumps at S3.8.

## What's NOT done — everything from S3.2 onward

Re-read `plans/s3-direct-manipulation/README.md` §8 (the TODO) for the authoritative list. In order:

- **S3.2 — hot path and capabilities.** `view/capability.ts` (`resolveCapabilities`, `Interactions`,
  `CapabilityRule`, D-S3-9's per-kind default table), `Gantt.interactions` live property, hover
  wiring (`hoveredItemId`, already paints via `applyState` — just needs a hover listener that isn't
  built yet), the shared `.fg-bar-handle` pair (D-S3-8), `movableItemId`/`resizableItemId` on
  `InteractionState` (need to add these two fields — currently only `hoveredItemId`/`selectedItemIds`
  exist). Wire the shell's `canSelect` to the real capability resolver instead of the current
  `() => true` stub. No prerequisite left — P3 is closed.
- **S3.3 — drag-move.** `time/snapInstant`, `layout/gesture-draft.ts` (`draftForMove`,
  `previewOffsets`, `ItemPreview`), move `EntryEdits`/`StoredEdit` to `model/` (D-S3-4), the pointer
  base (`attachPointerGesture` in a new `interaction/pointer-gesture.ts`), the *real*
  `EntryGestureContext` (D-S3-5, `interaction/entry-gesture-context.ts` — this is where
  `EntrySelectionContext` either grows into it or gets superseded; check whether `entry-gestures.ts`'s
  existing selection logic should be folded into the same file/context or kept separate — the spec's
  §3.2 table lists them as the same exported function `attachEntryGestures` growing new outcomes over
  the same pointer stream, so plan on editing `entry-gestures.ts` in place rather than replacing it).
  `SplitterHooks` → `SplitterContext` rename (D-S3-5, "one file, one test, mechanical").
- **S3.4 — resize.** `draftForResize`, edge detection, zero-length clamp.
- **S3.5 — keyboard parity + async veto.** `attachKeyboardEditing`, the mode-switch keydown listener
  (D-S3-13), `InteractionState.pending`.
- **S3.6 — extender preview.** rAF-coalesced extender call (D-S3-18), inject via
  `DatasetStateOptions.editExtender` (already the sanctioned internal seam — see
  `data/history.property.test.ts:169` for the precedent). Two items already done ahead of time (marked
  `[x]` in the README's S3.6 checklist): the pre-remap "S3 means scheduling" comment fixes.
- **S3.7 — viewport gestures.** `attachWheelNavigation`, `attachKeyboardNavigation` — these live in
  `view/`, not `interaction/` (D-S3-14, they write no data), so no boundary surprises expected here.
- **S3.8 — cursor line, harness, gate.** `.fg-cursor-line`, `harness/editing.html`/`editing.ts` (new
  pages, linked from index), `e2e/direct-manipulation.spec.ts`, the §7 spec edits batch (CONTEXT.md
  new glossary entries — **Gesture**, **Draft**, **Ghost**, **Cursor line**, **Interaction state**,
  **Nudge** — deliberately deferred to this step rather than done piecemeal), `plans/01` §9's
  Drag/Resize/Select/Keyboard controller-sketch prose needs rewriting to name the attachments actually
  shipped (also deferred — doing it now would describe files that don't exist yet). `.slice` bump and
  `scripts/slice-gate.mjs`'s `S3` gate entry (mirroring the `S1.12`/`S1.13` gate shape already in that
  file) both happen here too.

## Gotchas for whoever continues

1. **Don't let `view/` import `interaction/`.** Any new shell wiring for S3.3+ goes through the same
   constructor-injection pattern `entryGestures` already uses. `depcruise` will catch a direct import
   immediately (`view-boundary` rule), but it's worth knowing *why* up front rather than rediscovering
   the DI trick from a failing hook.
2. **The pre-commit hook auto-formats and lints on every commit** — don't be alarmed by "unchanged"
   noise; it's Prettier running over already-formatted files.
3. **`protect-spec.sh` soft-warns on any `plans/` edit** (not a hard block) but hard-blocks a
   `.dependency-cruiser.cjs`/`eslint.config.js` edit that *reduces* the count of `forbid(`/`rules:`/
   `severity` occurrences in the diff's `new_string` alone (a known false-positive trap for small
   `Edit` calls that touch a file with many existing `forbid()` calls) — if a legitimate boundary edit
   gets blocked this way, use `Write` with the *entire* file content instead of `Edit`, so old/new
   counts are comparable.
4. `Gantt.interactions` (S3.2) doesn't exist yet — `src/view/gantt-shell.ts`'s `canSelect: () => true`
   in the `attachEntryGestures` wiring is a known, intentional stub for S3.1 only.
5. `InteractionState` (`src/render/backend.ts`) currently has only `hoveredItemId`/`selectedItemIds`.
   D-S3-6 in the spec shows the *eventual* full shape (`resizableItemId`, `movableItemId`, `preview`,
   `cursorX`, `cursorLabel`, `pending`) — add fields incrementally as each step needs them rather than
   all at once; that's what S3.1 did.
6. Run `pnpm vitest run`, `npx tsc --noEmit -p tsconfig.json`, `npx eslint src harness`,
   `npx depcruise --config .dependency-cruiser.cjs src harness`, and `node scripts/guard-red-test.mjs`
   before considering any step done — all five are cheap and this session used exactly this sequence
   after each change.
7. Budget context carefully — this spec is ~1000 lines and the remaining 7 steps are each a real
   vertical slice with new files, tests and often a design question the spec left slightly open (the
   API→INT gap this session hit is exactly the kind of thing to expect again, e.g. S3.3's
   `EntryGestureContext` shape vs. this session's `EntrySelectionContext`). Stop and write a fresh
   handoff (delete or supersede this file) well before exhausting the context window.
