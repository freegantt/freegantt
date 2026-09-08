// data/ — Field read/write over the SOURCE_STRATEGY table (A4). Every other layer asks by Field
// key and never learns where the value sits.

import type {
  CoreFieldValue,
  Duration,
  Entry,
  EntryEdit,
  EntryId,
  FieldContext,
  FieldKey,
  FieldLookup,
  RollUpContext,
  StoredEdit,
  StoredEdits,
} from '../../model/index.js';
import { diffMs } from '../../time/index.js';
import { CORE_FIELDS } from './core-fields.js';
import { strategyFor, withProposedKeys, proposedKeysOf, statesProposedKeys } from './source-strategy.js';
import type { FieldReadMemo } from './source-strategy.js';
import type { FieldRegistry, ResolvedField } from './field-registry.js';

export type { FieldLookup, FieldReadMemo };
export { withProposedKeys, proposedKeysOf, statesProposedKeys };

function isOptionalEntryKey(key: string): key is 'parentId' | 'segments' | 'meta' {
  return key === 'parentId' || key === 'segments' || key === 'meta';
}

/** Which Field keys an edit claims to write. An edit that carries `proposedKeys` states them; a raw
 *  storage patch states them by the keys it holds, which is how `diffEdit` already reads one. */
function keysWrittenBy(edit: StoredEdit | undefined): readonly string[] {
  if (edit === undefined) return [];
  if (statesProposedKeys(edit)) return [...proposedKeysOf(edit)];
  return Object.keys(edit);
}

/**
 * Merges two storage-shaped edits. Object spread alone is not a legal merge: `proposedKeys` is how a
 * `meta`-sourced Field write is recognized, and the later edit's set replaces the earlier one's.
 *
 * The two edits may state their writes differently — one through `proposedKeys`, one through the keys
 * it holds. When either states `proposedKeys`, the merged edit does too, and the raw side contributes
 * the keys it holds, so `diffEdit` still emits a row for every write. When neither does, the merged
 * edit stays on the raw path, where an undeclared key survives — it is returned *unstamped*, because
 * absent and empty are two different statements (#238). A stamped empty set says "this edit writes no
 * Field", so a third merge read the first two plugins' writes as nothing and dropped them.
 */
export function mergeStoredEdits(base: StoredEdit | undefined, extra: StoredEdit): StoredEdit {
  const merged: StoredEdit = { ...base, ...extra };
  if (!statesProposedKeys(base) && !statesProposedKeys(extra)) {
    return merged;
  }
  return withProposedKeys(merged, new Set([...keysWrittenBy(base), ...keysWrittenBy(extra)]));
}

/**
 * Merges two maps of storage-shaped edits, keyed by Entry — what the commit path folds the body, the
 * hook's writes and the hierarchy's own writes together with.
 *
 * Object spread and `new Map([...a, ...b])` are not legal merges: two edits on one Entry lose the
 * earlier `StoredEdit` outright, and lose its `proposedKeys` with it (#197). `extra` wins per Field
 * key; the proposed keys of both survive. `mergeEntryEdits` (`data/edit-extension.ts`) is this
 * function's loose counterpart, the one a plugin author calls.
 */
export function mergeStoredEditsByEntry(base: StoredEdits, extra: StoredEdits): StoredEdits {
  if (extra.size === 0) return base;
  const merged = new Map<EntryId, StoredEdit>(base);
  for (const [id, edit] of extra) merged.set(id, mergeStoredEdits(merged.get(id), edit));
  return merged;
}

function storesInMeta(field: ResolvedField): boolean {
  return field.source.from === 'meta';
}

/** Call: `createFieldContext(registry, 'UTC')` — bind Field read to this lookup. */
export function createFieldContext(
  fields: FieldLookup,
  timeZone: string,
  memo?: () => FieldReadMemo | undefined,
): FieldContext {
  const ctx: FieldContext = {
    timeZone,
    read<K extends FieldKey>(entry: Entry, key: K): CoreFieldValue<K> | undefined {
      const field = fields.get(key);
      if (field === undefined || field.source === undefined) return undefined;
      // The registry is heterogeneous and string-keyed (ADR 0005), so nothing here narrows the
      // stored value to the key's declared type — the cast is where the Field key's type is claimed.
      return readField(entry, field as ResolvedField, ctx, memo?.()) as CoreFieldValue<K> | undefined;
    },
    durationOf(entry: Entry): Duration {
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
    values(children: readonly Entry[]): readonly unknown[] {
      return children.map((child) => rollUpCtx.read(child, field));
    },
    numericValues(children: readonly Entry[]): readonly number[] {
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
  entry: Entry,
  field: ResolvedField,
  ctx: FieldContext,
  memo?: FieldReadMemo,
): unknown {
  return strategyFor(field.source).read(entry, field, ctx, memo);
}

/** Folds one field write into an entry-shaped `StoredEdit`, merging `meta` rather than replacing it. */
export function writeField(edit: StoredEdit, entry: Entry, field: ResolvedField, value: unknown): StoredEdit {
  return strategyFor(field.source).write(edit, entry, field, value);
}

/** Writes `value` onto a copy of `entry`. Call: `writeOntoEntry(parent, costField, 300)`. */
export function writeOntoEntry(entry: Entry, field: ResolvedField, value: unknown): Entry {
  return overlayStoredEdit(entry, writeField({}, entry, field, value));
}

/** Folds declared meta-sourced keys from a public `EntryEdit` into a storage-shaped edit. */
export function writeDeclaredMetaFields(
  stored: StoredEdit,
  entry: Entry,
  edit: EntryEdit,
  registry: FieldRegistry,
): StoredEdit {
  let next = stored;
  const overlay = overlayStoredEdit(entry, stored);
  for (const key of Object.keys(edit)) {
    const field = registry.get(key);
    if (!field || !storesInMeta(field)) continue;
    next = writeField(next, overlay, field, edit[key]);
  }
  return next;
}

export function editProposesField(edit: StoredEdit | undefined, field: ResolvedField): boolean {
  if (!edit) return false;
  return strategyFor(field.source).proposes(edit, field);
}

/** Applies a stored overlay the way `EntryStore.get` must: core keys only, never proposedKeys. */
export function overlayStoredEdit(entry: Entry, edit: StoredEdit): Entry {
  const next: Entry = { ...entry };
  const bag = edit as Record<string, unknown>;
  for (const field of CORE_FIELDS) {
    const source = field.source;
    if (source === undefined || source.from !== 'entry') continue;
    const key = source.field;
    if (!(key in edit)) continue;
    const value = bag[key];
    if (value === undefined && isOptionalEntryKey(key)) {
      delete next[key];
      continue;
    }
    // `key` is `CoreFieldKey`, but `value` is untyped `unknown` here — this cast is load-bearing,
    // the same way entry-store.ts's `applyFieldRow` cast is: nothing narrows `value` to the field's
    // real value union at this point.
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
  }
  return next;
}
