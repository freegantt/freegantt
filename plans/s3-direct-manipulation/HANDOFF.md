# S3 implementation handoff

Status as of 2026-08-30, end of a session that implemented **S3.2**. Next session should read
`plans/s3-direct-manipulation/README.md` in full before touching `src/`, then continue at **S3.3**.
This file supersedes the previous handoff (S3.1 → S3.2); that one's gotchas that are still live are
folded in below.

## What landed this session (commit `d224d2c` on `s3-impl`, after `9ce93ad`/S3.1)

- **`view/capability.ts`** (new): `resolveCapabilities(interactions, isDerivedSpanKind)` →
  `Capabilities.can(capability, entry)`, over D-S3-9's per-kind default table (span: all true;
  milestone: resize false; a `derivedSpanKinds` kind — e.g. `'group'`: move/resize false, select
  always true; consumer-defined: same as span). `Interactions`/`CapabilityRule` are the public types,
  re-exported through `view/index.ts` → `api/index.ts`.
- **`model/dataset.ts`**: the bindable `Dataset` interface gained `isDerivedSpanKind(kind): boolean` —
  the one predicate `view/capability.ts` needs, without exposing `derivedSpanKinds`'s own shape
  (`ReadonlySet` internally on `DatasetState`, a plain array on the public `Dataset` class). Implemented
  in both `DatasetState` (`src/data/dataset-state.ts`) and the public `Dataset` (`src/api/dataset.ts`,
  delegates to `#state`). **If you write a third thing that structurally satisfies model's `Dataset`
  interface (a test fake, a new store), it now needs this method too** — three test fakes already
  needed the one-line fix this session (`dataset-change-subscription.test.ts`, `gantt-shell.test.ts`,
  `styles.test.ts`), caught by `tsc`, not by eslint.
- **`Gantt.interactions`** (live, `api/gantt.ts`) / **`GanttShell.interactions`** (live,
  `view/gantt-shell.ts`): reassignment re-resolves `#capabilities` immediately and re-derives the two
  affordance ids off the *current* hover/selection, so a stricter rule takes effect without waiting for
  a pointer move.
- **Hover wiring**: `interaction/entry-gestures.ts`'s `EntrySelectionContext` gained
  `setHovered(itemId: ItemId | undefined): void`, called from new `pointermove`/`pointerleave`
  listeners on the pane — it reports the raw hit only, no capability logic (I14 stays one resolution,
  in the shell). `GanttShell.#setHovered` → `#refreshAffordances()` resolves and writes
  `hoveredItemId`/`movableItemId`/`resizableItemId` into the one long-lived `InteractionState` and
  calls `applyState` once. Also called from `#proposeSelection` (selection changes can move the resize
  handles even with the pointer sitting still — see the fallback rule below) and from the
  `interactions` setter.
  - **`resizableItemId`'s fallback rule (D-S3-6), read `#resolveResizableItemId` in
    `gantt-shell.ts` to get this right**: if something is hovered, its own capability answer wins,
    full stop — even "no" beats the selection. Only when *nothing* is hovered, and exactly one entry
    is selected, does the selected entry get a turn. `movableItemId` has no such fallback — it is
    hover-only, per D-S3-6's own wording.
  - `exactOptionalPropertyTypes` makes `interactionState.foo = undefined` a type error when `foo` is
    itself typed `T | undefined` on the read side. Added a tiny `setOptional(target, key, value)`
    helper in `gantt-shell.ts` (does `delete` when `value === undefined`) — reuse it, don't reinvent
    the `if/delete` pair at a fourth call site.
