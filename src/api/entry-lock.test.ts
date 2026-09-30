// api/ — the core lock (ADR 0038, #611): a `Dataset` installs
// `lockedEntryLockRule`/`lockedEntryRemoveRule`/`lockedEntryBarMoveRule` (`data/entry-lock.ts`) first,
// so every consumer meets the same lock with no plugin of their own. A plugin wraps each rule. The parity test at the end proves a
// plugin author could build the identical rule through the public `ctx.edits` seam — the core lock
// takes no door a plugin cannot also reach.

import { describe, expect, it } from 'vitest';
import { barMovesOf, Dataset, placeableOf, removableOf } from './dataset.js';
import { fieldRowsOf } from '../data/change-set.js';
import { entryId, RemoveRefusedError } from './index.js';
import type { DataPlugin, EntryInput } from './index.js';
import { lockedEntryBarMoveRule, lockedEntryLockRule, lockedEntryRemoveRule } from '../data/entry-lock.js';

/** Two root Entries, `a` locked, `b` its next sibling — the shape the renumber test below shares. */
function twoRootEntries(overrides: { a?: Partial<EntryInput>; b?: Partial<EntryInput> } = {}): EntryInput[] {
  return [
    { id: 'a', name: 'a', locked: true, ...overrides.a },
    { id: 'b', name: 'b', ...overrides.b },
  ];
}

describe('the core lock refuses a gesture onto a locked Entry (ADR 0038)', () => {
  it("closes an ordinary cell to a gesture, but leaves 'locked' itself open", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 't1', name: 'Locked', locked: true },
        { id: 't2', name: 'Open' },
      ],
    });

    expect(dataset.editableOf('t1', 'name')).toBe('api');
    expect(dataset.editableOf('t1', 'locked')).toBe('api');
    expect(dataset.editableOf('t2', 'name')).toBe('anywhere');
  });

  it("never widens a Field a declaration already closed to 'never'", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'owner', editable: false }],
      entries: [{ id: 't1', name: 'Locked', locked: true, props: { owner: 'ana' } }],
    });

    expect(dataset.editableOf('t1', 'owner')).toBe('never');
  });

  it("reopens a locked cell a plugin's own lock rule answers 'anywhere' for", () => {
    const opensName: DataPlugin = {
      id: 'demo.opensName',
      data(ctx) {
        ctx.edits.setLockRule(
          (next) => (query, field) => (field === 'name' ? 'anywhere' : next(query, field)),
        );
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Locked', locked: true }],
      plugins: [opensName],
    });

    expect(dataset.editableOf('t1', 'name')).toBe('anywhere');
  });

  it('keeps the lock on a cell when a plugin only calls next', () => {
    const asksNext: DataPlugin = {
      id: 'demo.asksNext',
      data(ctx) {
        ctx.edits.setLockRule((next) => (query, field) => next(query, field));
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Locked', locked: true }],
      plugins: [asksNext],
    });

    expect(dataset.editableOf('t1', 'name')).toBe('api');
  });

  it('entries.update() still writes a locked cell — the lock stops only the user, never app code', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Locked', locked: true }],
    });

    dataset.entries.update('t1', { name: 'Renamed by app code' });

    expect(dataset.entries.get('t1')?.read('name')).toBe('Renamed by app code');
  });

  it('an undo of a lock restores the Entry, in one step', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Locked' }],
    });

    dataset.entries.update('t1', { locked: true });
    expect(dataset.entries.get('t1')?.read('locked')).toBe(true);

    dataset.undo();

    expect(dataset.entries.get('t1')?.read('locked')).toBeUndefined();
    expect(dataset.editableOf('t1', 'name')).toBe('anywhere');
  });
});

describe('a core lock protects only its own row', () => {
  function withLockedParent(): Dataset {
    return new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', locked: true },
        { id: 'q', name: 'q' },
        { id: 'c1', parentId: 'p', name: 'c1' },
        { id: 'c2', parentId: 'p', name: 'c2' },
        { id: 'free', name: 'free' },
      ],
    });
  }

  it('lets a user drop an Entry under a locked parent', () => {
    expect(placeableOf(withLockedParent(), 'free', 'p')).toBe('anywhere');
  });

  it('lets a user drag a child out of a locked parent', () => {
    expect(placeableOf(withLockedParent(), 'c1', 'q')).toBe('anywhere');
  });

  it('lets a child of a locked parent reorder', () => {
    expect(placeableOf(withLockedParent(), 'c1', 'p')).toBe('anywhere');
  });

  it('keeps the cells of a child of a locked parent open', () => {
    const dataset = withLockedParent();

    expect(dataset.editableOf('c1', 'name')).toBe('anywhere');
    expect(dataset.editableOf('c1', 'siblingIndex')).toBe('anywhere');
    expect(removableOf(dataset, 'c1')).toBe('anywhere');
  });

  it('keeps the parent locked when its last child leaves', () => {
    const dataset = withLockedParent();

    dataset.entries.update('c1', { parentId: 'q' });
    dataset.entries.update('c2', { parentId: 'q' });

    expect(dataset.entries.get('p')?.read('locked')).toBe(true);
    expect(dataset.editableOf('p', 'name')).toBe('api');
  });
});

