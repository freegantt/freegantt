// data/ — Field read/write, one address per key (ADR 0011). A core key reads and writes the Entry
// directly; a `compute` Field runs on read and owns no home; everything else lives in `entry.props`
// under its own key. Every other layer asks by Field key and never learns which of the three it is.

import type {
  CoreFieldValue,
  Duration,
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

/** Call: `createFieldContext(registry, 'UTC')` — bind Field read to this lookup. */
export function createFieldContext(
  fields: FieldLookup,
  timeZone: string,
  memo?: () => FieldReadMemo | undefined,
): FieldContext {
  const ctx: FieldContext = {
    timeZone,
    read<K extends FieldKey>(entry: StoredEntry, key: K): CoreFieldValue<K> | undefined {
      const field = fields.get(key);
      if (field === undefined) return undefined;
      // The registry is heterogeneous and string-keyed (ADR 0005), so nothing here narrows the
      // stored value to the key's declared type — the cast is where the Field key's type is claimed.
      return readField(entry, field, ctx, memo?.()) as CoreFieldValue<K> | undefined;
    },
    durationOf(entry: StoredEntry): Duration | undefined {
      // An Entry that does not span (`spansTime`, ADR 0012) has no duration to state. `diffMs` is
      // plain subtraction — an absent date yields `NaN`, never a throw — so this asks first.
      if (!spansTime(entry)) return undefined;
      return { value: diffMs(entry.end, entry.start), unit: 'millisecond' };
    },
  };
  return ctx;
}

/** Call: `createRollUpContext(fieldCtx, field.key)` — the one place a `RollUpContext` is built, so
 *  `values`/`numericValues` route through the same `ctx.read` every other Field access uses (issue
 *  #124, D-S4-8: one path for shipped and consumer Aggregators). */
export function createRollUpContext(ctx: FieldContext, field: FieldKey): RollUpContext {
  const rollUpCtx: RollUpContext = {
    ...ctx,
    field,
    values(children: readonly StoredEntry[]): readonly unknown[] {
      return children.map((child) => rollUpCtx.read(child, field));
    },
    numericValues(children: readonly StoredEntry[]): readonly number[] {
      const out: number[] = [];
      for (const child of children) {
        const value = rollUpCtx.read(child, field);
        if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
      }
      return out;
    },
  };
  return rollUpCtx;
}

export function readField(
  entry: StoredEntry,
  field: ResolvedField,
  ctx: FieldContext,
  memo?: FieldReadMemo,
): unknown {
  if ('compute' in field) {
    // A closure capturing the parameter `field` does not keep the `'compute' in field` narrowing
    // TypeScript applied one line up — a fresh `const` does, because it can never be reassigned.
    const computeField = field;
    const compute = (): unknown => computeField.compute(entry, ctx);
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
