// layout/ — what one row draws, as plain data (D-S4-19, D-S4-24, D-S4-25). One Item is one bar.
// This file holds the Item vocabulary alone, so `variants.ts` may name `ItemProducer` and
// `produce-items.ts` may name both, with no import ring between the three.

import { itemId } from '../../model/index.js';
import type { Entry, EntryId, Instant, ItemId, SegmentId } from '../../model/index.js';

/** Which point of the entry's own span a fixed box holds fixed — `'center'` for a marker (a diamond
 *  points at an instant), `'start'` for a flag (the pole sits on the date and the cloth hangs to the
 *  right), `'end'` for the mirror. Named so a producer can state it as a type, not repeat the union
 *  (F12) — `fixedBoxX` (`layout/frame.ts`) is `BarAnchor`'s other reader. */
export type BarAnchor = 'start' | 'center' | 'end';

/** A painted box the time scale does not size (ADR 0022) — `Item.box`'s own shape, named so
 *  `layout/frame.ts` and a producer both read one type instead of repeating the object literal
 *  (F12). `widthPx` is the box's width in content pixels. Frozen and shared across every Item one
 *  producer call builds (`fixedWidthItem`, F16): nothing in `layout/` or `render/` ever writes
 *  through an Item's `box` after production, so one immutable instance per producer costs nothing
 *  and the `readonly` members hold a consumer to that same contract at the type level. */
export interface FixedBarBox {
  readonly widthPx: number;
  readonly anchor: BarAnchor;
}

export interface Item {
  id: ItemId;
  entryId: EntryId;
  /** The variant this Item draws as — the `data-variant` a consumer styles, and the key the paint
   *  and the capability seams resolve through (ADR 0018). A plain `string`: core never branches on
   *  the name, and nothing stores one. */
  variant: string;
  label: string;
  start: Instant;
  end: Instant;
  /** The one Segment this Item draws (#212, ADR 0010) — set only when the Item stands for a real
   *  Segment of the Entry, never for an Item that draws the Entry's whole span (`wholeEntryItem`). */
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
   *  `data-span="fixed"`. `fixedWidthItem` is the producer that sets it. `readonly` (F16): the box
   *  a producer hoists is shared across every Item it builds, so a write through one Item's `box`
   *  would silently reach every other Item that producer ever returns. */
  readonly box?: FixedBarBox;
}

/** What shape one variant draws. `EntryVariant.items` takes one; omit it and the variant draws one
 *  whole-entry Item, which is the line both shipped examples used to hand-write (ADR 0018).
 *
 *  **Takes the variant's own name.** A variant states its name once (ADR 0018), so the registry
 *  passes its own registration's name here instead of a producer inventing or hardcoding one — the
 *  Item then carries that name straight to `data-variant`. A one-argument producer an author already
 *  wrote keeps compiling: TypeScript accepts a function that takes fewer parameters than its
 *  declared type. */
export type ItemProducer = (entry: Entry, variant: string) => readonly Item[];

/** One row's variant, as the item pass reads it: which one won, and what it draws. `variants.ts`
 *  widens it with how it looks and what you can do to it — those two name `BarRenderer`, and this
 *  file must not, or `layout/` grows an import ring through `renderer.ts`. */
export interface DrawnVariant {
  /** The `data-variant` a consumer styles, and the word a command's `when` reads. */
  readonly name: string;
  /** What it draws — its own `items`, or the whole-entry default bound at registration. */
  readonly items: ItemProducer;
}

/** The one question item production asks about a variant: which one this row wears. The answer
 *  carries what it draws. `VariantRegistry` (`variants.ts`) answers it, and its own face publishes
 *  the registration doors the frame pass never calls. So this narrower face is what
 *  `layout/frame.ts` and `produce-items.ts` name, and `layout/` keeps one direction of imports. */
export interface VariantItems {
  resolveFor(entry: Entry): DrawnVariant | undefined;
}

/** What a frame pass reads before a Gantt binds its own registry to it. It draws nothing, because
 *  an unbound pass has no Entry to draw either — `produceItemsForRow` asks `resolveFor` only for an
 *  Entry it already found. One frozen object, never a per-instance one: it holds no state, so two
 *  Gantts sharing it cannot see each other (I2). */
export const NO_VARIANTS: VariantItems = Object.freeze({
  resolveFor: () => undefined,
});

/** The one place the `${entryId}:${segmentIndex}` id convention is written. Every producer builds its
 *  Items here, so no producer restates it. `segmentId` is the caller's own Segment, not re-derived
 *  from `segmentIndex` — a caller with no Segment in hand (a whole Entry) simply omits it. */
export function entryItem(
  entry: Entry,
  segmentIndex: number,
  start: Instant,
  end: Instant,
  variant: string,
  segmentId?: SegmentId,
): Item {
  const item: Item = {
    id: itemId(entry.id, segmentIndex),
    entryId: entry.id,
    variant,
    label: entry.name,
    start,
    end,
  };
  if (segmentId !== undefined) item.segmentId = segmentId;
  return item;
}

/** One Item covering the entry's whole span — what almost every `ItemProducer` returns, and the
 *  default a variant with no `items` gets (ADR 0018). Public because the alternative is eight
 *  hand-written lines that must get the Item id convention right from documentation alone. Pure and
 *  DOM-free, like every other `layout/` function.
 *
 *  Load-bearing cast (ADR 0012, Build 1, J2 in BUILD-LOG.md): a non-spanning Entry has no
 *  `start`/`end` to draw, so `produceItemsForRow` never calls any producer — shipped or a
 *  plugin's own — for one. `spansTime` is where that rule is written, and `produceItemsForRow`
 *  is where it runs. The contract, not the type, is why `entry.start`/`entry.end` are read here
 *  as if they were always present.
 *
 *  This is the one cast Q5 left standing. The type fix is a narrower parameter — the Entry this
 *  takes always spans — and that is a public signature change, so it is owed rather than taken
 *  (N10 in plans/field-redesign/BUILD-LOG.md). */
export function wholeEntryItem(entry: Entry, variant: string): Item {
  return entryItem(entry, 0, entry.start as Instant, entry.end as Instant, variant);
}

/** Call: `diamond({ items: fixedWidthItem(13) })`. Answers an `ItemProducer` that draws one
 *  whole-entry Item — the same span `wholeEntryItem` draws — with `box` set, so `barSpan` paints it
 *  at `px` wide at every zoom instead of sizing it from the entry's span.
 *
 *  Omit `anchor` and it is `'center'` — the spelling already on the surface (`panToDate`'s `align`).
 *  A variant that wants a flag's left-aligned pole passes `'start'`; core picks for nobody.
 *
 *  `box` is built once, here, at registration time — not once per Item inside the returned producer
 *  (F16). One frozen `FixedBarBox` is safe to share across every Item this producer ever returns,
 *  because `box` is `readonly` on `Item` and nothing downstream writes through it (`Item.box`'s own
 *  doc). Freezing it turns an accidental write into a loud failure in strict mode, rather than a
 *  silent one that would otherwise reach every other Item sharing the same box. */
export function fixedWidthItem(px: number, anchor: BarAnchor = 'center'): ItemProducer {
  const box: FixedBarBox = Object.freeze({ widthPx: px, anchor });
  return (entry, variant) => [{ ...wholeEntryItem(entry, variant), box }];
}
