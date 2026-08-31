// data/ — the one `switch` over `FieldSource` in `src/` (D-S4-2). Every other layer asks by Field
// key and never learns where the value sits.

import type { Duration, Entry, FieldContext, FieldKey, StoredEdit } from '../../model/index.js';
import { diffMs } from '../../time/index.js';
import type { ResolvedField } from './field-registry.js';

const authoredKeys = new WeakMap<StoredEdit, ReadonlySet<string>>();

export function markAuthoredFieldKeys(edit: StoredEdit, keys: Iterable<string>): StoredEdit {
  authoredKeys.set(edit, new Set(keys));
  return edit;
}

export function authoredFieldKeysOf(edit: StoredEdit | undefined): ReadonlySet<string> {
  if (!edit) return new Set();
  return authoredKeys.get(edit) ?? new Set();
}

export function mergeStoredEdits(base: StoredEdit | undefined, extra: StoredEdit): StoredEdit {
  const merged: StoredEdit = { ...base, ...extra };
  const keys = new Set([...authoredFieldKeysOf(base), ...authoredFieldKeysOf(extra)]);
  return markAuthoredFieldKeys(merged, keys);
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

export function createFieldContext(
  timeZone: string,
  readDeclared: (entry: Entry, key: FieldKey, ctx: FieldContext) => unknown,
): FieldContext {
  const ctx: FieldContext = {
    timeZone,
    read<T>(entry: Entry, key: FieldKey): T | undefined {
      return readDeclared(entry, key, ctx) as T | undefined;
    },
    durationOf(entry: Entry): Duration {
      return { value: diffMs(entry.end, entry.start), unit: 'millisecond' };
    },
  };
  return ctx;
}

export function readField(entry: Entry, field: ResolvedField, ctx: FieldContext): unknown {
  const source = field.source;
  if (source.from === 'entry') return (entry as unknown as Record<string, unknown>)[source.field];
  if (source.from === 'meta') {
    const record = metaRecord(entry.meta);
    return record[metaKeyOf(field)];
  }
  return source.read(entry, ctx);
}

/** Folds one field write into an entry-shaped `StoredEdit`, merging `meta` rather than replacing it. */
export function writeField(edit: StoredEdit, entry: Entry, field: ResolvedField, value: unknown): StoredEdit {
  const source = field.source;
  if (source.from === 'compute') return edit;
  if (source.from === 'entry') {
    const next: StoredEdit = { ...edit };
    if (value === undefined) delete (next as Record<string, unknown>)[source.field];
    else (next as Record<string, unknown>)[source.field] = value;
    return markAuthoredFieldKeys(next, authoredFieldKeysOf(edit));
  }

  const key = metaKeyOf(field);
  const baseMeta = 'meta' in edit ? edit.meta : entry.meta;
  const record = metaRecord(baseMeta);
  if (value === undefined) delete record[key];
  else record[key] = value;
  const next: StoredEdit = { ...edit };
  if (Object.keys(record).length === 0) delete next.meta;
  else next.meta = record;
  return markAuthoredFieldKeys(next, authoredFieldKeysOf(edit));
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
