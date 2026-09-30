// api/ — the core lock (ADR 0038): a `Dataset` installs `lockedEntryLockRule`/`lockedEntryPlaceRule`
// (`data/entry-lock.ts`) last, so every consumer meets the same lock with no plugin of their own. The
// parity test at the end proves a plugin author could build the identical rule through the public
// `ctx.edits` seam — the core lock takes no door a plugin cannot also reach.

import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { fieldRowsOf } from '../data/change-set.js';
import { entryId } from './index.js';
import type { DataPlugin, EntryInput } from './index.js';
import { lockedEntryLockRule, lockedEntryPlaceRule } from '../data/entry-lock.js';

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

  it("does not reopen a locked Entry a plugin's own lock rule answers 'anywhere' for", () => {
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

  it("entries.update() of a child still widens a locked parent's rolled-up dates (#610) — the lock stops only the user", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'parent', name: 'Locked parent', locked: true },
        { id: 'child', name: 'Child', parentId: 'parent', start: '2026-01-01', end: '2026-01-05' },
      ],
    });

    dataset.entries.update('child', { end: '2026-01-20' });

    expect(dataset.entries.get('child')?.end).toBe(dataset.entries.get('parent')?.end);
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

describe('the core lock refuses a place into or out of a locked Entry (ADR 0038)', () => {
  function withLockedParent(): Dataset {
    return new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', locked: true },
        { id: 'q', name: 'q' },
        { id: 'c1', parentId: 'p', name: 'c1' },
        { id: 'c2', parentId: 'p', name: 'c2' },
      ],
    });
  }

  it('refuses a gesture landing a new child under a locked parent, api still writes it', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', locked: true },
        { id: 'c', name: 'c' },
      ],
    });

    dataset.entries.update('c', { parentId: 'p' });

    expect(dataset.entries.get('c')?.read('parentId')).toBe(entryId('p'));
  });

  it('refuses giving up a child from a locked parent the same way (isLocked reads currentParentId)', () => {
    const dataset = withLockedParent();

    dataset.entries.update('c1', { parentId: 'q' });

    expect(dataset.entries.get('c1')?.read('parentId')).toBe(entryId('q'));
  });

  it('leaves a same-parent reorder under a locked parent to the next rule — children may reorder', () => {
    const dataset = withLockedParent();

    dataset.entries.update('c1', { siblingIndex: 1 });

    expect(dataset.entries.get('c1')?.read('siblingIndex')).toBe(1);
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
        ctx.edits.setPlaceRule(lockedEntryPlaceRule(isLocked));
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

    withPlugin.entries.update('c1', { parentId: 'q' });
    core.entries.update('c1', { parentId: 'q' });

    expect(withPlugin.entries.get('c1')?.read('parentId')).toEqual(core.entries.get('c1')?.read('parentId'));
  });
});
