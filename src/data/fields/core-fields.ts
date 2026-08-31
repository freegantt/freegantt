// data/ — core Fields are ordinary declarations (D-S4-4). They always set `source` explicitly so
// omitted-source cannot steal `start` into `meta.start`. `progress` is not declared (ADR 0008).

import type { Entry, Field } from '../../model/index.js';

const byReference = (from: unknown, to: unknown): boolean => from === to;

const segmentsEqual = (from: unknown, to: unknown): boolean => {
  const a = from as Entry['segments'];
  const b = to as Entry['segments'];
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  return a.every((span, index) => span.start === b[index]?.start && span.end === b[index]?.end);
};

export const CORE_FIELDS: readonly Field[] = Object.freeze([
  {
    key: 'name',
    source: { from: 'entry', field: 'name' },
    equals: byReference,
    column: { header: 'Name' },
  },
  {
    key: 'start',
    source: { from: 'entry', field: 'start' },
    rollUp: 'min',
    equals: byReference,
    column: { header: 'Start' },
  },
  {
    key: 'end',
    source: { from: 'entry', field: 'end' },
    rollUp: 'max',
    equals: byReference,
    column: { header: 'End' },
  },
  {
    key: 'kind',
    source: { from: 'entry', field: 'kind' },
    equals: byReference,
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
    column: { header: 'Duration' },
  },
]);
