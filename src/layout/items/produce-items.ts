// layout/ — the one deep seam that turns a PlannedRow's entries into Items (D-S4-19, D-S4-24, D-S4-25).
// Type, per-Gantt registry, per-look producers, and the row-level fallback all live here so a caller
// and an agent learn one name. Header rows (`kind: 'header'`) produce no Items.
//
// ADR 0013: an Entry carries no stored classification. Structure decides the default look — a parent
// (has children) draws the parent look, a leaf draws a bar — and a plugin that needs a different look
// stores which ids it owns and registers two things under that look's name: a `LookClaim` saying
// which entries wear it, and an `ItemProducer` saying what it draws. The first registered claim to
// answer yes wins, and an Entry nothing claims falls back to the structure look (Q10).

import { itemId, spansTime } from '../../model/index.js';
import type {
  Disposer,
  StoredEntry,
  EntryId,
  EntryLook,
  ItemId,
  Instant,
  PluginId,
  SegmentId,
} from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';
import { isPlannedHeaderRow } from '../rows/row-source.js';
import { createRegistrationTable } from '../registration-table.js';

// `EntryLook` is declared in `model/` and re-exported here. It reaches six public signatures
// (`Item.look`, `wholeEntryItem`, `registerItemProducer`, `registerLookDefaults`), and only `api/`
// and `model/` types are public (plans/01 §1). Declaring it here left a consumer unable to name a
// type the API asks them for — `api-extractor` reported it as a forgotten export.
export type { EntryLook } from '../../model/index.js';

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

export type ItemProducer = (entry: StoredEntry) => readonly Item[];

/** Which entries wear one plugin's look (Q10, ADR 0013). A plugin registers one beside the producer
 *  it already registers:
 *
 *  ```ts
 *  ctx.layout.registerLookClaim(BUFFER_LOOK, (entry) => owned.has(entry.id));
 *  ctx.layout.registerItemProducer(BUFFER_LOOK, (entry) => [wholeEntryItem(entry, BUFFER_LOOK)]);
 *  ```
 *
 *  Answer yes for an Entry this plugin owns, and no for every other one. Keep it cheap: core asks
 *  this question on the hover path, so a `Set` read is the intended shape. It never draws, and it
 *  never allocates.
 *
 *  A look with a producer and no claim draws nothing, because nothing ever wears it. The two
 *  registrations are a pair. */
export type LookClaim = (entry: StoredEntry) => boolean;

/** Two plugins claimed one Entry. The first registered claim paints; the second is reported and
 *  ignored. The library never arbitrates between plugins — the consumer chose which ones to
 *  install, so core names both sides and carries on (Q10, the author's ruling of 2026-09-11). */
export interface DoubleLookClaim {
  entryId: EntryId;
  /** The claim that wins and paints. */
  painted: LookClaimant;
  /** The claim that also answered yes, and draws nothing. */
  ignored: LookClaimant;
}

/** One side of a `DoubleLookClaim`. `pluginId` is absent for a claim registered outside a plugin —
 *  a test registry, or core's own seeding. */
export interface LookClaimant {
  look: EntryLook;
  pluginId?: PluginId;
}

/** Where a `DoubleLookClaim` goes. `GanttShell` supplies one — see its `#reportDoubleClaim`, which
 *  raises the `'look-claimed-twice'` report and holds the one-per-pair rule. A registry built
 *  without one resolves a double claim silently to the first claim, and never asks a second
 *  question. That keeps `layout/` clear of error plumbing, and it is what a test registry gets. */
export type ReportDoubleClaim = (collision: DoubleLookClaim) => void;

/** The one place the `${entryId}:${segmentIndex}` id convention is written. Every producer below
 *  builds its Items here, so no producer restates it. `segmentId` is the caller's own Segment, not
 *  re-derived from `segmentIndex` — a caller with no Segment in hand (a whole Entry) simply omits it. */
