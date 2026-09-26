// layout/ — what one row draws, as plain data. One Bar is one bar.
// This file holds the Bar vocabulary alone, so `variants.ts` may name `BarProducer` and
// `produce-bars.ts` may name both, with no import ring between the three.

import { barId } from '../../model/index.js';
import type { Entry, EntryId, Instant, BarId } from '../../model/index.js';

/** Which point of the entry's own span a fixed box holds fixed — `'center'` for a marker (a diamond
 *  points at an instant), `'start'` for a flag (the pole sits on the date and the cloth hangs to the
 *  right), `'end'` for the mirror. Named so a producer can state it as a type, not repeat the union.
 *  `fixedBoxX` (`layout/frame.ts`) is `BarAnchor`'s other reader. */
export type BarAnchor = 'start' | 'center' | 'end';

/** A painted box the time scale does not size (ADR 0022) — `Bar.box`'s own shape, named so
 *  `layout/frame.ts` and a producer both read one type instead of repeating the object literal.
 *  `widthPx` is the box's width in content pixels. Frozen and shared across every Bar one
 *  producer call builds (`fixedWidthBar`): nothing in `layout/` or `render/` ever writes
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
   *  answer available. Omit it and `layout/frame.ts`'s `placeFrame` fills it from a bound
   *  `barLabelFor` resolver instead — `view/` builds one from the Gantt's own `barLabels` Field.
   *  The built-in producers (`entryBar`, `wholeEntryBar`, `fixedWidthBar`) never set this: an
   *  Entry's name is a Field like any other, read through `formatValue`, not restated here (#421
   *  C5). `FrameBar.label` is the one resolved answer this feeds — always a `string`, never absent. */
  label?: string;
  start: Instant;
  end: Instant;
  /** A painted box the time scale does not size, or `undefined` for an ordinary span-and-floor box.
   *  A marker that must hold its size at every zoom — `diamond()`'s glyph is the shipped case —
   *  states it here.
   *
   *  Not centred on the entry's own start — `barSpan` (`layout/frame.ts`) centres a *floored* span
   *  on its own midpoint (ADR 0022), and `'center'` follows that same rule so the two never
   *  disagree. The two answer the same question only when `start === end`.
   *
   *  `barSpan` honours this ahead of the span-and-floor path, and `render/` stamps
   *  `data-span="fixed"`. `fixedWidthBar` is the producer that sets it. `readonly`: the box
   *  a producer hoists is shared across every Bar it builds, so a write through one Bar's `box`
   *  would silently reach every other Bar that producer ever returns. */
  readonly box?: FixedBarBox;
}

/** What shape one variant draws. `EntryVariant.bars` takes one. Omit it and the variant draws
 *  `wholeSpanUnlessSegments`, the registry's own default (ADR 0023, ADR 0026) — one Bar over the entry's
 *  whole span. A former Segment is an ordinary child Entry now, so it draws its own Bar through its
 *  own row, never through this Entry's producer.
 *
 *  **Takes the variant's own name.** A variant states its name once (ADR 0018), so the registry
 *  passes its own registration's name here instead of a producer inventing or hardcoding one — the
 *  Bar then carries that name straight to `data-variant`. A one-argument producer an author already
 *  wrote keeps compiling: TypeScript accepts a function that takes fewer parameters than its
 *  declared type.
 *
 *  **Takes whether `childrenAsSegments` matches this Entry as a row's subject** (`true` for a segmented
 *  parent's own bar, `false` otherwise; `EntriesRowSource.childrenAsSegments`, #421 C2). Core's own
 *  `wholeSpanUnlessSegments` returns no Bar for it, so `summary()` paints no rail over the bars its children
 *  already draw. A producer that ignores this parameter still draws — nothing skips it. */
export type BarProducer = (entry: Entry, variant: string, childrenAsSegments?: boolean) => readonly Bar[];

/** One row's variant, as the bar pass reads it: which one won, and what it draws. `variants.ts`
 *  widens it with how it looks and what you can do to it — those two name `BarRenderer`, and this
 *  file must not, or `layout/` grows an import ring through `renderer.ts`. */
export interface DrawnVariant {
  /** The `data-variant` a consumer styles, and the word a command's `when` reads. */
  readonly name: string;
  /** What it draws — its own `bars`, or `wholeSpanUnlessSegments` bound at registration (ADR 0023). */
  readonly bars: BarProducer;
}

/** The one question bar production asks about a variant: which one this row wears. The answer
 *  carries what it draws. `VariantRegistry` (`variants.ts`) answers it, and its own face publishes
 *  the registration doors the frame pass never calls. So this narrower face is what
 *  `layout/frame.ts` and `produce-bars.ts` name, and `layout/` keeps one direction of imports. */
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

/** The one place the `${entryId}:${partIndex}` id convention is written. Every producer builds its
 *  Bars here, so no producer restates it. A core producer always calls this with the default part
 *  index: an Entry draws one Bar over its own span (#421, ADR 0026). */
export function entryBar(
  entry: Entry,
  partIndex: number,
  start: Instant,
  end: Instant,
  variant: string,
): Bar {
  return {
    id: barId(entry.id, partIndex),
    entryId: entry.id,
    variant,
    // #421 C5: no `label` — the Entry's name is a Field like any other, and `placeFrame`
    // reads it through a bound `barLabelFor` (`formatValue`), never restated here.
    start,
    end,
  };
}

/** One Bar covering the entry's whole span — what almost every `BarProducer` returns, and the
 *  default a variant with no `bars` gets (ADR 0018). Public because the alternative is eight
 *  hand-written lines that must get the Bar id convention right from documentation alone. Pure and
 *  DOM-free, like every other `layout/` function.
 *
 *  Load-bearing cast (ADR 0012, Build 1): a non-spanning Entry has no
 *  `start`/`end` to draw, so `produceBarsForRow` never calls any producer — shipped or a
 *  plugin's own — for one. `spansTime` is where that rule is written, and `produceBarsForRow`
 *  is where it runs. The contract, not the type, is why `entry.start`/`entry.end` are read here
 *  as if they were always present.
 *
 *  This is the one cast left standing. The type fix is a narrower parameter — the Entry this
 *  takes always spans — and that is a public signature change, so it is owed rather than taken
 *  (N10, ADR 0012's appendix). */
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
 *  `box` is built once, here, at registration time — not once per Bar inside the returned producer.
 *  One frozen `FixedBarBox` is safe to share across every Bar this producer ever returns,
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

/** Always one Bar, over the entry's whole span — the shape `bar()` and `summary()` both state
 *  (ADR 0023, ADR 0026). The registry's own default for a variant with no `bars` key: a former
 *  Segment is an ordinary child Entry now, so there is no second, narrower shape left to choose
 *  between — one Entry always draws one Bar over its own span.
 *
 *  Call: `variants: [{ name: 'summary', when: (e) => e.hasChildren, bars: wholeSpanUnlessSegments }]` —
 *  "the summary variant's bars: always one bar."
 *
 *  **"Segmented" here means `childrenAsSegments` (#421 C2).** Draws nothing for a row whose children
 *  `childrenAsSegments` already matched onto it: those children draw their own Bars
 *  through their own rows, so this producer's rail would paint a second bar over the same span. A
 *  consumer producer that ignores the parameter still draws — nothing else skips it. */
export function wholeSpanUnlessSegments(
  entry: Entry,
  variant: string,
  childrenAsSegments = false,
): readonly Bar[] {
  if (childrenAsSegments) return [];
  return [wholeEntryBar(entry, variant)];
}
