// The point of this file: it is the versioned contract between `render/dom` and every plugin
// (review A3). `extensions/` may not import `render/`, so before `GanttDom` existed a plugin retyped
// eight `.fg-*` selectors and three `data-*` keys by hand. Renaming a class in `render/dom` then
// broke every plugin with a green build, because nothing asserted the two sides still agreed.
//
// So this suite paints a real frame through `createDomBackend` into a real `PaneLayout`, and asks
// `ContainerDom` to read it back. A rename in `render/dom/dom-contract.ts` keeps this green; a
// rename at one paint site only does not.
import { describe, expect, it } from 'vitest';
import { FrameLayout, createVariantRegistry } from '../layout/index.js';
import type { RowSource, TimeScale, ViewPreset } from '../layout/index.js';
import { createDomBackend } from '../render/dom/index.js';
import { ContainerDom } from './gantt-dom.js';
import { PaneLayout } from './pane-layout.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import type { Entry, EntryId } from '../model/index.js';

// Load-bearing non-null assertion (ADR 0012): every fixture entry this file reads is authored
// with both dates.
const scale: TimeScale = {
  range: { start: sampleEntries[0]!.start!, end: sampleEntries[0]!.end! },
  timeZone: 'UTC',
  pxPerMs: 1,
  xForInstant: () => 0,
  instantForX: () => sampleEntries[0]!.start!,
  widthForDuration: () => 100,
  ticks: () => [{ instant: sampleEntries[0]!.start!, x: 0, width: 24 }],
  spanForPixels: () => ({ start: sampleEntries[0]!.start!, end: sampleEntries[0]!.start! }),
  contentWidth: 100,
};
const preset: ViewPreset = {
  id: 'none',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [{ unit: 'day', increment: 1, format: () => 'tick' }],
  preferredTickWidthPx: 24,
};

const entries = sampleEntries.slice(0, 2);
/** A row that owns three Entries — the shape #199 is about. Only a `{ source: 'custom' }` resolver
 *  can build one, so this is what the defect needed to be seen at all. */
const threeOnOneRow = sampleEntries.slice(1, 4);
const oneRowForAllThree: RowSource = {
  source: 'custom',
  resolve: ({ entries: all }) => [{ id: 'lane-1', entryIds: all.map((entry) => entry.id) }],
};

/** One mounted Gantt's worth of DOM: a `PaneLayout` for the panes and the splitter, and a real
 *  `render/dom` backend painting into its surfaces. */
function paintOneGantt(
  painted: readonly Entry[] = entries,
  rows?: RowSource,
): {
  dom: ContainerDom;
  container: HTMLElement;
  /** Paints a second frame over the same nodes, the way a Dataset edit does. The reconciler reuses
   *  every node whose key survived, so this is how a test sees what a recycled node carries. */
  repaint(next: readonly Entry[]): void;
  destroy(): void;
} {
  const container = document.createElement('div');
  document.body.append(container);
  const paneLayout = new PaneLayout({ container });
  let current = painted;
  const entryById = (id: EntryId): Entry | undefined => current.find((entry) => entry.id === id);
  const backend = createDomBackend({
    entryById,
    resolveBarRenderer: () => undefined,
    resolveGridCellRenderer: () => undefined,
    resolveHeaderRenderer: () => undefined,
  });
  backend.mount({
    grid: paneLayout.panes.rows,
    gridHeader: paneLayout.panes.gridHeader,
    timeline: paneLayout.panes.timeline,
  });
  // The real `FrameLayout`, because `barFor` asks it which Bars an entry draws (#185).
  const layout = new FrameLayout();
  const variantRegistry = createVariantRegistry({ fieldFor: () => undefined });
  const paint = (): void => {
    backend.sync(
      layout.computeFrame({
        entries: current,
        ...(rows !== undefined ? { rows } : {}),
        scale,
        preset,
        visible: { x: 0, y: 0, width: 200, height: 200 },
        rowHeight: 32,
        revision: 0,
        datasetRevision: 0,
        variants: variantRegistry,
        columns: [
          { field: 'name', header: 'Name', align: 'start', format: (entry) => entry.name },
          { field: 'cost', header: 'Budget', align: 'end', width: 90, format: () => '$500' },
        ],
      }),
    );
  };
  paint();
  return {
    dom: new ContainerDom({
      container,
      paneLayout,
      entryById,
      layout,
    }),
    container,
    repaint: (next) => {
      current = next;
      layout.invalidateFrom(0);
      paint();
    },
    destroy: () => {
      backend.destroy();
      paneLayout.destroy();
      container.remove();
    },
  };
}

