// data/ — Document writer (D-S2-12, D-S4-15). Four stability rules: declared key order, optional
// keys omitted, entries in store insertion order, instants as Z-suffixed ISO. A leaf directory:
// only api/dataset.ts imports it (serialization-is-removable, D-S2-23). Delete this directory and
// the data core does not notice a document format exists.

import type { DateOnlyEndRule, Entry, EntryKind, Field, FieldSource, GridColumn } from '../../model/index.js';
import type { DatasetDocument, EntryDocument, SerializedField } from '../../model/index.js';
import { instant, toISO } from '../../time/index.js';
import { CORE_FIELDS } from '../fields/core-fields.js';

export { readDocument, readers, mergeDeclaredFields } from './read.js';
export type { DatasetDocumentRead, FromJSONOptions } from './read.js';

/** The readable Dataset surface `toJSON` needs — what a consumer already has (`entries.all`, zone,
 *  `dateOnlyEnd`, `rollUpKinds`, resolved Fields). `Dataset` and `DatasetState` both match. */
export interface DatasetDocumentSource {
  readonly timeZone: string;
  readonly dateOnlyEnd: DateOnlyEndRule;
  readonly rollUpKinds: Iterable<EntryKind>;
  readonly fields: { readonly all: readonly Field[] };
  readonly entries: {
    readonly all: readonly Entry[];
    get(id: string): Entry | undefined;
  };
}

function isCoreFieldKey(key: string): boolean {
  return CORE_FIELDS.some((field) => String(field.key) === key);
}

function writeSegments(entry: Entry): EntryDocument['segments'] {
  if (entry.segments === undefined) return undefined;
  return entry.segments.map((segment) => ({ start: toISO(segment.start), end: toISO(segment.end) }));
}

function writeEntry(entry: Entry): EntryDocument {
  const segments = writeSegments(entry);
  return {
    id: entry.id,
    ...(entry.parentId !== undefined ? { parentId: entry.parentId } : {}),
    ...(entry.kind !== 'span' ? { kind: entry.kind } : {}),
    name: entry.name,
    start: toISO(entry.start),
    end: toISO(entry.end),
    ...(segments !== undefined ? { segments } : {}),
    ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
  };
}

function writeStoredSource(source: FieldSource): SerializedField['source'] | undefined {
  if (source.from === 'compute') return undefined;
  if (source.from === 'entry') return { from: 'entry', field: source.field };
  return { from: 'meta', key: source.key ?? '' };
}

function writeColumn(column: Omit<GridColumn, 'field'>): Omit<GridColumn, 'field'> {
  return {
    ...(column.header !== undefined ? { header: column.header } : {}),
    ...(column.width !== undefined ? { width: column.width } : {}),
    ...(column.flex !== undefined ? { flex: column.flex } : {}),
    ...(column.align !== undefined ? { align: column.align } : {}),
  };
}

/** Core Fields and `compute` sources stay out of the Document (D-S4-15). */
function writeDeclaredField(field: Field): SerializedField | undefined {
  if (isCoreFieldKey(String(field.key))) return undefined;
  const source = field.source ?? { from: 'meta' as const, key: String(field.key) };
  const stored = writeStoredSource(source);
  if (stored === undefined) return undefined;
  const column = field.column === undefined ? undefined : writeColumn(field.column);
  return {
    key: field.key,
    ...(field.type !== undefined ? { type: field.type } : {}),
    source: stored,
    ...(field.rollUp !== undefined ? { rollUp: field.rollUp } : {}),
    ...(column !== undefined && Object.keys(column).length > 0 ? { column } : {}),
  };
}

function writeDeclaredFields(all: readonly Field[]): SerializedField[] | undefined {
  const rows: SerializedField[] = [];
  for (const field of all) {
    const row = writeDeclaredField(field);
    if (row !== undefined) rows.push(row);
  }
  return rows.length === 0 ? undefined : rows;
}

/** `toJSON(dataset)` — write the Dataset as a Document. Keys are declared in order; `Object.keys`
 *  over a store entity is never used. Always `schema: 2` (D-S4-16). */
export function toJSON(dataset: DatasetDocumentSource): DatasetDocument {
  const fields = writeDeclaredFields(dataset.fields.all);
  return {
    schema: 2,
    timeZone: dataset.timeZone,
    dateOnlyEnd: dataset.dateOnlyEnd,
    rollUpKinds: Array.from(dataset.rollUpKinds),
    ...(fields !== undefined ? { fields } : {}),
    entries: dataset.entries.all.map(writeEntry),
  };
}

const isDevMode = (): boolean => (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;

/** A document whose stored roll-up values disagree with its children is corrected by construction
 *  (D-S2-22). In dev mode, name the entry so the rewrite is not silent. */
export function warnIfRollUpsWereCorrected(doc: DatasetDocument, dataset: DatasetDocumentSource): void {
  if (!isDevMode()) return;
  const kinds = new Set(dataset.rollUpKinds);
  for (const row of doc.entries) {
    const kind = row.kind ?? 'span';
    if (!kinds.has(kind)) continue;
    const stored = dataset.entries.get(row.id);
    if (stored === undefined) continue;
    if (instant(row.start) === stored.start && instant(row.end) === stored.end) continue;
    console.warn(
      `FreeGantt: fromJSON corrected the rolled-up span of entry "${row.id}" to match its children`,
    );
  }
}
