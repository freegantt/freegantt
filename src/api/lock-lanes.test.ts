// api/ — other locks are plugins. The core lock protects only its own row. An app that needs a
// wider lock composes the public `ctx.edits` seams. Each lane below builds one from a plugin, with
// no import from `data/`, to prove the seams are enough.

import { describe, expect, it } from 'vitest';
import { barMovesOf, Dataset, placeableOf, removableOf } from './dataset.js';
import type { DataPlugin, EntryId, FieldLockQuery } from './index.js';

/** Lock the whole subtree: the root and every descendant close their cells, refuse a drop in or out,
 *  refuse a removal, and freeze the root's summary bar. */
function lockWholeSubtree(root: EntryId | string): DataPlugin {
  const inSubtree = (entry: FieldLockQuery | undefined): boolean =>
    entry !== undefined && (entry.id === root || entry.isDescendantOf(root));
  return {
    id: 'demo.lockWholeSubtree',
    data(ctx) {
      ctx.edits.setLockRule((next) => (entry, field) => {
        const answer = next(entry, field);
        return inSubtree(entry) && answer === 'anywhere' ? 'api' : answer;
      });
      ctx.edits.setPlaceRule((next) => (place) => {
        const answer = next(place);
        const crossesTheBorder = inSubtree(place.entry) || inSubtree(place.parent);
        return crossesTheBorder && answer === 'anywhere' ? 'api' : answer;
      });
      ctx.edits.setRemoveRule((next) => (removal) => {
        const answer = next(removal);
        return inSubtree(removal.entry) && answer === 'anywhere' ? 'api' : answer;
      });
      ctx.edits.setBarMoveRule((next) => (entry) => (inSubtree(entry) ? false : next(entry)));
    },
  };
}

/** Lock the children list: no child joins, leaves or reorders under the parent, and no child is
 *  removed. The parent's own cells stay open. */
function lockChildrenList(parent: EntryId | string): DataPlugin {
  return {
    id: 'demo.lockChildrenList',
    data(ctx) {
      ctx.edits.setPlaceRule((next) => (place) => {
        const answer = next(place);
        const touchesTheList = place.parent?.id === parent || place.currentParent?.id === parent;
        return touchesTheList && answer === 'anywhere' ? 'api' : answer;
      });
      ctx.edits.setRemoveRule((next) => (removal) => {
        const answer = next(removal);
        return removal.currentParent?.id === parent && answer === 'anywhere' ? 'api' : answer;
      });
    },
  };
}

function treeWith(plugin: DataPlugin): Dataset {
  return new Dataset({
    timeZone: 'UTC',
    entries: [
      { id: 'p', name: 'p' },
      { id: 'c1', parentId: 'p', name: 'c1', start: '2026-01-01', end: '2026-01-03' },
      { id: 'g1', parentId: 'c1', name: 'g1', start: '2026-01-01', end: '2026-01-02' },
      { id: 'c2', parentId: 'p', name: 'c2', start: '2026-01-04', end: '2026-01-06' },
      { id: 'other', name: 'other', start: '2026-01-01', end: '2026-01-02' },
    ],
    plugins: [plugin],
  });
}

describe('lock the whole subtree, built from a plugin', () => {
  const build = (): Dataset => treeWith(lockWholeSubtree('p'));

  it('closes the cells of the root and of a deep descendant', () => {
    const dataset = build();

    expect(dataset.editableOf('p', 'name')).toBe('api');
    expect(dataset.editableOf('g1', 'name')).toBe('api');
    expect(dataset.editableOf('other', 'name')).toBe('anywhere');
  });

  it('refuses a drop into the subtree', () => {
    expect(placeableOf(build(), 'other', 'c1')).toBe('api');
  });

  it('refuses a drop out of the subtree', () => {
    expect(placeableOf(build(), 'g1', undefined)).toBe('api');
  });

  it('refuses a reorder inside the subtree', () => {
    expect(placeableOf(build(), 'c1', 'p')).toBe('api');
  });

  it('refuses the removal of any member', () => {
    const dataset = build();

    expect(removableOf(dataset, 'g1')).toBe('api');
    expect(removableOf(dataset, 'other')).toBe('anywhere');
  });

  it('freezes the bar of every member', () => {
    const dataset = build();

    expect(barMovesOf(dataset, 'p')).toBe(false);
    expect(barMovesOf(dataset, 'g1')).toBe(false);
    expect(barMovesOf(dataset, 'other')).toBe(true);
  });

  it('still lets app code write a member', () => {
    const dataset = build();

    dataset.entries.update('g1', { parentId: 'p' });

    expect(dataset.entries.get('g1')?.read('parentId')).toBe('p');
  });
});

describe('lock the children list, built from a plugin', () => {
  const build = (): Dataset => treeWith(lockChildrenList('p'));

  it('refuses a child that joins the list', () => {
    expect(placeableOf(build(), 'other', 'p')).toBe('api');
  });

  it('refuses a child that leaves the list', () => {
    expect(placeableOf(build(), 'c1', undefined)).toBe('api');
  });

  it('refuses a reorder inside the list', () => {
    expect(placeableOf(build(), 'c1', 'p')).toBe('api');
  });

  it('refuses the removal of a child, and of the parent that holds it', () => {
    const dataset = build();

    expect(removableOf(dataset, 'c1')).toBe('api');
    expect(removableOf(dataset, 'p')).toBe('api');
  });

  it('leaves the parent’s own cells open', () => {
    const dataset = build();

    expect(dataset.editableOf('p', 'name')).toBe('anywhere');
    expect(placeableOf(dataset, 'p', undefined)).toBe('anywhere');
  });

  it('leaves the bar of every child free', () => {
    const dataset = build();

    expect(barMovesOf(dataset, 'c1')).toBe(true);
    expect(dataset.editableOf('c1', 'name')).toBe('anywhere');
  });

  it('leaves a grandchild free to move within its own parent', () => {
    expect(placeableOf(build(), 'g1', 'c1')).toBe('anywhere');
  });
});
