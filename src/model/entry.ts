// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

import type { EntryId, SegmentId } from './ids.js';
import type { Instant, InstantInput, TimeSpan, TimeSpanInput } from './time.js';

/** Open classification — see plans/01 §2.5. Shipped kinds ship; consumers add their own. */
export type EntryKind = 'span' | 'group' | 'milestone' | (string & {});

/** One dated stretch of an Entry, and the unit the Selection holds (#212, ADR 0010). Interrupted
 * work stores several; an Entry that never mentioned one stores a single Segment over its own span,
 * filled at ingest, so every Entry reads the same way and no caller carries a "no segments" branch.
 * A Segment carries an id because a Selection, an undo and a `removeSegments` call all have to name
 * the same stretch after its siblings move — see `SegmentId`. */
export interface Segment extends TimeSpan {
  id: SegmentId;
}

/** What a consumer writes for one Segment. The id is theirs to name and optional: an omitted id is
 * minted at ingest from the Dataset's own counter. `Segment` is itself a valid `SegmentInput`. */
export interface SegmentInput extends TimeSpanInput {
  id?: string;
}

export interface Entry<TMeta = unknown> {
  id: EntryId;
  /** Hierarchy; roots have none. */
  parentId?: EntryId;
  /** Authored, never derived — see plans/01 §2.5. */
  kind: EntryKind;
  name: string;
  start: Instant;
  /** Exclusive — see plans/01 §5. */
  end: Instant;
  /** Every stretch this Entry draws, never empty (#212). Interrupted work stores several bars on one
   * row; everything else stores the single Segment ingest filled in over `[start, end)`. `start` and
   * `end` stay the envelope over all of them. */
  segments: readonly Segment[];
  /** Consumer-owned, typed via generic. */
  meta?: TMeta;
}

/**
 * What a consumer writes; `Entry` is what the library stores. The two differ only in how loose the input
 * may be: ids are plain strings (the `EntryId` brand is applied on the way in) and dates are any
 * `InstantInput`. An `Entry` is itself a valid `EntryInput`, so a consumer that already holds branded
 * values passes them through unchanged.
 *
 * `Dataset` reads this into `Entry` once, at construction, in the Dataset's own zone — see
 * `DateOnlyEndRule` for how a date-only `end` is read.
 */
export interface EntryInput<TMeta = unknown> {
  id: string;
  /** Hierarchy; roots have none. */
  parentId?: string;
  /** Authored, never derived — see plans/01 §2.5. Default 'span'. */
  kind?: EntryKind;
  name: string;
  /** Required for a `kind` whose span is authored. Omit both `start` and `end` for a
   * `rollUpKinds` kind (default `'group'`) to let the Rollup fill them in — the store
   * writes a zero-length span at the dataset's reference date until the rollup runs (`01` §2.5,
   * S2.3 §1.5). Omitting one but not the other, or omitting both on a non-deriving kind, is an
   * `InvalidInstantError`: the field is required and `undefined` names no instant. */
  start?: InstantInput;
  /** Exclusive — see plans/01 §5 and `DateOnlyEndRule`. See `start` for when this may be omitted. */
  end?: InstantInput;
  /** Interrupted work — renders as multiple bars on one row. Omit it and ingest fills one Segment
   * over `[start, end)`, so a stored `Entry` always has at least one. */
  segments?: readonly SegmentInput[];
  /** Consumer-owned, typed via generic. */
  meta?: TMeta;
}

/** What a consumer may change. Input-shaped, so dates stay loose the way `EntryInput`'s are: the store
 * reads them through `time/`'s `toInstant`/`toEndInstant` in the dataset's zone, exactly as
 * construction does. `id` is not editable — an id is identity. Declared Field keys (`cost`) are
 * legal beside core keys (D-S4-2); the registry rejects an unregistered name at the call.
 *
 * `TFields` is the TypeScript map of those declared keys (`Dataset<TMeta, { cost: number }>`). The
 * default stays open (`Record<string, unknown>`) so a Dataset that omitted the second generic still
 * type-checks `update({ cost: 500 })`; pass `{ cost: number }` to get a type error on `'nope'` and
 * autocomplete for `cost`. */
export type EntryEdit<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = Partial<Omit<EntryInput<TMeta>, 'id'>> & Partial<TFields>;

/** What the store already holds: a storage-shaped edit, with every field read through `time/` (an
 *  `Instant`, not a loose `InstantInput`). Two callers meet it, and they meet it differently
 *  (`plans/02`, two callers two surfaces). An **app author** reads one and never builds one — write
 *  an `EntryEdit`, the same object `entries.update()` takes. A **plugin author** builds them: an
 *  `EditExtender` returns `EntryEdits`, a map of these. `moveEntryTo` builds the one case that is
 *  easy to get wrong. Core builds these on the way in, and `diffEdit` compares one against `entries`.
 *
 *  `EntryEdit` above is the input-shaped edit a caller writes (`plans/02`, one write shape). The two
 *  coincide today only because no mutator normalizes loose input into this shape yet. This type sits
 *  in `model/` (moved from `data/edit-extension.ts` in S3.3, D-S3-4) so `layout/gesture-draft.ts` can
 *  build one without reaching into `data/`.
 *
 *  `proposedKeys` carries the Field keys the caller proposed. It is part of the edit, not a side
 *  channel — spread keeps it, and overlay never copies it onto an Entry. */
export type StoredEdit = Partial<Omit<Entry, 'id'>> & {
  readonly proposedKeys?: ReadonlySet<string>;
};

/** A map of `StoredEdit`s, keyed by the `EntryId` each one targets — what `EditRequest.proposed`
 *  carries, and what `entries.pendingEdits()` and a Draft (`layout/gesture-draft.ts`) hold. */
export type StoredEdits = ReadonlyMap<EntryId, StoredEdit>;

export type EntryEdits = ReadonlyMap<EntryId, StoredEdit>;

/** What the extension hook reads (D4, D-S2-6). It carries the same three members on a preview call
 *  and on the real commit call, which is why an extender can never refuse a write — see D-S5-24's
 *  refusal note: a lock plugin vetoes in `beforeChange`, never here. */
export interface EditRequest {
  /** Current store snapshot, before this transaction's edits — what a cascade reads to compute a
   *  delta (what moved, and by how much). Unlike `entryAfterEdits` below, this never reflects this
   *  transaction's own body edits (D-S5-45). */
  entries: ReadonlyMap<EntryId, Entry>;
  /** What the caller asked to change — storage-shaped and complete, the same as `entries` above
   *  (`plans/02`, "core fills zone math"): a cascade compares it against `entries` with no
   *  normalizing step of its own. */
  proposed: StoredEdits;
  /** `id` as this transaction's own body edits leave it: committed state overlaid with `proposed`
   *  (and, at commit, this transaction's own adds). `undefined` when `id` names no entry there either.
   *  `entries.get(id)` is the wrong read for judging an in-flight edit against current shape — it
   *  still shows an Entry's Segments as they were before this transaction rewrote them, so a cascade
   *  reasoning from it can propose a write core then refuses against the shape it actually has
   *  (D-S5-45). A per-id lookup, not a second map on this object: the drag preview calls this every
   *  rAF frame and must not copy the dataset to answer it (I5). */
  entryAfterEdits(id: EntryId): Entry | undefined;
}

/** Extra writes only; an empty map means no cascade. Lives in `model/` (not `data/`) so
 *  `ExtenderWrapper` — the type a plugin author writes against — can name it (D-S5-23). */
export type EditExtender = (request: EditRequest) => EntryEdits;
