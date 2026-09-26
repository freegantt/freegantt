// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

import type { EntryId } from './ids.js';
import type { Instant, InstantInput, TimeSpan } from './time.js';

/** The values one row stores at one moment (ADR 0017). `Entry` (`entry.ts`) is the other half of
 *  the pair: it answers questions about a row **now** — `read(key)`, `children()`, `duration()`,
 *  `hasChildren`. This type answers none of them, and that is deliberate. A pass may hold a row no
 *  store holds — the Rollup's own effective tree is one — so the questions belong to the pass, and
 *  every pass that hands a `StoredEntry` hands the answers beside it: an Aggregator reads
 *  `ctx.read(key)`, `ctx.children(row)`, `ctx.descendants(row)`, `ctx.leaves(row)` and
 *  `ctx.hasChildren(row)`, a `compute` Field reads `ComputeContext` the same way (#466).
 *
 *  It is not a second concept. It is one row, with no questions attached.
 *
 *  An app author meets it in `DatasetOptions.aggregators`, in a Field's `compute`, and on
 *  `ChangeSet.added[].entity` / `.removed[].entity`. */
export interface StoredEntry<TProps = Record<string, unknown>> {
  id: EntryId;
  /** Hierarchy; roots have none. An Entry has no stored classification (ADR 0013): it derives when
   *  it has children, and `Entry.hasChildren` is what answers that. */
  parentId?: EntryId;
  /** This Entry's rank among its siblings — an ordinary integer index, always present, never
   *  negative (ADR 0034). List position carries the value at construction and at `load`; after
   *  that, an explicit write moves an entry and the write's own group renumbers around it. Read it
   *  with `entry.read('siblingIndex')`, the same way `parentId` has no dedicated `Entry` member
   *  either. `HierarchySource` never reads this key — a source answers before an entry's index
   *  exists (`UnplacedEntry`, `data/hierarchy-source.ts`). */
  siblingIndex: number;
  /** What this row is called, or `undefined` when no author gave it one (#421 C5). Not a required
   *  field: a row with no name still stores, still spans, still draws — core defaults nothing off
   *  it beyond the Grid's `name` column and the default bar label reading the same Field. */
  name?: string;
  /** Omitted iff this Entry does not span (ADR 0012). Present with `end` if and only if this Entry
   * draws a bar. */
  start?: Instant;
  /** Exclusive — see plans/01 §5. Omitted iff this Entry does not span (ADR 0012); see `start`. */
  end?: Instant;
  /** Consumer-owned. A Field key is the whole address (ADR 0011): `{ key: 'cost' }` reads and writes
   *  `entry.props.cost`, and nothing declares a `source`. Always present — ingest fills `{}`, so no
   *  reader carries a "no props" branch. `Partial<TProps>` because a required key on `TProps` is
   *  still one a stored record may lack: `add({ id, name })` reaches that state on its own, with no
   *  write to refuse it. */
  props: Readonly<Partial<TProps>>;
}

/**
 * The span invariant, and the one place it is written (ADR 0012, Q5 in its appendix). An Entry
 * spans time when it holds **both** `start` and `end`. An Entry with one date,
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
  /** This Entry's rank among its siblings (ADR 0034). `add()` places a new entry at this index when
   *  given one; the constructor and `load` read list position instead and drop an authored value
   *  that disagrees with it, with one aggregated warning (`data/error-reporting.ts`,
   *  `'sibling-index-dropped'`). Omit it to append. */
  siblingIndex?: number | undefined;
  /** No stored classification (ADR 0013). An Entry derives when it has children — gaining one
   *  promotes it, losing the last one demotes it, and nothing here says which.
   *
   *  Optional (#421 C5): a booking with no title is still a row. Omit it and the Grid's `name`
   *  column, and the default bar label, both read an empty value. */
  name?: string | undefined;
  /** Optional on every kind (ADR 0012, revises this comment's earlier "required for an authored
   * span"): an Entry spans if and only if `start` and `end` are both present, and draws no bar
   * otherwise. One date with no other is legal and stores as written. An unreadable date is still an
   * `InvalidInstantError`. */
  start?: InstantInput | undefined;
  /** Exclusive — see plans/01 §5 and `DateOnlyEndRule`. See `start` for when this may be omitted. */
  end?: InstantInput | undefined;
  /** Passenger data, and a bag a consumer already holds (ADR 0011, Q15). A declared Field key belongs
   *  at the top level instead — `entries.add({ id, name, owner: 'Ali' })` — and naming one both here
   *  and at the top throws. An unknown top-level key, or a key here that names a core key, warns and
   *  is ignored rather than thrown: this Entry may come from an API this consumer does not own. */
  props?: Partial<TProps>;
}

/** The whole envelope `EntryInput` carries, minus `id` (an edit names its Entry at the call) and
 *  `props` (declared consumer keys sit flat on `EntryEdit`, never nested — decision 11). */
type EntryEnvelope<TProps> = Omit<EntryInput<TProps>, 'id' | 'props'>;

