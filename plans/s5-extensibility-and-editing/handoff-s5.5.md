# Handoff — S5.4 done, start S5.5

## S5.4 status: done

All TODO boxes in [`s5.4-renderers.md`](./s5.4-renderers.md) §4 are ticked, including the
visible-acceptance box (`handoff-s5.4-harness.md`'s open item, closed this session). Verified:

- `pnpm tsc` — clean.
- `pnpm vitest run` — 993/993 passing.
- `pnpm boundaries` (depcruise) — clean, no violations.
- `npx playwright test` — 50/50 passing, including the new `e2e/renderer-callbacks.spec.ts`.
- `harness/plugins.html` — installed live, checkbox checked by default: the "Launch" milestone
  paints as a recolored diamond, "Go/no-go review"'s `$1500` cost cell paints red. Unchecking the
  box removes both live, no bar remount; rechecking restores both. Screenshot-verified in a real
  browser (not just asserted headlessly).

Also closed this session, from the QC review (`plans/reviews/2026-09-03-s5-start-fixes-qc.md`):

- **F1** (the review's worst finding) — Escape could no longer dismiss a popup from inside the
  popup's own `<input>`, or when focus sat outside the container. Fixed: `popup.ts`'s Escape
  registration now passes `captureInEditable: true`; `gantt-shell.ts` gained a document-level
  capture-phase fallback, routed through the same `Keymap.resolve()` (not a second independent
  listener), skipped whenever the event's target already sits inside `#container`. Both cases have
  regression tests now (`popup.test.ts`, `gantt.test.ts`).
- **F8** — corrected the fix plan's own "no diff" sentence in `2026-09-02-s5-start-fixes.md`'s
  Verification section, which contradicted the `etc/freegantt.api.md` diff it describes.
- F2–F7 and F9 were left as the review's own "judgement calls, not required" — none is a hard
  standards violation. Worth a look before S5.9 (`GridColumn.cellRenderer`) touches the same
  `core-commands.ts`/`CoreCommandPorts` area F2/F3/F7 flag.

One naming/scope note worth carrying forward: `harness/plugins.ts`'s demo `barRenderer` does **not**
override `.fg-bar-diamond`'s background/text directly — that class is structural, applied from
`entry.kind` alone (`render/dom/index.ts`'s `BAR_SHAPE_CLASS`, D-S4-24), which sits outside a
renderer's bounded scope (I13: attr/class/style/text/children only). The demo renderer instead sets
the `--fg-bar-fill` custom property the shape's own `::before` already reads. Point this out to
anyone writing a milestone `barRenderer` for real — trying to set `class`/`text` to fight the shape
class will silently do nothing visible for that one kind.

## Next: S5.5 — Tooltips and the context menu, as plugins

Read [`s5.5-tooltips-and-context-menu.md`](./s5.5-tooltips-and-context-menu.md) in full before
starting — D-S5-13/D-S5-14, and this step **proves `[S5-A1]`, the dogfood gate**: both built-ins
must live in `src/extensions/features/`, confined by the `extensions-public-only` depcruise rule to
`api/`/`model/` imports only — zero private imports, lint-proven, not review-proven. That is the
whole point of the step; do not special-case either feature file past what a real third-party
plugin could reach.

Both features build directly on S5.4's `tooltip` renderer point, already live and already resolving
(`gantt.tooltipRenderer`, `ctx.view.registerRenderer('tooltip', …)`) — nothing paints through it yet
because no call site owned tooltip painting until now. This step is that call site.

Remaining work per the TODO list in `s5.5-tooltips-and-context-menu.md` §4:

- [ ] `tooltips()` factory (`src/extensions/features/tooltips.ts`) — hover/focus tracking, `delayMs`,
      `placement`, opens a `Popup` with `focus: 'none'` (D-S5-9: never steals focus), content through
      the `tooltip` renderer point so a consumer's `tooltipRenderer` replaces the body
- [ ] `contextMenu()` factory (`src/extensions/features/context-menu.ts`) — right-click and
      `Shift+F10`/Menu key open it; items are `commands.available(ctx)` filtered by `when`, mapped
      through `ContextMenuOptions.items` for append/reorder/replace; `focus: 'trap'`; arrow keys move,
      Enter runs, Escape closes and restores focus
- [ ] `src/extensions/features/menu-view.ts` — the menu's own `ElementDescription` builder, kept
      separate so `context-menu.ts` stays about behaviour, not markup shape
- [ ] `MenuItem`/`MenuEntry`/`ContextMenuOptions` types; `defaults` built from `commands.available`
- [ ] `.fg-menu`/`.fg-menu-item`/`.fg-tooltip` parts in `view/styles.ts` and the `plans/02` §4 table
- [ ] Public exports (`src/extensions/index.ts` re-exports both factories; `src/api/index.ts` exports
      both plus their option types); `pnpm api-report`
- [ ] `[S5-A1]`: confirm `depcruise` stays green with both built-ins present — this is the acceptance
      check, not an afterthought; run it as soon as both files exist, not just at the end
- [ ] **Visible:** the harness editing page installs both; right-click a bar and run "Collapse all"
      from the menu

Tests per §3: `tooltips.test.ts` (delay timing, follows the hovered bar, hides on pointer-out/scroll,
never moves focus, `tooltipRenderer` replaces the body), `context-menu.test.ts` (right-click position,
`Shift+F10` opens at the focused row, `when`-filtered items, `items` append/reorder, Enter/Escape),
`plugin-host.test.ts` additions (removing either plugin removes its listeners and overlay content).

Log every API gap this step finds in `s5.5-tooltips-and-context-menu.md` §5 as it appears, with the
`src/api/` change that closed it — the step file's own instruction, not new here. An empty table at
the end is a signal to double back, not a clean pass.
