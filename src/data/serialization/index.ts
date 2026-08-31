// data/ — Document writer (D-S2-12). Four stability rules: declared key order, optional keys omitted,
// entries in store insertion order, instants as Z-suffixed ISO. A leaf directory: only api/dataset.ts
// imports it (serialization-is-removable, D-S2-23). Delete this directory and the data core does not
// notice a document format exists.

import type { DateOnlyEndRule, Entry, EntryKind } from '../../model/index.js';
import type { DatasetDocument, EntryDocument } from '../../model/index.js';
import { instant, toISO } from '../../time/index.js';

export { readDocument, readers } from './read.js';
export type { DatasetDocumentRead } from './read.js';

/** The readable Dataset surface `toJSON` needs — what a consumer already has (`entries.all`, zone,
 *  `dateOnlyEnd`, `rollUpKinds`). `Dataset` and `DatasetState` both match. */
export interface DatasetDocumentSource {
  readonly timeZone: string;
  readonly dateOnlyEnd: DateOnlyEndRule;
  readonly rollUpKinds: Iterable<EntryKind>;
  readonly entries: {
    readonly all: readonly Entry[];
    get(id: string): Entry | undefined;
  };
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

/** `toJSON(dataset)` — write the Dataset as a Document. Keys are declared in order; `Object.keys`
 *  over a store entity is never used. */
export function toJSON(dataset: DatasetDocumentSource): DatasetDocument {
  return {
    schema: 1,
    timeZone: dataset.timeZone,
    dateOnlyEnd: dataset.dateOnlyEnd,
    rollUpKinds: Array.from(dataset.rollUpKinds),
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
