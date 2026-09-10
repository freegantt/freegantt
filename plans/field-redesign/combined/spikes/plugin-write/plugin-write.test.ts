import { describe, expect, it } from 'vitest';
import { CombinedStore } from '../combined-store/combined-store.js';
import { PluginFieldCollisionError, PluginWriteCollisionError } from '../combined-store/errors.js';
import { composeExtenders, toProposedEdit, type EditExtender } from '../combined-store/extender.js';

describe('plugin write door — Q12 Q13 Q16 improvement G', () => {
  it('shorthand and props path both write scheduling:progress', () => {
    const store = new CombinedStore({ fields: [{ key: 'scheduling:progress' }] });
    store.add({ id: 't1' });
    store.update('t1', { 'scheduling:progress': 60 });
    expect(store.get('t1').props['scheduling:progress']).toBe(60);
    store.update('t1', { props: { 'scheduling:progress': 70 } });
    expect(store.get('t1').props['scheduling:progress']).toBe(70);
  });

  it('bare progress throws collision error naming the plugin', () => {
    const store = new CombinedStore({ fields: [{ key: 'scheduling:progress' }] });
    store.add({ id: 't1' });
    expect(() => store.update('t1', { props: { progress: 60 } })).toThrow(PluginFieldCollisionError);
  });

  it('two plugins writing one Field reports, not last-wins', () => {
    const a: EditExtender = () => new Map([['t1', { props: { owner: 'a' } }]]);
    const b: EditExtender = () => new Map([['t1', { props: { owner: 'b' } }]]);
    const proposed = new Map([['t1', toProposedEdit({}, {})]]);
    expect(() =>
      composeExtenders([{ name: 'plugin-a', fn: a }, { name: 'plugin-b', fn: b }], proposed),
    ).toThrow(PluginWriteCollisionError);
  });
});