- **`render/backend.ts`**: `InteractionState` gained `resizableItemId?`/`movableItemId?`.
- **`render/dom/index.ts`**: `applyState` is now the real D-S3-8 implementation —
  - One shared `.fg-bar-handle` pair (`data-edge="start"|"end"`), created once at `mount()`, positioned
    onto `resizableItemId`'s committed geometry (a new `barGeomByItemId: Map<ItemId, HandleGeom>`,
    populated in `syncBars`) or parked via the `hidden` DOM **property** — not `style.display`, which
    `no-inline-style-outside-geometry` forbids outside `transform`/`width`/`height`.
  - `movableItemId` → a `data-movable` boolean **attribute**, not `style.cursor` (same lint rule).
    `view/styles.ts` owns the actual rule: `.fg-bar[data-movable] { cursor: grab; }` and
    `.fg-bar-handle { ...; cursor: ew-resize; }`.
  - Both diff against `paintedResizable`/`paintedMovable` the same way `paintedHovered`/`paintedSelected`
    already did — O(changed), no allocation (I5).
- **Public surface**: `Interactions`, `CapabilityRule` now exported from `api/index.ts` (via
  `view/index.ts`). Also fixed a real S3.1 gap while touching these exports: `SelectionChange` (the
  `beforeSelectionChange`/`selectionChange` payload type) was never re-exported from `api/index.ts` —
  a consumer could handle the event but not name its type. Fixed alongside, not a separate step.
- **Tests**: `view/capability.test.ts` (new, pure, 7 cases — the default table + boolean/predicate
  rules); `render/dom/index.test.ts` (+2: handle park/position, `data-movable` toggle);
  `interaction/entry-gestures.test.ts` (+2: hover reporting, detach stops it);
  `view/gantt-shell.test.ts` (+3, new describe block: `[S3-A3]` 1,000-entry hover-every-mounted-bar
  with `computeFrame`-not-called + zero DOM mutations via `MutationObserver`; capability gating on
  `movableItemId`/`resizableItemId`; the selection fallback rule). `api/gantt.test.ts` (+5: a
  resize-incapable entry, a `derivedSpanKinds` entry gets neither cursor nor handle, `selection =`
  bypasses `can('select')`, a `select: false` pointer click is refused, live `interactions`
  reassignment). **Note:** the `[S3-A3]` 1,000-row perf test lives in `gantt-shell.test.ts`, not
  `api/gantt.test.ts` — `overscan` is intentionally not a public `Gantt` option (CLAUDE.md's own
  "two callers, two surfaces" example names it as an expert knob), and `view/` may not import
  `interaction/` (`view-boundary`, depcruise), so these tests drive `EntrySelectionContext.setHovered`
  directly through the shell's injected `entryGestures` callback rather than a real `attachEntryGestures`
  + simulated DOM events.
