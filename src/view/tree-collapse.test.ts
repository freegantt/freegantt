import { describe, expect, it, vi } from 'vitest';
import { entryId, rowId } from '../model/index.js';
import type { Entry, EntryId, Instant } from '../model/index.js';
import { TreeCollapse } from './tree-collapse.js';
import type { TreeCollapseContext, TreeCollapseRow } from './tree-collapse.js';

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
  } = {},
): {
  tree: TreeCollapse;
  applyCollapsed: ReturnType<typeof vi.fn>;
  proposeSelection: ReturnType<typeof vi.fn>;
} {
  const applyCollapsed = vi.fn();
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
    applyCollapsed,
  };
  const tree = new TreeCollapse(ctx);
  return { tree, applyCollapsed, proposeSelection };
}

describe('TreeCollapse', () => {
  it('collapseAll collects expandable planned row ids, including grouped headers', () => {
    const { tree, applyCollapsed } = makeCollapse({
      plannedRows: [
        row('group:alpha', true, true, []),
        row('leaf', false, false),
        row('group:beta', true, true, []),
      ],
    });

    tree.collapseAll();

    expect(applyCollapsed).toHaveBeenCalledWith(['group:alpha', 'group:beta']);
  });

  it('collapseAll keeps ids already in the set and adds visible expandable rows', () => {
    const { tree, applyCollapsed } = makeCollapse({
      plannedRows: [row('p', true, false)],
    });
    const proposed = tree.propose(['nested']);
    tree.commit(proposed!.to);

    tree.collapseAll();

    expect(applyCollapsed).toHaveBeenCalledWith(['nested', 'p']);
  });

  it('expandAll writes an empty set when anything is collapsed', () => {
    const { tree, applyCollapsed } = makeCollapse();
    tree.commit(tree.propose(['p'])!.to);

    tree.expandAll();

    expect(applyCollapsed).toHaveBeenCalledWith([]);
  });

  it('handleArrow right expands a collapsed expandable row', () => {
    const { tree, applyCollapsed } = makeCollapse({
      plannedRows: [row('p', true, false)],
      entries: [entry('p'), entry('c', 'p')],
      selected: entryId('p'),
    });
    tree.commit(tree.propose(['p'])!.to);

    expect(tree.handleArrow('right')).toBe(true);
    expect(applyCollapsed).toHaveBeenCalledWith([]);
  });

  it('handleArrow right on an expanded row selects the first child', () => {
    const { tree, applyCollapsed, proposeSelection } = makeCollapse({
      plannedRows: [row('p', true, true)],
      entries: [entry('p'), entry('c', 'p')],
      selected: entryId('p'),
    });

    expect(tree.handleArrow('right')).toBe(true);
    expect(applyCollapsed).not.toHaveBeenCalled();
    expect(proposeSelection).toHaveBeenCalledWith([entryId('c')]);
  });

  it('handleArrow left collapses an expanded row', () => {
    const { tree, applyCollapsed } = makeCollapse({
      plannedRows: [row('p', true, true)],
      entries: [entry('p')],
      selected: entryId('p'),
    });

    expect(tree.handleArrow('left')).toBe(true);
    expect(applyCollapsed).toHaveBeenCalledWith([rowId('p')]);
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

  it('expandAncestorsOf drops collapsed ancestor ids and leaves unrelated ids', () => {
    const { tree, applyCollapsed } = makeCollapse({
      entries: [entry('p'), entry('c', 'p'), entry('g', 'c')],
    });
    tree.commit(tree.propose(['p', 'other'])!.to);

    expect(tree.expandAncestorsOf(entryId('g'))).toBe(true);
    expect(applyCollapsed).toHaveBeenCalledWith([rowId('other')]);
  });

  it('expandAncestorsOf is a no-op when no ancestor is collapsed', () => {
    const { tree, applyCollapsed } = makeCollapse({
      entries: [entry('p'), entry('c', 'p')],
    });
    tree.commit(tree.propose(['other'])!.to);

    expect(tree.expandAncestorsOf(entryId('c'))).toBe(false);
    expect(applyCollapsed).not.toHaveBeenCalled();
  });
});
