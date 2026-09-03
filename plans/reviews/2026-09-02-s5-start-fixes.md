# Fix plan — s5-start branch review findings

## Handoff — 2026-09-02, session 1

Done this session: every purely mechanical item across Slices 2, 5, and 6 (comment/citation
fixes, one rename, one param rename, one glossary line, one superseded-marker comment) — the
"few simplest findings that fit a small context window" pass. No behavior changes; nothing
requiring new tests. Verified clean: `pnpm tsc`, `pnpm boundaries` (depcruise), and
`pnpm test:dom` (384/384 passing, popup suite included). `pnpm test:node` was not re-run this
session (none of the touched files are in the pure/node project) — worth including in the next
full sweep regardless.

Files touched, uncommitted on `s5-start`: `.dependency-cruiser.cjs`, `CONTEXT.md`,
`src/extensions/popup.test.ts`, `src/render/dom/element-description.ts`,
`src/view/keyboard-navigation.ts`, `src/view/pane-layout.ts`, `src/view/styles.ts`. Not committed
— hand off as working-tree changes; commit when you're ready to checkpoint.

One process note for whoever picks this up: `.claude/hooks/check-file.sh` (the ESLint
PostToolUse hook) threw a batch of `no-unused-vars`/`no-unsafe-*` errors on
`popup.test.ts` after the `fakeHost`→`fakeAnchor` rename that a direct `npx eslint` run did not
reproduce — looked like a stale type-service cache reacting to the file mid-edit, not a real
error. If the hook fires something that contradicts a fresh `npx eslint <file>` run, trust the
direct run.

