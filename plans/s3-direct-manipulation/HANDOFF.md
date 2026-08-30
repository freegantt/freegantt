# S3 implementation handoff

Status as of 2026-08-30: **S3.6 (extender preview) is done.** All checks are green
(`pnpm vitest run` 646/646, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm guards`,
`node scripts/guard-red-test.mjs`, `pnpm build`, `pnpm api-report`), plus the full `playwright test`
e2e suite (37/37).

Continue at **S3.7**. The S3.5 D-S3-17 follow-up has landed. Read
[`s3.7-viewport-gestures.md`](./s3.7-viewport-gestures.md).

## What landed this session (S3.6)

D-S3-18's pseudocode, wired for real: `pointermove → draft → rAF → extra = extender({ entries:
committed, proposed: draft }) → previewOffsets({ proposed, extra, entries, scale }) → applyState`.
`GesturePipeline#computePreview` already took an `extra: EntryEdits` parameter shaped for this
(always `EMPTY_EDITS` before this session) — the work was wiring a real value into it, not building
the shape from scratch.

- **`src/view/gesture-pipeline.ts`** — `GesturePipelineDeps` grew two optional members: `extend?:
  EditExtender` (from `data/edit-extension.ts` — `view/` may import `data/`, same edge
  `view/event-bus.ts` already uses non-barrel) and `allEntries?(): ReadonlyMap<EntryId, Entry>`. New
  private `#extraFor(draft)`: `undefined` extend (P1's default — no public install API in S3) returns
  `EMPTY_EDITS`, otherwise calls `extend({ entries: allEntries(), proposed: draft })`. `#computePreview`
  now calls `#extraFor` and folds its result into both `previewOffsets`'s `extra` argument and the
  `entries` array it diffs against (a cascade can touch an entry outside the caller's own draft, so
  `entries` is built from `draft.keys()` **and** `extra.keys()`, deduped, same `pushCapable`-shaped
  pattern `#entriesForGesture` already uses). This runs on the pipeline's own rAF (`#preview`'s
  scheduled callback), never per `pointermove` — one extender call per painted frame, matching the
  existing preview-coalescing cost, not adding a second one.
- **`src/view/gantt-shell.ts`** — `GanttShellOptions.editExtender?: EditExtender`, internal-only
  (P1: no field on the public `GanttOptions`, `api/gantt.ts` never passes one — production `Gantt`
  usage previews no ghost until a real install API exists, S5). Wired straight into
  `GesturePipelineDeps.extend`; `allEntries` is always supplied (`new
  Map(dataset.entries.all.map(e => [e.id, e]))`), built fresh each time a preview frame actually needs
  it (only when `extend` is set) rather than cached, since it must reflect the live committed store.
- **`src/render/dom/index.ts`** — `paintedDragging`/`paintedGhost` (same diff-and-touch-only-changed
  shape as `paintedPending`), computed inside `paintPreview` off `ItemPreview.extra`. `paintDataState`
  grew two params (`dragging`, `ghost`) and two more tokens on the existing fixed `data-state`
  projection. Reset in `destroy()`.
- **`src/view/styles.ts`** — `.fg-bar[data-state~="ghost"] { opacity: var(--fg-ghost-opacity, 0.4);
  pointer-events: none; }`. `dragging` paints no rule of its own yet, same as `hovered`.

**No public API surface change** — `pnpm api-report` produced no diff on `etc/freegantt.api.md`.
`EditExtender`/`EditRequest`, `GanttShellOptions.editExtender`, `GesturePipelineDeps` are all internal
(P1 holds: S3 still publishes no install API for `EditExtender`).

Tests: `src/view/gesture-pipeline.test.ts` gained 3 tests (`[S3-A4]`) — injected `extend` previews a
ghost `ItemPreview` alongside the caller's own draft, no `extend` previews only the draft, `cancel()`
clears both, all using the file's existing `withRoster`/`makeDeps` fake-deps style.
`src/render/dom/index.test.ts` gained 1 test — `applyState({ preview: [...] })` paints
`dragging`/`ghost` off `ItemPreview.extra` and clears them once the preview drops.
**`src/interaction/extender-preview.test.ts`** (new) — the plan's named `[S3-A4]` test file: a real
`GanttShell` (not `Gantt` — `editExtender` isn't public) built directly over a real `DatasetState`
(the "inject through the internal `DatasetStateOptions.editExtender`"-shaped test P1 names), wired
with `entryGestures: attachEntryGestures` and a `commitEntryEdits` closure calling
`state.transaction()`/`state.entries.update()` — the same shape `api/gantt.ts` uses for real. A real
pointer drag (`pointerdown`/`pointermove` past the threshold, `document.elementFromPoint` stubbed,
same pattern `api/gantt.test.ts`'s drag suite uses) with an injected cascading `EditExtender` ghosts
the un-grabbed entry by the identical px delta; Escape mid-drag clears the ghost and writes nothing
(`[S3-A2]` contrast); no `editExtender` (P1's identity default) previews no ghost. This file imports
only `view/`, `data/`, `model/` — never `scheduling/` (S7, doesn't exist yet) — satisfying the plan's
"no `scheduling/` import" line by construction rather than a runtime assertion; the depcruise
`interaction-boundary` rule already forbids that edge globally.
`src/data/history.property.test.ts` — `[S3-A6]` labeled onto the existing "with an injected extender
that cascades an unrelated entry" property test rather than adding a duplicate: `opArb` already mixes
in gesture-shaped `move` ops (added in S3.3), so the existing property already covers "gesture write +
extender cascade undo atomically" — it just wasn't tagged with the acceptance id.

## Gotchas (carried forward + new)

1. **Don't let `view/` import `interaction/` or `time/`.** Unchanged.
2. **`view/` cannot call `dataset.transaction()` directly.** Unchanged.
3. **No raw `requestAnimationFrame` outside `view/frame-scheduler.ts`.** Unchanged — but plenty of
   *tests* legitimately call the real global `requestAnimationFrame` to await one coalesced preview
   frame (`gesture-pipeline.test.ts`'s existing pattern, now also in `extender-preview.test.ts`); that
   is not the same thing as production code scheduling its own frame outside `FrameScheduler`.
4. **A live drag preview (including the S3.6 ghost) is never synchronous** — it lands on the pipeline's
   own rAF, one frame later. A DOM-level test asserting `data-state`/transform right after a
   `pointermove` or an Escape `keydown` dispatch needs `await new Promise((resolve) =>
   requestAnimationFrame(resolve))` first, or it reads stale (pre-preview) state. This tripped both
   new `extender-preview.test.ts` tests on the first pass this session. **Exception:** the D-S3-17
   pending ghost is an immediate `#paintNow()` of the commit draft — `pointerup` tests may read
   transform and `data-state~="pending"` in the same tick.
5. **I10's `no-instant-arithmetic` lint is type-aware and reaches test files too** — even a file that
   cannot import `time/` (`interaction/`) must not do `someInstant - anotherInstant` arithmetic
   directly; cast to `as unknown as number` first (unbranding), do the arithmetic, cast back. See
   `extender-preview.test.ts`'s `makeCascadeExtender`.
6. **`itemId(entryId)` is `${entryId}:0`, not the same string.** Unchanged.
7. **A drag integration test needs `setPointerCapture`/`releasePointerCapture` stubbed on the pane
   element**, and `render/dom`'s `hitTest` resolves through `document.elementFromPoint` (not layout
   math) — stub that too, keyed on the one point each test drags from. Unchanged (S3.3's gotcha),
   reused as-is for `extender-preview.test.ts`.
8. **`EventBus`'s `TAsyncKeys` is opt-in per instantiation, not per `on()` call.** Unchanged (S3.5).
9. **Run all checks** before marking a step done: `pnpm vitest run`, `pnpm typecheck`, `pnpm lint`,
   `pnpm boundaries`, `pnpm guards`, `node scripts/guard-red-test.mjs`, `pnpm build`,
   `pnpm api-report`, plus `pnpm test:e2e`. All green as of this handoff. Note: `pnpm boundaries` run
   concurrently with a `pnpm guards` run (which itself invokes `guard-red-test.mjs`, writing and
   deleting a temp fixture under `src/interaction/`) can show one transient, spurious dependency
   violation on that fixture's path if the two commands race on the filesystem — rerun `pnpm
   boundaries` alone before treating a failure there as real.
10. **Write a fresh handoff before context runs low** — same as always.

## TODO — in priority order

1. **S3.7 (viewport gestures)** — read [`s3.7-viewport-gestures.md`](./s3.7-viewport-gestures.md) in
   full before touching anything. D-S3-14: viewport gestures (wheel zoom/pan) live in `view/`, write
   nothing to the dataset (`[S3-A7]`).
2. **Harness demo gaps** (standing ask, carried across several handoffs now): no `Ctrl+Z`/
   `Ctrl+Shift+Z` keydown shortcut, no `Gantt({ dateLines: [...] })` demo, no UI to flip
   `gantt.interactions` live, no `kind: 'group'` entry in the demo fixture, no visible way to see a
   keyboard nudge or the async-veto `pending` state in `harness/` itself, and — new, S3.6's own gap —
   no way to see an extender ghost in `harness/` either, since S3 has no public install API for one
   (P1: that demo is explicitly deferred to S5, `plans/s3-direct-manipulation/README.md`'s Deferred
   table). None of this blocks S3.7; it is explicitly S3.8's gate to close.
3. Once S3.7 is done and the full check sequence (including `pnpm test:e2e`) is green, update its own
   TODO boxes, `README.md` (S3.7 `done`, S3.8 `next`), and this file, pointing at S3.8
   (`s3.8-cursor-line-harness-gate.md`).
