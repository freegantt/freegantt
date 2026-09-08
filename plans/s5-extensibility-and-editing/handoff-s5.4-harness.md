# Handoff — S5.4 library code done, harness demo + sign-off left

## What this session did

Implemented S5.4 (renderer callbacks) per [`s5.4-renderers.md`](./s5.4-renderers.md) and
[`handoff-s5.4.md`](./handoff-s5.4.md). All TODO boxes in `s5.4-renderers.md` §4 are ticked **except
the visible-acceptance one** — that is what's left, see below.

**Verified green this session:**
- `npx tsc --noEmit` — clean.
- `npm run boundaries` — clean (230 modules, 942 deps).
- `npx vitest run` — 991/991 passing (up from 973 before this session's new tests).
- `pnpm lint`, `pnpm format:check`, `pnpm guards`, `pnpm vendor-names`, `pnpm disables`, `pnpm build`
  all clean.
- `pnpm api-report` clean — `etc/freegantt.api.md` regenerated and diffed in (see below).

**Not run this session:** `pnpm test:e2e` (Playwright). Not expected to be affected (no e2e specs
touch renderers yet) but not verified.

## What shipped

- `src/layout/renderer.ts` (new) — `RendererPoint`, `BarRenderer`/`BarRendererContext`,
  `RendererByKind`, `CellRenderer`/`CellRendererContext`, `HeaderRenderer`/`HeaderRendererContext`,
  `TooltipRenderer`/`TooltipRendererContext`, `RendererFor<P>`, `ResolvedRenderer<TRenderer>`.
  **Deviation from the spec's file table** (which put these in `model/render.ts`): they live in
  `layout/` instead because their context types reference `FrameBar`/`FrameRow`/`ResolvedColumn`
  (layout-owned), and `model/` is a dependency-cruiser leaf that may import nothing. Re-exported
  through `layout/index.ts`, same seam `ElementDescription` already uses.
- `src/layout/frame.ts` — `FrameRow` gained `entryId?: EntryId`, populated in `placeFrame()` from
  `planned.entryIds[0]` for non-header rows. This is what lets `render/dom` resolve a row's `Entry`
  for `CellRenderer` context without needing a second lookup path.
- `src/model/errors.ts` (+ `model/index.ts`, `api/index.ts`) — `RendererAlreadyRegisteredError`.
- `src/view/renderer-registry.ts` (new) — `RendererRegistry`: holds plugin registrations only: A
  consumer's `GanttOptions.*Renderer` is read live and passed into `resolveBar`/`resolveCell`/
  `resolveHeader`/`resolveTooltip` on every call — config always wins over a plugin (D-S5-11); the
  per-kind map (D-S5-12) resolves inside `resolveBar` so callers only ever see one resolved function.
  Tests: `src/view/renderer-registry.test.ts` (7 tests).
- `src/render/dom/element-description.ts` — `applyElementDescription(node, description)`, the diffing
  sibling to `buildElement`. Diffs class/style/attrs against a `WeakMap<Element, ElementDescription>`
  "last applied" cache per node; children are keyed by a `data-fg-key` attribute stamped once per
  child (not `sync-keyed.ts`'s generic helper — that's built for typed frame items with their own
  `key()`, `ElementDescription` trees are plain data). Handles the text/html/children mode-switch
  cleanup (stale text/markup left over from a prior call). Tests added to
  `src/render/dom/element-description.test.ts`.
- `src/render/dom/index.ts` — `createDomBackend(options?: DomBackendOptions)` (was zero-arg).
  `DomBackendOptions` = `{ entryById, resolveBarRenderer, resolveCellRenderer }`. Bar paint resolves
  a renderer per bar's `kind`, calls it (try/catch, issue #137 F14: dev-log names the point and, if
  it came from a plugin, that plugin's id — `isDevMode()` is a local copy of
  `data/dev-mode.ts`'s one-liner, same carve-out `extensions/plugin-runtime.ts` already takes since
  `render/dom` can't import `data/`). Cell paint resolves per-column (Gantt-wide `cellRenderer` only
  this slice — no per-column `GridColumn.cellRenderer` yet, that's S5.7). `undefined` from a resolved
  renderer, or no renderer at all, falls back through `applyElementDescription(node, { text: label })`
  — the existing default paint path now runs *through* the same reconciler function instead of a
  separate `node.textContent =` line, so there is exactly one paint path per node, not two.
  New/changed tests in `src/render/dom/index.test.ts` (4 new: throw-falls-back, paints-inside-.fg-bar
  + repaint-with-no-remount, cellRenderer receives entry/row/value).
- `src/view/gantt-shell.ts` — `#rendererRegistry`, `#barRenderer`/`#cellRenderer`/`#headerRenderer`/
  `#tooltipRenderer` fields + live get/set (each `set` calls `#frames.request()`, same pattern
  `gridColumns` uses). Constructor builds `createDomBackend({...})`'s three closures — the cell
  resolver is the interesting one: `render/dom` never receives `ResolvedColumn` (`column.format`
  "never reaches a backend", `layout/column.ts`'s own comment) so the shell binds the resolved
  `CellRenderer` to its `ResolvedColumn` *before* handing a plain `(ctx) => ElementDescription` down,
  keyed by `FrameColumn.key`/`CellItem.key`. `ctx.view.registerRenderer` wired into the
  `PluginRuntime` construction, gated the same way `registerKeybinding`/`commands.register` are
  (D-S5-4) — not through `RegistrationGate.guard()` though, because that erases the
  `<P extends RendererPoint>` generic link; calls `gate.assertOpen()` directly instead.
- `src/api/plugin.ts` — `PluginContextOf.view.registerRenderer<P>(point, renderer)`.
- `src/api/gantt.ts` — four `GanttOptions` keys (`barRenderer`/`cellRenderer`/`headerRenderer`/
  `tooltipRenderer`), live get/set on `Gantt`, wired into `buildPluginContext`'s `view` object.
- `src/api/index.ts` — exports the renderer vocabulary, **plus** `FrameBar`/`FrameRow`/
  `ResolvedColumn`/`FrameColumn`/`BarFlags`/`PlannedRowKind` (newly public — the renderer context
  types name them, e.g. `BarRendererContext.item: FrameBar`, so a consumer writing its own named
  `BarRenderer` needs them importable). `PlannedRowKind` also newly re-exported from
  `layout/index.ts` (it wasn't before). Found via `api-extractor`'s `ae-forgotten-export` warnings —
  if you add another type to a public context shape, re-run `pnpm api-report` and check for these.
- `etc/freegantt.api.md` — regenerated (`npx api-extractor run --local --config api-extractor.json`,
  then `pnpm api-report` to confirm clean), diffed in.

## Scope deliberately left for a later step (not a gap in this slice)

- **`header`/`tooltip` points resolve and can be registered, but nothing paints through them yet.**
  `GanttOptions.headerRenderer`/`tooltipRenderer` are live properties, `ctx.view.registerRenderer`
  accepts both points, `RendererRegistry.resolveHeader`/`resolveTooltip` work — but no call site in
  `render/dom` invokes them. Per `s5.4-renderers.md`'s own TODO list ("Bar and cell paint call the
  resolved renderer") this was always bar+cell only this slice. Header paint is grid column header
  chrome (S5.7); tooltip paint is S5.5's `tooltips()` feature reading `tooltipRenderer` to replace its
  body (see `s5.5-tooltips-and-context-menu.md` line ~62: "a `tooltipRenderer` replaces the body").
- **Per-column `GridColumn.cellRenderer` (D-S5-17, S5.7) does not exist.** The spec's "one total
  order for `cell`" table (D-S5-11 §"One total order") rows 1–2 need it; this slice only implements
  rows 3–4 (Gantt-wide config vs. plugin). The `renderer-registry.test.ts` case the spec lists for
  this ("a per-column plugin-registered cellRenderer loses to the consumer's own per-column one and
  beats a Gantt-wide plugin renderer") was **not written** — there's nothing to test yet. Don't add a
  fake stand-in for it; write it for real once S5.7 lands `GridColumn.cellRenderer`.

## What's actually left before S5.4 can be marked done

**The visible-acceptance line has not been demonstrated.** `s5.4-renderers.md` §4's last box says:
"the harness paints a custom milestone diamond and a red over-budget cost cell via renderers, with a
toggle that switches both off live, no remount." None of that exists in `harness/` yet — this session
spent its budget on the library code + tests and ran out of room for the harness page.

`harness/plugins.html` already exists (S5.1's harness, has a `#gantt` container and a `#controls` div
with buttons + a `#log`) and is the natural place for this — it's already wired for a `Gantt` instance
with a plugin, and S5.3's Popup demo lives there too. Steps:

1. Read `harness/plugins.html` in full (script section especially) to see how the existing `Gantt`
   instance and its `#controls` buttons are wired, and follow that pattern.
2. Give at least one entry `kind: 'milestone'` in the harness's sample data (or reuse whatever
   milestone entries already exist — check `fixtures/sample-dataset.ts` / `harness/data.ts`) and one
   entry with a `cost` meta field over some budget threshold (a `money`-typed field the way
   `src/api/gantt.test.ts`'s `gridColumns` describe block sets one up, or reuse an existing harness
   field if `harness/data.ts` already declares one).
3. Set `barRenderer: { milestone: ({ entry }) => ({ class: {...}, text: '◆' or similar }), '*': undefined-ish }`
   — actually per D-S5-12, omitting `'*'` is fine, it just means non-milestone kinds fall through to
   the library default. Set `cellRenderer: ({ column, value }) => column.field === 'cost' && overBudget(value) ? { class: { 'over-budget': true }, text: value } : undefined` (or similar) — remember `cellRenderer` is Gantt-wide, so it must itself decide which column to touch via `ctx.column`.
4. Add a toggle (checkbox or button, matching the existing `#controls` button style) that flips
   `gantt.barRenderer`/`gantt.cellRenderer` between the custom renderers and `undefined` live, no
   `gantt.destroy()`/recreate.
5. Run the dev server (`pnpm dev`, or use the `run` skill) and actually look at it — confirm the
   diamond renders, the cost cell goes red, the toggle switches both off with the same DOM nodes
   underneath (open devtools, watch the `.fg-bar`/`.fg-row-cell` node identity, or trust the unit
   tests already covering I8 and just eyeball the visual toggle). Screenshot if convenient.
6. Tick the last box in `s5.4-renderers.md` §4, update `README.md` line 3 to "S5.4 done, S5.5 next",
   and write a handoff doc for S5.5 (tooltips + context menu — read
   [`s5.5-tooltips-and-context-menu.md`](./s5.5-tooltips-and-context-menu.md), note it already expects
   `tooltipRenderer` to exist as a live option, which it now does).

## Workflow reminder

Tick TODO boxes in `s5.4-renderers.md` §4 in the same change as the code (already done for every box
but the last one). Don't batch to the end.
