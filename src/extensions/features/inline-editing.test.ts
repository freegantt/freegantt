import { describe, expect, it, vi } from 'vitest';
import { Gantt } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import type { EntryFieldEdit, EntryInput, GridColumnInput } from '../../api/index.js';
import { instant } from '../../api/index.js';
import { inlineEditing } from './inline-editing.js';
import type { InlineEditingOptions } from './inline-editing.js';

interface Meta {
  cost?: number;
  budget?: number;
  quantity?: number;
}

const ENTRIES: readonly EntryInput<Meta>[] = [
  { id: 'root', name: 'Root', kind: 'group' },
  {
    id: 'e1',
    name: 'Task One',
    parentId: 'root',
    start: '2026-01-01',
    end: '2026-01-05',
    meta: { cost: 100, budget: 500, quantity: 3 },
  },
  {
    id: 'e2',
    name: 'Task Two',
    start: '2026-01-01T14:00:00Z', // not local midnight (issue #137 F11)
    end: '2026-01-02T14:00:00Z',
    meta: { cost: 200, budget: 700 },
  },
];

const GRID_COLUMNS: readonly GridColumnInput[] = [
  { field: 'name', editable: true },
  { field: 'start', editable: true },
  'end', // not editable — default false
  { field: 'cost', editable: true }, // money, no parseValue — F12 refuses to open
  { field: 'budget', editable: true }, // money, WITH parseValue — round-trips
  { field: 'quantity', editable: true }, // no `type`, `inputType: 'number'` only
];

function makeGantt(
  options?: InlineEditingOptions,
  ganttOptions?: { locale?: Intl.LocalesArgument },
): {
  container: HTMLElement;
  gantt: Gantt;
  dataset: Dataset<Meta>;
} {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset<Meta>({
    entries: structuredClone([...ENTRIES]),
    timeZone: 'UTC',
    fieldTypes: {
      money: {
        rollUp: 'sum',
        formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
        column: { header: 'Cost' },
      },
      budgetMoney: {
        rollUp: 'sum',
        formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
        column: { header: 'Budget' },
        parseValue: (text) => {
          const n = Number(text.replace(/^\$/, ''));
          return Number.isFinite(n) ? n : undefined;
        },
      },
    },
    fields: [
      { key: 'cost', type: 'money' },
      { key: 'budget', type: 'budgetMoney' },
      { key: 'quantity', inputType: 'number', column: { header: 'Quantity' } },
    ],
  });
  const gantt = new Gantt({
    container,
    dataset,
    gridColumns: GRID_COLUMNS,
    plugins: [inlineEditing(options)],
    ...ganttOptions,
  });
  return { container, gantt, dataset };
}

