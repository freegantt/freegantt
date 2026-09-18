// layout/ — what one row draws, as plain data (D-S4-19, D-S4-24, D-S4-25). One Bar is one bar.
// This file holds the Bar vocabulary alone, so `variants.ts` may name `BarProducer` and
// `produce-items.ts` may name both, with no import ring between the three.

import { barId } from '../../model/index.js';
import type { Entry, EntryId, Instant, BarId, SegmentId } from '../../model/index.js';

/** Which point of the entry's own span a fixed box holds fixed — `'center'` for a marker (a diamond
 *  points at an instant), `'start'` for a flag (the pole sits on the date and the cloth hangs to the
 *  right), `'end'` for the mirror. Named so a producer can state it as a type, not repeat the union
 *  (F12) — `fixedBoxX` (`layout/frame.ts`) is `BarAnchor`'s other reader. */
export type BarAnchor = 'start' | 'center' | 'end';

/** A painted box the time scale does not size (ADR 0022) — `Bar.box`'s own shape, named so
 *  `layout/frame.ts` and a producer both read one type instead of repeating the object literal
 *  (F12). `widthPx` is the box's width in content pixels. Frozen and shared across every Bar one
 *  producer call builds (`fixedWidthBar`, F16): nothing in `layout/` or `render/` ever writes
 *  through a Bar's `box` after production, so one immutable instance per producer costs nothing
 *  and the `readonly` members hold a consumer to that same contract at the type level. */
export interface FixedBarBox {
  readonly widthPx: number;
  readonly anchor: BarAnchor;
}

export interface Bar {
  id: BarId;
  entryId: EntryId;
  /** The variant this Bar draws as — the `data-variant` a consumer styles, and the key the paint
   *  and the capability seams resolve through (ADR 0018). A plain `string`: core never branches on
   *  the name, and nothing stores one. */
  variant: string;
  /** A producer's own text for this bar — set it and this Bar owns its label, the most specific
   *  answer available (Q36). Omit it and `layout/frame.ts`'s `placeFrame` fills it from a bound
   *  `barLabelFor` resolver instead — `view/` builds one from the Gantt's own `barLabels` Field.
   *  The built-in producers (`entryBar`, `wholeEntryBar`, `fixedWidthBar`) never set this: an
   *  Entry's name is a Field like any other, read through `formatValue`, not restated here (#421
   *  C5). `FrameBar.label` is the one resolved answer this feeds — always a `string`, never absent. */
  label?: string;
  start: Instant;
  end: Instant;
  /** The one Segment this Bar draws (#212, ADR 0010) — set only when the Bar stands for a real
   *  Segment of the Entry, never for a Bar that draws the Entry's whole span (`wholeEntryBar`). */
  segmentId?: SegmentId;
  /** A painted box the time scale does not size, or `undefined` for an ordinary span-and-floor box.
   *  A marker that must hold its size at every zoom — `diamond()`'s glyph is the shipped case —
   *  states it here.
   *
   *  Not centred on the entry's own start — `barSpan` (`layout/frame.ts`) centres a *floored* span
   *  on its own midpoint (ADR 0022 Q7), and `'center'` follows that same rule so the two never
   *  disagree. The two answer the same question only when `start === end`.
   *
   *  `barSpan` honours this ahead of the span-and-floor path, and `render/` stamps
   *  `data-span="fixed"`. `fixedWidthBar` is the producer that sets it. `readonly` (F16): the box
   *  a producer hoists is shared across every Bar it builds, so a write through one Bar's `box`
   *  would silently reach every other Bar that producer ever returns. */
  readonly box?: FixedBarBox;
}

/** What shape one variant draws. `EntryVariant.bars` takes one. Omit it and the variant draws
 *  `followSegments`, the registry's own default (ADR 0023). One Bar per Segment, or one Bar
 *  over the whole span when the Entry has none.
 *
 *  **Takes the variant's own name.** A variant states its name once (ADR 0018), so the registry
 *  passes its own registration's name here instead of a producer inventing or hardcoding one — the
 *  Bar then carries that name straight to `data-variant`. A one-argument producer an author already
 *  wrote keeps compiling: TypeScript accepts a function that takes fewer parameters than its
 *  declared type.
 *
 *  **Takes whether `childrenAsSegments` claims this Entry as a row's subject** (`true` for a claimed
 *  parent's own bar, `false` otherwise; `EntriesRowSource.childrenAsSegments`, #421 C2). Core's own
 *  `ignoreSegments` and `followSegments` return no Bar for it, so `summary()` paints no rail over
 *  the bars it stands for. A producer that ignores this parameter still draws — nothing skips it. */
