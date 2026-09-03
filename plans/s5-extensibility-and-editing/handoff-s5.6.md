# Handoff — S5.5 done, start S5.6

## S5.5 status: done

All TODO boxes in [`s5.5-tooltips-and-context-menu.md`](./s5.5-tooltips-and-context-menu.md) §4 are
ticked. Verified this session:

- `pnpm tsc` — clean.
- `pnpm vitest run` — 1013/1013 passing (998 before this slice + 15 new: 7 `tooltips.test.ts`, 8
  `context-menu.test.ts`).
- `pnpm boundaries` (depcruise) — clean, including the `extensions-public-only` rule with both
  built-ins present (`[S5-A1]`, the dogfood gate).
- `pnpm lint`, `pnpm guards` — clean.
- `pnpm build && pnpm api-report` — `etc/freegantt.api.md` regenerated and committed (the two new
  factories, their option types, `Overlay.elementForEntry`, `PluginContextOf.view.resolveTooltip`).
- `harness/main.ts` (the flagship demo, `index.html`) installs both plugins from the start.
  Screenshot/interaction-verified in a real Chromium session: hovering a bar shows a tooltip with
  its name and dates; right-clicking a bar opens a real menu built from `commands.available(ctx)`,
  and running "Collapse all" from it actually collapses the tree. `e2e/plugins.spec.ts` (new) covers
  the hover path as a real regression test; the right-click path is unit-tested end to end instead
  (see below — a real e2e right-click test turned out reliably flaky).

## Two API gaps found and closed (both are real public surface now, not scoped to this step)

1. **`PluginContextOf.view.resolveTooltip(entryId): ElementDescription | undefined`** (`api/plugin.ts`).
   `tooltips()` owns the `tooltip` renderer point but works from the DOM after the render pass (a
   hover handler, not a paint callback), so it has no `FrameBar` of its own to build a
   `TooltipRendererContext` from the way `bar`/`cell` renderers do. `GanttShell` now keeps
   `#lastBarById`, a `FrameBar` index rebuilt once per `render()` (same cost the backend's own
   `frame.bars` iteration already pays), and `resolveTooltip` looks the bar up itself from an
   `EntryId`. `undefined` covers three cases alike: no renderer registered at either level, the
   entry has no bar in the current frame (scrolled out), or the renderer threw (dev-mode logged,
   same fallback `render/dom/index.ts`'s own `callRenderer` gives `bar`/`cell`).
2. **`Overlay.elementForEntry(id: EntryId): HTMLElement | undefined`** (`view/overlay.ts`).
   `contextMenu()`'s keyboard opener (`Shift+F10`) has no pointer event to read a target's DOM
   position from — it needs the *focused row*'s bar element to anchor a `Popup` at. `DomOverlay`
   implements this by scanning its own container for `[data-item-id]` matching the entry's segment-0
   item id (I2-safe: scoped to this Gantt's own container, never reaches past it). Falls back to the
   timeline pane's own top-left corner when the entry has no bar currently rendered.

Both are documented in `s5.5-tooltips-and-context-menu.md` §5 with the closing commit reasoning.

## A design note worth carrying forward: extensions/features/ imports the *narrow* source files, never the api/index.ts barrel

`tooltips.ts`/`context-menu.ts`/`menu-view.ts` import from `../popup.js`, `../../api/gantt.js`,
`../../model/index.js`, and a new **`src/api/time-facade.ts`** (a two-line re-export of
`formatDate`/`formatEndInclusive` from `time/index.js`) — never from `../../api/index.js`. That
barrel re-exports `tooltips`/`contextMenu` themselves (D-S5-13), so a feature file importing it back
would close a `no-circular` cycle. This is the same discipline `extensions/popup.ts` already follows
(its own file header explains it) — expect every future built-in in `extensions/features/` to need
the same care, and check whether it needs a new narrow facade file (like `time-facade.ts`) for
whatever slice of `time/`'s or another DOM-free layer's surface it needs that no existing narrow
`api/*.ts` file already re-exports.

## A test-writing trap worth naming: document-level listeners need an attached container

Both plugins listen at the `document` level (`document.addEventListener('pointerover', ...)`,
`'contextmenu'`, `'click'`, `'keydown')` rather than on the Gantt's own container — this is
deliberate (D-S5-5: a plugin has no privileged container reference, only what a third party could
reach). The first attempt at both test files built `container = document.createElement('div')` and
never attached it to `document.body`. Every assertion failed the same way (nothing ever opened) with
no error, because a bubbling event never escapes a detached tree — it stops at the fragment's own
root, never reaching `document`. Fix: `document.body.append(container)` before constructing the
`Gantt`, and `container.remove()` at the end of each test. Both test files now do this; anything
future testing a document-level listener in this codebase should too.

## Next: S5.6 — Decorations and the time façade

Read [`s5.6-decorations-and-time-facade.md`](./s5.6-decorations-and-time-facade.md) in full before
starting — D-S5-15/D-S5-16, and this step **proves `[S5-A2]`**: a harness-only, third-party-style
plugin (weekend shading) written against the public contract alone, with no core edit. This is the
other half of the S5→S6 gate (`[S5-A1]` + `[S5-A2]` together, per the README §4 table) — `[S5-A1]`
proved the *built-ins* took no back door, `[S5-A2]` proves an *outside author* can do the same.

Two things S5.6 will want that this step already ships or sets precedent for:

- **`dataset.time`, the zone-bound façade (D-S5-16).** A weekend-shading plugin needs `dayOfWeek`
  and zone-aware date arithmetic with no `time/` import (extensions/ can't reach it — the same rule
  this step worked around with `api/time-facade.ts`). Read `s5.6`'s own spec for the exact shape
  before designing it; do not assume `time-facade.ts` is the right pattern to extend for this — that
  file is a narrow, single-purpose re-export sized for what `tooltips.ts` needed, not a general
  `time/`-in-`extensions/` seam. `dataset.time` sounds like it wants to live on the public `Dataset`
  itself (api-level), which is a different shape entirely.
- **`registerDecoration` on `PluginContext.view`**, a decoration *provider* that "is pure and runs in
  `layout/`" (D-S5-15) — read the full step file for what that means concretely; do not guess from
  this paragraph alone.

As with S5.5, expect this step to find its own API gaps — log each one in
`s5.6-decorations-and-time-facade.md` §5 (or wherever that step's own spec says to) with the
`src/api/` (or `src/view/`) change that closed it, the same discipline this handoff's own §"Two API
gaps" section followed.
