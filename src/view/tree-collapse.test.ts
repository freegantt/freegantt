import { describe, expect, it, vi } from 'vitest';
import { entryId, rowId } from '../model/index.js';
import type { Entry, EntryId, Instant, RowId } from '../model/index.js';
import { TreeCollapse } from './tree-collapse.js';
import type { TreeCollapseContext, TreeCollapseRow } from './tree-collapse.js';
import type { CollapseChange } from './collapse-state.js';

function instant(n: number): Instant {
  return n as Instant;
}

function entry(id: string, parentId?: string): Entry {
  const record: Entry = {
    id: entryId(id),
    name: id,
    start: instant(0),
    end: instant(1),
    kind: 'span',
  };
  if (parentId !== undefined) record.parentId = entryId(parentId);
  return record;
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
    entries?: Entry[];
    selected?: EntryId;
    canSelect?: (id: EntryId) => boolean;
    rowIdForEntry?: (id: EntryId) => RowId | undefined;
    ancestorRowIds?: (id: EntryId) => readonly RowId[];
  } = {},
): {
  tree: TreeCollapse;
  confirm: ReturnType<typeof vi.fn<(change: CollapseChange) => boolean>>;
  proposeSelection: ReturnType<typeof vi.fn>;
} {
  const confirm = vi.fn<(change: CollapseChange) => boolean>(() => true);
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
    rowIdForEntry: options.rowIdForEntry ?? ((id) => rowId(id)),
    ancestorRowIds:
      options.ancestorRowIds ??
      ((id) => {
        const ids: RowId[] = [];
        let current = entries.find((candidate) => candidate.id === id);
        while (current?.parentId !== undefined) {
          const parentId = current.parentId;
          ids.push(rowId(parentId));
          current = entries.find((candidate) => candidate.id === parentId);
        }
        return ids;
      }),
  };
  const tree = new TreeCollapse(ctx);
  return { tree, confirm, proposeSelection };
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
      entries: [entry('p'), entry('c', 'p')],
      selected: entryId('p'),
    });
    tree.hydrate(['p']);

    expect(tree.handleArrow('right')).toBe(true);
    expect(confirm).toHaveBeenCalledWith({ from: [rowId('p')], to: [] });
  });

  it('handleArrow right on an expanded row selects the first child', () => {
    const { tree, confirm, proposeSelection } = makeCollapse({
      plannedRows: [row('p', true, true)],
      entries: [entry('p'), entry('c', 'p')],
      selected: entryId('p'),
    });

    expect(tree.handleArrow('right')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(proposeSelection).toHaveBeenCalledWith([entryId('c')]);
  });

  it('handleArrow left collapses an expanded row', () => {
    const { tree, confirm } = makeCollapse({
      plannedRows: [row('p', true, true)],
      entries: [entry('p')],
      selected: entryId('p'),
    });

    expect(tree.handleArrow('left')).toBe(true);
    expect(confirm).toHaveBeenCalledWith({ from: [], to: [rowId('p')] });
  });

  it('handleArrow left on a leaf selects a selectable parent', () => {
    const { tree, proposeSelection } = makeCollapse({
      plannedRows: [row('c', false, false)],
      entries: [entry('p'), entry('c', 'p')],
      selected: entryId('c'),
    });

    expect(tree.handleArrow('left')).toBe(true);
    expect(proposeSelection).toHaveBeenCalledWith([entryId('p')]);
  });

  it('expandAncestorsOf drops collapsed ancestor row ids, including group headers (D4)', () => {
    const header = rowId('group:red');
    const { tree, confirm } = makeCollapse({
      entries: [entry('a')],
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
      entries: [entry('p'), entry('c', 'p')],
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
});