function entryItem(
  entry: StoredEntry,
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
 *  plugin's own — for one. `spansTime` is where that rule is written, and `produceItemsForRow`
 *  is where it runs. The contract, not the type, is why `entry.start`/`entry.end` are read here
 *  as if they were always present.
 *
 *  This is the one cast Q5 left standing. The type fix is a narrower parameter — the Entry this
 *  takes always spans — and that is a public signature change, so it is owed rather than taken
 *  (N10 in plans/field-redesign/BUILD-LOG.md). */
export function wholeEntryItem(entry: StoredEntry, look: EntryLook): Item {
  return entryItem(entry, 0, entry.start as Instant, entry.end as Instant, look);
}

export interface ItemProducerRegistry {
  /** The producer registered for `look`, or `undefined` when nothing claims it. */
  producerFor(look: EntryLook): ItemProducer | undefined;
  /** The look this Entry wears, or `undefined` when no plugin claims it — in which case structure
   *  answers (`resolveLook`). The first registered claim to answer yes wins. */
  claimedLookFor(entry: StoredEntry): EntryLook | undefined;
  /** `ctx.layout.registerLookClaim(look, claim)` — which entries wear `look` (Q10). Newest
   *  registration on a look wins, and disposal restores the one before it, the same as every other
   *  `register*` seam. */
  registerClaim(look: EntryLook, claim: LookClaim, pluginId?: PluginId): Disposer;
  /** S5.9, D-S5-22: `ctx.layout.registerItemProducer(look, producer)` — a plugin claiming what
   *  shape the ids it owns draw. Replaces whichever producer `look` resolved to before (the shipped
   *  two included — a plugin may re-skin `'leaf'` or `'parent'` itself). The returned `Disposer`
   *  restores whichever registration is newest among the rest, the same "undo on plugin disposal"
   *  every other `register*` gives (D-S5-4). Disposing one plugin's producer never disturbs
   *  another plugin's registration on the same look. */
  register(look: EntryLook, producer: ItemProducer): Disposer;
}

function produceLeafItems(entry: StoredEntry): readonly Item[] {
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
function produceParentItems(entry: StoredEntry): readonly Item[] {
  return [wholeEntryItem(entry, 'parent')];
}

/** Call: `createItemProducerRegistry()` once in the Gantt constructor; tests pass extras for a look.
 *  `reportDoubleClaim` is `GanttShell`'s dev-mode reporter — omit it and a double claim resolves
 *  silently to the first claim, which is what a production build does. */
export function createItemProducerRegistry(
  extras: Readonly<Partial<Record<EntryLook, ItemProducer>>> = {},
  reportDoubleClaim?: ReportDoubleClaim,
): ItemProducerRegistry {
  const producers = createRegistrationTable<EntryLook, ItemProducer>([
    ['parent', produceParentItems],
    ['leaf', produceLeafItems],
    ...Object.entries(extras).filter((entry): entry is [EntryLook, ItemProducer] => entry[1] !== undefined),
  ]);
  const claims = createRegistrationTable<EntryLook, { claim: LookClaim; pluginId?: PluginId }>();
  /** A `const` copy, so the loop below narrows it once instead of on every pass. */
  const report = reportDoubleClaim;

  /** The claim order, held between registration changes (#188's pattern): `keys()` builds an array,
   *  and `claimedLookFor` runs on every hover change, where the budget is zero allocation. */
  let claimOrder: readonly EntryLook[] | undefined;
  const claimedLooks = (): readonly EntryLook[] => (claimOrder ??= claims.keys());

  return {
    producerFor: (look) => producers.get(look),
    claimedLookFor(entry) {
      let paintedLook: EntryLook | undefined;
      let paintedPluginId: PluginId | undefined;
      for (const look of claimedLooks()) {
        const registration = claims.get(look);
        if (registration === undefined || !registration.claim(entry)) continue;
        if (paintedLook === undefined) {
          paintedLook = look;
          paintedPluginId = registration.pluginId;
          // Nothing is watching for a collision, so the first yes is the whole answer.
          if (report === undefined) return paintedLook;
          continue;
        }
        report?.({
          entryId: entry.id,
          painted: claimant(paintedLook, paintedPluginId),
          ignored: claimant(look, registration.pluginId),
        });
        break;
      }
      return paintedLook;
    },
    register: (look, producer) => producers.register(look, producer),
    registerClaim(look, claim, pluginId) {
      claimOrder = undefined;
      const dispose = claims.register(look, pluginId === undefined ? { claim } : { claim, pluginId });
      return () => {
        claimOrder = undefined;
        dispose();
      };
    },
  };
}

function claimant(look: EntryLook, pluginId: PluginId | undefined): LookClaimant {
  return pluginId === undefined ? { look } : { look, pluginId };
}

/** What shape one Entry draws: its look, then that look's producer. One resolution, one producer
 *  call — the look is decided before anything draws (Q10), so no candidate's Items are ever built
 *  and thrown away.
 *
 *  A claimed look with no producer draws nothing. The claim still stands, so `resolveCapabilities`
 *  and the `bar` renderer seam still key on it: the plugin said this Entry is its own. */
export function resolveItems(
  entry: StoredEntry,
  registry: ItemProducerRegistry,
  hasChildren: boolean,
): readonly Item[] {
  return registry.producerFor(resolveLook(entry, registry, hasChildren))?.(entry) ?? [];
}

/** The look one Entry wears — a plugin's claim first, then structure (ADR 0013: "a plugin that
 *  needs a look that is not parent-or-bar stores which ids it owns"). The first registered claim to
 *  answer yes wins; a second claim on the same Entry is reported and ignored (`DoubleLookClaim`).
 *
 *  This runs on the hover path (`GanttShell#setHovered` -> `#refreshAffordances` ->
 *  `resolveCapabilities` -> `lookOf`), so it asks predicates and allocates nothing. Until Q10 it
 *  ran every candidate producer and counted the Items each one built, against the zero-allocation
 *  rule its own comment claimed to keep. */
export function resolveLook(
  entry: StoredEntry,
  registry: ItemProducerRegistry,
  hasChildren: boolean,
): EntryLook {
  return registry.claimedLookFor(entry) ?? (hasChildren ? 'parent' : 'leaf');
}

/** Call: `produceItemsForRow(planned, entryById, registry, hasChildren)`. The registry is required —
 *  one per Gantt (I2), never a fresh one per row. `hasChildren` answers structure for one Entry id —
 *  `(id) => entryById.get(id) !== undefined && childCountByParent(...).get(id) > 0` at the call site,
 *  never re-derived here. */
export function produceItemsForRow(
  row: PlannedRow,
  entryById: ReadonlyMap<EntryId, StoredEntry>,
  registry: ItemProducerRegistry,
  hasChildren: (id: EntryId) => boolean,
): readonly Item[] {
  if (isPlannedHeaderRow(row)) return [];
  const items: Item[] = [];
  for (const id of row.entryIds) {
    const entry = entryById.get(id);
    if (entry === undefined) continue;
    // An Entry draws nothing until it spans (`spansTime`, ADR 0012). This is the one gate: no
    // producer — shipped or a plugin's own — ever sees a non-spanning Entry, so `wholeEntryItem`
    // and the two producers above may read `entry.start`/`entry.end` as always present (J2,
    // BUILD-LOG.md).
    if (!spansTime(entry)) continue;
    items.push(...resolveItems(entry, registry, hasChildren(id)));
  }
  return items;
}
