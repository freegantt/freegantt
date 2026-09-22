// data/ — Field read/write, one address per key (ADR 0011). A core key reads and writes the Entry
// directly; a `compute` Field runs on read and owns no home; everything else lives in `entry.props`
// under its own key. Every other layer asks by Field key and never learns which of the three it is.

import type {
  ComputeContext,
  CoreFieldValue,
  Duration,
  DurationMeasure,
  StoredEntry,
  EntryEdit,
  EntryId,
  FieldContext,
  FieldKey,
  FieldLookup,
  ProposedEdit,
  ProposedEdits,
  RollUpContext,
} from '../../model/index.js';
import { spansTime } from '../../model/index.js';
import { diffMs } from '../../time/index.js';
import { CORE_FIELDS, isCoreFieldKey } from './core-fields.js';
import type { FieldRegistry, ResolvedField } from './field-registry.js';
import type { ComputedFieldCache } from '../computed-cache.js';

export interface FieldReadMemo {
  readonly cache: ComputedFieldCache;
  readonly datasetRevision: number;
}

export type { FieldLookup };

/** A fresh `ProposedEdit` with no envelope key touched and an empty `props` — the one way to start
 *  one from scratch. `props`/`proposedKeys`/the brand are required on the type (ADR 0011), so `{}`
 *  no longer satisfies it; every other `ProposedEdit` in the pipeline is built by spreading one of
 *  these, which is how the required fields carry through untouched. */
export function emptyProposedEdit(): ProposedEdit {
  return { __brand: 'ProposedEdit', props: {}, proposedKeys: new Set() };
}

/** Call: `withProposedKeys(edit, Object.keys(patch))`. */
export function withProposedKeys(edit: ProposedEdit, keys: Iterable<string>): ProposedEdit {
  return { ...edit, proposedKeys: new Set(keys) };
}

/** The keys the edit states it writes. `proposedKeys` is required (ADR 0011), so this is a plain
 *  accessor kept as a function because every caller already asks by this name. */
export function proposedKeysOf(edit: ProposedEdit | undefined): ReadonlySet<string> {
  return edit?.proposedKeys ?? new Set();
}

function keysWrittenBy(edit: ProposedEdit | undefined): readonly string[] {
  return [...proposedKeysOf(edit)];
}

/**
 * Applies a `props` patch's proposed keys onto a copy of `base`, one key at a time — never the whole
 * object (ADR 0011, the two-shallow-spread trap). A key named in `proposedKeys` and present in
 * `patch` is set; a key named but absent from `patch` was removed by an explicit `undefined`. A key
 * `proposedKeys` never names — a passenger `props` key nobody wrote this time — is untouched, so
 * `next === base` by reference whenever nothing in `props` changed ("`props` is carried by
 * reference", ADR 0011).
 *
 * Shared by `entryAfterEdit` (applying an edit onto a stored Entry) and `completeProps` (finishing
 * the `props` every `ProposedEdit` carries) — one function, so a fix to the merge lands once.
 */
function propsAfterEdit(
  base: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
  proposedKeys: ReadonlySet<string>,
): Readonly<Record<string, unknown>> {
  const propsKeys = [...proposedKeys].filter((key) => !isCoreFieldKey(key));
  if (propsKeys.length === 0) return base;
  const next: Record<string, unknown> = { ...base };
  for (const key of propsKeys) {
    if (key in patch) next[key] = patch[key];
    else delete next[key];
  }
  return next;
}

/**
 * Merges two storage-shaped edits. Object spread alone is not a legal merge: `proposedKeys` is how a
 * `props`-addressed Field write is recognized, and the later edit's set replaces the earlier one's.
 * `props` merges per key too (ADR 0011) — a body write to `props.cost` beside a cascade write to
 * `props.progress` must keep both; a whole-object spread would let the second replace the first's
 * entire bag and lose `cost` while `proposedKeys` still named it.
 */
