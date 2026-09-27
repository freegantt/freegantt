import { describe, expect, it } from 'vitest';
import { entryId } from '../../model/index.js';
import type { ComputeContext, Instant, StoredEntry } from '../../model/index.js';
import { CORE_FIELDS } from './core-fields.js';
import { MS } from '../../time/index.js';

const row = (start?: Instant, end?: Instant): StoredEntry => {
  return {
    id: entryId('t1'),
    siblingIndex: 0,
    name: 't1',
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    props: {},
  };
};

/** A `ComputeContext` that throws the moment anything reads it — the `duration` Field's `compute`
 *  must answer from `entry` alone and never ask the pass a question. */
const silentPass = new Proxy(
  {},
  {
    get(_target, prop): never {
      throw new Error(`asked the pass for ${String(prop)}`);
    },
  },
) as ComputeContext;

const durationField = CORE_FIELDS.find((field) => field.key === 'duration');
if (!durationField || !('compute' in durationField)) {
  throw new Error('the duration Field must declare a compute');
}
const compute: typeof durationField.compute = (entry, ctx) => durationField.compute(entry, ctx);

describe('the core duration Field', () => {
  it('computes duration from the row alone, and asks the pass nothing', () => {
    expect(compute(row(0 as Instant, (3 * MS.DAY) as Instant), silentPass)).toEqual({
      value: 3 * MS.DAY,
      unit: 'millisecond',
    });
  });

  it('answers undefined for a row with one date or none, and never NaN', () => {
    expect(compute(row(), silentPass)).toBeUndefined();
    expect(compute(row(0 as Instant), silentPass)).toBeUndefined();
    expect(compute(row(undefined, (3 * MS.DAY) as Instant), silentPass)).toBeUndefined();
  });
});
