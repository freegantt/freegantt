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
import { decodeFieldDocument } from './field-document.js';
import type { FromJSONOptions } from './field-document.js';

export type { FromJSONOptions };

export interface DatasetDocumentRead {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  rollUpKinds: readonly EntryKind[];
  entries: readonly EntryInput[];
  fields?: readonly Field[];
  fieldTypes?: Readonly<Record<string, FieldType>>;
  aggregators?: Readonly<Record<string, Aggregator>>;
}

type SchemaRead = Omit<DatasetDocumentRead, 'fields' | 'fieldTypes' | 'aggregators'>;

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

function readSchema1(doc: DatasetDocument): SchemaRead {
  return {
    timeZone: doc.timeZone,
    dateOnlyEnd: doc.dateOnlyEnd,
    rollUpKinds: rollUpKindsFromSchema1(doc),
    entries: doc.entries.map(readEntryDocument),
  };
}

function readSchema2(doc: DatasetDocument): SchemaRead {
  return {
    timeZone: doc.timeZone,
    dateOnlyEnd: doc.dateOnlyEnd,
    rollUpKinds: [...(doc.rollUpKinds ?? ['group'])],
    entries: doc.entries.map(readEntryDocument),
  };
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
  const documentRows: readonly SerializedField[] | undefined = doc.schema === 2 ? doc.fields : undefined;
  const { fields, fieldTypes } = decodeFieldDocument(documentRows, options);
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
