// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// The Document is the `toJSON()`/`fromJSON()` shape (D-S2-12): public API, schema-versioned, semver-governed.

import type { DateOnlyEndRule } from './time.js';
import type { EntryKind } from './entry.js';
import type { AggregatorName, CoreFieldKey, FieldKey, FieldTypeName, GridColumn } from './field.js';

/** One Entry as it appears in a Document. Instants are `Z`-suffixed ISO strings; brands are gone.
 *  Optional keys are omitted when absent, never written as `null`. */
export interface EntryDocument<TMeta = unknown> {
  id: string;
  parentId?: string;
  /** Omitted when it is the stored default `'span'`. */
  kind?: EntryKind;
  name: string;
  start: string;
  end: string;
  segments?: readonly { start: string; end: string }[];
  /** Consumer-owned. Carried by reference, never walked field by field (D-S2-12). */
  meta?: TMeta;
}

/** A `Field` minus its function-valued keys. `type` and `rollUp` travel as names (D-S4-15).
 *  `source` is always the resolved entry-or-meta slot — a `compute` Field is not written. */
export type SerializedField = {
  key: FieldKey;
  type?: FieldTypeName;
  source: { from: 'entry'; field: CoreFieldKey } | { from: 'meta'; key: string };
  rollUp?: AggregatorName;
  column?: Omit<GridColumn, 'field' | 'hidden'>;
};

/** Every plugin's own per-entry rows, keyed first by `PluginId` and then by `EntryId` (D-S5-24).
 *  Rows are passenger data: a Document read by an application that no longer installs that plugin
 *  keeps them untouched and writes them back, the same posture an undeclared `meta` key already has. */
export type PluginDocument = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** The whole-document half of D7. Key order is a contract: `schema`, `timeZone`, `dateOnlyEnd`,
 *  `rollUpKinds`, `fields`, `plugins`, `entries`. This build writes `schema: 3` and still reads
 *  `schema: 1` and `2` (D-S4-16, D-S5-24). */
export interface DatasetDocument<TMeta = unknown> {
  schema: 1 | 2 | 3;
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  rollUpKinds: readonly EntryKind[];
  /** Declaration order. Core Fields are never written — the reader seeds them itself. */
  fields?: readonly SerializedField[];
  /** Written at `schema: 3` and above. Omitted when no plugin holds a row. */
  plugins?: PluginDocument;
  entries: readonly EntryDocument<TMeta>[];
}