describe('the core lock stops the bar of a locked Entry', () => {
  function withLockedParent(plugins: DataPlugin[] = []): Dataset {
    return new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', locked: true },
        { id: 'c', name: 'c', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
        { id: 'free', name: 'free' },
      ],
      plugins,
    });
  }

  it('answers false for a locked Entry and true for a free one', () => {
    const dataset = withLockedParent();

    expect(barMovesOf(dataset, 'p')).toBe(false);
    expect(barMovesOf(dataset, 'c')).toBe(true);
    expect(barMovesOf(dataset, 'free')).toBe(true);
  });

  it('lets a plugin release a locked bar', () => {
    const releases: DataPlugin = {
      id: 'demo.releasesBar',
      data(ctx) {
        ctx.edits.setBarMoveRule((next) => (entry) => (entry.id === 'p' ? true : next(entry)));
      },
    };

    expect(barMovesOf(withLockedParent([releases]), 'p')).toBe(true);
  });

  it('lets a plugin freeze a free bar', () => {
    const freezes: DataPlugin = {
      id: 'demo.freezesBar',
      data(ctx) {
        ctx.edits.setBarMoveRule((next) => (entry) => (entry.id === 'free' ? false : next(entry)));
      },
    };

    const dataset = withLockedParent([freezes]);

    expect(barMovesOf(dataset, 'free')).toBe(false);
    expect(barMovesOf(dataset, 'c')).toBe(true);
  });

  it('keeps the lock on a bar when a plugin only calls next', () => {
    const asksNext: DataPlugin = {
      id: 'demo.asksNextBar',
      data(ctx) {
        ctx.edits.setBarMoveRule((next) => (entry) => next(entry));
      },
    };

    expect(barMovesOf(withLockedParent([asksNext]), 'p')).toBe(false);
  });
});

describe('the core lock refuses a user delete (#611)', () => {
  function withLockedRow(): Dataset {
    return new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', locked: true },
        { id: 'c', parentId: 'p', name: 'c' },
        { id: 'q', name: 'q' },
      ],
    });
  }

  it('entries.remove() still deletes a locked row and its child — one undo restores both', () => {
    const dataset = withLockedRow();

    dataset.entries.remove('p');
    expect(dataset.entries.has('p')).toBe(false);
    expect(dataset.entries.has('c')).toBe(false);

    dataset.undo();

    expect(dataset.entries.has('p')).toBe(true);
    expect(dataset.entries.has('c')).toBe(true);
  });

  it('entries.remove() still deletes an unlocked ancestor that holds a locked descendant', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'root', name: 'root' },
        { id: 'p', parentId: 'root', name: 'p', locked: true },
      ],
    });

    dataset.entries.remove('root');

    expect(dataset.entries.has('root')).toBe(false);
    expect(dataset.entries.has('p')).toBe(false);
  });

  it("reopens a locked row a plugin's own remove rule answers 'anywhere' for", () => {
    const opensRemove: DataPlugin = {
      id: 'demo.opensRemove',
      data(ctx) {
        ctx.edits.setRemoveRule(() => () => 'anywhere');
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'p', name: 'p', locked: true }],
      plugins: [opensRemove],
    });

    expect(removableOf(dataset, 'p')).toBe('anywhere');
  });

  it('keeps the lock on a delete when a plugin only calls next', () => {
    const asksNext: DataPlugin = {
      id: 'demo.asksNextRemove',
      data(ctx) {
        ctx.edits.setRemoveRule((next) => (removal) => next(removal));
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'p', name: 'p', locked: true }],
      plugins: [asksNext],
    });

    expect(removableOf(dataset, 'p')).toBe('api');
  });

  it("a plugin's own 'never' remove rule still refuses entries.remove() — the core lock never widens it", () => {
    const refuses: DataPlugin = {
      id: 'demo.refusesRemove',
      data(ctx) {
        ctx.edits.setRemoveRule(
          (next) => (removal) => (removal.entry.id === entryId('q') ? 'never' : next(removal)),
        );
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'q', name: 'q' }],
      plugins: [refuses],
    });

    expect(() => dataset.entries.remove('q')).toThrow(RemoveRefusedError);
    expect(dataset.entries.has('q')).toBe(true);
  });
});