export type BarProducer = (entry: Entry, variant: string, childrenAsSegments?: boolean) => readonly Bar[];

/** One row's variant, as the item pass reads it: which one won, and what it draws. `variants.ts`
 *  widens it with how it looks and what you can do to it — those two name `BarRenderer`, and this
 *  file must not, or `layout/` grows an import ring through `renderer.ts`. */
export interface DrawnVariant {
  /** The `data-variant` a consumer styles, and the word a command's `when` reads. */
  readonly name: string;
  /** What it draws — its own `bars`, or `followSegments` bound at registration (ADR 0023). */
  readonly bars: BarProducer;
}

/** The one question item production asks about a variant: which one this row wears. The answer
 *  carries what it draws. `VariantRegistry` (`variants.ts`) answers it, and its own face publishes
 *  the registration doors the frame pass never calls. So this narrower face is what
 *  `layout/frame.ts` and `produce-items.ts` name, and `layout/` keeps one direction of imports. */
export interface VariantBars {
  resolveFor(entry: Entry): DrawnVariant | undefined;
}

/** What a frame pass reads before a Gantt binds its own registry to it. It draws nothing, because
 *  an unbound pass has no Entry to draw either — `produceBarsForRow` asks `resolveFor` only for an
 *  Entry it already found. One frozen object, never a per-instance one: it holds no state, so two
 *  Gantts sharing it cannot see each other (I2). */
export const NO_VARIANTS: VariantBars = Object.freeze({
  resolveFor: () => undefined,
});

/** The one place the `${entryId}:${segmentIndex}` id convention is written. Every producer builds its
 *  Bars here, so no producer restates it. `segmentId` is the caller's own Segment, not re-derived
 *  from `segmentIndex` — a caller with no Segment in hand (a whole Entry) simply omits it. */
export function entryBar(
  entry: Entry,
  segmentIndex: number,
  start: Instant,
  end: Instant,
  variant: string,
  segmentId?: SegmentId,
): Bar {
  const item: Bar = {
    id: barId(entry.id, segmentIndex),
    entryId: entry.id,
    variant,
    // #421 C5, Q36: no `label` — the Entry's name is a Field like any other, and `placeFrame`
    // reads it through a bound `barLabelFor` (`formatValue`), never restated here.
    start,
    end,
  };
  if (segmentId !== undefined) item.segmentId = segmentId;
  return item;
}

/** One Bar covering the entry's whole span — what almost every `BarProducer` returns, and the
 *  default a variant with no `bars` gets (ADR 0018). Public because the alternative is eight
 *  hand-written lines that must get the Bar id convention right from documentation alone. Pure and
 *  DOM-free, like every other `layout/` function.
 *
 *  Load-bearing cast (ADR 0012, Build 1, J2 in BUILD-LOG.md): a non-spanning Entry has no
 *  `start`/`end` to draw, so `produceBarsForRow` never calls any producer — shipped or a
 *  plugin's own — for one. `spansTime` is where that rule is written, and `produceBarsForRow`
 *  is where it runs. The contract, not the type, is why `entry.start`/`entry.end` are read here
 *  as if they were always present.
 *
 *  This is the one cast Q5 left standing. The type fix is a narrower parameter — the Entry this
 *  takes always spans — and that is a public signature change, so it is owed rather than taken
 *  (N10 in plans/field-redesign/BUILD-LOG.md). */
export function wholeEntryBar(entry: Entry, variant: string): Bar {
  return entryBar(entry, 0, entry.start as Instant, entry.end as Instant, variant);
}