export function mergeProposedEdits(base: ProposedEdit | undefined, extra: ProposedEdit): ProposedEdit {
  const baseProps = base?.props ?? {};
  const merged: ProposedEdit = {
    ...emptyProposedEdit(),
    ...base,
    ...extra,
    props: propsAfterEdit(baseProps, extra.props, proposedKeysOf(extra)),
  };
  return withProposedKeys(merged, new Set([...keysWrittenBy(base), ...keysWrittenBy(extra)]));
}

/**
 * Merges two maps of storage-shaped edits, keyed by Entry — what the commit path folds the body, the
 * hook's writes and the hierarchy's own writes together with.
 *
 * Object spread and `new Map([...a, ...b])` are not legal merges: two edits on one Entry lose the
 * earlier `ProposedEdit` outright, and lose its `proposedKeys` with it (#197). `extra` wins per Field
 * key; the proposed keys of both survive. `mergeEntryEdits` (`data/edit-extension.ts`) is this
 * function's loose counterpart, the one a plugin author calls.
 */
export function mergeProposedEditsByEntry(base: ProposedEdits, extra: ProposedEdits): ProposedEdits {
  if (extra.size === 0) return base;
  const merged = new Map<EntryId, ProposedEdit>(base);
  for (const [id, edit] of extra) merged.set(id, mergeProposedEdits(merged.get(id), edit));
  return merged;
}

function storesInProps(field: ResolvedField): boolean {
  return !isCoreFieldKey(field.key) && !('compute' in field);
}

/**
 * The ambient half of every Field read, plus the two things `model/`'s public `FieldContext` must
 * not carry: the registry to look a key up in, and the tree to walk. It is `data/`'s own type — a
 * consumer never receives one.
 *
 * `storedChildrenOf` is what makes one `readField` serve two callers. The store answers with the
 * children it holds now; a Rollup pass answers with its own **effective** children, which carry the
 * values that same bottom-up pass has already produced and the store has not (ADR 0017).
 */
export interface FieldAccess {
  readonly fields: FieldLookup;
  readonly timeZone: string;
  readonly measureDuration: DurationMeasure;
  storedChildrenOf(id: EntryId): readonly StoredEntry[];
  /** Which Entry the checked hierarchy names as `entry`'s parent (ADR 0020) — the same answer
   *  `entry.parent()?.id` gives on a live row, never `entry.parentId`'s stored value (ADR 0024). */
  parentIdOf(entry: StoredEntry): EntryId | undefined;
  /** Does `id` have a child, on this same tree — `EntrySource.hasChildren` (`live-entry.ts`) asks
   *  the same question by the same name, on the live row. */
  hasChildren(id: EntryId): boolean;
  memo?(): FieldReadMemo | undefined;
}

const NO_CHILDREN: readonly StoredEntry[] = Object.freeze([]);
const NO_PARENT = (): undefined => undefined;

export interface FieldAccessOptions {
  fields: FieldLookup;
  timeZone: string;
  measureDuration?: DurationMeasure;
  storedChildrenOf?: (id: EntryId) => readonly StoredEntry[];
  parentIdOf?: (entry: StoredEntry) => EntryId | undefined;
  hasChildren?: (id: EntryId) => boolean;
  memo?: () => FieldReadMemo | undefined;
}

/** Call: `createFieldAccess({ fields: registry, timeZone: 'UTC' })`. */
export function createFieldAccess(options: FieldAccessOptions): FieldAccess {
  // A caller that names no tree must not get a `hasChildren` that reads a different one — so the
  // default reads the **resolved** `storedChildrenOf`, never `options.storedChildrenOf`.
  const storedChildrenOf = options.storedChildrenOf ?? ((): readonly StoredEntry[] => NO_CHILDREN);
  return {
    fields: options.fields,
    timeZone: options.timeZone,
    measureDuration: options.measureDuration ?? 'span',
    storedChildrenOf,
    parentIdOf: options.parentIdOf ?? NO_PARENT,
    hasChildren: options.hasChildren ?? ((id): boolean => storedChildrenOf(id).length > 0),
    ...(options.memo !== undefined ? { memo: options.memo } : {}),
  };
}

