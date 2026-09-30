import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import { inlineEditing } from '../extensions/features/inline-editing.js';
import { ToggleFieldNotBooleanError } from './index.js';
import { boolean } from '../data/fields/field-types.js';
import type { ColumnToggle, EntryInput, GridColumnInput } from './index.js';

interface Meta {
  done?: boolean;
}

const ENTRIES: readonly EntryInput<Meta>[] = [
  { id: 'a', name: 'Alpha', start: '2026-01-01', end: '2026-01-05', props: { done: false } },
  { id: 'b', name: 'Beta', start: '2026-01-02', end: '2026-01-06', props: { done: true } },
];

const mounted: Gantt[] = [];

afterEach(() => {
  for (const gantt of mounted.splice(0)) gantt.destroy();
  document.body.replaceChildren();
});

function mount(
  toggle: true | ColumnToggle = true,
  options: { editable?: boolean | 'api' | 'never'; capabilities?: { edit: boolean } } = {},
) {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset<Meta>({
    entries: structuredClone([...ENTRIES]),
    timeZone: 'UTC',
    fields: [{ key: 'done', type: 'boolean', editable: options.editable ?? true }],
  });
  const gridColumns: GridColumnInput[] = ['name', { field: 'done', header: 'Done', toggle }];
  const gantt = new Gantt({
    container,
    dataset,
    gridColumns,
    plugins: [inlineEditing()],
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
  });
  mounted.push(gantt);
  return { container, gantt, dataset };
}

