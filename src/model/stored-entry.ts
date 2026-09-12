// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

import type { EntryId, SegmentId } from './ids.js';
import type { Instant, InstantInput, TimeSpan, TimeSpanInput } from './time.js';

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

/** The values one row stores at one moment (ADR 0017). `Entry` (`entry.ts`) is the other half of
 *  the pair: it answers questions about a row **now** — `read(key)`, `children()`, `duration()`,
 *  `hasChildren`. This type answers none of them, and that is deliberate. A pass may hold a row no
 *  store holds — the Rollup's own effective tree is one — so the questions belong to the pass, and
 *  every pass that hands a `StoredEntry` hands the answers beside it: an Aggregator reads
 *  `ctx.read(key)` and `ctx.children()`, a `compute` Field reads `ComputeContext` the same way.
 *
 *  It is not a second concept. It is one row, with no questions attached.
 *
 *  An app author meets it in `DatasetOptions.aggregators`, in a Field's `compute` and `distribute`,
 *  and on `ChangeSet.added[].entity` / `.removed[].entity`. */
export interface StoredEntry<TProps = Record<string, unknown>> {
  id: EntryId;
  /** Hierarchy; roots have none. An Entry has no stored classification (ADR 0013): it derives when
   *  it has children, and `Entry.hasChildren` is what answers that. */
  parentId?: EntryId;
  /** What this row is called. Core reads it for the Grid's default label and for nothing else. */
  name: string;
  /** Omitted iff this Entry does not span (ADR 0012). Present with `end` if and only if it holds a
   * Segment and draws a bar. */
  start?: Instant;
  /** Exclusive — see plans/01 §5. Omitted iff this Entry does not span (ADR 0012); see `start`. */
  end?: Instant;
  /** Every stretch this Entry draws. Empty when the Entry does not span (ADR 0012, revises #212's
   * "never empty"). A spanning Entry stores at least one Segment: interrupted work stores several
   * bars on one row; everything else stores the single Segment ingest filled in over `[start, end)`.
   * `start` and `end` stay the envelope over all of them. */
  segments: readonly Segment[];
  /** Consumer-owned. A Field key is the whole address (ADR 0011): `{ key: 'cost' }` reads and writes
   *  `entry.props.cost`, and nothing declares a `source`. Always present — ingest fills `{}`, the
   *  same rule `segments` already follows, so no reader carries a "no props" branch. `Partial<TProps>`
   *  because a required key on `TProps` is still one a stored record may lack: `add({ id, name })`
   *  reaches that state on its own, with no write to refuse it. */
  props: Readonly<Partial<TProps>>;
}

/**
 * The span invariant, and the one place it is written (ADR 0012, Q5 in the field-redesign
 * BUILD-LOG). An Entry spans time when it holds **both** `start` and `end`. An Entry with one date,
 * or with no date, appears in the grid and draws no bar.
 *
 * Call it as a question about the record: `if (!spansTime(entry)) return;`. It narrows, so the
 * caller reads `entry.start` and `entry.end` as `Instant` after it, with no cast.
 *
 * It is generic over the two dates rather than over `Entry`, because three kinds of record carry
 * them and ask the same question: a stored `Entry`, a `ProposedEdit` mid-gesture, and the date pair
 * ingest reads before it builds either.
 *
 * This is the one runtime function `model/` holds beyond the id/brand helpers and the error base
 * (plans/01 §1.1). The author widened that carve-out for it on 2026-09-11: it is a total function
 * over its argument, with no state and no dependency. Before it, the rule was restated as guard
 * arithmetic at about ten sites, plus six casts that asserted it without testing it.
 */
export function spansTime<T extends { start?: Instant | undefined; end?: Instant | undefined }>(
  dated: T,
): dated is T & TimeSpan {
  return dated.start !== undefined && dated.end !== undefined;
}

/**
 * What a consumer writes; `Entry` is what the library stores. The two differ only in how loose the input
 * may be: ids are plain strings (the `EntryId` brand is applied on the way in) and dates are any
 * `InstantInput`. An `Entry` is itself a valid `EntryInput`, so a consumer that already holds branded
 * values passes them through unchanged.
 *
 * `Dataset` reads this into a `StoredEntry` once, at construction, in the Dataset's own zone — see
 * `DateOnlyEndRule` for how a date-only `end` is read.
 *
 * Every optional key admits an explicit `undefined`, which is what keeps the sentence above true
 * under `exactOptionalPropertyTypes`: a live `Entry`'s `start` is `Instant | undefined`, and
 * `entry.toInput()` hands one straight back to `entries.add`.
 */