describe('ContainerDom — what render/dom emits is what targetUnder reads', () => {
  it('resolves a painted bar to a bar target carrying its own entry', () => {
    const gantt = paintOneGantt();
    const bar = gantt.container.querySelector<HTMLElement>('[data-bar-id]')!;

    const target = gantt.dom.targetUnder(bar);

    expect(target?.kind).toBe('bar');
    expect(target?.element).toBe(bar);
    expect(target?.entry?.id).toBe(entries[0]!.id);
    gantt.destroy();
  });

  it('resolves a painted grid cell to a cell target carrying its entry and its Field', () => {
    const gantt = paintOneGantt();
    const cell = gantt.container.querySelector<HTMLElement>('.fg-row [data-field="cost"]')!;

    const target = gantt.dom.targetUnder(cell);

    expect(target?.kind).toBe('gridCell');
    expect(target?.field).toBe('cost');
    expect(target?.entry?.id).toBe(entries[0]!.id);
    gantt.destroy();
  });

  it('resolves the name cell through its own text span, the way a double-click lands', () => {
    const gantt = paintOneGantt();
    const label = gantt.container.querySelector<HTMLElement>('.fg-row-label-text')!;

    const target = gantt.dom.targetUnder(label);

    expect(target?.kind).toBe('gridCell');
    expect(target?.field).toBe('name');
    expect(gantt.dom.cellText(target!.element)).toBe(entries[0]!.name);
    gantt.destroy();
  });

  it('resolves a painted header cell to a header target with no entry', () => {
    const gantt = paintOneGantt();
    const header = gantt.container.querySelector<HTMLElement>('.fg-grid-header [data-field="cost"]')!;

    const target = gantt.dom.targetUnder(header);

    expect(target?.kind).toBe('header');
    expect(target?.field).toBe('cost');
    expect(target?.entry).toBeUndefined();
    gantt.destroy();
  });

  it("resolves the pane layout's own splitter", () => {
    const gantt = paintOneGantt();
    const splitter = gantt.container.querySelector<HTMLElement>('.fg-splitter')!;

    expect(gantt.dom.targetUnder(splitter)?.kind).toBe('splitter');
    gantt.destroy();
  });

  it('resolves a row through a node that is in no cell', () => {
    const gantt = paintOneGantt();
    const row = gantt.container.querySelector<HTMLElement>('[data-entry-id]')!;

    const target = gantt.dom.targetUnder(row);

    expect(target?.kind).toBe('row');
    expect(target?.entry?.id).toBe(entries[0]!.id);
    expect(target?.entryIds).toEqual([entries[0]!.id]);
    gantt.destroy();
  });

  it('names every Entry a row owns, and keeps the first as the row subject (#199)', () => {
    const gantt = paintOneGantt(threeOnOneRow, oneRowForAllThree);
    const row = gantt.container.querySelector<HTMLElement>('.fg-row')!;

    const target = gantt.dom.targetUnder(row);

    expect(target?.kind).toBe('row');
    expect(target?.entryIds).toEqual(threeOnOneRow.map((entry) => entry.id));
    // The subject is what the cells format, and it stays the one Entry `data-entry-id` names.
    expect(target?.entry?.id).toBe(threeOnOneRow[0]!.id);
    gantt.destroy();
  });

  it('a cell of a row that owns three names the same three (#199)', () => {
    const gantt = paintOneGantt(threeOnOneRow, oneRowForAllThree);
    const cell = gantt.container.querySelector<HTMLElement>('.fg-row [data-field="cost"]')!;

    const target = gantt.dom.targetUnder(cell);

    // A click anywhere in the row selects all three (#185), so a right-click there names all three.
    expect(target?.kind).toBe('gridCell');
    expect(target?.entryIds).toEqual(threeOnOneRow.map((entry) => entry.id));
    gantt.destroy();
  });

  it('a bar of a row that owns three names only the Entry it draws (#199)', () => {
    const gantt = paintOneGantt(threeOnOneRow, oneRowForAllThree);
    const bar = gantt.container.querySelector<HTMLElement>('[data-bar-id]')!;

    const target = gantt.dom.targetUnder(bar);

    expect(target?.kind).toBe('bar');
    expect(target?.entryIds).toEqual([threeOnOneRow[0]!.id]);
    gantt.destroy();
  });

  it('a header cell and the splitter stand for no Entry at all', () => {
    const gantt = paintOneGantt();
    const header = gantt.container.querySelector<HTMLElement>('.fg-grid-header [data-field="cost"]')!;
    const splitter = gantt.container.querySelector<HTMLElement>('.fg-splitter')!;

    expect(gantt.dom.targetUnder(header)?.entryIds).toEqual([]);
    expect(gantt.dom.targetUnder(splitter)?.entryIds).toEqual([]);
    gantt.destroy();
  });

  it('answers nothing for a node this Gantt does not own', () => {
    const gantt = paintOneGantt();
    const other = paintOneGantt();
    const otherBar = other.container.querySelector<HTMLElement>('[data-bar-id]')!;

    expect(gantt.dom.owns(otherBar)).toBe(false);
    expect(gantt.dom.targetUnder(otherBar)).toBeUndefined();
    expect(other.dom.targetUnder(otherBar)?.kind).toBe('bar');
    gantt.destroy();
    other.destroy();
  });

  it('answers nothing for a node inside this Gantt that is none of the five kinds', () => {
    const gantt = paintOneGantt();

    expect(gantt.dom.targetUnder(gantt.container)).toBeUndefined();
    gantt.destroy();
  });
});

