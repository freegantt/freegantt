// data/ — one FieldSource strategy table (A4). Registry, read/write, and the document codec
// all ask here so `from` is not switched in four places.

import type {
  Entry,
  Field,
  FieldSource,
  FieldContext,
  SerializedField,
  StoredEdit,
} from '../../model/index.js';
import type { ComputedFieldCache } from '../computed-cache.js';

export interface FieldReadMemo {
  readonly cache: ComputedFieldCache;
  readonly datasetRevision: number;
}

function metaRecord(meta: unknown): Record<string, unknown> {
  if (meta !== undefined && meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) };
  }
  return {};
}

function metaKey(field: Pick<Field, 'key' | 'source'>): string {
  const source = field.source;
  if (source !== undefined && source.from === 'meta') return source.key ?? String(field.key);
  return String(field.key);
}

/** Call: `withProposedKeys(stored, Object.keys(edit))`. */
export function withProposedKeys(edit: StoredEdit, keys: Iterable<string>): StoredEdit {
  return { ...edit, proposedKeys: new Set(keys) };
}

export function proposedKeysOf(edit: StoredEdit | undefined): ReadonlySet<string> {
  if (!edit) return new Set();
  return edit.proposedKeys ?? new Set();
}

export interface SourceStrategy {
  normalize(field: Pick<Field, 'key' | 'source'>): FieldSource;
  read(
    entry: Entry,
    field: Field & { source: FieldSource },
    ctx: FieldContext,
    memo?: FieldReadMemo,
  ): unknown;
  write(edit: StoredEdit, entry: Entry, field: Field & { source: FieldSource }, value: unknown): StoredEdit;
  proposes(edit: StoredEdit, field: Field & { source: FieldSource }): boolean;
  serialize(source: FieldSource): SerializedField['source'] | undefined;
}

const entryStrategy = {
  normalize(field) {
    const source = field.source;
    if (source !== undefined && source.from === 'entry') return source;
    return { from: 'meta', key: String(field.key) };
  },
  read(entry, field) {
    const source = field.source;
    if (source.from !== 'entry') return undefined;
    return (entry as unknown as Record<string, unknown>)[source.field];
  },
  write(edit, _entry, field, value) {
    const source = field.source;
    if (source.from !== 'entry') return edit;
    const next: StoredEdit = { ...edit };
    (next as Record<string, unknown>)[source.field] = value;
    return withProposedKeys(next, proposedKeysOf(edit));
  },
  proposes(edit, field) {
    const source = field.source;
    if (source.from !== 'entry') return false;
    return (edit as Record<string, unknown>)[source.field] !== undefined;
  },
  serialize(source) {
    if (source.from !== 'entry') return undefined;
    return { from: 'entry', field: source.field };
  },
} as const satisfies SourceStrategy;

const metaStrategy = {
  normalize(field) {
    return { from: 'meta', key: metaKey(field) };
  },
  read(entry, field) {
    return metaRecord(entry.meta)[metaKey(field)];
  },
  write(edit, entry, field, value) {
    const key = metaKey(field);
    const baseMeta = 'meta' in edit ? edit.meta : entry.meta;
    const record = metaRecord(baseMeta);
    if (value === undefined) delete record[key];
    else record[key] = value;
    const next: StoredEdit = { ...edit };
    if (Object.keys(record).length === 0) (next as Record<string, unknown>)['meta'] = undefined;
    else next.meta = record;
    return withProposedKeys(next, proposedKeysOf(edit));
  },
  proposes(edit, field) {
    return proposedKeysOf(edit).has(String(field.key));
  },
  serialize(source) {
    if (source.from !== 'meta' || source.key === undefined) return undefined;
    return { from: 'meta', key: source.key };
  },
} as const satisfies SourceStrategy;

const computeStrategy = {
  normalize(field) {
    const source = field.source;
    if (source !== undefined && source.from === 'compute') return source;
    return { from: 'meta', key: String(field.key) };
  },
  read(entry, field, ctx, memo) {
    const source = field.source;
    if (source.from !== 'compute') return undefined;
    const compute = (): unknown => source.read(entry, ctx);
    if (!memo) return compute();
    return memo.cache.read(entry.id, field.key, memo.datasetRevision, compute);
  },
  write(edit) {
    return edit;
  },
  proposes() {
    return false;
  },
  serialize() {
    return undefined;
  },
} as const satisfies SourceStrategy;

export const SOURCE_STRATEGY = Object.freeze({
  entry: entryStrategy,
  meta: metaStrategy,
  compute: computeStrategy,
} as const satisfies Record<FieldSource['from'], SourceStrategy>);

export function strategyFor(source: FieldSource): SourceStrategy {
  return SOURCE_STRATEGY[source.from];
}
