// extensions/features/ — shared DOM lookup for the built-in feature plugins (S5.5/S5.8). `.fg-bar`
// is the one DOM contract a feature plugin has (`render/dom/index.ts` writes `dataset.itemId` on
// every bar node) — the same seam `harness/plugins.ts`'s own popup demo already reaches through, not
// a back door (D-S5-5 only forbids `src/` imports, not plain DOM APIs). `tooltips.ts` and
// `context-menu.ts` both walk up from an event target to find the bar it landed on; this is that one
// walk, kept in one place so it can't drift between the two callers.

/** Finds the nearest ancestor-or-self `.fg-bar` element, or `undefined` when `node` is outside one
 *  (e.g. a hover/click that landed on the grid or an empty stretch of timeline). */
export function barUnder(node: Node): HTMLElement | undefined {
  const el = node instanceof Element ? node.closest<HTMLElement>('.fg-bar') : null;
  return el ?? undefined;
}

/** Finds the nearest ancestor-or-self `.fg-row` element, or `undefined` when `node` is outside one
 *  (e.g. a click on the header row or an empty stretch below the last row). `context-menu.ts` uses
 *  this so a right-click on a grid cell resolves the same entry a right-click on that entry's bar
 *  would — the same target `render/dom/index.ts`'s own `hitTest` grid-row fallback already selects. */
export function rowUnder(node: Node): HTMLElement | undefined {
  const el = node instanceof Element ? node.closest<HTMLElement>('.fg-row') : null;
  return el ?? undefined;
}