/**
 * The same access, with the memo stood down — for a pass that reads rows no revision holds.
 *
 * `ComputedFieldCache` is keyed by entry, Field key and **dataset revision** (D-S4-10), and a
 * revision describes the committed rows only. A post-edit row and the Rollup's effective child are
 * both hypothetical (`model/field.ts`), so neither belongs in that cache: reading it answers with
 * the committed value for a staged row, and writing it hands the committed revision a value no
 * commit produced. `DatasetState`'s own memo callback stands down while a transaction is open for
 * the same reason; this covers the commit path, which runs after the body closes and before the
 * revision moves (#300).
 */
export function readingHypotheticalRows(access: FieldAccess): FieldAccess {
  // `undefined` from the callback is already how `DatasetState` stands the memo down, and
  // `readField` already reads it as "compute it" — so this needs no second shape.
  return { ...access, memo: () => undefined };
}

/** The same access, reading the tree a pass holds instead of the one the store holds.
 *
 *  `hasChildren` defaults off the **new** `childrenOf`, never the access it is rebinding away from.
 *  A plain sibling default would keep the store's own `hasChildren` after this call replaces the
 *  tree, so `ctx.children(row)` and `ctx.hasChildren(row)` would answer off two different trees —
 *  exactly on the commits the Rollup exists for (#466). A caller that already holds a cheaper answer
 *  passes the third argument and skips building the list — the store does, from its own cached child
 *  index (`data/entry-store.ts`). The Rollup passes two arguments and keeps this default, so its
 *  answer stays on the effective tree it just rebound. */
export function readingChildrenFrom(
  access: FieldAccess,
  childrenOf: (id: EntryId) => readonly StoredEntry[],
  hasChildren: (id: EntryId) => boolean = (id): boolean => childrenOf(id).length > 0,
): FieldAccess {
  return { ...access, storedChildrenOf: childrenOf, hasChildren };
}

/** The same access, answering `hierarchyParentId` from the tree a pass holds instead of the store's
 *  own committed index — the Rollup's effective parent (`data/rollup.ts`), never the live store. */
export function readingParentFrom(
  access: FieldAccess,
  parentIdOf: (entry: StoredEntry) => EntryId | undefined,
): FieldAccess {
  return { ...access, parentIdOf };
}

/** What a consumer receives: the zone, and nothing that belongs to one row (ADR 0017, J5). */
export function ambientFieldContext(access: FieldAccess): FieldContext {
  return { timeZone: access.timeZone };
}

/**
 * The one duration computation, and three doors reach it: the core `duration` Field's own `compute`,
 * `entry.duration()` on a live row, and `ctx.duration()` inside a pass (ADR 0017). Each door hands
 * it a different row; none of them hands it a Field key, so the circle cannot close.
 *
 * The unit is always `'millisecond'`, which is what makes `formatDuration` and `compareDuration`
 * correct by construction rather than by luck (#274).
 */
export function measureEntryDuration(
  entry: Pick<StoredEntry, 'id' | 'start' | 'end'>,
  access: Pick<FieldAccess, 'measureDuration' | 'storedChildrenOf'>,
): Duration | undefined {
  // An Entry that does not span (`spansTime`, ADR 0012) has no duration to state. `diffMs` is plain
  // subtraction — an absent date yields `NaN`, never a throw — so this asks first.
  if (!spansTime(entry)) return undefined;
  if (access.measureDuration === 'span') {
    return { value: diffMs(entry.end, entry.start), unit: 'millisecond' };
  }
  // `'children'` (ADR 0026 retired the Segment `measureDuration: 'segments'` named): sum each direct
  // child's own span. A gap between children goes uncounted, and a childless entry falls back to its
  // own span — the same number `'span'` above would give it. Nesting through grandchildren, and any
  // richer notion of "claimed" time, is #428's fix, not this one's.
  const children = access.storedChildrenOf(entry.id);
  if (children.length === 0) return { value: diffMs(entry.end, entry.start), unit: 'millisecond' };
  let total = 0;
  for (const child of children) {
    if (child.start === undefined || child.end === undefined) continue;
    total += diffMs(child.end, child.start);
  }
  return { value: total, unit: 'millisecond' };
}