/** What `entries.add()` and the constructor's `entries` array both take (ADR 0011, Q15, #281): a
 *  declared Field key sits flat, at the top, the same shape `update()` takes —
 *  `entries.add({ id, name, owner: 'Ali' })` — and nested `props` still works for a bag already held
 *  or a passenger key ingest does not know about.
 *
 *  **This type checks every `TProps` key flat, whether or not a Field declares it — ingest does not
 *  (`propsFromInput`, `data/entry-reader.ts`).** A `TProps` key with no matching Field is an
 *  undeclared key at ingest (ADR 0011: "an undeclared key is never written by the library, ever"):
 *  `entries.add({ id, passengerKey: 1 })` type-checks and then warns and drops `passengerKey` at
 *  runtime. This is not a gap `FlatEntryInput` could close — declaring a key is what tells the
 *  library the home is safe to write to (ADR 0011, "declaring a key does not create it. Declaring
 *  says what the library may do with it"), and `TProps` alone does not declare one. Nest the value
 *  under `props` instead (`entries.add({ id, props: { passengerKey: 1 } })`), which ingest always
 *  carries, declared or not.
 *
 *  Conditional on whether `TProps` is declared. An open `TProps` (the default, or a plugin author's
 *  own erased `Record<string, unknown>`) has no declared key to check flatly, so this falls back to
 *  plain `EntryInput<TProps>` — exactly today's shape, already sound for that case. `keyof` an open
 *  record is `string`, an index signature; had the declared-key arm below run for that branch too,
 *  its own mapped `[K in keyof TProps]` would grow that same index signature and refuse the named
 *  `EntryInput<TProps>` value all over again — the identical trap `& Partial<TProps>` fell into, just
 *  moved. A concrete `TProps` (a consumer's own declared props interface) has no index signature, so
 *  the declared-key arm runs and the flat key type-checks.
 *
 *  The declared-key arm is inlined here, not a named helper type: a helper `api-extractor` cannot see
 *  through a non-exported name (`ae-forgotten-export`), and this arm is never named on its own — a
 *  consumer names `FlatEntryInput`, never a "declared" half of it. Every piece — the envelope,
 *  `props`, and the declared keys — is its own mapped type, re-derived from `EntryEnvelope`/`TProps`
 *  the way `EntryEdit` already builds itself below, never an intersection with the named `EntryInput`
 *  interface. That is the whole fix: a mapped type carries no interface identity for TypeScript to
 *  refuse, so where `EntryInput<TProps> & Partial<TProps>` (the shape Q15's wording first suggested)
 *  was uninhabitable by a named `EntryInput<TProps>[]` value, this type takes one straight in — it is
 *  a subset of what this type allows, `entry.toInput()`'s return included. */
export type FlatEntryInput<TProps = Record<string, unknown>> = string extends keyof TProps
  ? EntryInput<TProps>
  : { id: string } & {
      [K in keyof EntryEnvelope<TProps>]?: EntryEnvelope<TProps>[K];
    } & { props?: Partial<TProps> } & {
      // `Exclude<…, keyof EntryEnvelope<TProps> | 'id' | 'props'>`, not a bare `keyof TProps`: an
      // envelope key (`name`, `start`, …) never joins a real `TProps`, so excluding it changes
      // nothing today. It exists so a literal's own core fields can only ever explain themselves
      // through the envelope mapped type above, never through this one — without it, `new
      // Dataset({ entries: [{ id, name, start, end }] })` (no `<TProps>` named, ADR 0011 Q15's own
      // common case) makes TypeScript try to infer `TProps` from `id`/`name`/`start`/`end`
      // themselves, landing on a nonsense shape and refusing the call. `'props'` is excluded for the
      // same reason, and it is not redundant with the envelope: `EntryEnvelope` already dropped
      // `'props'` (this file's `Omit<…, 'id' | 'props'>` above), so a `TProps` that itself declares a
      // key named `props` would otherwise land here and intersect with the `{ props?: Partial<TProps>
      // }` arm above — `Partial<TProps>['props']` against this arm's `TProps['props']` — and refuse
      // the nested-bag form entirely.
      [K in Exclude<keyof TProps, keyof EntryEnvelope<TProps> | 'id' | 'props'>]?: TProps[K] | undefined;
    };

/** What `entries.syncChanges()` takes: only the rows a server changed, and the ids it removed. */
export interface EntryDelta<TProps = Record<string, unknown>> {
  /** Rows to add or change, keyed by `id`. An id the Dataset does not hold adds an entry, read the
   *  way `add()` reads one. An id it holds takes the row as a partial edit: a key the row leaves out
   *  keeps its value, and a key set to `undefined` clears it, the same as `update()`. */
  readonly upsert?: readonly FlatEntryInput<TProps>[];
  /** Ids to remove, each with its subtree. An id the Dataset does not hold is ignored, so a retried
   *  delta is safe to apply again. */
  readonly remove?: readonly (EntryId | string)[];
}

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
 * An edit may remove exactly what a stored Entry may lack: `{ parentId: undefined }`,
 * `{ name: undefined }` (#421 C5) and (after ADR 0012) `{ start: undefined }` all compile. Every
 * declared consumer key is removable without exception, because `props` is `Partial<TProps>`
 * everywhere already. */
// `Exclude<…, undefined>` on the non-removable arm is load-bearing. `EntryInput`'s optional keys
// admit an explicit `undefined` so that `entries.add({ ...entry.toInput() })` compiles (ADR 0017),
// and without this the widening would leak into a key that must never be removed by accident.
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
} & Partial<Omit<StoredEntry, 'id' | 'start' | 'end' | 'parentId' | 'name' | 'props'>> & {
    // Same widening as `EntryEdit`, for the same reason: `stored.start = undefined` has to be legal
    // once `toEditReading` reads an explicit clear off the wire (ADR 0012) — and `stored.parentId`/
    // `stored.name` need the same room to root an entry or clear its name (#542).
    start?: Instant | undefined;
    end?: Instant | undefined;
    parentId?: EntryId | undefined;
    name?: string | undefined;
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

// `EditRequest`/`EditExtender` moved to `edit-request.ts` (#466): `EditRequest.writeTarget` names
// both `FieldKey` and `WriteTarget`, and `write-verdict.ts` already reaches `field-key.ts` through
// `error-report.ts` → `field.ts`, so nothing upstream of that chain — this file included — can import
// `WriteTarget` without cycling back. `edit-request.ts` sits below all three and depends on nothing
// that depends on it.
