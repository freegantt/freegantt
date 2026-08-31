// data/ — Document reader (D-S2-12, D-S4-15, D-S4-16). A `readers` map keyed by schema version;
// this build writes `schema: 2` and reads `1` and `2`. An unknown schema throws
// `UnsupportedSchemaError`. Keys the reader does not know are dropped: top level belongs to the
// schema, `meta` is the consumer's namespace.

import type {
  Aggregator,
  DateOnlyEndRule,
  EntryInput,
  EntryKind,
  Field,
  FieldType,
  Instant,
} from '../../model/index.js';
import type { DatasetDocument, EntryDocument, SerializedField } from '../../model/index.js';
import { InvalidInstantError, UnsupportedSchemaError } from '../../model/index.js';
import { instant } from '../../time/index.js';

/** Code half of a Field — the Document carries the data half (D-S4-15). */
export interface FromJSONOptions {
  fieldTypes?: Readonly<Record<string, FieldType>>;
  aggregators?: Readonly<Record<string, Aggregator>>;
  fields?: readonly Field[];
}

export interface DatasetDocumentRead {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  rollUpKinds: readonly EntryKind[];
  entries: readonly EntryInput[];
  fields?: readonly Field[];
  fieldTypes?: Readonly<Record<string, FieldType>>;
  aggregators?: Readonly<Record<string, Aggregator>>;
}

interface SchemaRead {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  rollUpKinds: readonly EntryKind[];
  entries: readonly EntryInput[];
  fields?: readonly Field[];
}

type Reader = (doc: DatasetDocument) => SchemaRead;

/** Reads a stored absolute-ISO date. `fromJSON` is a public validation boundary (`plans/02` §7):
 *  a bad document date must surface as `InvalidInstantError`, the same `FreeGanttError` subclass
 *  mutation input throws through `toInstant()`, not `instant()`'s bare `RangeError`. */
function readInstant(value: string): Instant {
  try {
    return instant(value);
  } catch {
    throw new InvalidInstantError(`fromJSON(): "${value}" is not a stored date this library can read`);
  }
}

function readEntryDocument(row: EntryDocument): EntryInput {
  return {
    id: row.id,
    ...(row.parentId !== undefined ? { parentId: row.parentId } : {}),
    ...(row.kind !== undefined ? { kind: row.kind } : {}),
    name: row.name,
    start: readInstant(row.start),
    end: readInstant(row.end),
    ...(row.segments !== undefined
      ? {
          segments: row.segments.map((segment) => ({
            start: readInstant(segment.start),
            end: readInstant(segment.end),
          })),
        }
      : {}),
    ...(row.meta !== undefined ? { meta: row.meta } : {}),
  };
}

function rollUpKindsFromSchema1(doc: DatasetDocument): readonly EntryKind[] {
  const legacy = doc as DatasetDocument & { derivedSpanKinds?: readonly EntryKind[] };
  return [...(doc.rollUpKinds ?? legacy.derivedSpanKinds ?? ['group'])];
}

/** A `compute` source in JSON is not a schema-2 Field — drop it (D-S4-15). */
function readDeclaredField(row: SerializedField): Field | undefined {
  const source = row.source;
  if (source !== undefined && source.from !== 'entry' && source.from !== 'meta') return undefined;
  return {
    key: row.key,
    ...(row.type !== undefined ? { type: row.type } : {}),
    source: source ?? { from: 'meta', key: String(row.key) },
    ...(row.rollUp !== undefined ? { rollUp: row.rollUp } : {}),
    ...(row.column !== undefined ? { column: row.column } : {}),
  };
}

function readSchema1(doc: DatasetDocument): SchemaRead {
  return {
    timeZone: doc.timeZone,
    dateOnlyEnd: doc.dateOnlyEnd,
    rollUpKinds: rollUpKindsFromSchema1(doc),
    entries: doc.entries.map(readEntryDocument),
  };
}

