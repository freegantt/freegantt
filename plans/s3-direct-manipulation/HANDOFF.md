# S3 implementation handoff

Status as of 2026-08-30: **S3.5 (keyboard parity + async veto) is done.** All checks are green
(`pnpm vitest run` 639/639, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm guards`,
`node scripts/guard-red-test.mjs`, `pnpm build`, `pnpm api-report`), plus the full `playwright test`
e2e suite (37/37). The gesture-host-refactor (between S3.4 and S3.5) was already done and committed
before this session started; this session found the tracker files hadn't been updated to say so and
fixed that alongside its own S3.5 work.

Continue at **S3.6 (extender preview)** — read
[`s3.6-extender-preview.md`](./s3.6-extender-preview.md) before touching anything; its status is
"partial" already (some prior work landed), not a cold start.

## What landed this session (S3.5)

**Keyboard nudge** reuses the pointer commit pipeline rather than a parallel calendar-stepping path:

- **`src/interaction/keyboard-editing.ts`** (new) — `attachKeyboardEditing(container, ctx)`. One
  `keydown` listener, gated on `ctx.selection.get()[0]`: nothing selected is a no-op (S3.7 owns pan
  bindings there, not yet built); something selected implements D-S3-13's table — `↑`/`↓` move the
  selection to the next/previous `select`-capable row over `rowOrder()` (skipping incapable ones,
  same shape `entry-gestures.ts`'s shift-click range already uses); `←`/`→` call
  `ctx.session(grabbed, {kind:'move'}).nudge(direction)`; `Shift+←/→` grab `{kind:'resize',edge:'end'}`
  instead; `Alt` passes `{suspendSnap:true}`. Never resolves a pixel or an `Instant` itself (I1) — it
  only picks `direction: 1 | -1` and hands it to `session().nudge()`.
- **`src/view/entry-gesture-context.ts`** — `EntryGestureSession` grew a fourth method,
  `nudge(direction, options): Promise<boolean>`, alongside `preview`/`commit`/`cancel`.
- **`src/view/gesture-pipeline.ts`** — `session()` now also returns `nudge`, implemented as
  `#stepPx(gesture, anchor, suspendSnap) * direction` fed straight into the existing
  `#draftFor`/`#commit` — `#stepPx` asks `TimeScale.widthForDuration` for one resolved snap unit's
  px width (falling back to the preset's own tick when `suspendSnap` clears snap to `'none'`), so a
  keyboard step is pixel-for-pixel the same math a mouse drag's `commit(dxPx)` already runs.
- **`src/view/gantt-shell.ts`** — builds one `EntryGestureContext` object in the constructor now
  (previously an inline literal passed only to `attachEntryGestures`) and passes the *same* instance to
  both `options.entryGestures?.(...)` and the new `options.keyboardEditing?.(...)` (new
  `AttachKeyboardEditing`/`KeyboardEditingAttachment` types, same DI shape as `AttachEntryGestures` —
  `view/` still cannot import `interaction/`). `#keyboardEditing` field added, detached in `destroy()`.
- **`src/api/gantt.ts`** — passes `attachKeyboardEditing` from `interaction/index.ts`.

**Async veto (D-S3-17)** — a `beforeEntryMove`/`beforeEntryResize` handler may now return
`Promise<void | false>` instead of resolving synchronously:

- **`src/data/event-bus.ts`** — `EventBus<TEvents, TAsyncKeys extends keyof TEvents = never>`.
  `TAsyncKeys` (default `never`) names which event keys may have a Promise-returning handler; `on`/
  `off`'s handler type and `emit`'s return type widen only for those keys (a conditional type). Every
  handler still runs (no short-circuit on a sync veto, unchanged from before); a sync `false` from any
  handler wins immediately; if none did but some returned a Promise, the overall result is
  `Promise.all(...).then(results => !results.includes(false))`. `data/dataset-state.ts`'s
  `EventBus<DatasetEventMap>` (used by `data/transaction.ts`'s `beforeChange`) is unaffected — it never
  names `TAsyncKeys`, so it stays sync-only exactly as before, no code there changed.
- **`src/view/event-bus.ts`** — `AsyncCancelableEvent = 'beforeEntryMove' | 'beforeEntryResize'`
  (the only two names), `GanttEventHandler<K>` (the one handler type `Gantt.on`/`off` and
  `GanttShell.on`/`off` all share now, replacing four copies of the same inline union).
  `GanttShell`'s `#events` is now `EventBus<GanttEventMap, AsyncCancelableEvent>`.
- **`src/view/gesture-pipeline.ts`**'s `#commit` — **important shape**: a sync `true`/`false` from
  `emit(...)` resolves (and, for `true`, actually commits — `commitEntryEdits` + the after-event) fully
  *synchronously* inside `#commit`, wrapped only in `Promise.resolve()` at the very end. Only a
  genuine Promise result goes through `#awaitVeto`, which sets `#pendingItemIds`/calls
  `#deps.setPending(itemIds)`, awaits, then clears both in a `.finally()`. **Do not** restructure this
  into one `.then()`-chained path for both cases — an earlier draft this session did that and broke
  `api/gantt.test.ts`'s synchronous (non-`async`) drag tests, which assert `entryMove` fired *before*
  the test function returns; that only holds if the sync path never crosses a microtask boundary.
- **`session()`** now refuses to arm (`return undefined`) while `#pendingItemIds !== undefined` — one
  choke point (I14) both the pointer path and `keyboard-editing.ts` go through, so neither needs its
  own pending check.
- **`src/render/backend.ts`** — `InteractionState.pendingItemIds?: readonly ItemId[]`.
- **`src/render/dom/index.ts`** — `paintedPending` set (same diff-and-touch-only-changed pattern as
  `paintedSelected`), `paintDataState` gained a `pending` param/token, reset in `destroy()`.
- **`src/view/styles.ts`** — `.fg-bar[data-state~="pending"] { opacity: var(--fg-pending-opacity, 0.6); }`.

**Public API surface change** (confirmed intentional, `pnpm api-report` updated and committed):
`Gantt.on`/`Gantt.off`'s handler parameter is now `GanttEventHandler<K>` instead of an inline
`(payload) => void | false` — for `'beforeEntryMove'`/`'beforeEntryResize'` specifically, a handler may
return `Promise<void | false>`. `GanttEventHandler`/`AsyncCancelableEvent` are now exported from
`api/index.ts` (api-extractor's `ae-forgotten-export` caught the initial miss — re-run
`npx api-extractor run --local --config api-extractor.json` and diff `etc/freegantt.api.md` after any
future public-type change, not just `pnpm api-report`'s pass/fail).

Tests: `src/interaction/keyboard-editing.test.ts` (new, 11 tests — fake-context style matching
`entry-gestures.test.ts`); `src/view/gesture-pipeline.test.ts` gained `nudge()` (4 tests, using a
5-minute/300,000ms tick — **not** a real hour, because I10's magic-time-constant lint bans the literal
`3600000` outside `time/`, and this file is `view/`, which the `view-boundary` dependency-cruiser rule
also forbids from importing `time/` to compute it any other way) and async-veto/pending (4 tests);
`src/api/gantt.test.ts` gained a keyboard-nudge integration describe block (4 tests, real `keydown`
dispatch) and an async-veto/pending describe block (2 tests, real pointer drag + a `Promise`-returning
`beforeEntryMove` handler, `await new Promise(r => setTimeout(r, 0))` to flush the multi-tick
`.then()`/`.finally()` chain rather than counting exact microtask ticks).

## Gotchas (carried forward + new)

1. **Don't let `view/` import `interaction/` or `time/`.** Unchanged (the `time/` half is why the
   `nudge()` tests above use a made-up 5-minute tick instead of a real hour).
2. **`view/` cannot call `dataset.transaction()` directly.** Unchanged.
3. **No raw `requestAnimationFrame` outside `view/frame-scheduler.ts`.** Unchanged.
4. **`itemId(entryId)` is `${entryId}:0`, not the same string.** Unchanged.
5. **A synchronous (non-`async`) test asserting an after-event fired requires the commit path to never
   cross a microtask boundary for the sync case** — see `#commit`'s shape note above. If you touch
   `GesturePipeline#commit` again, run the full `pnpm vitest run` before assuming a refactor is
   behavior-preserving; a `.then()`-only rewrite compiles fine and fails two specific sync tests.
6. **`EventBus`'s `TAsyncKeys` is opt-in per instantiation, not per `on()` call** — `new
   EventBus<TEvents>()` (default `never`) stays fully sync-only; only `new EventBus<TEvents,
   'someKey'>()` grants that one key's handlers a Promise return. `data/dataset-state.ts`'s bus was
   deliberately left at the default — `beforeChange` is not part of D-S3-17's scope.
7. **Magic-time-constant lint (I10) reaches test files too** — `3_600_000`/`60_000`/`86_400_000`/
   `604_800_000` are banned literals anywhere outside `time/`, tests included. `300_000` (5 minutes)
   is not banned and was this session's workaround for `gesture-pipeline.test.ts`'s `nudge()` tests.
8. **A drag integration test needs `setPointerCapture`/`releasePointerCapture` stubbed on the pane
   element.** Unchanged (S3.3's gotcha).
9. **Run all checks** before marking a step done: `pnpm vitest run`, `pnpm typecheck`, `pnpm lint`,
   `pnpm boundaries`, `pnpm guards`, `node scripts/guard-red-test.mjs`, `pnpm build`,
   `pnpm api-report` (this last one specifically — a public-surface change silently drifts otherwise),
   plus `pnpm test:e2e`. All green as of this handoff.
10. **Write a fresh handoff before context runs low** — same as always.

## TODO — in priority order

1. **S3.6 (extender preview)** — read [`s3.6-extender-preview.md`](./s3.6-extender-preview.md) in
   full; it is already "partial", not a cold start. `GesturePipeline#computePreview` already takes an
   `extra: EntryEdits` parameter shaped for this (currently always `EMPTY_EDITS`) — check what's
   already wired before assuming a blank slate.
2. **Harness demo gaps** (standing ask, carried across several handoffs now): no `Ctrl+Z`/
   `Ctrl+Shift+Z` keydown shortcut, no `Gantt({ dateLines: [...] })` demo, no UI to flip
   `gantt.interactions` live, no `kind: 'group'` entry in the demo fixture, and — new this session — no
   visible way to see a keyboard nudge or the async-veto `pending` state in `harness/` itself (both are
   proven only by `api/gantt.test.ts`'s `dom`-environment integration tests, never in a real browser).
   None of this blocks S3.6; it is explicitly S3.8's gate to close.
3. Once S3.6 is done and the full check sequence (including `pnpm test:e2e`) is green, update its own
   TODO boxes, `README.md` (S3.6 `done`, S3.7 `next`), and this file, pointing at S3.7
   (`s3.7-viewport-gestures.md`).
