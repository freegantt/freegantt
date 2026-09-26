// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// A Field key names a Field, and it is the changeset's `field` (ADR 0011). These types derive from
// `StoredEntry` — which keys storage owns — so they live one file below `field.ts`: the live `Entry`
// names a Field key too, and a shared leaf is what keeps the two out of an import ring.

import type { Duration } from './time.js';
import type { EntryId } from './ids.js';
import type { StoredEntry } from './stored-entry.js';

/** The shipped subset — keys of `Entry` except `id` and `props`. The comparator exhaustiveness check
 *  stays over this set (ADR 0005 §28). `props` omits alongside this, or neither does (ADR 0011):
 *  change one and not the other, and `read(id, 'props')` types as the whole bag while the registry
 *  refuses the key at runtime. */
export type CoreFieldKey = keyof Omit<StoredEntry, 'id' | 'props'>;

/** A Field's name, and the changeset's `field`. Open by construction (ADR 0005). */
export type FieldKey = CoreFieldKey | (string & {});

/** What each shipped Field reads as: the `Entry` keys (minus `props`, ADR 0011's one reserved key),
 *  plus `duration` — the one core Field that computes its value and owns no `Entry` key
 *  (`data/fields/core-fields.ts`). The typed way to a consumer's own `props` is
 *  `entries.get(id)?.props`. */
export interface CoreFieldValues extends Omit<StoredEntry, 'id' | 'props'> {
  /** This row's duration under the Dataset's `measureDuration`, computed on read (`CORE_FIELDS`) —
   *  the one core Field with no `Entry` key. `measureEntryDuration` (`data/fields/field-access.ts`)
   *  is the one computation all three doors reach: `'span'` measures `end - start`, and
   *  `'children'` sums the direct children's own spans and counts no gap (ADR 0017, ADR 0026). */
  duration: Duration;
  /** The tree's answer to "who is this row's parent", by key (ADR 0024) — the same answer
   *  `parent()?.id` gives, computed on read, never stored. `parentId` stays the authored value; a
   *  plugin-owned hierarchy source can make the two disagree, on purpose (ADR 0020). */
  hierarchyParentId: EntryId | undefined;
}

/** A core Field's value, and `unknown` for every other key. This is all a `FieldContext` can
 *  promise: it flows into `layout/` and `view/`, and threading a consumer's field map through those
 *  layers is the option ADR 0005 rejected. */
export type CoreFieldValue<K extends FieldKey> = K extends keyof CoreFieldValues
  ? CoreFieldValues[K]
  : unknown;

/** A Field's value on a Dataset that declared `TProps` — what `entry.read(key)` answers. A core
 *  key reads as its shipped type, a declared key as the type the consumer wrote, and any other key
 *  as `unknown`. One generic types both `entry.props` and this (ADR 0011); `TProps` stops at the
 *  Dataset (ADR 0005). */
export type FieldValue<TProps, K extends FieldKey> = K extends keyof CoreFieldValues
  ? CoreFieldValues[K]
  : K extends keyof TProps
    ? TProps[K]
    : unknown;
