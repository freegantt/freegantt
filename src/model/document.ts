// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// The Document is the `toJSON()`/`fromJSON()` shape (D-S2-12): public API, schema-versioned, semver-governed.

import type { DateOnlyEndRule } from './time.js';
import type { EntryKind } from './entry.js';

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

/** The whole-document half of D7. Key order is a contract: `schema`, `timeZone`, `dateOnlyEnd`,
 *  `derivedSpanKinds`, `entries`. */
export interface DatasetDocument<TMeta = unknown> {
  schema: 1;
  timeZone: string;
  dateOnlyEnd: DateOnlyEndRule;
  derivedSpanKinds: readonly EntryKind[];
  entries: readonly EntryDocument<TMeta>[];
}