export interface EntryInput<TProps = Record<string, unknown>> {
  id: string;
  /** Hierarchy; roots have none. */
  parentId?: string | undefined;
  /** No stored classification (ADR 0013). An Entry derives when it has children — gaining one
   *  promotes it, losing the last one demotes it, and nothing here says which. */
  name: string;
  /** Optional on every kind (ADR 0012, revises this comment's earlier "required for an authored
   * span"): an Entry spans if and only if `start` and `end` are both present, and holds no Segment
   * and draws no bar otherwise. One date with no other is legal and stores as written. An unreadable
   * date is still an `InvalidInstantError`. */
  start?: InstantInput | undefined;
  /** Exclusive — see plans/01 §5 and `DateOnlyEndRule`. See `start` for when this may be omitted. */
  end?: InstantInput | undefined;
  /** Interrupted work — renders as multiple bars on one row. Omit it and ingest fills one Segment
   * over `[start, end)`, so a stored `Entry` always has at least one. */
  segments?: readonly SegmentInput[] | undefined;
  /** Passenger data, and a bag a consumer already holds (ADR 0011, Q15). A declared Field key belongs
   *  at the top level instead — `entries.add({ id, name, owner: 'Ali' })` — and naming one both here
   *  and at the top throws. An unknown top-level key, or a key here that names a core key, warns and
   *  is ignored rather than thrown: this Entry may come from an API this consumer does not own. */
  props?: Partial<TProps>;
}

/** The whole envelope `EntryInput` carries, minus `id` (an edit names its Entry at the call) and
 *  `props` (declared consumer keys sit flat on `EntryEdit`, never nested — decision 11). */
type EntryEnvelope<TProps> = Omit<EntryInput<TProps>, 'id' | 'props'>;

/** Every key a *stored* `Entry` may lack, restricted to the ones `EntryEnvelope` also carries —
 *  derived from `Entry` rather than hand-listed, so the moment `Entry.end` stops being optional, or a
 *  new optional key joins `Entry`, this (and `EntryEdit` below) follow with no edit to either. */
// The idiomatic "is K optional" test: an empty object type accepts a Pick that dropped a required
// key, never one that kept it.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type OptionalKeysOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
type RemovableEntryKey = OptionalKeysOf<StoredEntry> & keyof EntryEnvelope<unknown>;

/** A patch of `props`: every key optional, and every key removable by an explicit `undefined`. There
 *  is no protected key, because `props` is `Partial<TProps>` at every storage door — a key `TProps`
 *  marks required is still a key the stored record may not hold. `Partial<TProps>` cannot be this
 *  type: under `exactOptionalPropertyTypes` a `Partial` property accepts an absent key and refuses an
 *  explicit `undefined` (`TS2375`), which deletes the remove verb. */
export type PropsEdit<TProps> = { [K in keyof TProps]?: TProps[K] | undefined };

/** What a consumer may change. Input-shaped, so dates stay loose the way `EntryInput`'s are: the store
 * reads them through `time/`'s `toInstant`/`toEndInstant` in the dataset's zone, exactly as
 * construction does. `id` is not editable — an id is identity.
 *
 * A Field key is the whole address (ADR 0011): `update(id, { start, cost })` writes one date and one
 * declared consumer value, flat — there is no `props` key here, and naming one throws
 * (`props?: never` below is what makes `{ props: { owner: 'Sam' } }` fail to compile, the same brand
 * that keeps a `ProposedEdit` from masquerading as this type).
 *
 * An edit may remove exactly what a stored Entry may lack: `name` and `segments` are required on
 * `Entry`, so `{ name: undefined }` does not compile, while `{ parentId: undefined }` and (after ADR
 * 0012) `{ start: undefined }` do. Every declared consumer key is removable without exception, because
 * `props` is `Partial<TProps>` everywhere already. */
// `Exclude<…, undefined>` on the non-removable arm is load-bearing. `EntryInput`'s optional keys
// admit an explicit `undefined` so that `entries.add({ ...entry.toInput() })` compiles (ADR 0017),
// and without this the widening would leak here and quietly make `segments` removable.
export type EntryEdit<TProps = Record<string, unknown>> = {
  [K in keyof EntryEnvelope<TProps>]?: K extends RemovableEntryKey
    ? EntryEnvelope<TProps>[K] | undefined
    : Exclude<EntryEnvelope<TProps>[K], undefined>;
} & { [K in keyof TProps]?: TProps[K] | undefined } & { readonly props?: never };