function cellFor(container: HTMLElement, entry: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.fg-row[data-entry-id="${entry}"]`)!;
  return row.querySelector<HTMLElement>('[data-field="done"]')!;
}

function click(node: HTMLElement, detail = 1): void {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
}

function press(container: HTMLElement, key: string): void {
  container.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const doneOf = (dataset: Dataset<Meta>, id: string): unknown => dataset.entries.get(id)?.read('done');

describe('a toggle column', () => {
  it('a click writes the opposite value', () => {
    const { container, dataset } = mount();
    click(cellFor(container, 'a'));
    expect(doneOf(dataset, 'a')).toBe(true);
    click(cellFor(container, 'b'));
    expect(doneOf(dataset, 'b')).toBe(false);
  });

  it('a double-click switches once and opens no editor', () => {
    const { container, dataset } = mount();
    const cell = cellFor(container, 'a');
    click(cell, 1);
    click(cell, 2);
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
    expect(doneOf(dataset, 'a')).toBe(true);
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
  });

  it.each(['Enter', ' '])('the %j key switches the focused cell and opens no editor', (key) => {
    const { container, dataset } = mount();
    cellFor(container, 'a').focus();
    press(container, key);
    expect(doneOf(dataset, 'a')).toBe(true);
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
  });

  it('a switch is one undo step', () => {
    const { container, dataset } = mount();
    click(cellFor(container, 'a'));
    dataset.undo();
    expect(doneOf(dataset, 'a')).toBe(false);
    expect(dataset.canUndo).toBe(false);
  });

  it('beforeChange may refuse the write, and the cell keeps its value', () => {
    const { container, dataset } = mount();
    dataset.on('beforeChange', () => false);
    click(cellFor(container, 'a'));
    expect(doneOf(dataset, 'a')).toBe(false);
  });

  it('beforeEntryEdit may veto the switch, and entryEdit reports the value written', () => {
    const { container, gantt, dataset } = mount();
    const edits: unknown[] = [];
    gantt.on('entryEdit', ({ field, from, to }) => {
      edits.push({ field, from, to });
    });
    let allow = false;
    gantt.on('beforeEntryEdit', () => (allow ? undefined : false));
    click(cellFor(container, 'a'));
    expect(doneOf(dataset, 'a')).toBe(false);
    allow = true;
    click(cellFor(container, 'a'));
    expect(edits).toEqual([{ field: 'done', from: false, to: true }]);
  });

  describe('a closed toggle does nothing', () => {
    it.each([
      ['a Field with editable never', { editable: 'never' as const }],
      ['a Field with editable api', { editable: 'api' as const }],
      ['capabilities.edit off', { capabilities: { edit: false } }],
    ])('%s', (_name, options) => {
      const onToggle = vi.fn();
      const { container, dataset } = mount({ onToggle }, options);
      click(cellFor(container, 'a'));
      cellFor(container, 'a').focus();
      press(container, ' ');
      press(container, 'Enter');
      expect(doneOf(dataset, 'a')).toBe(false);
      expect(onToggle).not.toHaveBeenCalled();
      expect(cellFor(container, 'a').querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe(
        'false',
      );
    });

    it('the lock rule closes the toggle, and the callback never runs', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const onToggle = vi.fn();
      const dataset = new Dataset<Meta>({
        entries: [{ id: 'a', name: 'Alpha', props: { done: false } }],
        timeZone: 'UTC',
        fields: [{ key: 'done', type: 'boolean', editable: true }],
      });
      dataset.setFieldEditable('done', 'never');
      const gantt = new Gantt({
        container,
        dataset,
        gridColumns: ['name', { field: 'done', toggle: { onToggle } }],
      });
      mounted.push(gantt);
      click(cellFor(container, 'a'));
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  describe('the callback', () => {
    it('replaces the default write and receives the Entry, the Field and the next value', () => {
      const onToggle = vi.fn<NonNullable<ColumnToggle['onToggle']>>();
      const { container, dataset } = mount({ onToggle });
      click(cellFor(container, 'a'));
      expect(doneOf(dataset, 'a')).toBe(false);
      expect(onToggle).toHaveBeenCalledOnce();
      expect(onToggle.mock.calls[0]![0]).toMatchObject({ field: 'done', nextValue: true });
      expect(onToggle.mock.calls[0]![0].entry.id).toBe('a');
    });

    it('may write through the public API, and that write is one undo step', () => {
      const { container, dataset } = mount({
        onToggle: ({ entry, field, nextValue }) => {
          dataset.entries.update(entry.id, { [field]: nextValue });
        },
      });
      cellFor(container, 'a').focus();
      press(container, ' ');
      expect(doneOf(dataset, 'a')).toBe(true);
      dataset.undo();
      expect(doneOf(dataset, 'a')).toBe(false);
    });

    describe('announceEdit', () => {
      function mountAnnouncing(onToggle: NonNullable<ColumnToggle['onToggle']>) {
        const mounted = mount({ onToggle });
        const edits: unknown[] = [];
        mounted.gantt.on('entryEdit', ({ field, from, to }) => {
          edits.push({ field, from, to });
        });
        return { ...mounted, edits };
      }

      it('raises one entryEdit with the value beforeEntryEdit saw and the value now held', () => {
        const { container, dataset, edits } = mountAnnouncing(({ entry, field, nextValue, announceEdit }) => {
          dataset.entries.update(entry.id, { [field]: nextValue });
          announceEdit();
        });
        click(cellFor(container, 'a'));
        expect(edits).toEqual([{ field: 'done', from: false, to: true }]);
      });

      it('raises no entryEdit when the callback never calls it', () => {
        const { container, dataset, edits } = mountAnnouncing(({ entry, field, nextValue }) => {
          dataset.entries.update(entry.id, { [field]: nextValue });
        });
        click(cellFor(container, 'a'));
        expect(doneOf(dataset, 'a')).toBe(true);
        expect(edits).toEqual([]);
      });

      it('works after an async write', async () => {
        let finish: () => void = () => {};
        const confirmed = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const { container, dataset, edits } = mountAnnouncing(({ entry, field, nextValue, announceEdit }) => {
          void confirmed.then(() => {
            dataset.entries.update(entry.id, { [field]: nextValue });
            announceEdit();
          });
        });
        click(cellFor(container, 'a'));
        expect(edits).toEqual([]);
        finish();
        await confirmed;
        expect(edits).toEqual([{ field: 'done', from: false, to: true }]);
      });

      it('raises entryEdit once when the callback calls it twice', () => {
        const { container, edits } = mountAnnouncing(({ announceEdit }) => {
          announceEdit();
          announceEdit();
        });
        click(cellFor(container, 'a'));
        expect(edits).toHaveLength(1);
      });

      it('raises nothing after the Entry leaves the Dataset', () => {
        const { container, dataset, edits } = mountAnnouncing(({ entry, announceEdit }) => {
          dataset.entries.remove(entry.id);
          announceEdit();
        });
        click(cellFor(container, 'a'));
        expect(edits).toEqual([]);
      });
    });
  });

  describe('the cell markup', () => {
    it('is a checkbox named by the column header, with the icon hidden from assistive tech', () => {
      const { container } = mount({ on: { tag: 'span', text: 'ON' }, off: { tag: 'span', text: 'OFF' } });
      const off = cellFor(container, 'a').querySelector('[role="checkbox"]')!;
      expect(off.getAttribute('aria-checked')).toBe('false');
      expect(off.getAttribute('aria-label')).toBe('Done');
      expect(off.textContent).toBe('OFF');
      expect(off.querySelector('[aria-hidden="true"]')?.textContent).toBe('OFF');
      expect(cellFor(container, 'b').querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(cellFor(container, 'b').textContent).toBe('ON');
      expect(cellFor(container, 'a').getAttribute('role')).toBe('gridcell');
    });

    it('draws a checkbox look when the column names no icons', () => {
      const { container } = mount(true);
      expect(cellFor(container, 'a').querySelector('.fg-toggle-box')).not.toBeNull();
      expect(cellFor(container, 'a').querySelector('.fg-toggle-box-checked')).toBeNull();
      expect(cellFor(container, 'b').querySelector('.fg-toggle-box-checked')).not.toBeNull();
    });

    it('repaints the icon after a write', async () => {
      const { container } = mount({ on: { tag: 'span', text: 'ON' }, off: { tag: 'span', text: 'OFF' } });
      click(cellFor(container, 'a'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(cellFor(container, 'a').textContent).toBe('ON');
    });
  });

  it('refuses a toggle on a Field that is not boolean', () => {
    const container = document.createElement('div');
    expect(
      () =>
        new Gantt({
          container,
          dataset: new Dataset({ entries: [], timeZone: 'UTC' }),
          gridColumns: ['name', { field: 'name', toggle: true }],
        }),
    ).toThrow(ToggleFieldNotBooleanError);
  });

  it('accepts a boolean Field declared with an inline type bundle', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({
        entries: [],
        timeZone: 'UTC',
        fields: [{ key: 'done', type: boolean }],
      }),
      gridColumns: ['name', { field: 'done', toggle: true }],
    });
    mounted.push(gantt);
    expect(gantt.gridColumns).toHaveLength(2);
  });

  it('reads back through gridColumns unchanged', () => {
    const { gantt } = mount(true);
    expect(gantt.gridColumns).toEqual(['name', { field: 'done', header: 'Done', toggle: true }]);
  });
});

describe('a per-column headerRenderer', () => {
  function headerOf(container: HTMLElement, field: string): HTMLElement {
    return container.querySelector<HTMLElement>(`.fg-col-header[data-field="${field}"]`)!;
  }

  it('wins over the Gantt-wide headerRenderer for its own column only', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: [...ENTRIES], timeZone: 'UTC' }),
      gridColumns: [
        'name',
        { field: 'start', header: 'From', headerRenderer: ({ header }) => ({ text: `own:${header}` }) },
      ],
      headerRenderer: ({ column }) => ({ text: `wide:${column.header}` }),
    });
    mounted.push(gantt);
    expect(headerOf(container, 'start').textContent).toBe('own:From');
    expect(headerOf(container, 'name').textContent).toBe('wide:Name');
  });

  it('keeps the header string as the accessible name', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: [...ENTRIES], timeZone: 'UTC' }),
      gridColumns: [{ field: 'name', header: 'Task', headerRenderer: () => ({ text: '#' }) }, 'start'],
    });
    mounted.push(gantt);
    expect(headerOf(container, 'name').getAttribute('aria-label')).toBe('Task');
    expect(headerOf(container, 'start').hasAttribute('aria-label')).toBe(false);
  });
});

describe('a toggle cell with double-click activation', () => {
  it('a double-click switches once and fires no entryActivate', () => {
    const { container, gantt, dataset } = mount();
    gantt.pointerActivation = 'dblclick';
    const activations: unknown[] = [];
    gantt.on('entryActivate', (payload) => {
      activations.push(payload);
    });
    const cell = cellFor(container, 'a');
    cell.focus();
    click(cell, 1);
    click(cell, 2);
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
    expect(doneOf(dataset, 'a')).toBe(true);
    expect(activations).toEqual([]);
  });
});

describe('a toggle column in the gridColumnsChange payload', () => {
  it('keeps the toggle: true shorthand the consumer authored', () => {
    const { gantt } = mount(true);
    const payloads: unknown[] = [];
    gantt.on('gridColumnsChange', ({ to }) => {
      payloads.push(to.find((column) => column.field === 'done')?.toggle);
    });
    gantt.hideGridColumn('name');
    expect(payloads).toEqual([true]);
  });
});