describe('ContainerDom — finding an element from an id', () => {
  it('barFor finds the painted bar of the entry, and nothing for an entry with no bar', () => {
    const gantt = paintOneGantt();

    const bar = gantt.dom.barFor(entries[1]!.id);

    expect(bar).toBe(gantt.container.querySelectorAll('[data-bar-id]')[1]);
    // F19: a plain string, not `as EntryId` — `barFor` is loose on this scalar id (#305).
    expect(gantt.dom.barFor('no-such-entry')).toBeUndefined();
    gantt.destroy();
  });

  it('cellFor finds the painted cell of one entry and one Field', () => {
    const gantt = paintOneGantt();

    const cell = gantt.dom.cellFor(entries[1]!.id, 'cost');

    expect(cell?.dataset['field']).toBe('cost');
    expect(gantt.dom.targetUnder(cell!)?.entry?.id).toBe(entries[1]!.id);
    expect(gantt.dom.cellFor(entries[1]!.id, 'nothing')).toBeUndefined();
    // F19: a plain string, not `as EntryId` — `cellFor` is loose on this scalar id (#305).
    expect(gantt.dom.cellFor('no-such-entry', 'cost')).toBeUndefined();
    gantt.destroy();
  });

  it('keeps barFor and cellFor inside their own Gantt (I2)', () => {
    const gantt = paintOneGantt();
    const other = paintOneGantt();

    // Both Gantts paint the same entry ids. Each one must answer with its own nodes.
    expect(gantt.container.contains(gantt.dom.barFor(entries[0]!.id)!)).toBe(true);
    expect(other.container.contains(gantt.dom.barFor(entries[0]!.id)!)).toBe(false);
    expect(other.container.contains(other.dom.cellFor(entries[0]!.id, 'cost')!)).toBe(true);
    gantt.destroy();
    other.destroy();
  });
});

// Retired (ADR 0026, #421): 'ContainerDom — the pane picks the unit (#212, ADR 0010)' used to prove
// a bar/row/cell target named the Segment(s) it stood for, not the Entry. A core Entry now always
// draws exactly one Bar over its own span, so `DomTarget` carries only `entryIds` — and the earlier
// describe block above ('what render/dom emits is what targetUnder reads') already proves every one
// of bar/row/cell/header/splitter resolves the right `entryIds`, so nothing here was left to add.

describe('ContainerDom — the pointer path allocates nothing while it rests', () => {
  it('answers with the same frozen target for repeated reads of one node', () => {
    const gantt = paintOneGantt();
    const bar = gantt.container.querySelector<HTMLElement>('[data-bar-id]')!;

    const first = gantt.dom.targetUnder(bar);
    const second = gantt.dom.targetUnder(bar);

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    gantt.destroy();
  });

  it('forgets the memo when virtualization recycles the node under a new entry', () => {
    const gantt = paintOneGantt();
    const row = gantt.container.querySelector<HTMLElement>('[data-entry-id]')!;
    const first = gantt.dom.targetUnder(row);
    expect(first?.entry?.id).toBe(entries[0]!.id);

    row.dataset['entryId'] = entries[1]!.id;

    expect(gantt.dom.targetUnder(row)?.entry?.id).toBe(entries[1]!.id);
    gantt.destroy();
  });
});
