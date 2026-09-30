import { describe, expect, it } from 'vitest';
import { entryStepRefusalMessage, resolveEntryStep } from './entry-step.js';
import { EntryStepTree } from './entry-step-tree.js';
import type { EntryStep, EntryStepInput, EntryStepVerdict } from './entry-step.js';
import type { RowsForDrop } from '../layout/row-drop-target.js';
import { PLANNED_ROW_KIND } from '../layout/rows/row-source.js';
import type { PlannedRow } from '../layout/rows/row-source.js';
import { entryDoubles } from '../layout/entry-double.js';
import { rowId } from '../model/index.js';
import type { Entry } from '../model/index.js';

// P1{a, b, c}, P2{d}, r, g. Root order: P1, P2, r, g. `r` draws its children as segments.
const [P1, a, b, c, P2, d, r, g] = entryDoubles([
  { id: 'P1', props: { siblingIndex: 0 } },
  { id: 'a', parentId: 'P1', props: { siblingIndex: 0 } },
  { id: 'b', parentId: 'P1', props: { siblingIndex: 1 } },
  { id: 'c', parentId: 'P1', props: { siblingIndex: 2 } },
  { id: 'P2', props: { siblingIndex: 1 } },
  { id: 'd', parentId: 'P2', props: { siblingIndex: 0 } },
  { id: 'r', props: { siblingIndex: 2 } },
  { id: 'g', props: { siblingIndex: 3 } },
]) as [Entry, Entry, Entry, Entry, Entry, Entry, Entry, Entry];

function entryRow(entry: Entry, overrides: Partial<PlannedRow> = {}): PlannedRow {
  return {
    id: rowId(entry.id),
    kind: PLANNED_ROW_KIND.entry,
    index: 0,
    depth: entry.depth,
    entryIds: [entry.id],
    expandable: entry.hasChildren,
    expanded: entry.hasChildren,
    ...overrides,
  };
}

const ROWS: RowsForDrop = {
  rows: [P1, a, b, c, P2, d, r, g].map((entry) =>
    entryRow(entry, entry === r ? { childrenAsSegments: true } : {}),
  ),
  rowTop: (index) => index * 32,
  rowHeightAt: () => 32,
  entryOf: (id) => [P1, a, b, c, P2, d, r, g].find((entry) => entry.id === id),
  rootEntries: () => [P1, P2, r, g],
};

function resolve(
  entry: Entry,
  step: EntryStep,
  overrides: Partial<EntryStepInput> = {},
  tree?: EntryStepTree,
): EntryStepVerdict {
  return resolveEntryStep(
    {
      entry,
      step,
      rows: ROWS,
      canPlace: () => true,
      verticalDropOffered: true,
      ...overrides,
    },
    tree,
  );
}

function placed(verdict: EntryStepVerdict): { parentId: unknown; index: number } {
  if (verdict.kind !== 'place') throw new Error(`expected a place, got a refusal: ${verdict.reason}`);
  return { parentId: verdict.place.parentId, index: verdict.place.index };
}

