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
  StoredEdit,
} from '../../model/index.js';
import { diffMs } from '../../time/index.js';
import type { ComputedFieldCache } from '../computed-cache.js';
import type { FieldRegistry, ResolvedField } from './field-registry.js';

const authoredFieldKeys = Symbol('authoredFieldKeys');

type StoredEditWithAuthoredKeys = StoredEdit & {
  [authoredFieldKeys]?: ReadonlySet<string>;
};

/** Memo for compute-sourced Fields (D-S4-10). Stored Fields ignore it. */
export interface FieldReadMemo {
  readonly cache: ComputedFieldCache;
  readonly datasetRevision: number;
}

export function markAuthoredFieldKeys(edit: StoredEdit, keys: Iterable<string>): StoredEdit {
  Object.defineProperty(edit, authoredFieldKeys, {
    value: new Set(keys),
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return edit;
}

export function authoredFieldKeysOf(edit: StoredEdit | undefined): ReadonlySet<string> {
  if (!edit) return new Set();
  return (edit as StoredEditWithAuthoredKeys)[authoredFieldKeys] ?? new Set();
}

export function mergeStoredEdits(base: StoredEdit | undefined, extra: StoredEdit): StoredEdit {
  const merged: StoredEdit = { ...base, ...extra };
  const keys = new Set([...authoredFieldKeysOf(base), ...authoredFieldKeysOf(extra)]);
  return markAuthoredFieldKeys(merged, keys);
}

/** Merges two edit maps. Object spread is not a legal merge — authored keys would drop. */
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
  const source = field.source;
  if (source.from !== 'meta') return String(field.key);
  return source.key ?? String(field.key);
}

function storesInMeta(field: ResolvedField): boolean {
  return field.source.from === 'meta';
}

/** Call: `createFieldContext(registry, 'UTC')` — bind Field read to this registry. */
export function createFieldContext(
  registry: FieldRegistry,
  timeZone: string,
  memo?: () => FieldReadMemo | undefined,
): FieldContext {
  const ctx: FieldContext = {
    timeZone,
    read<T>(entry: Entry, key: FieldKey): T | undefined {
      const field = registry.get(String(key));
      if (!field) return undefined;
      return readField(entry, field, ctx, memo?.()) as T | undefined;
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
    return markAuthoredFieldKeys(next, authoredFieldKeysOf(edit));
  }

  const key = metaKeyOf(field);
  const baseMeta = 'meta' in edit ? edit.meta : entry.meta;
  const record = metaRecord(baseMeta);
  if (value === undefined) delete record[key];
  else record[key] = value;
  const next: StoredEdit = { ...edit };
  if (Object.keys(record).length === 0) (next as Record<string, unknown>)['meta'] = undefined;
  else next.meta = record;
  return markAuthoredFieldKeys(next, authoredFieldKeysOf(edit));
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
    return authoredFieldKeysOf(edit).has(String(field.key));
  }
  return false;
}

/** Applies a stored overlay the way `EntryStore.get` must: core keys only, never authored extras. */
export function overlayStoredEdit(entry: Entry, edit: StoredEdit): Entry {
  const next: Record<string, unknown> = { ...entry };
  if ('parentId' in edit) {
    if (edit.parentId === undefined) delete next['parentId'];
    else next['parentId'] = edit.parentId;
  }
  if (edit.kind !== undefined) next['kind'] = edit.kind;
  if (edit.name !== undefined) next['name'] = edit.name;
  if (edit.start !== undefined) next['start'] = edit.start;
  if (edit.end !== undefined) next['end'] = edit.end;
  if ('segments' in edit) {
    if (edit.segments === undefined) delete next['segments'];
    else next['segments'] = edit.segments;
  }
  if ('meta' in edit) {
    if (edit.meta === undefined) delete next['meta'];
    else next['meta'] = edit.meta;
  }
  return next as unknown as Entry;
}
