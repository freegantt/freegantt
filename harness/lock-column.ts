// The padlock look shared by the harness pages that lock an Entry with a `locked` toggle column.

import type { ColumnToggle, ElementDescription } from 'freegantt';

// A cell icon draws in the theme's row-label colour. The header icon takes the header cell's text colour.
function padlock(parts: string, style: Record<string, string>): ElementDescription {
  return {
    html:
      '<svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
      `${parts}</svg>`,
    attrs: { 'aria-hidden': 'true' },
    style: { display: 'inline-flex', ...style },
  };
}

// On: a solid body and a shackle that closes into it, at full strength.
const CLOSED_PARTS =
  '<rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>';
const closedPadlock = padlock(CLOSED_PARTS, { color: 'var(--fg-row-label-color)' });

// Off: a hollow body and a shackle swung up and aside, muted. The shapes differ, so colour does not carry the state.
export const openPadlock = padlock(
  '<rect x="3" y="7" width="10" height="7.5" rx="1.5"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 4.9-.7"/>',
  { color: 'var(--fg-row-label-color)', opacity: '0.55' },
);

/** The header icon: a closed padlock in the same colour as the other header labels. */
export const padlockHeader: ElementDescription = padlock(CLOSED_PARTS, {});

/** A closed padlock when on, an open padlock when off. */
export const padlockToggle: ColumnToggle = { on: closedPadlock, off: openPadlock };