function readSchema2(doc: DatasetDocument): SchemaRead {
  const fields = (doc.fields ?? [])
    .map(readDeclaredField)
    .filter((field): field is Field => field !== undefined);
  return {
    timeZone: doc.timeZone,
    dateOnlyEnd: doc.dateOnlyEnd,
    rollUpKinds: [...(doc.rollUpKinds ?? ['group'])],
    entries: doc.entries.map(readEntryDocument),
    ...(fields.length > 0 ? { fields } : {}),
  };
}

/** Same-key merge: Document wins `source` / `rollUp` / `type` / `column`; options win functions. */
function takeDocumentDataWithOptionFunctions(documentField: Field, optionField: Field): Field {
  return {
    key: documentField.key,
    ...(documentField.type !== undefined ? { type: documentField.type } : {}),
    ...(documentField.source !== undefined ? { source: documentField.source } : {}),
    ...(documentField.rollUp !== undefined ? { rollUp: documentField.rollUp } : {}),
    ...(documentField.column !== undefined ? { column: documentField.column } : {}),
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Field callbacks are declaration values.
    ...(optionField.equals !== undefined ? { equals: optionField.equals } : {}),
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Field callbacks are declaration values.
    ...(optionField.compare !== undefined ? { compare: optionField.compare } : {}),
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Field callbacks are declaration values.
    ...(optionField.formatValue !== undefined ? { formatValue: optionField.formatValue } : {}),
  };
}

/** Document Fields first (declaration order); a Field only in `options.fields` is appended whole. */
export function mergeDeclaredFields(
  documentFields: readonly Field[],
  optionFields: readonly Field[] | undefined,
): Field[] {
  if (optionFields === undefined || optionFields.length === 0) return [...documentFields];
  const optionByKey = new Map(optionFields.map((field) => [String(field.key), field]));
  const used = new Set<string>();
  const merged: Field[] = [];
  for (const documentField of documentFields) {
    const key = String(documentField.key);
    used.add(key);
    const optionField = optionByKey.get(key);
    merged.push(
      optionField === undefined
        ? documentField
        : takeDocumentDataWithOptionFunctions(documentField, optionField),
    );
  }
  for (const optionField of optionFields) {
    if (!used.has(String(optionField.key))) merged.push(optionField);
  }
  return merged;
}

/** Keep a Document `type` name constructible when the reading app omitted that Field type.
 *  The data keys (`rollUp`, `source`) already travelled; an empty bundle supplies no functions.
 *  `new Dataset({ fields: [{ type: 'money' }] })` still throws — it has no Document behind it. */
function fieldTypesForConstruction(
  fields: readonly Field[],
  optionTypes: Readonly<Record<string, FieldType>> | undefined,
): Readonly<Record<string, FieldType>> | undefined {
  const next: Record<string, FieldType> = { ...optionTypes };
  let seeded = false;
  for (const field of fields) {
    if (field.type !== undefined && next[field.type] === undefined) {
      next[field.type] = {};
      seeded = true;
    }
  }
  if (optionTypes !== undefined) return next;
  if (seeded) return next;
  return undefined;
}

/** The migration seam. A second schema is a map addition, not a rewrite (`plans/02` §6). */
export const readers: Record<number, Reader> = Object.freeze({
  1: readSchema1,
  2: readSchema2,
});

export function readDocument(doc: DatasetDocument, options?: FromJSONOptions): DatasetDocumentRead {
  const reader = readers[doc.schema];
  if (reader === undefined) {
    throw new UnsupportedSchemaError(doc.schema, Object.keys(readers).map(Number));
  }
  const base = reader(doc);
  const fields = mergeDeclaredFields(base.fields ?? [], options?.fields);
  const fieldTypes = fieldTypesForConstruction(fields, options?.fieldTypes);
  return {
    timeZone: base.timeZone,
    dateOnlyEnd: base.dateOnlyEnd,
    rollUpKinds: base.rollUpKinds,
    entries: base.entries,
    ...(fields.length > 0 ? { fields } : {}),
    ...(fieldTypes !== undefined ? { fieldTypes } : {}),
    ...(options?.aggregators !== undefined ? { aggregators: options.aggregators } : {}),
  };
}
