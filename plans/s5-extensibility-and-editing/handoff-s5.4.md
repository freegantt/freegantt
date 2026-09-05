# Handoff — S5.3 done, start S5.4

## S5.3 status: done

All TODO boxes in [`s5.3-overlay-and-popup.md`](./s5.3-overlay-and-popup.md) are ticked. Verified:

- `npx vitest run` — 949/949 passing (includes `src/view/overlay.test.ts`, `src/extensions/popup.test.ts`, `src/render/dom/element-description.test.ts`).
- `npx tsc --noEmit` — clean.
- `npm run boundaries` (dependency-cruiser) — clean, no violations.
- `etc/freegantt.api.md` regenerated and diffed in — `Overlay`, `OverlayHandle`, `ElementDescription` now `@public`.
- Live in `harness/plugins.html`: "Open popup on selected bar" button opens a `.fg-popup` anchored to the selected bar, flips at the pane edge, and closes on Escape. Screenshot-verified.

One naming deviation from the spec, intentional at the time: the spec's file name was `view/overlay-host.ts` / type `OverlayHost`. S5.3 shipped `view/overlay.ts` / type `Overlay`, with a `DomOverlay` implementation.

> **Superseded by #168 — do not act on the paragraph above, or on the names in the checklist above it.** #168 deleted `src/view/overlay.ts` and `src/view/row-layer.ts`. One file replaced both: `src/view/mount-layer.ts`. It declares one interface, `MountLayer`, and one implementation, `DomMountLayer`. A Gantt builds two instances of it, reached as `ctx.view.overlay` and `ctx.view.rowLayer`. The difference is the instance, never the interface — read that file's own header for why. `present()` returns a plain `Disposer`, so `OverlayHandle` is gone too. Do not restore `Overlay`, `DomOverlay`, `OverlayHandle` or a second interface beside `MountLayer`.

Nothing left uncommitted from S5.3 except the working tree diff itself (this session did not commit — check with the user before committing, per CLAUDE.md workflow).

## Next: S5.4 — Renderer callbacks

Read [`s5.4-renderers.md`](./s5.4-renderers.md) in full before starting — it has three decisions (D-S5-10/11/12) worth internalizing, not just the TODO list below.

**Important:** S5.3 already built two of S5.4's files ahead of schedule, because `Popup.content` needed the same `ElementDescription` vocabulary:

- `src/model/render.ts` — `ElementDescription` already shipped. S5.4 does not need to redefine it, only add the renderer point types (`RendererPoint`, `BarRenderer`, `CellRenderer`, `RendererByKind`) alongside it.
- `src/render/dom/element-description.ts` — has `buildElement()` (one-shot build, used by `Popup`). S5.4 needs a **diffing sibling** for repaint-without-remount (I8) — the file's own header comment already flags this: "S5.4 adds the diffing sibling (`applyElementDescription`, patching an existing node in place)". Don't duplicate `buildElement`; extend this file.

Remaining work per the TODO list in `s5.4-renderers.md` §4:

- [ ] `model/render.ts`: add `RendererPoint`, `BarRenderer`, `CellRenderer`, `RendererByKind` types (the `ElementDescription` type itself is already there — don't re-add it)
- [ ] `view/renderer-registry.ts` (new file) — slot per point, config-over-plugin resolution order (D-S5-11), `RendererAlreadyRegisteredError`, per-kind resolution kind → `'*'` → default (D-S5-12)
- [ ] `render/dom/element-description.ts` — add the diffing/patch function for repaint, inside the reconciler's bounded scope (attrs/class/style/text + keyed children only)
- [ ] `render/dom/index.ts` — bar and cell paint call the resolved renderer; `undefined` keeps current library output; wrap every renderer call in try/catch, falling back to default output on throw, dev-log naming the point + plugin id if the renderer came from a plugin (issue #137 F14)
- [ ] `api/gantt.ts` — four `GanttOptions` keys (`barRenderer`, `cellRenderer`, `headerRenderer`, `tooltipRenderer`) as live properties; `ctx.view.registerRenderer(point, renderer)` on the plugin context
- [ ] Exports through `api/index.ts`; regenerate `etc/freegantt.api.md` (`pnpm api-report` or equivalent — check `package.json` scripts)
- [ ] **Visible acceptance:** harness paints a custom milestone diamond and a red over-budget cost cell via renderers, with a toggle that switches both off live, no remount

Tests to write alongside the code (see `s5.4-renderers.md` §3 for exact cases):

- `src/view/renderer-registry.test.ts` (new)
- additions to `src/render/dom/index.test.ts` (throw-falls-back-to-default; renderer output paints inside `.fg-bar`; reassigning renderer repaints without remount)
- additions to `src/render/dom/element-description.test.ts` (the new diff/patch path: class/style/attrs/text apply, `<script>` text stays text, `html` skips children, keyed children patch in place and prune)
- additions to `src/api/gantt.test.ts` (four options are live properties)

## Workflow reminder for whoever picks this up

**Tick TODO boxes in `s5.4-renderers.md` §4 as each item lands — in the same change as the code, not batched at the end.** The README says this explicitly ("Tick as you go... Do not wait for S5.12 or the slice gate") and it's how this handoff was able to tell S5.3 was actually finished versus just coded. When S5.4 is fully done, update the README status line (`plans/s5-extensibility-and-editing/README.md` line 3) from "S5.0/S5.1/S5.2/S5.3 done, S5.4 next" to include S5.4, pointing at S5.5 next — and write a handoff doc like this one for whoever starts S5.5.

Before declaring S5.4 done: run the full `vitest run`, `tsc --noEmit`, and `npm run boundaries`, and verify the visible acceptance line live in the harness (screenshot or direct interaction), the same bar this handoff held S5.3 to.
