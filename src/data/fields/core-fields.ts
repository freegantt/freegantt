// data/ — core Fields are ordinary declarations (D-S4-4). They always set `source` explicitly so
// omitted-source cannot steal `start` into `meta.start`. `progress` is not declared (ADR 0008).

import type { Duration, Entry, Field, Instant } from '../../model/index.js';
import { DATE_TIME_FORMAT, formatDate, formatEndInclusive, MS } from '../../time/index.js';

const byReference = (from: unknown, to: unknown): boolean => from === to;

const segmentsEqual = (from: unknown, to: unknown): boolean => {
  const a = from as Entry['segments'];
  const b = to as Entry['segments'];
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  return a.every((span, index) => span.start === b[index]?.start && span.end === b[index]?.end);
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function formatStart(value: unknown, ctx: { timeZone: string; locale: Intl.LocalesArgument }): string {
  if (value === undefined || value === null) return '';
  return formatDate(ctx.timeZone, value as Instant, ctx.locale, DATE_TIME_FORMAT);
}

function formatEnd(value: unknown, ctx: { timeZone: string; locale: Intl.LocalesArgument }): string {
  if (value === undefined || value === null) return '';
  return formatEndInclusive(ctx.timeZone, value as Instant, ctx.locale, DATE_TIME_FORMAT);
}

function formatDuration(value: unknown): string {
  if (value === undefined || value === null) return '';
  const duration = value as Duration;
  const days = duration.value / MS.DAY;
  if (Number.isInteger(days)) return `${days} d`;
  return `${days.toFixed(1)} d`;
}

export const CORE_FIELDS: readonly Field[] = Object.freeze([
  {
    key: 'name',
    source: { from: 'entry', field: 'name' },
    equals: byReference,
    formatValue: asText,
    column: { header: 'Name' },
  },
  {
    key: 'start',
    source: { from: 'entry', field: 'start' },
    rollUp: 'min',
    equals: byReference,
    formatValue: formatStart,
    column: { header: 'Start' },
  },
  {
    key: 'end',
    source: { from: 'entry', field: 'end' },
    rollUp: 'max',
    equals: byReference,
    formatValue: formatEnd,
    column: { header: 'End' },
  },
  {
    key: 'kind',
    source: { from: 'entry', field: 'kind' },
    equals: byReference,
    formatValue: asText,
    column: { header: 'Kind' },
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
    formatValue: formatDuration,
    column: { header: 'Duration', align: 'end' },
  },
]);
