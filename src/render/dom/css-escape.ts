// render/dom — one place for the `CSS.escape` feature-detect every `[data-field="…"]` attribute
// selector needs (S5.7, D-S5-18): `CSS.escape` is missing in some older or non-browser DOM shims.
// Every caller here builds a *quoted* attribute selector, so the fallback escapes the two characters
// that end the quoted string — `"` and `\`. A Field key that holds one still finds its own cell.
// `view/` reads through this too (view -> render is an allowed edge, plans/01 §1).

/** The two characters a double-quoted CSS attribute-selector string cannot hold raw. */
const QUOTED_STRING_SPECIALS = /["\\]/g;

/** Escapes `value` for use inside a quoted CSS attribute-selector string
 *  (`[data-field="${...}"]`). It uses `CSS.escape` where the environment has it. */
export function cssEscapeAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(QUOTED_STRING_SPECIALS, '\\$&');
}