/** Call: `diamond({ bars: fixedWidthBar(13) })`. Answers a `BarProducer` that draws one
 *  whole-entry Bar — the same span `wholeEntryBar` draws — with `box` set, so `barSpan` paints it
 *  at `px` wide at every zoom instead of sizing it from the entry's span.
 *
 *  Omit `anchor` and it is `'center'` — the spelling already on the surface (`panToDate`'s `align`).
 *  A variant that wants a flag's left-aligned pole passes `'start'`; core picks for nobody.
 *
 *  `box` is built once, here, at registration time — not once per Bar inside the returned producer
 *  (F16). One frozen `FixedBarBox` is safe to share across every Bar this producer ever returns,
 *  because `box` is `readonly` on `Bar` and nothing downstream writes through it (`Bar.box`'s own
 *  doc). Freezing it turns an accidental write into a loud failure in strict mode, rather than a
 *  silent one that would otherwise reach every other Bar sharing the same box.
 *
 *  **A narrow `px` starves the move zone, when resize is on.** Each resize handle is 8px wide and
 *  sits 4px outside its own edge, so the two handles eat `px` from both sides. A `px` under about
 *  9 leaves no gap between them for a pointer to grab the bar itself and move it — the handles meet
 *  or overlap first. This only matters when the variant's `can.resize` allows a resize at all;
 *  `diamond()`'s own default turns resize off, so its 13px box is unaffected. */
export function fixedWidthBar(px: number, anchor: BarAnchor = 'center'): BarProducer {
  const box: FixedBarBox = Object.freeze({ widthPx: px, anchor });
  return (entry, variant) => [{ ...wholeEntryBar(entry, variant), box }];
}

/** Always one Bar, over the entry's whole span — the shape `summary()` states explicitly. A
 *  summary is one rail whatever the Segments do (ADR 0023). The one-line wrapper that turns
 *  `wholeEntryBar`'s single Bar into a `BarProducer`'s array, so `bars: ignoreSegments` reads
 *  as a plain assignment, the same shape `followSegments` takes.
 *
 *  Call: `variants: [{ name: 'summary', when: (e) => e.hasChildren, bars: ignoreSegments }]` —
 *  "the summary variant's bars: always one bar."
 *
 *  Draws nothing for a claimed parent's own row (#421 C2, Q26/Q27/Q33): `childrenAsSegments`
 *  already carries the row's bars, so `summary()`'s rail would paint over the very bars it stands
 *  for. A consumer producer that ignores the parameter still draws — nothing else skips it. */
export function ignoreSegments(entry: Entry, variant: string, childrenAsSegments = false): readonly Bar[] {
  if (childrenAsSegments) return [];
  return [wholeEntryBar(entry, variant)];
}

/** One Bar per Segment, or one Bar over the whole span when the Entry has none. The shape a
 *  variant with no `bars` key gets (ADR 0023).
 *
 *  Follows the data: a row authored in pieces draws its pieces, gaps included. A plain start/end
 *  row draws the one Bar it has always drawn.
 *
 *  Call: `variants: [{ name: 'phase', when: myRule, bars: followSegments }]` — "the phase
 *  variant's bars: one bar per segment." Naming it explicitly only matters when a variant also
 *  overrides something else on `bar()`'s own object, and still wants to keep this shape. The
 *  registry already gives this shape to a variant that names no `bars` at all.
 *
 *  Fallback branch, reached only for a spanning Entry with no Segments of its own (the plain
 *  start/end case). Same load-bearing cast as `wholeEntryBar` — `produceBarsForRow` never calls
 *  this producer for a non-spanning Entry (ADR 0012, Build 1, J2).
 *
 *  Draws nothing for a claimed parent's own row (#421 C2, Q26/Q27/Q33): the row's children carry
 *  its bars, so a leaf variant's default shape would double them. */
export function followSegments(entry: Entry, variant: string, childrenAsSegments = false): readonly Bar[] {
  if (childrenAsSegments) return [];
  const segments = entry.segments;
  if (segments !== undefined && segments.length > 0) {
    return segments.map((segment, index) =>
      entryBar(entry, index, segment.start, segment.end, variant, segment.id),
    );
  }
  return ignoreSegments(entry, variant);
}
