// render/dom — one place for the `CSS.escape` feature-detect every `[data-field="…"]`/
// `[data-field=…]` attribute selector needs (S5.7, D-S5-18): `CSS.escape` is missing in some older
// or non-browser DOM shims, so every caller building a selector from a column key falls back to the
// raw string rather than throwing. `view/` reads through this too (view -> render is an allowed
// edge, plans/01 §1).

/** Escapes `value` for use inside a CSS attribute-selector string (`[data-field="${...}"]`),
 *  falling back to the raw value when `CSS.escape` is not available. */
export function cssEscapeAttr(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value;
}
