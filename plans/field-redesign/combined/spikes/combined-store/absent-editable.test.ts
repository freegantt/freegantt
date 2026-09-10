import { describe, expect, it } from 'vitest';
import { CombinedStore } from './combined-store.js';
import { FieldNotEditableError } from './errors.js';
import { gridCanWrite } from './grid.js';

/** Q17 — absent editable means API may write; split cannot claim I14 for absent Fields. */
describe('absent editable — decision 18', () => {
  it('update({ parentId }) stays true with no column', () => {
    const store = new CombinedStore({ fields: [{ key: 'owner' }] });
    store.add({ id: 'p', owner: 'a' });
    store.add({ id: 'c', parentId: 'p' });
    store.update('c', { parentId: 'p' });
    expect(store.get('c').parentId).toBe('p');
  });

  it('update({ kind }) writes while grid says not writable for absent editable', () => {
    const store = new CombinedStore({ fields: [{ key: 'owner' }] });
    store.add({ id: 't1', kind: 'span' });
    store.update('t1', { kind: 'group' });
    expect(store.get('t1').kind).toBe('group');
    const ctx = { id: 't1', hasChildren: false, followChildren: true };
    expect(gridCanWrite('kind', store.declared, ctx)).toBe(false);
  });

  it('explicit false throws FieldNotEditableError', () => {
    const store = new CombinedStore({ fields: [{ key: 'owner', editable: false }] });
    store.add({ id: 't1', owner: 'a' });
    expect(() => store.update('t1', { owner: 'b' })).toThrow(FieldNotEditableError);
  });
});
