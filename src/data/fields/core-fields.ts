// data/ — core Fields are ordinary declarations (D-S4-4). A core key reads and writes the Entry
// directly, never `props` (ADR 0011). `progress` is not declared (ADR 0008).

import type { Entry, Field, FieldKey, Instant } from '../../model/index.js';
import { DATE_TIME_FORMAT, formatEndInclusive } from '../../time/index.js';
import { formatInstant } from './field-types.js';

const byReference = (from: unknown, to: unknown): boolean => from === to;

function formatEnd(
  value: unknown,
  ctx: { timeZone: string; locale: Intl.LocalesArgument },
  entry: Entry,
): string {
  if (value === undefined || value === null) return '';
  // End with no start (ADR 0012) shows the stored end as a plain instant — no inclusive-display
  // adjustment, because there is no paired start to be inclusive against. Guessing one is not this
  // Field's job.
  if (entry.start === undefined) return formatInstant(value, ctx);
  const span = { start: entry.start, end: value as Instant };
  return formatEndInclusive(ctx.timeZone, span, ctx.locale, DATE_TIME_FORMAT);
}

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
    // Inclusive display is this Field's job, not every Instant's. The `date` type still supplies
    // compare, and `formatInstant` as the default that this override replaces.
    formatValue: formatEnd,
    // #142: see `start` above — the same one answer, the same reason.
    editable: 'anywhere',
    column: { header: 'End', width: 120 },
  },
  {
    key: 'parentId',
    equals: byReference,
    // A column object may show this Field. The app writes it through `entries.update()`;
    // the user never types it (ADR 0015 `'api'`).
    editable: 'api',
  },
  {
    key: 'duration',
    type: 'duration',
    compute: (_entry, ctx) => ctx.duration(),
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
