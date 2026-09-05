import { describe, expect, it, vi } from 'vitest';
import { Gantt } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import type { EntryFieldEdit, EntryInput, GridColumnInput } from '../../api/index.js';
import { EntryNotFoundError, entryId, instant } from '../../api/index.js';
import { contextMenu } from './context-menu.js';
import { CellEditorSession, inlineEditing } from './inline-editing.js';
import type {
  CellEditorControl,
  CellEditorPorts,
  CellEditorValue,
  InlineEditingOptions,
} from './inline-editing.js';

// happy-dom does no layout, so a real ResizeObserver never fires. This is the same fake seam
// `api/gantt.test.ts` stubs globally: the overlay builds its own observer on the first `onResize`
// call, which is the call an open editor makes (review C1).
type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0];

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  fire(): void {
    this.#callback([], this);
  }
}

/** happy-dom measures nothing, so every rect is zero until a test states one. */
function rectAt(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

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

  it('a container resize moves the open editor with its cell (review C1)', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const { container, gantt } = makeGantt();
      const cell = cellFor(container, 'e1', 'name');
      // The overlay observes lazily, on the first `onResize` call — the one the editor's own mount
      // makes. Every earlier instance belongs to the pane-size attachment.
      const beforeOpen = FakeResizeObserver.instances.length;
      dblclick(cell);
      const wrapper = container.querySelector<HTMLElement>('.fg-cell-editor')!;
      expect(wrapper.style.transform).toBe('translate(0.00px, 0.00px)');

      // The resize brings a reflow that moves the cell. happy-dom measures nothing, so the test
      // states the new rect the editor must follow.
      cell.getBoundingClientRect = () => rectAt(40, 120, 200, 24);
      FakeResizeObserver.instances[beforeOpen]!.fire();

      expect(wrapper.style.transform).toBe('translate(40.00px, 120.00px)');
      expect(wrapper.style.width).toBe('200px');
      expect(wrapper.style.height).toBe('24px');

      gantt.destroy();
      container.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a refused commit keeps its own editor and opens no second one (review C2)', () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'budget'));
    const el = input(container);
    el.value = 'not a number'; // budgetMoney's parseValue refuses this
    dblclick(cellFor(container, 'e1', 'name'));

    const editors = container.querySelectorAll('.fg-cell-editor');
    expect(editors).toHaveLength(1);
    expect(editors[0]!.getAttribute('data-state')).toBe('invalid');
    expect(input(container).value).toBe('not a number'); // still the budget editor
    expect(dataset.entries.get('e1')!.meta?.budget).toBe(500);

    gantt.destroy();
    container.remove();
  });

  it('a blur commit lands before the context menu that caused it opens (S5.8 F10)', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset<Meta>({ entries: structuredClone([...ENTRIES]), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: [{ field: 'name', editable: true }],
      plugins: [inlineEditing(), contextMenu()],
    });

    dblclick(cellFor(container, 'e1', 'name'));
    const el = input(container);
    el.value = 'Blurred rename';
    // The browser's own order for a right-click on another row: the press blurs the editor first,
    // then the `contextmenu` event opens the menu.
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    container
      .querySelector<HTMLElement>('.fg-bar')!
      .dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );

    expect(dataset.entries.get('e1')!.name).toBe('Blurred rename');
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(container.querySelector('.fg-menu')).not.toBeNull();

    gantt.destroy();
    container.remove();
  });
});

// Review A5: the session is an object, so these run it with no mounted Gantt at all — plain ports,
// a plain row, and a control that answers whatever the test needs.
describe('CellEditorSession (S5.8, review A5/C2b)', () => {
  const dataset = new Dataset({
    entries: [{ id: 'e1', name: 'Task One', start: '2026-01-01', end: '2026-01-05' }],
    timeZone: 'UTC',
  });
  const entry = dataset.entries.get('e1')!;

  function textControl(read: () => CellEditorValue): CellEditorControl {
    return { element: document.createElement('input'), read, bindCommitTriggers: () => () => {} };
  }

  function mountSession(
    overrides: Partial<CellEditorPorts> = {},
    control: CellEditorControl = textControl(() => ({ ok: true, value: 'Renamed' })),
  ): { session: CellEditorSession; row: HTMLElement; cell: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'fg-row';
    row.dataset['entryId'] = 'e1';
    const cell = document.createElement('div');
    cell.className = 'fg-row-cell';
    cell.dataset['field'] = 'name';
    row.append(cell);
    const layer = document.createElement('div');
    document.body.append(row, layer);

    const ports: CellEditorPorts = {
      overlay: {
        present: (content) => {
          layer.append(content);
          return {
            detach: () => {
              content.remove();
            },
          };
        },
        bounds: rectAt(0, 0, 0, 0),
        onResize: () => () => {},
      },
      bindEscape: () => () => {},
      entryById: () => entry,
      storedValue: () => 'Task One',
      writeValue: () => {},
      announceEntryEdit: () => {},
      requestCommit: () => {},
      requestRevert: () => {},
      ...overrides,
    };
    const session = new CellEditorSession(ports, { entryId: entryId('e1'), field: 'name', row }, control);
    session.mount(cell);
    return { session, row, cell };
  }

  it('reposition() re-finds the cell inside its own row and follows it (review C1)', () => {
    const { session, cell } = mountSession();
    expect(session.element.style.transform).toBe('translate(0.00px, 0.00px)');

    cell.getBoundingClientRect = () => rectAt(40, 120, 200, 24);
    session.reposition();

    expect(session.element.style.transform).toBe('translate(40.00px, 120.00px)');
    expect(session.element.style.width).toBe('200px');
  });

  it('commit() writes once, announces the edit, then closes', () => {
    const writes: { field: string; value: unknown }[] = [];
    const announced: EntryFieldEdit[] = [];
    const values = ['Task One', 'Renamed'];
    const { session } = mountSession({
      writeValue: (_id, field, value) => writes.push({ field, value }),
      storedValue: () => values.shift(),
      announceEntryEdit: (payload) => announced.push(payload),
    });

    expect(session.commit()).toBe(true);

    expect(writes).toEqual([{ field: 'name', value: 'Renamed' }]);
    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatchObject({ field: 'name', from: 'Task One', to: 'Renamed' });
    expect(session.element.isConnected).toBe(false);
  });

  it('commit() answers false and keeps the editor open when the control reads no value', () => {
    const { session } = mountSession(
      {
        writeValue: () => {
          throw new Error('a refused value must never reach the Dataset');
        },
      },
      textControl(() => ({ ok: false })),
    );

    expect(session.commit()).toBe(false);
    expect(session.element.dataset['state']).toBe('invalid');
    expect(session.element.isConnected).toBe(true);

    session.revert();
    expect(session.element.isConnected).toBe(false);
  });

  it('commit() closes and reports no error when the entry goes away mid-write (issue #137 F10)', () => {
    const { session } = mountSession({
      writeValue: (id) => {
        throw new EntryNotFoundError(id, 'entries.update');
      },
    });

    expect(session.commit()).toBe(true);
    expect(session.element.isConnected).toBe(false);
  });

  it('a second commit after the first one closed writes nothing', () => {
    const writes: unknown[] = [];
    const { session } = mountSession({ writeValue: (_id, _field, value) => writes.push(value) });

    expect(session.commit()).toBe(true);
    expect(session.commit()).toBe(true);

    expect(writes).toEqual(['Renamed']);
  });

  it('stillAnchored() goes false once the row leaves the frame', () => {
    const { session, row } = mountSession();
    expect(session.stillAnchored()).toBe(true);

    row.remove();

    expect(session.stillAnchored()).toBe(false);
  });
});
