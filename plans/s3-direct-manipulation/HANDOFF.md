# S3 implementation handoff

Status as of 2026-08-30: **S3.7 (viewport gestures) is done.** Continue at **S3.8**.
Read [`s3.8-cursor-line-harness-gate.md`](./s3.8-cursor-line-harness-gate.md).

## What landed this session (S3.7)

D-S3-14: wheel zoom/pan and keyboard pan live in `view/`, write nothing to the dataset.

- **`src/view/wheel-navigation.ts`** — `attachWheelNavigation(pane, ctx)`. ctrl/⌘+wheel calls
  `zoomIn`/`zoomOut` (one `zoomPresets` step per 100 px of wheel delta, anchored at `offsetX`
  from `clientX - pane left`). Trackpad crumbs accumulate. `zoomBy` is not on this path — it
  stretches ticks without changing the preset. shift+wheel pans on x (`deltaX`, or `deltaY`
  when `deltaX` is 0). `{ passive: false }` + `preventDefault` only when the gesture is enabled
  and handled. A plain wheel is left to native scroll.
- **`src/view/keyboard-navigation.ts`** — `attachKeyboardNavigation(container, ctx)`. PageUp/Down
  pan y by pane height; Home/End pan x to 0 / `scroll.max.x` (even with a selection — D-S3-13
  "never re-bound"); unmodified arrows pan by one tick / one row height only when the selection
  is empty. Two keydown listeners (this file + `attachKeyboardEditing`) split the D-S3-13 table
  the same per-module way S3.5 already shipped; the shell does not merge them.
- **`src/view/viewport-gestures.ts`** — public `ViewportGestures` (`boolean | { wheelZoom?,
  wheelPan?, keyboardPan? }`). `false` turns every viewport gesture off; omitted flags stay on.
  Does not gate `zoomBy` / `panToDate` / `zoomIn`.
- **`GanttShell` / `Gantt`** — always attach both; live `viewportGestures` getter/setter. Pan goes
  through `ScrollModel.panTo` (I12).

Tests: unit files for both attachments + `resolveViewportGestures`; `[S3-A7]` in
`src/api/gantt.test.ts` (ctrl+wheel anchored, shift+wheel pan, Page/Home/End, no `change` event,
and the disable switch).

## Gotchas (carried forward)

1. **Don't let `view/` import `interaction/` or `time/`.** Unchanged.
2. **`view/` cannot call `dataset.transaction()` directly.** Unchanged.
3. **No raw `requestAnimationFrame` outside `view/frame-scheduler.ts`.** Unchanged.
4. **A live drag preview is never synchronous** — still needs an rAF wait in DOM tests (S3.6).
5. **I10's `no-instant-arithmetic` lint is type-aware and reaches test files too.** Unchanged.
6. **`itemId(entryId)` is `${entryId}:0`.** Unchanged.
7. **A drag integration test needs `setPointerCapture` stubbed and `elementFromPoint` stubbed.**
   Unchanged.
8. **Wheel `offsetX` must not use `event.offsetX`** — that is relative to the event target (a bar),
   not the pane. Always `clientX - pane.getBoundingClientRect().left`. That call is an I9 lint
   exemption on `wheel-navigation.ts` (pane-box left, not a row height). happy-dom's `WheelEvent`
   drops `ctrlKey`/`clientX`; unit tests `defineProperty` those fields.
9. **`zoomIn`/`zoomOut` look up the ladder by `preset.id`**, not object identity. The index harness
   spreads `{ ...gantt.preset, snap }` on load (#116). Reference `indexOf` made `canZoom*` false
   and the wheel a no-op. Carry `snap` across a ladder step.
10. **Run all checks** before marking a step done. `pnpm boundaries` raced with `pnpm guards` can
   show a transient violation — rerun `boundaries` alone.
11. **`.slice` bumps only at S3.8.**

## TODO — in priority order

1. **S3.8 (cursor line, harness, gate)** — read `s3.8-cursor-line-harness-gate.md` in full.
   Harness demo gaps from earlier steps (Ctrl+Z, dateLines demo, live `interactions` flip,
   keyboard-nudge visibility, extender-ghost demo deferred to S5) close here.
2. After S3.8 is green, bump `.slice` and the `S3 → S4` gate.