/**
 * Every row under `root`, reached through `childrenOf` — a worklist, never recursion
 * (`live-entry.ts:117-135` is the shape copied): how deep a tree goes is the consumer's to author,
 * and a stack overflow answers no question. `seen` visits each row once, so a source that loops
 * terminates instead of walking forever. A child is recorded the moment its parent's children are
 * read, so siblings stay together — but `pending` is a stack, so one node's whole subtree comes out
 * before its next sibling, and that is not level order. Nothing may depend on the order
 * (*the three words*, #466); `Entry.descendants()` walks this same shape.
 */
function descendantsOf(
  root: StoredEntry,
  childrenOf: (row: StoredEntry) => readonly StoredEntry[],
): readonly StoredEntry[] {
  const found: StoredEntry[] = [];
  const seen = new Set<EntryId>([root.id]);
  const pending: StoredEntry[] = [root];
  while (pending.length > 0) {
    for (const child of childrenOf(pending.pop()!)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      found.push(child);
      pending.push(child);
    }
  }
  return found;
}

/**
 * The same walk as `descendantsOf`, keeping a node whose own fetched children list is empty — that
 * emptiness **is** the leaf test, so this never asks `hasChildren` and never filters
 * `descendantsOf`'s result (#466). One tree read per node visited, same as `descendantsOf`.
 *
 * `root` is kept when `root` itself is childless: `leaves(row)` names the bottom rows *of a
 * subtree*, and a subtree of one leaf has one leaf. This is why `leaves(row)` can include `row`
 * while `descendantsOf` never does — a row is not its own descendant, but it can be its own
 * subtree's only leaf.
 *
 * Exported for `data/live-entry.ts`'s `Entry.leaves()`, so the live row and both pass contexts
 * (`ComputeContext`, `RollUpContext`) share this one walk instead of each rebuilding it.
 */
export function leavesOf(
  root: StoredEntry,
  childrenOf: (row: StoredEntry) => readonly StoredEntry[],
): readonly StoredEntry[] {
  const found: StoredEntry[] = [];
  const seen = new Set<EntryId>([root.id]);
  const pending: StoredEntry[] = [root];
  while (pending.length > 0) {
    const row = pending.pop()!;
    const rowChildren = childrenOf(row);
    if (rowChildren.length === 0) found.push(row);
    for (const child of rowChildren) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      pending.push(child);
    }
  }
  return found;
}

/** What a `compute` Field runs inside. A value question — `read`, `duration`, `hierarchyParentId` —
 *  stays bound to `entry`. A structure question — `children`, `descendants`, `leaves`,
 *  `hasChildren` — answers about any row the pass hands out (ADR 0017, amended #466). */
export function createComputeContext(access: FieldAccess, entry: StoredEntry): ComputeContext {
  const children = (row: StoredEntry): readonly StoredEntry[] => access.storedChildrenOf(row.id);
  return {
    timeZone: access.timeZone,
    // `key` on this row, through the Field registry (ADR 0024): `read('parentId')` answers the
    // stored field, the same as every other declared key. `hierarchyParentId()` below is the
    // tree's own door, and it is a different question from `read('hierarchyParentId')` on the same
    // access only in that this one skips the registry round-trip.
    read<K extends FieldKey>(key: K): CoreFieldValue<K> | undefined {
      return readFieldByKey(entry, key, access) as CoreFieldValue<K> | undefined;
    },
    duration(): Duration | undefined {
      return measureEntryDuration(entry, access);
    },
    children,
    descendants: (row: StoredEntry): readonly StoredEntry[] => descendantsOf(row, children),
    leaves: (row: StoredEntry): readonly StoredEntry[] => leavesOf(row, children),
    hasChildren: (row: StoredEntry): boolean => access.hasChildren(row.id),
    hierarchyParentId(): EntryId | undefined {
      return access.parentIdOf(entry);
    },
  };
}