function cellFor(container: HTMLElement, entryId: string, field: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.fg-row[data-entry-id="${entryId}"]`)!;
  return row.querySelector<HTMLElement>(`[data-field="${field}"]`)!;
}

function dblclick(cell: HTMLElement): void {
  cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
}

function input(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('.fg-cell-editor-control')!;
}

function enter(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

function escape(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

describe('inlineEditing() (S5.8, D-S5-19/D-S5-20)', () => {
  it('double-click on an editable text cell opens a seeded input', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'name'));
    expect(input(container).value).toBe('Task One');
    gantt.destroy();
    container.remove();
  });

  it('Enter commits one transaction and closes the editor ([S5-A5] happy path)', () => {
    const { container, gantt, dataset } = makeGantt();
    const onChange = vi.fn();
    dataset.on('change', onChange);

    dblclick(cellFor(container, 'e1', 'name'));
    const el = input(container);
    el.value = 'Renamed';
    enter(el);

    expect(dataset.entries.get('e1')!.name).toBe('Renamed');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.fg-cell-editor')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('Escape reverts and writes nothing', () => {
    const { container, gantt, dataset } = makeGantt();
    const onChange = vi.fn();
    dataset.on('change', onChange);

    dblclick(cellFor(container, 'e1', 'name'));
    input(container).value = 'Should not stick';
    escape(input(container));

    expect(dataset.entries.get('e1')!.name).toBe('Task One');
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('.fg-cell-editor')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('blur commits', () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'name'));
    const el = input(container);
    el.value = 'Blurred rename';
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(dataset.entries.get('e1')!.name).toBe('Blurred rename');
    gantt.destroy();
    container.remove();
  });

  it('a non-editable column never opens (default false)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'end'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('interactions.edit: false refuses every cell', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset<Meta>({ entries: structuredClone([...ENTRIES]), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: [{ field: 'name', editable: true }],
      interactions: { edit: false },
      plugins: [inlineEditing()],
    });
    dblclick(cellFor(container, 'e1', 'name'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('a rolled-up parent cell (start on a group entry) refuses to open', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'root', 'start'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('a money field with no parseValue refuses to open (issue #137 F12)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'cost'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it("a field's own parseValue round-trips its formatted display text", () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'budget'));
    expect(input(container).value).toBe('$500'); // seeded from the rendered (formatted) text
    const el = input(container);
    el.value = '$650';
    enter(el);
    expect(dataset.entries.get('e1')!.meta?.budget).toBe(650);
    gantt.destroy();
    container.remove();
  });

  it('an invalid parseValue result keeps the editor open in the invalid state', () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'budget'));
    const el = input(container);
    el.value = 'not a number';
    enter(el);
    expect(container.querySelector('.fg-cell-editor[data-state="invalid"]')).not.toBeNull();
    expect(dataset.entries.get('e1')!.meta?.budget).toBe(500);
    gantt.destroy();
    container.remove();
  });

  it("a Field's `inputType` sets the generic editor's native <input type>", () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'quantity'));
    expect(input(container).type).toBe('number');
    expect(input(container).value).toBe('3');
    gantt.destroy();
    container.remove();
  });

  it('with no `inputType`, the generic editor stays <input type="text"> (default)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'name'));
    expect(input(container).type).toBe('text');
    gantt.destroy();
    container.remove();
  });

  it('a date column opens the default <input type="date"> seeded from the stored instant', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'start'));
    expect(input(container).type).toBe('date');
    expect(input(container).value).toBe('2026-01-01');
    gantt.destroy();
    container.remove();
  });

  it('committing a new date writes one transaction', () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'start'));
    const el = input(container);
    el.value = '2026-01-10';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dataset.entries.get('e1')!.start).toBe(instant('2026-01-10T00:00:00Z'));
    gantt.destroy();
    container.remove();
  });

  it('a non-midnight instant refuses the default date editor (issue #137 F11)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e2', 'start'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('a consumer dateInput factory is used instead, with no midnight refusal', () => {
    const { container, gantt } = makeGantt({
      dateInput: () => {
        const el = document.createElement('input');
        el.type = 'datetime-local';
        return {
          element: el,
          read: () => undefined,
          write: () => {},
          onCommit: () => () => {},
          destroy: () => el.remove(),
        };
      },
    });
    dblclick(cellFor(container, 'e2', 'start')); // e2's start is not midnight
    expect(container.querySelector('.fg-cell-editor-control')).not.toBeNull();
    expect(input(container).type).toBe('datetime-local');
    gantt.destroy();
    container.remove();
  });

  it("a consumer dateInput factory receives this Gantt's locale, not just the zone (#144)", () => {
    const seen: { zone: string; locale?: Intl.LocalesArgument }[] = [];
    const { container, gantt } = makeGantt(
      {
        dateInput: (dateCtx) => {
          seen.push(dateCtx);
          const el = document.createElement('input');
          el.type = 'datetime-local';
          return {
            element: el,
            read: () => undefined,
            write: () => {},
            onCommit: () => () => {},
            destroy: () => el.remove(),
          };
        },
      },
      { locale: 'de-DE' },
    );
    dblclick(cellFor(container, 'e2', 'start'));
    expect(seen).toEqual([{ zone: 'UTC', locale: 'de-DE' }]);
    gantt.destroy();
    container.remove();
  });

  it('beforeEntryEdit returning false suppresses the built-in editor (U8, [S5-A5])', () => {
    const { container, gantt } = makeGantt();
    gantt.on('beforeEntryEdit', () => false);
    dblclick(cellFor(container, 'e1', 'name'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('beforeEntryEdit may veto asynchronously (D-S3-17 shape)', async () => {
    const { container, gantt } = makeGantt();
    let resolve!: (value: void | false) => void;
    gantt.on('beforeEntryEdit', () => new Promise<void | false>((r) => (resolve = r)));
    dblclick(cellFor(container, 'e1', 'name'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    resolve(false);
    await Promise.resolve();
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('entryEdit fires after the commit with from/to', () => {
    const { container, gantt } = makeGantt();
    const events: EntryFieldEdit[] = [];
    gantt.on('entryEdit', (payload) => {
      events.push(payload);
    });
    dblclick(cellFor(container, 'e1', 'name'));
    const el = input(container);
    el.value = 'Renamed';
    enter(el);
    expect(events).toHaveLength(1);
    expect(events[0]!.entry.id).toBe('e1');
    expect(events[0]!.field).toBe('name');
    expect(events[0]!.from).toBe('Task One');
    expect(events[0]!.to).toBe('Renamed');
    gantt.destroy();
    container.remove();
  });

  it('a beforeChange veto leaves the editor open in the invalid state, focus retained', () => {
    const { container, gantt, dataset } = makeGantt();
    dataset.on('beforeChange', () => false);
    dblclick(cellFor(container, 'e1', 'name'));
    const el = input(container);
    el.value = 'Vetoed';
    enter(el);
    expect(container.querySelector('.fg-cell-editor[data-state="invalid"]')).not.toBeNull();
    expect(document.activeElement).toBe(el);
    expect(dataset.entries.get('e1')!.name).toBe('Task One');
    gantt.destroy();
    container.remove();
  });

  it('#158: the editor mounts in the grid row layer, so a scroll carries it with its cell', () => {
    const { container, gantt, dataset } = makeGantt();
    dataset.on('beforeChange', () => false);
    const cell = cellFor(container, 'e1', 'name');
    dblclick(cell);
    const el = input(container);
    el.value = 'Vetoed';
    enter(el);

    const wrapper = container.querySelector<HTMLElement>('.fg-cell-editor[data-state="invalid"]')!;
    // Inside the layer the pane's own scroll already moves — not the overlay, which does not move.
    expect(wrapper.parentElement).toBe(container.querySelector('.fg-rows'));
    expect(container.querySelector('.fg-overlay')!.contains(wrapper)).toBe(false);
    // Beside the rows, never inside one: a row is render/dom's reconciled DOM.
    expect(wrapper.closest('.fg-row')).toBeNull();

    // A scroll rewrites nothing: the layer's own transform carries the editor and its cell together.
    const placed = wrapper.style.transform;
    container.querySelector('.fg-grid-pane')!.dispatchEvent(new Event('scroll'));
    expect(wrapper.style.transform).toBe(placed);
    expect(container.querySelector('.fg-cell-editor')).toBe(wrapper); // still open, still invalid

    gantt.destroy();
    container.remove();
  });

  it('#158: a scroll that recycles the anchor row onto another entry closes without committing', () => {
    const { container, gantt, dataset } = makeGantt();
    const row = container.querySelector<HTMLElement>('.fg-row[data-entry-id="e1"]')!;
    dblclick(cellFor(container, 'e1', 'name'));
    const el = input(container);
    el.value = 'Never written';

    row.dataset['entryId'] = 'e2'; // virtualization repaints this node for another entry
    container.querySelector('.fg-grid-pane')!.dispatchEvent(new Event('scroll'));

    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(dataset.entries.get('e1')!.name).toBe('Task One');
    expect(dataset.entries.get('e2')!.name).toBe('Task Two');

    gantt.destroy();
    container.remove();
  });

  it('a stale async veto does not mount a second, orphaned session over a newer open', async () => {
    const { container, gantt } = makeGantt();
    let resolveFirst!: (value: void | false) => void;
    let vetoCall = 0;
    gantt.on('beforeEntryEdit', () => {
      vetoCall++;
      // Only the first open (on "name") gets an async veto; the second (on "quantity") resolves
      // synchronously, so it can mount before the first's promise ever settles.
      return vetoCall === 1 ? new Promise<void | false>((r) => (resolveFirst = r)) : undefined;
    });

    dblclick(cellFor(container, 'e1', 'name')); // request #1 — veto pending
    expect(container.querySelector('.fg-cell-editor')).toBeNull();

    dblclick(cellFor(container, 'e1', 'quantity')); // request #2 — opens immediately
    expect(container.querySelectorAll('.fg-cell-editor')).toHaveLength(1);
    expect(input(container).value).toBe('3'); // quantity's own seed, not name's

    resolveFirst(undefined); // request #1's veto now resolves — must not mount a second editor
    await Promise.resolve();

    expect(container.querySelectorAll('.fg-cell-editor')).toHaveLength(1);
    expect(input(container).value).toBe('3');

    gantt.destroy();
    container.remove();
  });

  it("Enter opens this Gantt's own row, not an earlier-in-DOM Gantt's row sharing the same entry id (I2)", () => {
    // containerA is appended to document.body first — an unscoped document-wide lookup by entry id
    // would find *its* row first no matter which Gantt's own Enter handler actually fired, so B's own
    // handler firing must still resolve to B's own row.
    const { container: containerA, gantt: ganttA } = makeGantt();
    const { container: containerB, gantt: ganttB } = makeGantt();

    ganttA.selectedIds = ['e1'];
    ganttB.selectedIds = ['e1'];

    enter(containerB);
    expect(containerB.querySelector('.fg-cell-editor')).not.toBeNull();
    expect(containerA.querySelector('.fg-cell-editor')).toBeNull();

    ganttA.destroy();
    ganttB.destroy();
    containerA.remove();
    containerB.remove();
  });

  it('the anchor entry disappearing mid-edit closes without committing (issue #137 F10)', () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'name'));
    expect(container.querySelector('.fg-cell-editor')).not.toBeNull();
    dataset.entries.remove('e1');
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('removing the plugin closes any open editor', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'name'));
    expect(container.querySelector('.fg-cell-editor')).not.toBeNull();
    gantt.plugins = [];
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    gantt.destroy();
    container.remove();
  });
});
