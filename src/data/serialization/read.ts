// data/ — Document reader (D-S2-12). A `readers` map keyed by schema version; this build writes and
// reads `schema: 1` only. An unknown schema throws `UnsupportedSchemaError`. Keys the reader does
// not know are dropped: top level belongs to the schema, `meta` is the consumer's namespace.

import type { DateOnlyEndRule, EntryInput, EntryKind } from '../../model/index.js';
import type { DatasetDocument, EntryDocument } from '../../model/index.js';
import { UnsupportedSchemaError } from '../../model/index.js';
import { instant } from '../../time/index.js';

export interface DatasetDocumentRead {
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  derivedSpanKinds: readonly EntryKind[];
  entries: readonly EntryInput[];
}

type Reader = (doc: DatasetDocument) => DatasetDocumentRead;

function readEntryDocument(row: EntryDocument): EntryInput {
  return {
    id: row.id,
    ...(row.parentId !== undefined ? { parentId: row.parentId } : {}),
    ...(row.kind !== undefined ? { kind: row.kind } : {}),
    name: row.name,
    start: instant(row.start),
    end: instant(row.end),
    ...(row.progress !== undefined ? { progress: row.progress } : {}),
    ...(row.segments !== undefined
      ? {
          segments: row.segments.map((segment) => ({
            start: instant(segment.start),
            end: instant(segment.end),
          })),
        }
      : {}),
    ...(row.meta !== undefined ? { meta: row.meta } : {}),
  };
}

function readSchema1(doc: DatasetDocument): DatasetDocumentRead {
  return {
    timeZone: doc.timeZone,
    dateOnlyEnd: doc.dateOnlyEnd,
    derivedSpanKinds: [...doc.derivedSpanKinds],
    entries: doc.entries.map(readEntryDocument),
  };
}

/** The migration seam. A second schema is a map addition, not a rewrite (`plans/02` §6). */
export const readers: Record<number, Reader> = {
  1: readSchema1,
};

export function readDocument(doc: DatasetDocument): DatasetDocumentRead {
  const reader = readers[doc.schema];
  if (reader === undefined) {
    throw new UnsupportedSchemaError(doc.schema, Object.keys(readers).map(Number));
  }
  return reader(doc);
}
