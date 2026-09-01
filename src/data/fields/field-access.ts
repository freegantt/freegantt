// data/ — the one `switch` over `FieldSource` in `src/` (D-S4-2). Every other layer asks by Field
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
  StoredEdit,
} from '../../model/index.js';
import { diffMs } from '../../time/index.js';
import type { ComputedFieldCache } from '../computed-cache.js';
import { CORE_FIELDS } from './core-fields.js';
import { storedSourceOf } from './normalize-source.js';
import type { FieldRegistry, ResolvedField } from './field-registry.js';

export type { FieldLookup };

function isOptionalEntryKey(key: string): boolean {
  return key === 'parentId' || key === 'segments' || key === 'meta';
}

/** Memo for compute-sourced Fields (D-S4-10). Stored Fields ignore it. */
export interface FieldReadMemo {
  readonly cache: ComputedFieldCache;
  readonly datasetRevision: number;
}

/** Call: `withProposedKeys(stored, Object.keys(edit))`. */
export function withProposedKeys(edit: StoredEdit, keys: Iterable<string>): StoredEdit {
  return { ...edit, proposedKeys: new Set(keys) };
}

export function proposedKeysOf(edit: StoredEdit | undefined): ReadonlySet<string> {
  if (!edit) return new Set();
  return edit.proposedKeys ?? new Set();
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

function metaRecord(meta: unknown): Record<string, unknown> {
  if (meta !== undefined && meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) };
  }
  return {};
}

function metaKeyOf(field: ResolvedField): string {
  const source = storedSourceOf(field);
  if (source.from !== 'meta') return String(field.key);
  return source.key ?? String(field.key);
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

export function readField(
  entry: Entry,
  field: ResolvedField,
  ctx: FieldContext,
  memo?: FieldReadMemo,
): unknown {
  const source = field.source;
  if (source.from === 'entry') return (entry as unknown as Record<string, unknown>)[source.field];
  if (source.from === 'meta') {
    const record = metaRecord(entry.meta);
    return record[metaKeyOf(field)];
  }
  const compute = (): unknown => source.read(entry, ctx);
  if (!memo) return compute();
  return memo.cache.read(entry.id, field.key, memo.datasetRevision, compute);
}

/** Folds one field write into an entry-shaped `StoredEdit`, merging `meta` rather than replacing it. */
export function writeField(edit: StoredEdit, entry: Entry, field: ResolvedField, value: unknown): StoredEdit {
  const source = field.source;
  if (source.from === 'compute') return edit;
  if (source.from === 'entry') {
    const next: StoredEdit = { ...edit };
    (next as Record<string, unknown>)[source.field] = value;
    return withProposedKeys(next, proposedKeysOf(edit));
  }

  const key = metaKeyOf(field);
  const baseMeta = 'meta' in edit ? edit.meta : entry.meta;
  const record = metaRecord(baseMeta);
  if (value === undefined) delete record[key];
  else record[key] = value;
  const next: StoredEdit = { ...edit };
  if (Object.keys(record).length === 0) (next as Record<string, unknown>)['meta'] = undefined;
  else next.meta = record;
  return withProposedKeys(next, proposedKeysOf(edit));
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
  const source = field.source;
  if (source.from === 'entry') {
    return (edit as Record<string, unknown>)[source.field] !== undefined;
  }
  if (source.from === 'meta') {
    return proposedKeysOf(edit).has(String(field.key));
  }
  return false;
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
