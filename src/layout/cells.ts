// layout/ — shipped Grid-column cell renderers. DOM-free `ElementDescription` trees
// (plans/01 §1). A variant can carry its own `css`; a cell renderer cannot, so the
// look lives in the always-on sheet (`view/styles.ts`).
//
// What shape it draws? `meterCell()` a track and optional text; `imageCell({ alt })`
// an img.
// How it looks? `.fg-meter*` / `.fg-image-cell` in the base sheet.

import type { ColumnCellRenderer, ElementDescription } from '../model/index.js';

/** The track's own scale. Paint clamps to this; the formatted text does not. */
const TRACK_FULL = 100;

/** A finite number is a reading. `NaN` and `Infinity` are not, and must not paint a track. */
function meterReading(fieldValue: unknown): number | undefined {
  return typeof fieldValue === 'number' && Number.isFinite(fieldValue) ? fieldValue : undefined;
}

/** How wide the fill paints, as a 0–100 percent. The text still prints the true value. */
function trackFillPercent(reading: number): number {
  if (reading < 0) return 0;
  if (reading > TRACK_FULL) return TRACK_FULL;
  return reading;
}

function meterTrack(paintPercent: number, hidden: boolean): ElementDescription & { key: string } {
  const track: ElementDescription & { key: string } = {
    key: 'track',
    class: { 'fg-meter-track': true },
    children: [
      {
        key: 'fill',
        class: { 'fg-meter-fill': true },
        style: { width: `${paintPercent}%` },
      },
    ],
  };
  if (hidden) track.attrs = { 'aria-hidden': 'true' };
  return track;
}

/** `meterCell()` — core's meter, for a `percent` Field. Call: "the progress column's
 *  cell renderer is a meter cell."
 *
 *  Default `{ text: true }`: a track plus the Field's formatted `value` (`35%`).
 *  The graphic is `aria-hidden`, so AT announces the adjacent text once.
 *
 *  `{ text: false }`: the graphic alone, with `role="meter"`. `aria-valuenow` is
 *  the true reading. `aria-valuemax` is `max(100, now)`, so 120 is not announced
 *  as 100. Never `role="progressbar"` — a unit-level percent is not a running task.
 *
 *  Missing or non-numeric `fieldValue` paints an empty cell: no track, no role.
 *  `0` is a real reading and paints an empty fill. Out of range clamps paint only. */
export function meterCell(options?: { text?: boolean }): ColumnCellRenderer {
  const showText = options?.text ?? true;
  return ({ value, fieldValue }) => {
    const reading = meterReading(fieldValue);
    if (reading === undefined) return undefined;
    const track = meterTrack(trackFillPercent(reading), showText);
    if (showText) {
      return {
        class: { 'fg-meter': true },
        children: [track, { key: 'text', class: { 'fg-meter-text': true }, text: value }],
      };
    }
    return {
      class: { 'fg-meter': true },
      attrs: {
        role: 'meter',
        'aria-valuemin': '0',
        'aria-valuenow': String(reading),
        'aria-valuemax': String(Math.max(TRACK_FULL, reading)),
      },
      children: [track],
    };
  };
}

/** `imageCell({ alt })` — core's image cell, for a Field that stores a URL string.
 *
 *  `alt` is required: this cell is an image with no adjacent text, so the
 *  alternative text is the only name a reader of the cell hears.
 *
 *  Empty or non-string `fieldValue` paints an empty cell, never a broken img.
 *
 *  Column `tooltip` already defaults `false`. `tooltip: true` on an image
 *  column shows the stored URL unless the Field's `formatValue` returns a
 *  caption. The default tooltip body never sees the renderer. */
export function imageCell(options: { alt: string }): ColumnCellRenderer {
  const { alt } = options;
  return ({ fieldValue }) => {
    if (typeof fieldValue !== 'string' || fieldValue === '') return undefined;
    return { tag: 'img', class: { 'fg-image-cell': true }, attrs: { src: fieldValue, alt } };
  };
}