/** Call: `createRollUpContext(access, parent, children, field.key)` — the one place a
 *  `RollUpContext` is built, so `values`/`numericValues` route through the same read every other
 *  Field access uses (issue #124, D-S4-8: one path for shipped and consumer Aggregators). */
export function createRollUpContext(
  access: FieldAccess,
  parent: StoredEntry,
  rollUpChildren: readonly StoredEntry[],
  field: FieldKey,
): RollUpContext {
  // `access` reads each row through its own children, and both callers already hand one that does —
  // the Rollup's pass access, and the store's. A second binding that answered `children` for every
  // id would tell a child's own `compute` Field about the parent (F22).
  //
  // The pass's own `children` answers `parent`'s id from this pre-built, pre-fetched list, and every
  // other row from `access.storedChildrenOf` — both read `effectiveEntry`, so the two cannot
  // disagree (#466). `descendants` and `leaves` walk through this same member, never
  // `access.storedChildrenOf` directly, and `hasChildren` reads this same member's length, so all
  // four members read one list at depth 1 and one tree below it — reach past this override and depth
  // 1 answers from a second list instead. `hasChildren` is overridden here and not inherited on
  // purpose: `createComputeContext` sends it to `access.hasChildren`, which is the store's cached
  // index, and that would rest agreement on two implementations rather than on one list (#466).
  const children = (row: StoredEntry): readonly StoredEntry[] =>
    row.id === parent.id ? rollUpChildren : access.storedChildrenOf(row.id);
  return {
    ...createComputeContext(access, parent),
    children,
    descendants: (row: StoredEntry): readonly StoredEntry[] => descendantsOf(row, children),
    leaves: (row: StoredEntry): readonly StoredEntry[] => leavesOf(row, children),
    hasChildren: (row: StoredEntry): boolean => children(row).length > 0,
    field,
    values(key: FieldKey = field): readonly unknown[] {
      return rollUpChildren.map((child) => readFieldByKey(child, key, access));
    },
    numericValues(key: FieldKey = field): readonly number[] {
      const out: number[] = [];
      for (const child of rollUpChildren) {
        const value = readFieldByKey(child, key, access);
        if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
      }
      return out;
    },
    durations(): readonly (Duration | undefined)[] {
      return rollUpChildren.map((child) => measureEntryDuration(child, access));
    },
  };
}

/** `key` on `entry`, through the registry. An undeclared key answers `undefined` — the by-key door
 *  that refuses one is `entry.read`, which a consumer holds. */
export function readFieldByKey(entry: StoredEntry, key: FieldKey, access: FieldAccess): unknown {
  const field = access.fields.get(key);
  if (field === undefined) return undefined;
  return readField(entry, field, access);
}

export function readField(entry: StoredEntry, field: ResolvedField, access: FieldAccess): unknown {
  if ('compute' in field) {
    // A closure capturing the parameter `field` does not keep the `'compute' in field` narrowing
    // TypeScript applied one line up — a fresh `const` does, because it can never be reassigned.
    const computeField = field;
    const compute = (): unknown => computeField.compute(entry, createComputeContext(access, entry));
    const memo = access.memo?.();
    if (!memo) return compute();
    return memo.cache.read(entry.id, field.key, memo.datasetRevision, compute);
  }
  const key = String(field.key);
  if (isCoreFieldKey(field.key)) return (entry as unknown as Record<string, unknown>)[key];
  return entry.props[key];
}