Not started: everything in Slices 1, 3, 4, and the four remaining items in Slice 5/6 that need
real code changes or a design call (C1 install() atomicity, C2 the registration gate, C3 popup
Escape→keymap, the scroll-dismiss scoping and flip-test-fixture fix, the command-catalog
extraction, the keymap double-eval cleanup, the C5 generic-type exports, the bounds-naming
unification, and the doc-sentence additions). **Recommended next slice: Slice 1** — it's the
highest-leverage item (every later S5.x slice's `register*` inherits the gate or the leak) and
was the review's own top recommendation. It needs actual logic changes plus new tests, so budget
a full session for it rather than folding it into a "quick fixes" pass.

---

Source: `plans/reviews/2026-09-02-s5-start.html` (2026-09-02). Every finding below was
independently re-verified against the branch before this list was written — three parallel
code searches plus a manual trace of `plugin-runtime.ts`'s throw path. All confirmed real. One
correction along the way: the review's C1 claim was initially waved off by one verification pass
as unfounded, but a direct trace shows `PluginRuntime.install()`'s `#installed` field is only
reassigned at the very end of the method — a line skipped entirely when `setup()` throws — so
the bug is real and C1 stays in the plan.

Ordered by leverage: `plugin-runtime.ts` first (S5.4–S5.12 all build on it — a fix here is
inherited free by every later slice; a leak here gets copied by every later slice). Then popup,
then the shell, then docs/glossary. Expect this to span multiple sessions — check items off as
they land, and re-run `pnpm test && pnpm tsc && pnpm depcruise && pnpm api-report` at the end of
each slice below before moving to the next.

---

## Slice 1 — `plugin-runtime.ts`: atomicity + one gate for every `register*`

Highest leverage: both bugs live in the seam every later slice's `register*` reuses.

- [ ] **C1 — make `install()` atomic.** Reorder so `toAdd` plugins are set up *before* `removed`
      plugins are disposed (unwind only the new batch on a `setup()` throw, as today); dispose
      `removed` only after every addition's `setup()` succeeded; commit
      `this.#installed = [...kept, ...justInstalled]` last. Today a thrown `setup()` skips that
      final reassignment, so `#installed` still holds the just-disposed `removed` plugins — primed
      to be disposed a second time on the next `install()` call.
      `src/extensions/plugin-runtime.ts:95-133`
- [ ] Regression test for C1: install a set with a real removal *and* a throwing addition; assert
      the removed plugin's `dispose()` ran exactly once and it is gone from `.plugins` after the
      throw (not silently re-listed).
- [ ] **C2 — gate every `register*`, not just `registerKeybinding`.** `ctx.commands` is handed to
      plugins as the raw `CommandRegistry`, so `ctx.commands.register()` after `setup()` returns
      silently succeeds — D-S5-4 says it must throw `RegistrationClosedError`. Wrap `ctx.commands`
      the same way `registerKeybinding` is already wrapped (`gate.assertOpen()` first), ideally by
      deepening `PluginRuntime`/`BuiltPluginContext` so future S5.4+ registration surfaces
      (`registerRenderer`, `registerDecoration`, `registerGridColumn`) inherit the gate instead of
      each call site re-deriving it by hand.
      `src/view/gantt-shell.ts:443` (leak) vs `:436-438` (correct pattern)
- [ ] Regression test for C2: `ctx.commands.register()` called after `setup()` returns throws
      `RegistrationClosedError`, mirroring the existing `registerKeybinding` gate test.
- [ ] `pnpm test && pnpm tsc && pnpm depcruise` clean before moving on.

## Slice 2 — popup: collapse three mechanisms to one

- [ ] **C3 — fold Escape into the keymap.** Replace the document-level capture listener + module
      `WeakMap` LIFO stack with a keymap registration (`{ chord: 'Escape', ... }` registered on
      open, unregistered on close). Restores the editable-target/IME rule for Escape; keymap's
      newest-first order already gives innermost-wins, so the stack/WeakMap/document listener can
      be deleted outright.
      `src/extensions/popup.ts:112-141`
- [ ] **D-S5-9 — scope scroll-dismiss to the anchor's pane**, not any scroll anywhere in the
      document.
      `src/extensions/popup.ts:210-218`
- [ ] Update `popup.test.ts:155-167` ("a scroll anywhere in the document closes the popup") to
      assert pane-scoped dismissal; add a case proving a scroll in an unrelated pane does *not*
      close the popup.
- [ ] Adopt `DisposableStore` in `createPopup` instead of the hand-rolled `unsubscribers` array
      (`DisposableStore` already used by `plugin-runtime.ts` in the same layer).
      `src/extensions/popup.ts:149-156`
- [x] Fix the flip/clamp test fixture: `popup.test.ts:92-96` sets the timeline pane's `right`
      equal to the overlay's outer `bounds.right`, so container-clamping and pane-clamping are
      indistinguishable. Give the pane a right edge strictly inside the container bounds.
- [x] Document `Popup.open()`: calling it while already open replaces the current popup (closes it
      first) — currently true in code, not stated on the interface. (Done in the doc-sentences
      pass, session 2 — see Slice 6.)
- [x] Rename `fakeHost` → e.g. `fakeAnchor`/`stubAnchor` ("host" is repo-retired vocabulary,
      D-S1.11-6, #64 — this same branch renamed `PluginHost`→`PluginRuntime` for the same reason).
      `src/extensions/popup.test.ts:13`
- [ ] `pnpm test && pnpm tsc && pnpm depcruise` clean before moving on.

## Slice 3 — `GanttShell`: extract the command catalog (C4)

- [ ] Move the 19 inline `register({...})` command calls (~`gantt-shell.ts:816-950`) into a new
      `src/view/core-commands.ts` exporting `registerCoreCommands(registry, ports)`, where `ports`
      names the shell verbs commands call (pan, zoom, select, collapse/expand, undo/redo, …).
      Mechanical extraction — keep ids, labels, `when` clauses, and default bindings identical;
      existing command/keybinding tests should catch any regression.
- [ ] Give the new module its own test file, testing the catalog through `registerCoreCommands`
      rather than through the shell.
- [ ] `pnpm test && pnpm tsc && pnpm depcruise` clean before moving on.

## Slice 4 — keymap double-evaluation cleanup

- [ ] `Keymap.resolve` builds a `CommandContext` and evaluates `command.when`
      (`keymap.ts:107-126`), then `CommandRegistry.run()` independently rebuilds the context and
      re-evaluates `when` again (`commands.ts:45-50`) — two builds, two guard checks per keypress.
      Resolve once, run once: either have `resolve()` hand its built context to a `run`-with-context
      variant, or let `commands.run()` accept an optional prebuilt context. (Still open — the
      constructor-injection item below removed the *argument* clump, not this double work; `resolve()`
      still calls `this.#buildContext()` itself and `commands.run()` still rebuilds and re-checks
      `when` independently.)
- [x] Move `Keymap.resolve(event, commands, buildContext)`'s trailing two arguments to constructor
      injection (its only caller passes the same two every time) so call sites read `resolve(event)`.
      `Keymap` now takes `(commands, buildContext)` in its constructor; `GanttShell` builds it right
      after `#commandRegistry` exists (field default moved into the constructor body, since it can no
      longer default-initialize before `#commandRegistry` is assigned) and calls `keymap.resolve(event)`.
      `src/extensions/keymap.ts`, `src/view/gantt-shell.ts`, `src/extensions/keymap.test.ts`
- [ ] `pnpm test && pnpm tsc` clean before moving on.

## Slice 5 — API surface (C5) + small naming/citation fixes

- [x] **C5 — export the six generic shapes** (`CommandOf<TGantt>`, `CommandContextOf<TGantt>`,
      `CommandRegistryOf<TGantt>`, `GanttPlugin<TGantt>`, `KeyBindingOf<TGantt>`,
      `PluginContext<TGantt>`) from `src/api/index.ts` alongside their `<Gantt>`-bound aliases
      (pure types, zero runtime cost). Regenerate `etc/freegantt.api.md` via `pnpm api-report` —
      should go from 6 `ae-forgotten-export` warnings to 0 (`main` has 0).
      `src/api/index.ts`, `src/api/command.ts`, `src/api/plugin.ts`
- [x] Fix stale `.dependency-cruiser.cjs:58` comment: `PluginHost` → `PluginRuntime`.
- [x] Fix decision-id citation `D-S1.8-8` → `D-S1.8-13` for the grid pane's horizontal scroller
      (`D-S1.8-8` is the unrelated `no-flow-layout-rows` decision).
      `src/view/styles.ts:97,102`, `src/view/pane-layout.ts:9,36`
- [x] Rename `buildElement(desc)`'s parameter to `description`.
      `src/render/dom/element-description.ts:13`
- [x] `pnpm api-report` diff shows only the six new exports, no unrelated churn.

## Slice 6 — glossary and doc gaps

- [ ] Add `CONTEXT.md` glossary entries: `Overlay`, `Popup`, Command registry, `Keymap`,
      `PluginRuntime`, `DisposableStore`, `ElementDescription`. For `DisposableStore`, record that
      it deliberately reuses "Store" outside data/'s normalized-entity-collection sense
      (spec-mandated name — document the distinction, don't rename).
- [x] Update the `PaneLayout` glossary line ("structure and one number only — grid width") to
      cover the second owned number, `contentWidth`.
- [x] Unify "bounds" naming across the Overlay seam: pick "bounds" on both sides of
      `Overlay.paneBounds` vs `PaneLayout.paneRects()`, and `Overlay.bounds` vs
      `containerBounds()`. Renamed `PaneLayout.paneRects()` → `paneBounds()` and
      `PaneLayout.containerBounds()` → `bounds()`, matching the `Overlay` getters of the same names
      that already wrap them 1:1. Only caller was `overlay.ts`; no test named either old method.
      `src/view/pane-layout.ts`, `src/view/overlay.ts`
- [x] Doc: `GanttOptions.plugins` — add "same id, new object → ignored (dev: warns)".
      `src/api/gantt.ts` (the `plugins?` option doc)
- [x] Doc: public `Gantt.commands` alias — carry the same "no-ops when `when` declines" sentence
      already on the internal registry doc.
      `src/api/gantt.ts` (the `get commands()` doc)
- [x] Doc: resolve `Gantt.commands`'s public doc listing eleven (D-S5-6) vs the shell's actual
      nineteen registered commands — went with the rule (`freegantt.*` is the core namespace,
      plugin registration wins on a shared id), not a hardcoded list: the eleven-item list had
      already drifted once when S5.2 added 8 navigation commands, and a literal id list is exactly
      the kind of thing that drifts again next slice. Folded into the same edit as the row above.
      `src/api/gantt.ts` (the `get commands()` doc)
- [x] Document `Popup.open()`'s replace-on-reopen behavior (moved up from the self-documentation
      list below — same session, same file).
      `src/extensions/popup.ts` (the `Popup` interface)
- [x] Mark `attachKeyboardNavigation` (`src/view/keyboard-navigation.ts`) as superseded-but-kept
      in its header comment — zero production callers today, kept intentionally per the S5.2 TODO.

---

## Flagged, not scheduled (needs a decision first, not mechanical)

- **`forwardPlainWheel` swallows horizontal wheel** (`src/view/wheel-navigation.ts:81-84`):
  `preventDefault()` fires unconditionally and only `deltaY` is used, so the grid pane's new
  horizontal scroller (#126, D-S1.8-13) can't be wheel-driven. Fixing it touches pan-vs-scroll
  wheel policy for *all* panes, not just the grid pane — needs a design decision (does plain
  horizontal wheel scroll the grid pane, or does something else drive it?) before it's a slice
  item.
- **`as CommandContext<unknown>` cast** (`gantt-shell.ts:813,819`): review marks this accepted
  (documented trust in the injected builder) — no action planned.
- **Scope-only items**: commit 67c79dc (#126 grid scroller) and the 8 extra navigation commands
  beyond D-S5-6's eleven are already-shipped, already-documented-elsewhere decisions riding on
  this branch, not defects. Covered by the Slice 6 doc-rule item, nothing else needed.

## Verification (run at the end of the whole pass)

- [ ] `pnpm test` — 868 tests today; expect the count to grow (new C1/C2/popup/keymap tests), not
      shrink.
- [ ] `pnpm tsc` clean.
- [ ] `pnpm depcruise` clean (no new violations from the command-catalog extraction or the new
      API exports).
- [ ] `pnpm api-report` — zero `ae-forgotten-export` warnings.
- [ ] Manual harness check: open two popups in sequence (replace-on-reopen); open a popup and
      scroll an unrelated pane (stays open) vs. its own pane (closes); press Escape with a popup
      open and with an editable field focused (editable-target rule still holds).
