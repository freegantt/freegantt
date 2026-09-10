import { describe, expect, it } from 'vitest';
import { FlatUpdateStore } from './flat-update-store.js';

describe('improvement A — drop long form at update()', () => {
  it('update accepts { cost } and rejects { props: { cost } }', () => {
    const store = new FlatUpdateStore({ fields: [{ key: 'cost' }] });
    store.add({ id: 't1', cost: 1 });
    store.update('t1', { cost: 9 });
    expect(store.get('t1').props.cost).toBe(9);
    expect(() => store.update('t1', { props: { cost: 8 } })).toThrow(/shorthand/);
  });

  it('add still accepts props bag', () => {
    const store = new FlatUpdateStore({ fields: [{ key: 'cost' }, { key: 'owner' }] });
    const row = store.add({ id: 't1', props: { cost: 3, owner: 'Sam' } });
    expect(row.props).toEqual({ cost: 3, owner: 'Sam' });
  });
});
