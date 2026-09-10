// data/ — Document writer (D-S2-12, D-S4-15). Four stability rules: declared key order, optional
// keys omitted, entries in store insertion order, instants as Z-suffixed ISO. A leaf directory:
// only api/dataset.ts imports it (serialization-is-removable, D-S2-23). Delete this directory and
// the data core does not notice a document format exists.

import type { DateOnlyEndRule, Entry, EntryKind, Field, RaiseError } from '../../model/index.js';
import type { DatasetDocument, EntryDocument, PluginDocument } from '../../model/index.js';
import { instant, toISO } from '../../time/index.js';
import { encodeFieldDocument } from './field-document.js';

export { fromDocument, readers } from './read.js';
export type { DatasetDocumentRead, FromJSONOptions } from './read.js';

/** The readable Dataset surface `toDocument` needs — what a consumer already has (`entries.all`, zone,
 *  `dateOnlyEnd`, `rollUpKinds`, resolved Fields). `Dataset` and `DatasetState` both match. */
export interface DatasetDocumentSource {
  readonly timeZone: string;
  readonly dateOnlyEnd: DateOnlyEndRule;
  readonly rollUpKinds: Iterable<EntryKind>;
  /** `authored`, not `all`: a Document carries the consumer's own Field declarations only
   *  (D-S5-33). A plugin declares its Fields again on its next install. */
  readonly fields: { readonly authored: readonly Field[] };
  readonly entries: {
    readonly all: readonly Entry[];
    get(id: string): Entry | undefined;
  };
  /** Every plugin's own rows (D-S5-24), the rows of plugins this Dataset never installed included. */
  readonly pluginStores: { toDocument(): PluginDocument | undefined };
}

/** Every Entry stores Segments since #212, and most store the single one ingest filled in over
 *  `[start, end)`. Writing that one back would say twice what `start` and `end` already say, so this
 *  omits it — the reader fills it in again, and an ordinary Document keeps the bytes it had. An Entry
 *  whose Segments say something the envelope does not writes them all, ids included. */
function writeSegments(entry: Entry): EntryDocument['segments'] {
  if (drawsItsEnvelope(entry)) return undefined;
  return entry.segments.map((segment) => ({
    id: segment.id,
    start: toISO(segment.start),
    end: toISO(segment.end),
  }));
}

function drawsItsEnvelope(entry: Entry): boolean {
  const sole = entry.segments.length === 1 ? entry.segments[0] : undefined;
  return sole !== undefined && sole.start === entry.start && sole.end === entry.end;
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

/** `toDocument(dataset)` — write the Dataset as a Document. Keys are declared in order; `Object.keys`
 *  over a store entity is never used. Always `schema: 4` (D-S4-16, D-S5-24, #212). */
export function toDocument(dataset: DatasetDocumentSource): DatasetDocument {
  const fields = encodeFieldDocument(dataset.fields.authored);
  const plugins = dataset.pluginStores.toDocument();
  return {
    schema: 4,
    timeZone: dataset.timeZone,
    dateOnlyEnd: dataset.dateOnlyEnd,
    rollUpKinds: Array.from(dataset.rollUpKinds),
    ...(fields !== undefined ? { fields } : {}),
    ...(plugins !== undefined ? { plugins } : {}),
    entries: dataset.entries.all.map(writeEntry),
  };
}

/** A document whose stored roll-up values disagree with its children is corrected by construction
 *  (D-S2-22). Names every entry it rewrote, so the correction is never silent.
 *
 *  S5.12, D-S5-41: this used to return early unless `isDevMode()`. That flag is resolved when *this
 *  repo* builds `dist/`, so the whole pass was dead-code-eliminated out of every consumer's build and
 *  no consumer has ever seen one of these lines. It now reports every correction, and the
 *  `console.warn` behind each report fires only when nothing is subscribed to `error`. */
export function reportCorrectedRollUps(
  doc: DatasetDocument,
  dataset: Pick<DatasetDocumentSource, 'rollUpKinds' | 'entries'>,
  raiseError: RaiseError,
): void {
  const kinds = new Set(dataset.rollUpKinds);
  for (const row of doc.entries) {
    const kind = row.kind ?? 'span';
    if (!kinds.has(kind)) continue;
    const stored = dataset.entries.get(row.id);
    if (stored === undefined) continue;
    if (instant(row.start) === stored.start && instant(row.end) === stored.end) continue;
    const message = `fromJSON corrected the rolled-up span of entry "${row.id}" to match its children`;
    raiseError(
      {
        code: 'rollup-corrected',
        message,
        severity: 'warning',
        by: 'core',
        entryId: stored.id,
      },
      () => console.warn(`FreeGantt: ${message}`),
    );
  }
}
