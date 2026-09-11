// layout/ — the one deep seam that turns a PlannedRow's entries into Items (D-S4-19, D-S4-24, D-S4-25).
// Type, per-Gantt registry, per-look producers, and the row-level fallback all live here so a caller
// and an agent learn one name. Header rows (`kind: 'header'`) produce no Items.
//
// ADR 0013: an Entry carries no stored classification. Structure decides the default look — a parent
// (has children) draws the parent look, a leaf draws a bar — and a plugin that needs a different look
// stores which ids it owns and registers its own producer under that look's name (`resolveLook`
// below tries every registered non-structural look first, and the first one to claim the Entry — a
// non-empty `Item[]` — wins; an Entry nothing claims falls back to the structure look).

import { itemId } from '../../model/index.js';
import type { Disposer, Entry, EntryId, ItemId, Instant, SegmentId } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';
import { isPlannedHeaderRow } from '../rows/row-source.js';
import { createRegistrationTable } from '../registration-table.js';

/** What one Item's look is: structure (a parent or a leaf), or a plugin-owned look — stamped as
 *  `data-kind` on the painted element (`02` §4). Not a stored Entry classification (ADR 0013). */
export type EntryLook = 'parent' | 'leaf' | (string & {});

export interface Item {
  id: ItemId;
  entryId: EntryId;
  look: EntryLook;
  label: string;
  start: Instant;
  end: Instant;
  /** The one Segment this Item draws (#212, ADR 0010) — set only when the Item stands for a real
   *  Segment of the Entry, never for an Item that draws the Entry's whole span (`wholeEntryItem`). */
  segmentId?: SegmentId;
}

export type ItemProducer = (entry: Entry) => readonly Item[];

/** The one place the `${entryId}:${segmentIndex}` id convention is written. Every producer below
 *  builds its Items here, so no producer restates it. `segmentId` is the caller's own Segment, not
 *  re-derived from `segmentIndex` — a caller with no Segment in hand (a whole Entry) simply omits it. */
function entryItem(
  entry: Entry,
  segmentIndex: number,
  start: Instant,
  end: Instant,
  look: EntryLook,
  segmentId?: SegmentId,
): Item {
  const item: Item = {
    id: itemId(entry.id, segmentIndex),
    entryId: entry.id,
    look,
    label: entry.name,
    start,
    end,
  };
  if (segmentId !== undefined) item.segmentId = segmentId;
  return item;
}

/** One Item covering the entry's whole span — what almost every `ItemProducer` returns, and the
 *  common case a plugin author writes (review P3): `ctx.layout.registerItemProducer(MY_LOOK,
 *  (entry) => [wholeEntryItem(entry, MY_LOOK)])`. Public because the alternative is eight
 *  hand-written lines that must get the Item id convention right from documentation alone. Pure and
 *  DOM-free, like every other `layout/` function.
 *
 *  Load-bearing cast (ADR 0012, Build 1, J2 in BUILD-LOG.md): a non-spanning Entry has no
 *  `start`/`end` to draw, so `produceItemsForRow` never calls any producer — shipped or a
 *  plugin's own — for one. That contract, not the type, is why `entry.start`/`entry.end` are
 *  read here as if they were always present. */
export function wholeEntryItem(entry: Entry, look: EntryLook): Item {
  return entryItem(entry, 0, entry.start as Instant, entry.end as Instant, look);
}

export interface ItemProducerRegistry {
  /** The producer registered for `look`, or `undefined` when nothing claims it. */
  producerFor(look: EntryLook): ItemProducer | undefined;
  /** Every registered look other than the two structural ones, in first-registration order —
   *  `resolveLook`'s own trial order. */
  customLooks(): readonly EntryLook[];
  /** S5.9, D-S5-22: `ctx.layout.registerItemProducer(look, producer)` — a plugin claiming what
   *  shape the ids it owns draw. Replaces whichever producer `look` resolved to before (the shipped
   *  two included — a plugin may re-skin `'leaf'` or `'parent'` itself). The returned `Disposer`
   *  restores whichever registration is newest among the rest, the same "undo on plugin disposal"
   *  every other `register*` gives (D-S5-4). Disposing one plugin's producer never disturbs
   *  another plugin's registration on the same look. */
  register(look: EntryLook, producer: ItemProducer): Disposer;
}