describe('resolveEntryStep', () => {
  describe('up', () => {
    it('swaps with the sibling above', () => {
      expect(placed(resolve(b, 'up'))).toEqual({ parentId: P1.id, index: 0 });
    });

    it('moves a root above its previous root', () => {
      expect(placed(resolve(r, 'up'))).toEqual({ parentId: undefined, index: 1 });
    });

    it('refuses the first sibling', () => {
      expect(resolve(a, 'up')).toEqual({ kind: 'refused', reason: 'firstSibling' });
      expect(resolve(P1, 'up')).toEqual({ kind: 'refused', reason: 'firstSibling' });
    });
  });

  describe('down', () => {
    it('swaps with the sibling below', () => {
      expect(placed(resolve(b, 'down'))).toEqual({ parentId: P1.id, index: 3 });
    });

    it('moves a parent past the next sibling with its whole subtree', () => {
      expect(placed(resolve(P1, 'down'))).toEqual({ parentId: undefined, index: 2 });
    });

    it('refuses the last sibling', () => {
      expect(resolve(c, 'down')).toEqual({ kind: 'refused', reason: 'lastSibling' });
      expect(resolve(g, 'down')).toEqual({ kind: 'refused', reason: 'lastSibling' });
    });
  });

  describe('indent', () => {
    it('makes the Entry the last child of the sibling above', () => {
      expect(placed(resolve(P2, 'indent'))).toEqual({ parentId: P1.id, index: 3 });
    });

    it('makes the Entry the first child of a sibling with no children', () => {
      expect(placed(resolve(b, 'indent'))).toEqual({ parentId: a.id, index: 0 });
    });

    it('refuses an Entry with no sibling above', () => {
      expect(resolve(a, 'indent')).toEqual({ kind: 'refused', reason: 'noSiblingAbove' });
      expect(resolve(P1, 'indent')).toEqual({ kind: 'refused', reason: 'noSiblingAbove' });
    });
  });

  describe('outdent', () => {
    it('makes the Entry the next sibling of its old parent', () => {
      expect(placed(resolve(b, 'outdent'))).toEqual({ parentId: undefined, index: 1 });
    });

    it('leaves the later siblings with the old parent and writes one Entry', () => {
      const verdict = resolve(b, 'outdent');

      expect(verdict.kind === 'place' && verdict.moves.map((move) => move.id)).toEqual([b.id]);
    });

    it('reports where the Entry sat and where it lands', () => {
      const verdict = resolve(b, 'outdent');

      expect(verdict.kind === 'place' && verdict.moves[0]).toMatchObject({
        place: { parentId: undefined, siblingIndex: 1 },
        currentPlace: { parentId: P1.id, siblingIndex: 1 },
      });
    });

    it('refuses a root Entry', () => {
      expect(resolve(P1, 'outdent')).toEqual({ kind: 'refused', reason: 'topLevel' });
    });
  });

  describe('the rules a drop asks', () => {
    it('refuses with capability when the Entry may not reorder at all', () => {
      expect(resolve(b, 'up', { canPlace: () => false })).toEqual({ kind: 'refused', reason: 'capability' });
    });

    it('refuses with parentLocked when only the new parent refuses', () => {
      const canPlace: EntryStepInput['canPlace'] = (_entry, parentId) => parentId === P1.id;

      expect(resolve(b, 'outdent', { canPlace })).toEqual({ kind: 'refused', reason: 'parentLocked' });
    });

    it('lets a same-parent step through when only a crossing is closed', () => {
      const canPlace: EntryStepInput['canPlace'] = (_entry, parentId) => parentId === P1.id;

      expect(placed(resolve(b, 'up', { canPlace }))).toEqual({ parentId: P1.id, index: 0 });
    });

    it('refuses every step when the rows do not follow the tree', () => {
      for (const step of ['up', 'down', 'indent', 'outdent'] as const) {
        expect(resolve(b, step, { verticalDropOffered: false })).toEqual({
          kind: 'refused',
          reason: 'rowsOutOfTreeOrder',
        });
      }
    });

    it('still indents under a row that draws its children as segments', () => {
      expect(placed(resolve(g, 'indent', { verticalDropOffered: false }))).toEqual({
        parentId: r.id,
        index: 0,
      });
      expect(resolve(r, 'indent', { verticalDropOffered: false })).toEqual({
        kind: 'refused',
        reason: 'rowsOutOfTreeOrder',
      });
    });
  });
});

describe('a run of steps over one tree', () => {
  /** Resolves each Entry in turn, like the pipeline, and lets the tree hear about every step that lands. */
  function run(entries: readonly Entry[], step: EntryStep): string[] {
    const tree = new EntryStepTree(ROWS);
    return entries.map((entry) => {
      const verdict = resolve(entry, step, {}, tree);
      if (verdict.kind === 'place') tree.place(verdict.moves[0]!);
      return verdict.kind === 'place'
        ? `${entry.id}@${String(verdict.place.parentId)}:${verdict.place.index}`
        : `${entry.id}:${verdict.reason}`;
    });
  }

  it('indents two siblings top to bottom into the same parent', () => {
    expect(run([b, c], 'indent')).toEqual(['b@a:0', 'c@a:1']);
  });

  it('indents two siblings bottom to top into nested parents, which is the wrong order', () => {
    expect(run([c, b], 'indent')).toEqual(['c@b:0', 'b@a:0']);
  });

  it('outdents two siblings bottom to top without swapping them', () => {
    expect(run([c, b], 'outdent')).toEqual(['c@undefined:1', 'b@undefined:1']);
  });

  it('lets a lower Entry pass a blocked one at the selection edge', () => {
    expect(run([a, b], 'up')).toEqual(['a:firstSibling', 'b@P1:0']);
  });

  it('moves down bottom to top, so the lower Entry makes room', () => {
    expect(run([c, b], 'down')).toEqual(['c:lastSibling', 'b@P1:3']);
  });
});

describe('entryStepRefusalMessage', () => {
  it('keeps the one sentence of a single refused Entry', () => {
    expect(entryStepRefusalMessage([{ id: a.id, reason: 'firstSibling' }], 0)).toBe(
      'Nothing moved. This entry is the first of its siblings.',
    );
  });

  it('names every refused Entry when nothing moved', () => {
    expect(
      entryStepRefusalMessage(
        [
          { id: a.id, reason: 'firstSibling' },
          { id: P1.id, reason: 'firstSibling' },
        ],
        0,
      ),
    ).toBe('Nothing moved. These entries stay in place: a, P1.');
  });

  it('says some Entries did not move when others moved', () => {
    expect(entryStepRefusalMessage([{ id: a.id, reason: 'firstSibling' }], 2)).toBe(
      'Some entries did not move. These entries stay in place: a.',
    );
  });
});
