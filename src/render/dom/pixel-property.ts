// render/dom — level 1 of the customization ladder (plans/02 §4): a `--fg-*` CSS custom property,
// read off the host element, parsed to px, and validated against what the library can actually draw
// with. One reader for every such property: `--fg-row-height` and `--fg-grid-pane-width` were the
// same routine with silently different validity rules, and S1.10's theming pass multiplies the
// count. `view/` reads through this too (view -> render is an allowed edge, plans/01 §1).
//
// Re-read cadence is the caller's, and each caller states it: `--fg-grid-pane-width` is read once at
// construction (`PaneLayout` owns the grid pane's width for the life of the mount, S1.8), `--fg-row-
// height` again on every pane measurement (#49). Neither is read per render — `getComputedStyle` is a
// synchronous style read that can force a style recalculation.

/** What counts as an authored value, and what to fall back to when nothing usable is authored. */
export interface PixelPropertyPolicy {
  /** The library default — used when the property is unset, unparseable, or outside `accepts`. */
  fallback: number;
  /** `'positive'`: zero is nonsense for this property (a zero-height row is not a row).
   *  `'zeroOrMore'`: zero is a real choice (a host turning the row-label gutter off). */
  accepts: 'positive' | 'zeroOrMore';
}

export function readPixelProperty(
  element: HTMLElement,
  property: string,
  policy: PixelPropertyPolicy,
): number {
  const raw = getComputedStyle(element).getPropertyValue(property).trim();
  const px = parseFloat(raw);
  if (!Number.isFinite(px)) return policy.fallback;
  const authored = policy.accepts === 'positive' ? px > 0 : px >= 0;
  return authored ? px : policy.fallback;
}
