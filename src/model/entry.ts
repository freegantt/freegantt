// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// The live row (ADR 0017). `StoredEntry` (`stored-entry.ts`) carries the values one row stores at one
// point in time; `Entry` here answers questions about that row *now*. Every read seam receives this
// type; the edit pipeline carries `StoredEntry`.
//
// It is declared here and built in `data/`, beside the store and the indexes it reads. `layout/`
// names the type and never the factory, so the import graph stays `layout/ → model/` (ADR 0017,
// *The seam with `layout/`*).

import type { Duration } from './time.js';
import type { Instant } from './time.js';
import type { EntryId } from './ids.js';
import type { FieldKey, FieldValue } from './field-key.js';
import type { EntryInput, Segment } from './stored-entry.js';

/**
 * One row, as it stands now.
 *
 * **A member that does no work is a property. A member that computes, walks or allocates carries
 * parentheses** (ADR 0017, rule 4). So `hasChildren` and `depth` are properties, and `children()`,
 * `parent()`, `descendants()` and `duration()` are methods — `parent()` answers one value and still
 * carries parentheses, because it looks the row up.
 *
 * There is no `entry.update()`: the `Entry` reads, and `dataset.entries.update(id, edit)` writes.
 * There is no `entry.variant`: a variant is per Gantt, because two Gantts on one Dataset may install
 * different ones. There is no `removed` flag: existence is `entries.has(id)`.
 */
export interface Entry<TProps = Record<string, unknown>> {
  readonly id: EntryId;
  /** Omitted iff no author gave this row a name — a booking with no title is still a row (#421
   *  C5). The Grid's `name` column reads it through `formatValue`, the same door every other Field
   *  reads through; nothing else in core defaults it. */
  readonly name?: string | undefined;
  /** Omitted iff this Entry does not span (ADR 0012). Present with `end` iff it draws a bar. */
  readonly start?: Instant | undefined;
  /** Exclusive — see plans/01 §5. Omitted iff this Entry does not span (ADR 0012). */
  readonly end?: Instant | undefined;
  readonly segments: readonly Segment[];

  /** The one by-key value door: a core key, a `props` key, or a `compute` Field. Every answer is
   *  live, and every answer is what its Field declares: a stored key answers the stored value,
   *  `'parentId'` included, and a `compute` key answers what it computes (ADR 0024). The tree has
   *  its own doors — `parent()` and `read('hierarchyParentId')` — because a plugin-owned hierarchy
   *  (ADR 0020) can make the tree disagree with the stored `parentId`, on purpose. */
  read<K extends FieldKey>(field: K): FieldValue<TProps, K> | undefined;

  /** Core's sixth Field, computed from `start` and `end` through `time/` under the Dataset's own
   *  `measureDuration` policy. It allocates, so it carries parentheses. `undefined` iff this Entry
   *  does not span (ADR 0012) — never `NaN`. */
  duration(): Duration | undefined;

  /** Free: a cached index read, no allocation. */
  readonly hasChildren: boolean;
  children(): readonly Entry<TProps>[];
  parent(): Entry<TProps> | undefined;
  /** Every Entry below this one, deepest included. It walks, so it carries parentheses. */
  descendants(): readonly Entry<TProps>[];
  /** How many ancestors this row has. Read off a cached index, so it does no work here. */
  readonly depth: number;

  /** The loose input shape, and exactly what `entries.add()` takes. It is how a row is copied:
   *  `entries.add({ ...entry.toInput(), id: 'copy-1' })`. It is not a second read door — nothing in
   *  a renderer, a rule or a capability calls it. */
  toInput(): EntryInput<TProps>;
}