/** Folds one field write into an entry-shaped `ProposedEdit`. A core key writes onto the edit's own
 *  envelope; everything else writes into the edit's `props` patch, per key, never replacing it
 *  whole. A `compute` Field has no home — this returns `edit` unchanged, the same silent no-op the
 *  registry's own guard leaves for ADR 0015 to refuse loudly at the write door. */
export function writeField(edit: ProposedEdit, field: ResolvedField, value: unknown): ProposedEdit {
  const key = String(field.key);
  if ('compute' in field) return edit;
  if (isCoreFieldKey(field.key)) {
    const next: ProposedEdit = { ...edit };
    (next as Record<string, unknown>)[key] = value;
    return withProposedKeys(next, new Set([...proposedKeysOf(edit), key]));
  }
  const nextProps: Record<string, unknown> = { ...edit.props };
  if (value === undefined) delete nextProps[key];
  else nextProps[key] = value;
  const next: ProposedEdit = { ...edit, props: nextProps };
  return withProposedKeys(next, new Set([...proposedKeysOf(edit), key]));
}

/** Writes `value` onto a copy of `entry`. Call: `writeOntoEntry(parent, costField, 300)`. */
export function writeOntoEntry(entry: StoredEntry, field: ResolvedField, value: unknown): StoredEntry {
  return entryAfterEdit(entry, writeField(emptyProposedEdit(), field, value));
}

/** Folds declared props-addressed keys from a public `EntryEdit` into a storage-shaped edit. Core
 *  keys are read straight off `edit` by `toEditReading`; this is the one door for everything else a
 *  Field declares. */
export function writeDeclaredPropsFields(
  stored: ProposedEdit,
  edit: EntryEdit,
  registry: FieldRegistry,
): ProposedEdit {
  let next = stored;
  for (const key of Object.keys(edit)) {
    const field = registry.get(key);
    if (!field || !storesInProps(field)) continue;
    next = writeField(next, field, (edit as Record<string, unknown>)[key]);
  }
  return next;
}

/** Completes the `props` a `ProposedEdit` always carries (ADR 0011): merges whatever `writeField`
 *  accumulated in `edit.props` onto a copy of `entry.props`, the same per-key rule `entryAfterEdit`
 *  applies. Call once, at the end of `toEditReading` — every earlier step may leave `props` a sparse
 *  patch of only the keys it touched so far. */
export function completeProps(entry: StoredEntry, edit: ProposedEdit): ProposedEdit {
  const props = propsAfterEdit(entry.props, edit.props, edit.proposedKeys);
  return props === edit.props ? edit : { ...edit, props };
}

export function editProposesField(edit: ProposedEdit | undefined, field: ResolvedField): boolean {
  if (!edit) return false;
  if ('compute' in field) return false;
  return proposedKeysOf(edit).has(String(field.key));
}

/** Applies a stored overlay the way `EntryStore.get` must: core keys and `props`, never proposedKeys. */
export function entryAfterEdit(entry: StoredEntry, edit: ProposedEdit): StoredEntry {
  const next: StoredEntry = { ...entry };
  const bag = edit as Record<string, unknown>;
  for (const field of CORE_FIELDS) {
    const key = String(field.key);
    if (!(key in edit)) continue;
    const value = bag[key];
    if (value === undefined) {
      delete (next as unknown as Record<string, unknown>)[key];
      continue;
    }
    // `key` is `CoreFieldKey`, but `value` is untyped `unknown` here — this cast is load-bearing,
    // the same way entry-store.ts's `applyFieldRow` cast is: nothing narrows `value` to the field's
    // real value union at this point.
    (next as unknown as Record<string, unknown>)[key] = value;
  }
  next.props = propsAfterEdit(entry.props, edit.props, edit.proposedKeys);
  return next;
}
