// data/ — core Fields are ordinary declarations (D-S4-4). They always set `source` explicitly so
// omitted-source cannot steal `start` into `meta.start`. `progress` is not declared (ADR 0008).

import type { Duration, Entry, Field, FieldKey, Instant } from '../../model/index.js';
import { DATE_TIME_FORMAT, formatDate, formatEndInclusive, MS } from '../../time/index.js';

const byReference = (from: unknown, to: unknown): boolean => from === to;

// Segment identity is part of the value (#212, ADR 0010): an id-only write — the same start and end,
// a different `SegmentId` — must reach the changeset, or the Selection silently loses what it holds.
const segmentsEqual = (from: unknown, to: unknown): boolean => {
  const a = from as Entry['segments'];
  const b = to as Entry['segments'];
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  return a.every(
    (span, index) => span.id === b[index]?.id && span.start === b[index]?.start && span.end === b[index]?.end,
  );
};

/** Stringifies a primitive Field value for display; anything else (undefined, object) renders empty. */
export function stringifyPrimitive(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function formatStart(value: unknown, ctx: { timeZone: string; locale: Intl.LocalesArgument }): string {
  if (value === undefined || value === null) return '';
  return formatDate(ctx.timeZone, value as Instant, ctx.locale, DATE_TIME_FORMAT);
}

function formatEnd(
  value: unknown,
  ctx: { timeZone: string; locale: Intl.LocalesArgument },
  entry: Entry,
): string {
  if (value === undefined || value === null) return '';
  const span = { start: entry.start, end: value as Instant };
  return formatEndInclusive(ctx.timeZone, span, ctx.locale, DATE_TIME_FORMAT);
}

function formatDuration(value: unknown): string {
  if (value === undefined || value === null) return '';
  const duration = value as Duration;
  const days = duration.value / MS.DAY;
  if (Number.isInteger(days)) return `${days} d`;
  return `${days.toFixed(1)} d`;
}

function compareDuration(a: Duration | undefined, b: Duration | undefined): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return a.value - b.value;
}

export const CORE_FIELDS: readonly Field[] = Object.freeze([
  {
    key: 'name',
    source: { from: 'entry', field: 'name' },
    equals: byReference,
    formatValue: stringifyPrimitive,
    // #142: a stored, ordinary value with nothing else that ever rewrites it — nothing refuses an
    // edit here by default.
    editable: true,
    // #139: the Name column carries the tree indent and twisty on top of its text, so its natural
    // width is wider than a date's.
    column: { header: 'Name', width: 240 },
  },
  {
    key: 'start',
    source: { from: 'entry', field: 'start' },
    rollUp: 'min',
    equals: byReference,
    formatValue: formatStart,
    // #142: one answer gates the inline cell editor and bar drag-resize alike (I14) — `true` is
    // what every span kind already allowed a resize drag to write before this Field existed.
    editable: true,
    column: { header: 'Start', width: 120 },
  },
  {
    key: 'end',
    source: { from: 'entry', field: 'end' },
    rollUp: 'max',
    equals: byReference,
    formatValue: formatEnd,
    // #142: see `start` above — the same one answer, the same reason.
    editable: true,
    column: { header: 'End', width: 120 },
  },
  {
    key: 'kind',
    source: { from: 'entry', field: 'kind' },
    equals: byReference,
    formatValue: stringifyPrimitive,
    column: { header: 'Kind', width: 100 },
  },
  {
    key: 'parentId',
    source: { from: 'entry', field: 'parentId' },
    equals: byReference,
  },
  {
    key: 'segments',
    source: { from: 'entry', field: 'segments' },
    equals: segmentsEqual,
  },
  {
    key: 'meta',
    source: { from: 'entry', field: 'meta' },
    equals: byReference,
  },
  {
    key: 'duration',
    source: {
      from: 'compute',
      read: (entry, ctx) => ctx.durationOf(entry),
    },
    compare: compareDuration,
    formatValue: formatDuration,
    column: { header: 'Duration', align: 'end', width: 100 },
  },
]);

/** Whether `key` names one of the Fields above. `data/` asks twice: the codec never writes a core
 *  Field into a Document, and `FieldRegistry.authored` never reports one as consumer-written. */
export function isCoreFieldKey(key: FieldKey): boolean {
  return CORE_FIELDS.some((field) => field.key === key);
}
