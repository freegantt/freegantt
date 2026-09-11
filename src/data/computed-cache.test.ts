import { describe, expect, it } from 'vitest';
import { ComputedFieldCache } from './computed-cache.js';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';

describe('ComputedFieldCache (D-S4-10)', () => {
  it('recomputes after the dataset revision bumps', () => {
    const cache = new ComputedFieldCache();
    let calls = 0;
    const read = (): number => {
      calls += 1;
      return calls;
    };

    expect(cache.read(entryId('t1'), 'duration', 0, read)).toBe(1);
    expect(cache.read(entryId('t1'), 'duration', 0, read)).toBe(1);

    expect(cache.read(entryId('t1'), 'duration', 1, read)).toBe(2);
    expect(cache.read(entryId('t1'), 'duration', 1, read)).toBe(2);
  });

  it('FieldContext.read recomputes a compute Field after commit, not before', () => {
    let calls = 0;
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-02' }],
      fields: [
        {
          key: 'label',
          compute(entry, ctx) {
            calls += 1;
            return `${ctx.read(entry, 'name')}:${calls}`;
          },
        },
      ],
    });
    const before = state.entries.get('t1')!;
    expect(state.fieldContext.read(before, 'label')).toBe('t1:1');
    expect(state.fieldContext.read(before, 'label')).toBe('t1:1');

    state.entries.update('t1', { name: 't2' });
    const after = state.entries.get('t1')!;
    expect(state.fieldContext.read(after, 'label')).toBe('t2:2');
  });

  it('entries.fieldValue uses the same memo as FieldContext.read', () => {
    let calls = 0;
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 't1', start: '2026-01-01', end: '2026-01-02' }],
      fields: [
        {
          key: 'label',
          compute(entry, ctx) {
            calls += 1;
            return `${ctx.read(entry, 'name')}:${calls}`;
          },
        },
      ],
    });
    expect(state.entries.fieldValue('t1', 'label')).toBe('t1:1');
    expect(state.entries.fieldValue('t1', 'label')).toBe('t1:1');
    state.entries.update('t1', { name: 't2' });
    expect(state.entries.fieldValue('t1', 'label')).toBe('t2:2');
  });
});
