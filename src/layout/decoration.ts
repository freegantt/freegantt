// layout/ — decoration provider types (D-S5-15). A provider is a pure function of the window,
// registered from the DOM side (`ctx.view.registerDecoration`) and invoked from here — the same
// shape `ItemProducer` already has (ADR 0002's precedent). It never touches the DOM and never
// mutates its input.
//
// These types live in layout/, not model/ (the spec's own files table names `model/decoration.ts` —
// see s5.6's "API gaps found" note): `DecorationContext.time` is a `ZonedTime` (time/) and
// `DecorationContext.rows` is `FrameRow` (layout/'s own row geometry). `model/` may import nothing
// in `src/` (plans/01 §1), so a type built on either could never live there.

import type { Instant, RowId, TimeSpan } from '../model/index.js';
import type { ZonedTime } from '../time/index.js';
import type { FrameRow } from './frame-row.js';

/** Where a decoration paints relative to the bar layer — `underBars` below, `overBars` above. */
export type DecorationLayer = 'underBars' | 'overBars';

export interface DecorationContext {
  /** The visible time span, already widened by overscan. */
  span: TimeSpan;
  /** The rows in that window, so a provider can shade a row instead of a date range. */
  rows: readonly FrameRow[];
  /** Zone-bound date math (D-S5-16). The provider never touches `Date` or a magic constant. */
  time: ZonedTime;
}

export type DecorationProvider = (ctx: DecorationContext) => readonly DecorationInput[];

/** What a provider states — time, not pixels. `layout/decorations.ts` converts through the bound
 *  `TimeScale` (I12); a provider that computed pixels itself would break the moment the axis is
 *  shared (D9). */
export type DecorationInput =
  | { kind: 'rangeBand'; start: Instant; end: Instant; class?: string }
  | { kind: 'rowStripe'; rowId: RowId; class?: string };

/** A `DecorationInput.rangeBand`, resolved to content pixels through the bound `TimeScale`. `class`
 *  lands on the decoration node beside `.fg-range-band`, so two providers' bands are tellable apart
 *  in CSS (level 2 of the customization ladder) — the library never invents one. */
export interface RangeBand {
  kind: 'rangeBand';
  x: number;
  width: number;
  class?: string;
}

/** A `DecorationInput.rowStripe`, unchanged: a row id needs no pixel conversion, `render/dom`
 *  resolves it against the row it already painted. */
export interface RowStripe {
  kind: 'rowStripe';
  rowId: RowId;
  class?: string;
}
