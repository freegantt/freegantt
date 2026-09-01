// data/ — Field read/write over the SOURCE_STRATEGY table (A4). Every other layer asks by Field
// key and never learns where the value sits.

import type {
  Duration,
  Entry,
  EntryEdit,
  EntryEdits,
  EntryId,
  FieldContext,
  FieldKey,
  FieldLookup,
  RollUpContext,
  StoredEdit,
} from '../../model/index.js';
import { diffMs } from '../../time/index.js';
import { CORE_FIELDS } from './core-fields.js';
import { strategyFor, withProposedKeys, proposedKeysOf } from './source-strategy.js';
import type { FieldReadMemo } from './source-strategy.js';
import type { FieldRegistry, ResolvedField } from './field-registry.js';

export type { FieldLookup, FieldReadMemo };
export { withProposedKeys, proposedKeysOf };

function isOptionalEntryKey(key: string): boolean {
  return key === 'parentId' || key === 'segments' || key === 'meta';
}

export function mergeStoredEdits(base: StoredEdit | undefined, extra: StoredEdit): StoredEdit {
  const merged: StoredEdit = { ...base, ...extra };
  const keys = new Set([...proposedKeysOf(base), ...proposedKeysOf(extra)]);
  return withProposedKeys(merged, keys);
}

/** Merges two edit maps. Object spread is not a legal merge — proposed keys would drop. */
export function mergeEntryEdits(base: EntryEdits, extra: EntryEdits): EntryEdits {
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
    read<T>(entry: Entry, key: FieldKey): T | undefined {
      const field = fields.get(key);
      if (field === undefined || field.source === undefined) return undefined;
      return readField(entry, field as ResolvedField, ctx, memo?.()) as T | undefined;
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
        const value = rollUpCtx.read<unknown>(child, field);
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
  const next: Record<string, unknown> = { ...entry };
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
    if (value !== undefined) next[key] = value;
  }
  return next as unknown as Entry;
}