function produceLeafItems(entry: Entry): readonly Item[] {
  const segments = entry.segments;
  if (segments !== undefined && segments.length > 0) {
    return segments.map((segment, index) =>
      entryItem(entry, index, segment.start, segment.end, 'leaf', segment.id),
    );
  }
  // Fallback branch, reached only for a spanning Entry with no Segments of its own (the plain
  // start/end case). Same load-bearing cast as `wholeEntryItem` above — `produceItemsForRow`
  // never calls this producer for a non-spanning Entry (ADR 0012, Build 1, J2).
  return [wholeEntryItem(entry, 'leaf')];
}

// render/ draws the bracket off data-kind (D-S4-24).
function produceParentItems(entry: Entry): readonly Item[] {
  return [wholeEntryItem(entry, 'parent')];
}

/** Call: `createItemProducerRegistry()` once in the Gantt constructor; tests pass extras for a look. */
export function createItemProducerRegistry(
  extras: Readonly<Partial<Record<EntryLook, ItemProducer>>> = {},
): ItemProducerRegistry {
  const producers = createRegistrationTable<EntryLook, ItemProducer>([
    ['parent', produceParentItems],
    ['leaf', produceLeafItems],
    ...Object.entries(extras).filter((entry): entry is [EntryLook, ItemProducer] => entry[1] !== undefined),
  ]);
  return {
    producerFor: (look) => producers.get(look),
    customLooks: () => producers.keys().filter((look) => look !== 'parent' && look !== 'leaf'),
    register: (look, producer) => producers.register(look, producer),
  };
}

/** What look one Entry draws, and what shape it produces for it — structure first, then every
 *  registered non-structural look, in registration order (ADR 0013: "a plugin that needs a look
 *  that is not parent-or-bar stores which ids it owns"). A custom-look producer answers by *not*
 *  claiming the Entry: it returns `[]`, the same "no items" value `produceItemsForRow` already
 *  uses elsewhere, and the next registered look gets a turn. Nothing claiming it falls back to the
 *  structure look, which always produces at least one Item for a spanning Entry. */
export function resolveItems(
  entry: Entry,
  registry: ItemProducerRegistry,
  hasChildren: boolean,
): readonly Item[] {
  for (const look of registry.customLooks()) {
    const items = registry.producerFor(look)?.(entry) ?? [];
    if (items.length > 0) return items;
  }
  const structuralLook: EntryLook = hasChildren ? 'parent' : 'leaf';
  return registry.producerFor(structuralLook)?.(entry) ?? [];
}

/** The look `resolveItems` would resolve for `entry`, without building its Items — what
 *  `resolveCapabilities` reads to key a plugin's `registerLookDefaults`/`registerRenderer('bar',
 *  byLook)` registration the same way item production does, off one shared trial instead of two. */
export function resolveLook(entry: Entry, registry: ItemProducerRegistry, hasChildren: boolean): EntryLook {
  for (const look of registry.customLooks()) {
    if ((registry.producerFor(look)?.(entry) ?? []).length > 0) return look;
  }
  return hasChildren ? 'parent' : 'leaf';
}

/** Call: `produceItemsForRow(planned, entryById, registry, hasChildren)`. The registry is required —
 *  one per Gantt (I2), never a fresh one per row. `hasChildren` answers structure for one Entry id —
 *  `(id) => entryById.get(id) !== undefined && childCountByParent(...).get(id) > 0` at the call site,
 *  never re-derived here. */
export function produceItemsForRow(
  row: PlannedRow,
  entryById: ReadonlyMap<EntryId, Entry>,
  registry: ItemProducerRegistry,
  hasChildren: (id: EntryId) => boolean,
): readonly Item[] {
  if (isPlannedHeaderRow(row)) return [];
  const items: Item[] = [];
  for (const id of row.entryIds) {
    const entry = entryById.get(id);
    if (entry === undefined) continue;
    // An Entry spans iff both dates are present, and draws nothing until it does (ADR 0012). No
    // producer — shipped or a plugin's own — ever sees a non-spanning Entry, so `wholeEntryItem`
    // and the two producers above may read `entry.start`/`entry.end` as always present (J2,
    // BUILD-LOG.md).
    if (entry.start === undefined || entry.end === undefined) continue;
    items.push(...resolveItems(entry, registry, hasChildren(id)));
  }
  return items;
}
