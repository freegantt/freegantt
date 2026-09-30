// The padlock look shared by the harness pages that lock an Entry with a `locked` toggle column.

import type { ColumnToggle, ElementDescription } from 'freegantt';

// The icons draw in the theme's own row-label colour, so every built-in theme reads them.
function padlock(shacklePath: string): ElementDescription {
  return {
    html:
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
      `<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="${shacklePath}"/></svg>`,
    attrs: { 'aria-hidden': 'true' },
    style: { color: 'var(--fg-row-label-color)', display: 'inline-flex' },
  };
}

export const closedPadlock = padlock('M5 7V5a3 3 0 0 1 6 0v2');
export const openPadlock = padlock('M5 7V5a3 3 0 0 1 6 0');

/** A closed padlock when on, an open padlock when off. */
export const padlockToggle: ColumnToggle = { on: closedPadlock, off: openPadlock };
