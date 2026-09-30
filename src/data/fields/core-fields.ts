// data/ — core Fields are ordinary declarations. A core key reads and writes the Entry
// directly, never `props` (ADR 0011). `progress` is not declared (ADR 0008).

import type { Duration, Field, FieldKey } from '../../model/index.js';
import { spansTime } from '../../model/index.js';
import { diffMs, formatInclusiveDate } from '../../time/index.js';

const byReference = (from: unknown, to: unknown): boolean => from === to;

export const CORE_FIELDS: readonly Field[] = Object.freeze([
  {
    key: 'name',
    type: 'text',
    equals: byReference,
    // #142: a stored, ordinary value with nothing else that ever rewrites it — nothing refuses an
    // edit here by default. ADR 0015 states the word rather than the alias: `'anywhere'` is what
    // `true` already meant.
    editable: 'anywhere',
    // #139: the Name column carries the tree indent and twisty on top of its text, so its natural
    // width is wider than a date's.
    column: { header: 'Name', width: 240 },
  },
  {
    key: 'start',
    type: 'date',
    rollUp: 'min',
    equals: byReference,
    // #142: one answer gates the inline cell editor and bar drag-resize alike (I14) —
    // `'anywhere'` is what every span kind already allowed a resize drag to write before this Field
    // existed. A consumer locks it with `{ key: 'start', editable: false }` (ADR 0015).
    editable: 'anywhere',
    column: { header: 'Start', width: 120 },
  },
  {
    key: 'end',
    type: 'date',
    rollUp: 'max',
    equals: byReference,
    // A stored `end` is the boundary after the entry, not its last covered day — `end` shows the
    // last day it covers instead. The `date` type still supplies compare. A consumer replaces this
    // with any `formatValue` of its own (`CORE_FIELD_OVERRIDABLE_KEYS`).
    formatValue: formatInclusiveDate,
    // #142: see `start` above — the same one answer, the same reason.
    editable: 'anywhere',
    column: { header: 'End', width: 120 },
  },
  {
    key: 'parentId',
    type: 'entryId',
    equals: byReference,
    // A drag may re-parent (#425). The grid shows the id and offers no editor for it (`entryId`
    // ships no `parseValue`).
    editable: 'anywhere',
  },
  {
    // An ordinary Field, stored on every Entry (ADR 0034) — no `column` of its own, so the grid never
    // shows a "siblingIndex" header unless a consumer lists it in `gridColumns`; `type: 'number'`
    // still gives it a column then, the same default every number Field falls back to. `editable:
    // 'anywhere'`: an explicit write moves the entry, and the write's own group renumbers around it
    // in the same transaction (`entry-store.ts`).
    key: 'siblingIndex',
    type: 'number',
    equals: byReference,
    editable: 'anywhere',
  },
  {
    // A lock refuses a gesture on every other cell of this Entry (ADR 0038). The default grid
    // still shows no "locked" header: `gridColumns` lists `name`, `start` and `end` only. When a
    // consumer lists `'locked'`, the cell is a checkbox and a user toggles the lock. An app closes
    // that column with `capabilities.edit` or a lock rule.
    key: 'locked',
    type: 'boolean',
    equals: byReference,
    inputType: 'checkbox',
    editable: 'anywhere',
    column: { header: 'Locked', align: 'center', width: 80 },
  },
  {
    // How long does this row run? Its own span, `end - start`, and nothing once a date is missing.
    // A parent's `start` and `end` roll up, so its span counts the gaps between its children.
    key: 'duration',
    type: 'duration',
    compute: (entry): Duration | undefined =>
      spansTime(entry) ? { value: diffMs(entry.end, entry.start), unit: 'millisecond' } : undefined,
    column: { header: 'Duration', align: 'end', width: 100 },
  },
  {
    // The tree's own by-key door (ADR 0024): the answer `entry.parent()?.id` gives, computed on
    // read, never stored. `parentId` above stays the authored value — a plugin-owned hierarchy
    // source (ADR 0020) can make the two disagree, on purpose.
    key: 'hierarchyParentId',
    compute: (_entry, ctx) => ctx.hierarchyParentId(),
    column: { header: 'Parent', width: 120 },
  },
]);

/** Whether `key` names one of the Fields above — a core Field a consumer never overrides its way
 *  out of (`FieldRegistry`'s override rules ask this before a consumer declaration wins a key). */
export function isCoreFieldKey(key: FieldKey): boolean {
  return CORE_FIELDS.some((field) => field.key === key);
}
