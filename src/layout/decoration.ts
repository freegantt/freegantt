// layout/ — decoration provider types (D-S5-15). A provider is a pure function of the window,
// registered from the DOM side (`ctx.view.registerDecoration`) and invoked from here — the same
// shape `BarProducer` already has (ADR 0002's precedent). It never touches the DOM and never
// mutates its input.
//
// These types live in layout/, not model/ (the spec's own files table names `model/decoration.ts` —
// see s5.6's "API gaps found" note): `DecorationContext.time` is a `ZonedTime` (time/) and
// `DecorationContext.rows` is `FrameRow` (layout/'s own row geometry). `model/` may import nothing
// in `src/` (plans/01 §1), so a type built on either could never live there.

import type { Instant, RowId, TimeSpan, TimeUnit } from '../model/index.js';
import type { ZonedTime } from '../time/index.js';
import type { FrameRow } from './frame-row.js';

/** Where a decoration paints relative to the bar layer — `underBars` below, `overBars` above. */
export type DecorationLayer = 'underBars' | 'overBars';

export interface DecorationContext {
  /** The visible time span, widened by overscan and then bounded by the content's own
   *  `[0, contentWidth]` (#436). The bound is not a narrowing a provider has to work around: a
   *  decoration placed outside the content paints past the timeline's own edge and widens the
   *  pane's native `scrollWidth` past the content sizer, the harm D-S1.8-1 exists to stop. So the
   *  span a provider reads is exactly the span it is allowed to paint over. */
  span: TimeSpan;
  /** The rows in that window, so a provider can shade a row instead of a date range. */
  rows: readonly FrameRow[];
  /** Zone-bound date math (D-S5-16). The provider never touches `Date` or a magic constant. */
  time: ZonedTime;
  /** What one tick column stands for — `'day'` with an increment of 1 means a reader can see
   *  individual days. A provider that only makes sense at some granularity tests these two and
   *  returns nothing at the others. Still time, not pixels (I12): the answer is a calendar step, so
   *  a shared axis (D9) resolves it the same way for every Gantt bound to it. */
  tickUnit: TimeUnit;
  /** How many `tickUnit`s one tick column covers — 1 day reads as a day, 2 days does not. */
  tickIncrement: number;
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
