import { describe, expect, it, vi } from 'vitest';
import { entryId, rowId } from '../model/index.js';
import type { Entry, EntryId, RowId } from '../model/index.js';
import type { EntryDoubleValues } from '../layout/entry-double.js';
import { entryDoubles } from '../layout/entry-double.js';
import { TreeCollapse } from './tree-collapse.js';
import type { TreeCollapseContext, TreeCollapseRow } from './tree-collapse.js';
import type { CollapseChange } from './collapse-state.js';

function stored(id: string, parentId?: string): EntryDoubleValues {
  return { id, start: 0, end: 1, ...(parentId !== undefined ? { parentId } : {}) };
}

function row(
  id: string,
  expandable: boolean,
  expanded: boolean,
  entryIds: readonly string[] = [id],
): TreeCollapseRow {
  return {
    id: rowId(id),
    expandable,
    expanded,
    entryIds: entryIds.map((value) => entryId(value)),
  };
}

function makeCollapse(
  options: {
    plannedRows?: TreeCollapseRow[];
    entries?: readonly Entry[];
    selected?: EntryId;
    canSelect?: (id: EntryId) => boolean;
    rowIdForEntry?: (id: EntryId) => RowId | undefined;
    ancestorRowIds?: (id: EntryId) => readonly RowId[];
    expandableOfRow?: (id: RowId) => boolean | undefined;
  } = {},
): {
  tree: TreeCollapse;
  confirm: ReturnType<typeof vi.fn<(change: CollapseChange) => boolean>>;
  announce: ReturnType<typeof vi.fn<(change: CollapseChange) => void>>;
  proposeSelection: ReturnType<typeof vi.fn>;
} {
  const confirm = vi.fn<(change: CollapseChange) => boolean>(() => true);
  const announce = vi.fn<(change: CollapseChange) => void>();
  const proposeSelection = vi.fn();
  const plannedRows = options.plannedRows ?? [];
  const entries = options.entries ?? [];
  const selected = options.selected;
  const canSelect = options.canSelect ?? (() => true);
  const ctx: TreeCollapseContext = {
    plannedRows: () => plannedRows,
    entries: () => entries,
    entry: (id) => entries.find((candidate) => candidate.id === id),
    canSelect,
    selected: () => selected,
    proposeSelection,
    confirm,
    announce,
    rowIdForEntry: options.rowIdForEntry ?? ((id) => rowId(id)),
    ancestorRowIds:
      options.ancestorRowIds ??
      ((id) => {
        const ids: RowId[] = [];
        let current = entries.find((candidate) => candidate.id === id);
        for (let above = current?.parent(); above !== undefined; above = above.parent()) {
          ids.push(rowId(String(above.id)));
          current = above;
        }
        return ids;
      }),
    expandableOfRow:
      options.expandableOfRow ?? ((id) => plannedRows.find((candidate) => candidate.id === id)?.expandable),
  };
  const tree = new TreeCollapse(ctx);
  return { tree, confirm, announce, proposeSelection };
}