describe('a removal extender writes past the remove rule and the lock', () => {
  it('removes a locked parent when its last child goes, the way an edit extender writes past a lock', () => {
    const removesEmptyParent: DataPlugin = {
      id: 'demo.tidy',
      data(ctx) {
        ctx.edits.setRemovalExtender(
          () => (request) =>
            request.removedEntryIds.has(entryId('child')) && !request.hasChildren('parent')
              ? new Set([entryId('parent')])
              : new Set(),
        );
      },
    };
    const refusesParent: DataPlugin = {
      id: 'demo.refuseParent',
      data(ctx) {
        ctx.edits.setRemoveRule(
          (next) => (removal) => (removal.entry.id === 'parent' ? 'never' : next(removal)),
        );
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'parent', name: 'parent', locked: true },
        { id: 'child', name: 'child', parentId: 'parent' },
      ],
      plugins: [removesEmptyParent],
    });
    expect(removableOf(dataset, 'parent')).toBe('api');

    dataset.entries.remove('child');

    expect(dataset.entries.has('parent')).toBe(false);
    expect(dataset.entries.has('child')).toBe(false);

    const refusing = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'parent', name: 'parent' },
        { id: 'child', name: 'child', parentId: 'parent' },
      ],
      plugins: [removesEmptyParent, refusesParent],
    });
    expect(() => refusing.entries.remove('parent')).toThrow(RemoveRefusedError);

    refusing.entries.remove('child');

    expect(refusing.entries.has('parent')).toBe(false);
  });
});

describe('the core lock states an explicit move, not a neighbour renumbering past it (#425)', () => {
  it("a neighbour's renumber writes past a lock; app code still reorders a locked Entry", () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: twoRootEntries() });
    let renumberedARow: unknown;
    dataset.on('change', ({ changeSet }) => {
      renumberedARow = fieldRowsOf(changeSet).find(
        (row) => row.id === entryId('a') && row.field === 'siblingIndex',
      );
    });

    // b, unlocked, moves in front of a: the renumber pass writes a's siblingIndex directly (ADR
    // 0034), never asking the lock rule — a neighbour's move, not a's own explicit one.
    dataset.entries.update('b', { siblingIndex: 0 });

    expect(dataset.entries.get('b')?.read('siblingIndex')).toBe(0);
    expect(dataset.entries.get('a')?.read('siblingIndex')).toBe(1);
    expect(renumberedARow).toBeDefined();

    // app code still reorders a's own siblingIndex explicitly — the lock stops only the user.
    dataset.entries.update('a', { siblingIndex: 0 });

    expect(dataset.entries.get('a')?.read('siblingIndex')).toBe(0);
  });
});

describe('a plugin builds the identical lock through the public ctx.edits seam (parity)', () => {
  /** Reads the `locked` Field straight off the Dataset this plugin joins — the same one call the
   *  core lock itself makes (`api/dataset.ts`). */
  function pluginLock(): DataPlugin {
    let dataset: Dataset | undefined;
    const isLocked = (id: string): boolean => dataset?.entries.get(id)?.read('locked') === true;
    return {
      id: 'demo.parityLock',
      data(ctx) {
        dataset = ctx.dataset;
        ctx.edits.setLockRule(lockedEntryLockRule(isLocked));
        ctx.edits.setRemoveRule(lockedEntryRemoveRule(isLocked));
        ctx.edits.setBarMoveRule(lockedEntryBarMoveRule(isLocked));
      },
    };
  }

  it('answers every core-lock query the same, once installed a second time through a plugin', () => {
    const entries: EntryInput[] = [
      { id: 'p', name: 'p', locked: true },
      { id: 'q', name: 'q' },
      { id: 'c1', parentId: 'p', name: 'c1' },
    ];
    const core = new Dataset({ timeZone: 'UTC', entries: entries.map((entry) => ({ ...entry })) });
    const withPlugin = new Dataset({
      timeZone: 'UTC',
      entries: entries.map((entry) => ({ ...entry })),
      plugins: [pluginLock()],
    });

    expect(withPlugin.editableOf('p', 'name')).toBe(core.editableOf('p', 'name'));
    expect(withPlugin.editableOf('q', 'name')).toBe(core.editableOf('q', 'name'));
    expect(barMovesOf(withPlugin, 'p')).toBe(barMovesOf(core, 'p'));
    expect(barMovesOf(withPlugin, 'q')).toBe(barMovesOf(core, 'q'));
    expect(removableOf(withPlugin, 'p')).toBe(removableOf(core, 'p'));

    withPlugin.entries.update('c1', { parentId: 'q' });
    core.entries.update('c1', { parentId: 'q' });

    expect(withPlugin.entries.get('c1')?.read('parentId')).toEqual(core.entries.get('c1')?.read('parentId'));
  });

  it('removes a locked row the same way — the app door stays open on both', () => {
    const entries: EntryInput[] = [{ id: 'p', name: 'p', locked: true }];
    const core = new Dataset({ timeZone: 'UTC', entries: entries.map((entry) => ({ ...entry })) });
    const withPlugin = new Dataset({
      timeZone: 'UTC',
      entries: entries.map((entry) => ({ ...entry })),
      plugins: [pluginLock()],
    });

    core.entries.remove('p');
    withPlugin.entries.remove('p');

    expect(core.entries.has('p')).toBe(false);
    expect(withPlugin.entries.has('p')).toBe(false);
  });
});
