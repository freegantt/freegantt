# QC review — s5-start fix pass (2026-09-03)

Scope: the 13 fix commits after `e20fc03` (`908d6ec..55d6b87`), reviewed against
`plans/reviews/2026-09-02-s5-start-fixes.md`. Two axes, run separately: **Spec** (did the
commits land what the plan promised?) and **Standards** (do they follow the repo's rules?).
Method: every `[x]` in the plan traced to code; gates re-run; smells checked against the
Fowler baseline with repo docs overriding.

## Verdict

The plan holds up. Every checkbox traced to real code. No item is missing, partial, or wrong.
Gates reproduce exactly: `pnpm test:node` 484/484, `pnpm test:dom` 397/397 (881 total),
`pnpm tsc` clean, `pnpm boundaries` clean (227 modules, 927 dependencies). The fix work is a
net deepening: `plugin-runtime.ts`, `popup.ts`, and `core-commands.ts` are now reviewable
without the shell.

One real behaviour regression escaped the plan's scope (F1). One wording error sits in the
plan's own Verification section (F8).

## Spec axis

### Claims that hold (spot-checked, not trusted)

- **C1** — `install()` sets up additions first, disposes `removed` only after every `setup()`
  succeeded, and assigns `#installed` last (`plugin-runtime.ts:109-148`). The regression test
  asserts a clean dispose log after the throw, the dropped plugin still listed, and exactly one
  dispose on a follow-up `install([])`.
- **C2** — `ctx.commands.register` is gate-wrapped; `run`/`available` pass through unguarded
  (`gantt-shell.ts:446-455`). `gantt.test.ts:2191` asserts `RegistrationClosedError` post-setup.
- **C3** — the document-capture listener and the WeakMap LIFO stack are gone. `createPopup`
  takes a required `KeyHandlerRegistrar`. `registerKeyHandler` is ungated and wired through
  `GanttShell` and `api/gantt.ts:214`; `harness/plugins.ts:83` uses it.
- **D-S5-9** — `paneNameFor` exists; scroll-dismiss compares the anchor's pane to the event's
  pane; an anchor in neither pane still dismisses on any scroll. Both test cases present.
- **Slice 3** — 19 command ids in `core-commands.ts`; tests drive a ports fake, not the shell.
- **Slice 4** — `runResolved` skips the `when` re-check, sits outside `CommandRegistryOf`, and
  has one caller. Public `run(id)` still self-checks. `Keymap` constructor injection landed;
  call sites read `resolve(event)`.
- **Slice 5/6** — six generic exports present; `paneBounds()`/`bounds()` unified on both sides;
  all doc sentences landed; superseded marker on `keyboard-navigation.ts`; seven glossary
  entries; wheel fix scoped to the grid pane's `forwardPlainWheel` with the
  `defaultPrevented === false` test.
- **Flagged, not scheduled** — untouched, as promised.

### Findings

- **F8 (plan-doc nit).** The Verification section says "`pnpm api-report` — no diff … no public
  surface moved". The diff adds the six generics plus `KeyHandlerRegistrar`/`KeyEventLike` to
  `etc/freegantt.api.md`. The committed api.md is current; the sentence is wrong.
- **F9 (scope creep, defensible).** `KeyHandlerRegistrar` and `KeyEventLike` became public
  exports beyond C5's six. Required for the required-second-arg signature to serialize
  warning-free. The `buildElement` rename touched 28 lines, not just the parameter — mechanical.

## Standards axis

Hard violations of the documented standards: none. Layer map, sealed exports, no-singleton,
naming, and loose-input rules all hold. Findings below are judgement calls unless marked.

### F1 — Escape dismissal regression (the worst finding)

`popup.ts:186-191` registers Escape through the keymap with the default
`captureInEditable: false`. Two cases the old document-capture listener handled are now lost:

1. A popup that contains its own `<input>`: Escape inside that input no longer closes the
   popup. The editable-target gate meant to protect page-level editables now also blocks the
   popup's own editable. The cell editor (S5.5+) builds on this path, so this will bite again.
2. Focus outside the container: the keymap listener is bubble-phase on `#container`
   (`gantt-shell.ts:594`). A popup opened from an external trigger never sees Escape. The old
   listener was document-wide capture.

The test gap hid both: `popup.test.ts:135-140` models a capture-phase *document* listener,
which is not the production wiring. Fix direction: register the popup's Escape handler
explicitly with `captureInEditable: true`, and decide the out-of-container story (capture
phase, or a document-level fallback) before S5.5 builds on this seam. Re-point the test at the
production wiring.

### F2–F7 — judgement calls

- **F2.** `core-commands.ts` repeats `when: () => ports.keyboardPanEnabled() &&
  ports.nothingSelected()` four times — Duplicated Code. The `asCtx` unknown-cast also carried
  over, so every command re-casts ctx.
- **F3.** Command #20 now spans three places: the catalog, the ports object, and the default
  chord binding (the last two stay in `GanttShell`). Shotgun Surgery risk; the extraction is
  still a net win. A follow-up could move default bindings next to the catalog.
- **F4.** C2 asymmetry: `ctx.commands.register` throws after setup, but the public
  `gantt.commands.register` (`api/gantt.ts:158`) stays ungated. One method name, two rules.
  Worth a doc line, or one rule.
- **F5.** `KeyEventLike` gained `stopPropagation()` — narrow-subset creep; every plain-object
  test event must now stub a method only one handler uses.
- **F6.** `bounds()`/`paneBounds()` on `PaneLayout` answer "bounds of what?" less honestly than
  the old `containerBounds()`/`paneRects()`. The glossary alignment with `Overlay` justifies
  it; keep the ambiguity in mind.
- **F7.** `CoreCommandPorts` introduces "ports" vocabulary that the glossary does not carry
  (`KeyHandlerRegistrar` is glossed). Add the entry or rename.

### What is sound

C1's ordering is correct and its disposer already tolerates throws. C2's `guard()` is a real
seam, not a Middle Man. Keymap's constructor injection is clean DI. Popup ownership is clear:
per-open `DisposableStore`, fresh store per `close()`, plugin-supplied registrar. New names
(`runResolved`, `paneNameFor`, `registerCoreCommands`, `gate.guard`) read well at the call
site. C1/C2 tests are behavioural.

## Summary

- **Spec:** 0 missing, 0 wrong, 2 minor notes (F8, F9). Worst: the plan's own "no public
  surface moved" sentence contradicts its diff.
- **Standards:** 1 behavioural regression, 6 judgement calls. Worst: F1 — Escape can no longer
  dismiss a popup from inside the popup's own input, or when focus sits outside the container.