- **Also fixed, same commit, pre-existing uncommitted work found on disk at session start** (not
  written this session, but verified, kept, and committed together since it touches the same files):
  a double-click inside the Gantt was starting a native text-selection range on nearby page chrome.
  `entry-gestures.ts` gained `mousedown`/`selectstart` listeners (`user-select: none` handles
  in-Gantt highlight; these two stop a double-click's second click from starting a range at all) and
  `styles.ts` gained `user-select: none` on `.fg-container`. Covered by
  `interaction/entry-gestures.test.ts` and a new `e2e/selection.spec.ts` (3 cases, run and passing).
- **Found and fixed while touching `styles.ts`**: the pre-existing uncommitted comment additions there
  used markdown-style backticks (`` `user-select: text` ``, `` `cursor` `` etc.) *inside* the
  `BASE_STYLESHEET` template literal — an unescaped backtick inside a JS template literal terminates
  it early, which broke `tsc`/`eslint` parsing of the whole file. Fixed by dropping the backticks from
  those comments (they're already inside a JS comment; markdown emphasis was never needed and isn't
  safe here). **If you add a comment inside `BASE_STYLESHEET` in future, no backticks, ever** — the
  template-literal-parses-as-one-string failure mode is not obvious from the error location (`tsc`
  reports the parse failure many lines *after* the actual unescaped backtick, wherever the parser next
  hits something that doesn't typecheck as JS).
- Full suite: 546 tests passing, `tsc --noEmit` clean, `eslint` clean, `depcruise` clean,
  `node scripts/guard-red-test.mjs` clean, `e2e/selection.spec.ts` passing. `.slice` is still `S1.13` —
  it only bumps at S3.8.

## Skipped, deliberately, this session

- **The harness "Visible" line** ("handles and a grab cursor appear on capable bars only; groups show
  neither") was **not** wired into `harness/index.html`'s demo dataset. `fixtures/sample-dataset.ts`
  (frozen — dozens of tests pin its exact `2026-09-*` instants) and `fixtures/demo-dataset.ts` (used by
  `harness/scroll-sync.ts`/`data.ts`/`zoom.ts` and `e2e/today-line.spec.ts`) have **no** `kind: 'group'`
  entry today, and no `parentId` at all — every demo entry defaults to `'span'`. Adding one risked
  shifting row order/count other harness pages and that e2e spec render, for a purely cosmetic checklist
  item already proven correctly by `dom` tests (`api/gantt.test.ts`'s capability describe block). If a
  later step wants this, it's a `fixtures/demo-dataset.ts`-only addition (append, don't touch existing
  entries or `sample-dataset.ts`), re-verified against `e2e/today-line.spec.ts`.
- README §8's S3.2 checklist is marked done in `plans/s3-direct-manipulation/README.md` with the
  harness line called out as the one open item, not silently checked off.

## What's NOT done — everything from S3.3 onward

Re-read `plans/s3-direct-manipulation/README.md` §8 for the authoritative list. In order:

- **S3.3 — Drag-move.** `time/snapInstant`; `layout/gesture-draft.ts` (`draftForMove`,
  `previewOffsets`, `ItemPreview`); move `EntryEdits`/`StoredEdit` to `model/` (D-S3-4, re-exported from
  `data/` so no import path breaks); `attachPointerGesture` (new `interaction/pointer-gesture.ts` — arm
  threshold, long-press on coarse pointers per D-S3-21, pointer capture, Escape, teardown); the *real*
  seven-member `EntryGestureContext`/`Gesture` union (D-S3-5, new `interaction/entry-gesture-context.ts`)
  — **decide here** whether `EntrySelectionContext` (today's reduced context, now carrying
  `hitTest`/`entryIdFor`/`canSelect`/`rowOrder`/`selection`/`setHovered`) grows into the full context in
  place inside `entry-gestures.ts`, or gets superseded by a new file that `entry-gestures.ts` then takes
  as its param type — the spec's own §3.2 table says `attachEntryGestures` is one exported function
  growing new outcomes over the same pointer stream, so plan on editing `entry-gestures.ts` in place
  rather than replacing it, but the *context type's* file is still an open call. `beforeEntryMove` → one
  `dataset.transaction()` → `entryMove`; `MutationCancelledError` restores (D-S3-16). Multi-entry draft
  from the selection (D-S3-19). `SplitterHooks` → `SplitterContext` rename (D-S3-5, "one file, one test,
  mechanical" — unrelated to the rest of this step, do it as its own small commit if that's cleaner).
  `[S3-A1]`'s move half, `[S3-A2]`, `[S3-A6]`.
- **S3.4 — Resize.** `draftForResize`; edge detection from the handle grabbed (the two handle nodes
  `render/dom/index.ts` already creates and positions — S3.2 — become live drag targets here, not new
  nodes). `beforeEntryResize`/`entryResize`; zero-length clamp; milestone/derived-span refusal (already
  proven at the *paint* layer by S3.2's capability wiring — this step is the *gesture* refusal, which
  should read off the same `can()` the paint layer already uses via `EntryGestureContext`).
- **S3.5 — Keyboard parity + async veto.** `attachKeyboardEditing`; the shell's one `keydown` listener
  and D-S3-13's mode switch (arrows pan when nothing selected, nudge/resize when something is); the
  editing rows refuse off the same `can()` the pointer path asks; `↑`/`↓` skip `select`-incapable rows.
  `InteractionState.pending` (D-S3-17) — the **lock** half (no second gesture arms) is *not* paint and
  belongs to the gesture machinery's own state, not `InteractionState`; only the dimmed-bar paint half
  goes through `InteractionState.pending`.
- **S3.6 — Extender preview.** The rAF-coalesced extender call (D-S3-18) on the shell's existing
  `FrameScheduler`; extras join `previewOffsets`; inject through the internal
  `DatasetStateOptions.editExtender` (`data/history.property.test.ts:169`'s existing precedent); a
  static-import assertion proving no `scheduling/` import reaches `interaction/`. Two items already
  done ahead of time (marked `[x]` in the README's S3.6 checklist, pre-remap comment fixes) — don't
  redo them.
- **S3.7 — Viewport gestures.** `attachWheelNavigation`/`attachKeyboardNavigation` — these live in
  `view/`, not `interaction/` (D-S3-14, they write no data), so no boundary surprises expected.
- **S3.8 — Cursor line, harness, gate.** `.fg-cursor-line`/`.fg-cursor-line-label`; `cursorX`/
  `cursorLabel` in `InteractionState`; `harness/editing.html`/`editing.ts` (new pages, linked from
  index — **this is also where the S3.2 harness "Visible" gap above could be picked up**, and where P1's
  deferred lock-extender demo lands per the spec); `e2e/direct-manipulation.spec.ts`; the §7 spec-edits
  batch (CONTEXT.md glossary: Gesture, Draft, Ghost, Cursor line, Interaction state, Nudge); `.slice`
  bump and `scripts/slice-gate.mjs`'s `S3` gate entry.

## Gotchas for whoever continues

1. **Don't let `view/` import `interaction/`.** Any new shell wiring goes through the same
   constructor-injection pattern `entryGestures` already uses (now also carrying `setHovered`).
   `depcruise` catches a direct import immediately (`view-boundary`), and this is also why
   `[S3-A3]`'s perf test lives in `gantt-shell.test.ts` driving the injected context directly rather
   than in `api/gantt.test.ts` with real DOM pointer events.
2. **The pre-commit hook auto-formats and lints on every commit** — "unchanged" noise on every staged
   file is Prettier running over already-formatted files, not a problem.
3. **`protect-spec.sh` soft-warns on any `plans/` edit** but hard-blocks a
   `.dependency-cruiser.cjs`/`eslint.config.js` edit that *reduces* the count of `forbid(`/`rules:`/
   `severity` occurrences in the diff's `new_string` alone — use `Write` with the entire file content
   instead of `Edit` if a legitimate boundary edit trips this.
4. **No backticks inside `view/styles.ts`'s `BASE_STYLESHEET` template literal comments** — see above;
   it silently breaks `tsc`/`eslint` parsing of the whole file with a confusing, far-away error location.
5. `exactOptionalPropertyTypes`: clearing an optional `InteractionState` field is `delete`, not
   `= undefined`. Use/extend `setOptional` in `gantt-shell.ts` rather than writing a fourth `if/delete`
   pair by hand.
6. Run `pnpm vitest run`, `npx tsc --noEmit -p tsconfig.json`, `npx eslint src harness`,
   `npx depcruise --config .dependency-cruiser.cjs src harness`, and `node scripts/guard-red-test.mjs`
   before considering any step done — all five are cheap. Also run the relevant `e2e/*.spec.ts` with
   `npx playwright test <file>` for anything that touches pointer/DOM behavior end-to-end (this
   session's double-click fix would not have been caught by the unit suite alone).
7. Budget context carefully. This session did a full read of the ~1,000-line spec, then implemented
   S3.2 end-to-end (7 source files, ~5 test files, 1 new module) inside one sitting without exhausting
   context, but S3.3 is a bigger step (new pointer-gesture base, the real seven-member context, first
   real data mutation + undo). Consider reading only README.md §2 (D-S3-2 through D-S3-5, D-S3-16,
   D-S3-19), §3.2, and §8's S3.3 entry closely, and skimming the rest, rather than re-reading the whole
   file cold — the sections list above already extracts what S3.3 needs.
