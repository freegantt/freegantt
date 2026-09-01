import { describe, expect, it } from 'vitest';
import { rowId } from '../model/index.js';
import { CollapseState } from './collapse-state.js';

describe('CollapseState [S4-A6]', () => {
  it('two instances hold independent sets', () => {
    const a = new CollapseState();
    const b = new CollapseState();
    const change = a.propose(['p1']);
    expect(change).toEqual({ from: [], to: [rowId('p1')] });
    a.commit(change!.to);
    expect(a.ids).toEqual([rowId('p1')]);
    expect(b.ids).toEqual([]);
  });

  it('propose is a no-op when the id list is unchanged', () => {
    const state = new CollapseState();
    expect(state.propose([])).toBeUndefined();
    const first = state.propose(['p1']);
    state.commit(first!.to);
    expect(state.propose(['p1'])).toBeUndefined();
  });

  it('a removed entry id stays in the set until the caller drops it', () => {
    const state = new CollapseState();
    const change = state.propose(['gone']);
    state.commit(change!.to);
    expect(state.ids).toEqual([rowId('gone')]);
  });
});