describe('TreeCollapse', () => {
  it('two instances hold independent sets', () => {
    const a = makeCollapse().tree;
    const b = makeCollapse().tree;
    a.hydrate(['p1']);
    expect(a.ids).toEqual([rowId('p1')]);
    expect(b.ids).toEqual([]);
  });

  it('confirm is skipped when the id list is unchanged', () => {
    const { tree, confirm } = makeCollapse();
    tree.expandAll();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a removed entry id stays in the set until the caller drops it', () => {
    const { tree } = makeCollapse();
    tree.hydrate(['gone']);
    expect(tree.ids).toEqual([rowId('gone')]);
  });

  it('collapseAll collects expandable planned row ids, including grouped headers', () => {
    const { tree, confirm } = makeCollapse({
      plannedRows: [
        row('group:alpha', true, true, []),
        row('leaf', false, false),
        row('group:beta', true, true, []),
      ],
    });

    tree.collapseAll();

    expect(confirm).toHaveBeenCalledWith({
      from: [],
      to: [rowId('group:alpha'), rowId('group:beta')],
    });
    expect(tree.ids).toEqual([rowId('group:alpha'), rowId('group:beta')]);
  });

  it('collapseAll keeps ids already in the set and adds visible expandable rows', () => {
    const { tree, confirm } = makeCollapse({
      plannedRows: [row('p', true, false)],
    });
    tree.hydrate(['nested']);

    tree.collapseAll();

    expect(confirm).toHaveBeenCalledWith({
      from: [rowId('nested')],
      to: [rowId('nested'), rowId('p')],
    });
  });

  it('expandAll writes an empty set when anything is collapsed', () => {
    const { tree, confirm } = makeCollapse();
    tree.hydrate(['p']);

    tree.expandAll();

    expect(confirm).toHaveBeenCalledWith({ from: [rowId('p')], to: [] });
    expect(tree.ids).toEqual([]);
  });

  it('handleArrow right expands a collapsed expandable row', () => {
    const { tree, confirm } = makeCollapse({
      plannedRows: [row('p', true, false)],
      entries: entryDoubles([stored('p'), stored('c', 'p')]),
      selected: entryId('p'),
    });
    tree.hydrate(['p']);

    expect(tree.handleArrow('right')).toBe(true);
    expect(confirm).toHaveBeenCalledWith({ from: [rowId('p')], to: [] });
  });

  it('handleArrow right on an expanded row selects the first child', () => {
    const { tree, confirm, proposeSelection } = makeCollapse({
      plannedRows: [row('p', true, true)],
      entries: entryDoubles([stored('p'), stored('c', 'p')]),
      selected: entryId('p'),
    });

    expect(tree.handleArrow('right')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(proposeSelection).toHaveBeenCalledWith([entryId('c')]);
  });

  it('handleArrow left collapses an expanded row', () => {
    const { tree, confirm } = makeCollapse({
      plannedRows: [row('p', true, true)],
      entries: entryDoubles([stored('p')]),
      selected: entryId('p'),
    });

    expect(tree.handleArrow('left')).toBe(true);
    expect(confirm).toHaveBeenCalledWith({ from: [], to: [rowId('p')] });
  });

  it('handleArrow left on a leaf selects a selectable parent', () => {
    const { tree, proposeSelection } = makeCollapse({
      plannedRows: [row('c', false, false)],
      entries: entryDoubles([stored('p'), stored('c', 'p')]),
      selected: entryId('c'),
    });

    expect(tree.handleArrow('left')).toBe(true);
    expect(proposeSelection).toHaveBeenCalledWith([entryId('p')]);
  });

  it('expandAncestorsOf drops collapsed ancestor row ids, including group headers (D4)', () => {
    const header = rowId('group:red');
    const { tree, confirm } = makeCollapse({
      entries: entryDoubles([stored('a')]),
      rowIdForEntry: () => rowId('a'),
      ancestorRowIds: () => [header],
    });
    tree.hydrate([String(header), 'other']);

    expect(tree.expandAncestorsOf(entryId('a'))).toBe(true);
    expect(confirm).toHaveBeenCalledWith({
      from: [header, rowId('other')],
      to: [rowId('other')],
    });
  });

  it('expandAncestorsOf is a no-op when no ancestor is collapsed', () => {
    const { tree, confirm } = makeCollapse({
      entries: entryDoubles([stored('p'), stored('c', 'p')]),
    });
    tree.hydrate(['other']);

    expect(tree.expandAncestorsOf(entryId('c'))).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a vetoed confirm leaves the set unchanged', () => {
    const { tree, confirm } = makeCollapse();
    confirm.mockReturnValue(false);
    tree.collapse('p');
    expect(tree.ids).toEqual([]);
  });

  describe('resetToStartState (#496 L2)', () => {
    it('returns to the set hydrate wrote, dropping every collapse made since', () => {
      const { tree, announce } = makeCollapse();
      tree.hydrate(['p1']);
      tree.collapse('p2');
      expect(tree.ids).toEqual([rowId('p1'), rowId('p2')]);

      tree.resetToStartState();

      expect(tree.ids).toEqual([rowId('p1')]);
      expect(announce).toHaveBeenCalledWith({
        from: [rowId('p1'), rowId('p2')],
        to: [rowId('p1')],
      });
    });

    it('returns to an empty set when hydrate was never called', () => {
      const { tree, announce } = makeCollapse();
      tree.collapse('p1');

      tree.resetToStartState();

      expect(tree.ids).toEqual([]);
      expect(announce).toHaveBeenCalledWith({ from: [rowId('p1')], to: [] });
    });

    it('is a no-op, and announces nothing, when the set already matches the start state', () => {
      const { tree, announce } = makeCollapse();
      tree.hydrate(['p1']);

      tree.resetToStartState();

      expect(tree.ids).toEqual([rowId('p1')]);
      expect(announce).not.toHaveBeenCalled();
    });

    it('never asks confirm — a load already committed, so there is no gesture to veto', () => {
      const { tree, confirm } = makeCollapse();
      tree.hydrate(['p1']);
      tree.collapse('p2');
      confirm.mockClear();

      tree.resetToStartState();

      expect(confirm).not.toHaveBeenCalled();
    });
  });

  describe('collapseStateOf', () => {
    it('answers leaf for a row that cannot expand', () => {
      const { tree } = makeCollapse({ expandableOfRow: () => false });
      expect(tree.collapseStateOf('c')).toBe('leaf');
    });

    it('answers expanded for an expandable row not in the collapsed set', () => {
      const { tree } = makeCollapse({ expandableOfRow: () => true });
      expect(tree.collapseStateOf('p')).toBe('expanded');
    });

    it('answers collapsed for an expandable row in the collapsed set', () => {
      const { tree } = makeCollapse({ expandableOfRow: () => true });
      tree.hydrate(['p']);
      expect(tree.collapseStateOf('p')).toBe('collapsed');
    });

    it('answers undefined for an id no current row holds — a removed row or a stale id', () => {
      const { tree } = makeCollapse({ expandableOfRow: () => undefined });
      expect(tree.collapseStateOf('gone')).toBeUndefined();
    });

    it('answers a collapsed ancestor’s hidden child from the row tree, not the frame', () => {
      // The row is hidden under a collapsed ancestor, so it carries no `plannedRows` entry — only
      // `expandableOfRow`, sourced from the row tree, still knows about it (#424).
      const { tree } = makeCollapse({
        plannedRows: [],
        expandableOfRow: (id) => (String(id) === 'child' ? true : undefined),
      });
      tree.hydrate(['parent']);
      expect(tree.collapseStateOf('child')).toBe('expanded');
    });

    it('answers a grouping header row by the same rule as any other row', () => {
      const { tree } = makeCollapse({ expandableOfRow: () => true });
      tree.hydrate(['group:alpha']);
      expect(tree.collapseStateOf('group:alpha')).toBe('collapsed');
    });
  });
});