/** The **read** shape: an edit core has already read, with every date an `Instant` rather than a loose
 *  `InstantInput`, and every declared consumer key merged into a complete `props` (ADR 0011). Nobody
 *  outside core builds a `ProposedEdit`, and two callers read one differently (`plans/02`, two callers
 *  two surfaces):
 *
 *  - An **app author** never meets it at all. They write an `EntryEdit` to `entries.update()`.
 *  - A **plugin author** reads one off `EditRequest.proposed`, and writes `EntryEdit`s back (#209).
 *    `moveEntryTo` builds one of those for them (D-S5-50).
 *
 *  Core builds these on the way in — the extension hook's writes included, at one door
 *  (`DatasetState.extraEditsFor` → `toEditsReading`) — and `diffEdit` compares one against `entries`.
 *
 *  **Decision 22 (ADR 0011), closed 2026-09-10: the whole type is branded, and it is *not* assignable
 *  to `EntryEdit`.** Before this ADR the asymmetry ran the other way — every `StoredEdit` was a legal
 *  `EntryEdit`. It stopped holding at `props`: a complete record and a patch are structurally the same
 *  shape, so a plugin author reading `request.proposed` off `EditRequest` could spread its `props`
 *  into a returned edit (`{ props: { ...request.proposed.get(id)?.props, risk: 'high' } }`) and turn
 *  every stored key into a proposed one by accident. `EntryEdit`'s own `props?: never` refuses that
 *  literal outright; the brand here refuses the object itself. A plugin author who wants one key off
 *  `proposed` writes one unwrap, never a spread.
 *
 *  `proposedKeys` carries the Field keys the caller proposed. It is part of the edit, not a side
 *  channel — spread keeps it, and overlay never copies it onto an Entry. */
export type ProposedEdit<TProps = Record<string, unknown>> = {
  readonly __brand: 'ProposedEdit';
  /** Always present and complete: `toEditReading` merges the patch onto the Entry's own `props`
   *  record on the read side. */
  readonly props: Readonly<Partial<TProps>>;
  /** Never optional here: every `ProposedEdit` is built through `toEditReading`, which always seeds
   *  this set (`withProposedKeys`). */
  readonly proposedKeys: ReadonlySet<string>;
} & Partial<Omit<StoredEntry, 'id' | 'start' | 'end' | 'props'>> & {
    // Same widening as `EntryEdit`, for the same reason: `stored.start = undefined` has to be legal
    // once `toEditReading` reads an explicit clear off the wire (ADR 0012).
    start?: Instant | undefined;
    end?: Instant | undefined;
  };

/** A map of `ProposedEdit`s, keyed by the `EntryId` each one targets — what `EditRequest.proposed`
 *  carries, and what `entries.pendingEdits()` and a Draft (`layout/gesture-draft.ts`) hold. */
export type ProposedEdits = ReadonlyMap<EntryId, ProposedEdit>;

/** What a plugin author writes: one `EntryEdit` per Entry, keyed by `EntryId` — exactly the object
 *  `dataset.entries.update(id, edit)` takes, loose dates included (#209). An `EditExtender` returns
 *  one, and `mergeEntryEdits` composes two. Core reads it into `ProposedEdits` at the hook boundary,
 *  through the same `toEditReading` every other write goes through, so an extender never normalizes a date
 *  and never states its own proposed keys. */
export type EntryEdits = ReadonlyMap<EntryId, EntryEdit>;

/** What the extension hook reads (D4, D-S2-6). It carries the same three members on a preview call
 *  and on the real commit call, which is why an extender can never refuse a write — see D-S5-24's
 *  refusal note: a lock plugin vetoes in `beforeChange`, never here. */
export interface EditRequest {
  /** Current store snapshot, before this transaction's edits — what a cascade reads to compute a
   *  delta (what moved, and by how much). Unlike `entryAfterEdits` below, this never reflects this
   *  transaction's own body edits (D-S5-45). */
  entries: ReadonlyMap<EntryId, StoredEntry>;
  /** What the caller asked to change — storage-shaped and complete, the same as `entries` above
   *  (`plans/02`, "core fills zone math"): a cascade compares it against `entries` with no
   *  normalizing step of its own. */
  proposed: ProposedEdits;
  /** `id` as this transaction's own body edits leave it: committed state overlaid with `proposed`
   *  (and, at commit, this transaction's own adds). `undefined` when `id` names no entry there either.
   *  `entries.get(id)` is the wrong read for judging an in-flight edit against current shape — it
   *  still shows an Entry's Segments as they were before this transaction rewrote them, so a cascade
   *  reasoning from it can propose a write core then refuses against the shape it actually has
   *  (D-S5-45). A per-id lookup, not a second map on this object: the drag preview calls this every
   *  rAF frame and must not copy the dataset to answer it (I5). */
  entryAfterEdits(id: EntryId): StoredEntry | undefined;
}

/** Extra writes only; an empty map means no cascade. Lives in `model/` (not `data/`) so
 *  `ExtenderWrapper` — the type a plugin author writes against — can name it (D-S5-23).
 *
 *  What it returns is read by the same rules `dataset.entries.update(id, edit)` obeys (#209): a Field
 *  no Dataset declares is refused (`UnknownFieldError`), and an edit that moves `start`/`end` on an
 *  Entry with several Segments without restating `segments` is refused too (`SegmentsOutOfSyncError`,
 *  D-S5-44) — `moveEntryTo` writes that move. An id nothing in the transaction knows is skipped. */
export type EditExtender = (request: EditRequest) => EntryEdits;
