import { describe, expect, it, vi } from 'vitest';
import { Gantt } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import type {
  Entry,
  EntryFieldEdit,
  EntryInput,
  GridColumnInput,
  PluginErrorReport,
} from '../../api/index.js';
import { EntryNotFoundError, entryId, instant } from '../../api/index.js';
import { contextMenu } from './context-menu.js';
import { CellEditing, CellEditorSession, inlineEditing, presentRefusal } from './inline-editing.js';
import type {
  CellEditorControl,
  CellEditorPorts,
  CellEditorRefusal,
  CellEditorValue,
  InlineEditingOptions,
  RefusalNoticePorts,
} from './inline-editing.js';

// happy-dom does no layout, so a real ResizeObserver never fires. This is the same fake seam
// `api/gantt.test.ts` stubs globally. The overlay builds its own observer on the first `onResize`
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
  {
    // Stores `segments`, so `start`/`end` are the envelope those segments span (#212).
    id: 'e3',
    name: 'Segmented Task',
    start: '2026-01-01',
    end: '2026-01-10',
    segments: [
      { start: '2026-01-01', end: '2026-01-04' },
      { start: '2026-01-06', end: '2026-01-10' },
    ],
    meta: { cost: 300, budget: 900 },
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

/** The refusal notice a cell mounts when it offers an editor that cannot open here (review SP1).
 *  It carries the same `.fg-cell-editor[data-state="invalid"]` a refused commit does, plus the
 *  machine-readable `data-reason` whose text the user reads. */
function refusal(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.fg-cell-editor[data-state="invalid"][data-reason]');
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

  // The two silent refusals, by decision (`s5.8-inline-editing.md` §1, "Which refusals speak").
  // Neither cell offers an editor at all, so nothing mounts — no editor, and no notice either.
  it('a non-editable column never opens, and says nothing (default false)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'end'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(refusal(container)).toBeNull();
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
    expect(refusal(container)).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('a rolled-up parent cell refuses with the invalid state and a named reason (review SP1)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'root', 'start'));
    const notice = refusal(container)!;
    expect(notice).not.toBeNull();
    expect(notice.dataset['reason']).toBe('derived-value');
    expect(notice.textContent).toContain('comes from the rows below it');
    expect(notice.title).toBe(notice.textContent);
    expect(container.querySelector('.fg-cell-editor-control')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('a segmented entry refuses its start cell instead of throwing on commit (#212)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e3', 'start'));
    const notice = refusal(container)!;
    expect(notice).not.toBeNull();
    expect(notice.dataset['reason']).toBe('segmented-entry');
    expect(notice.textContent).toContain('span the segments below');
    expect(container.querySelector('.fg-cell-editor-control')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('a segmented entry still edits a field that is not its envelope (#212)', () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e3', 'name'));
    const el = input(container);
    el.value = 'Renamed Segmented';
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dataset.entries.get('e3')?.name).toBe('Renamed Segmented');
    expect(refusal(container)).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('a money field with no parseValue refuses with a named reason (issue #137 F12, review SP1)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'cost'));
    const notice = refusal(container)!;
    expect(notice).not.toBeNull();
    expect(notice.dataset['reason']).toBe('no-parse-value');
    expect(notice.textContent).toContain('has no parseValue');
    expect(container.querySelector('.fg-cell-editor-control')).toBeNull();
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
    el.value = '2026-01-03';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dataset.entries.get('e1')!.start).toBe(instant('2026-01-03T00:00:00Z'));
    gantt.destroy();
    container.remove();
  });

  it('a one-segment entry edits its start cell, and its lone segment moves too (#212)', () => {
    // The guard above refuses an envelope write only when an entry draws several segments. One
    // segment is the envelope's own drawing, so it moves with the envelope. `e1` authors no
    // segments, so ingest filled one over `[start, end)`, and this proves that one still tracks.
    const { container, gantt, dataset } = makeGantt();
    const before = dataset.entries.get('e1')!.segments[0]!.id;
    dblclick(cellFor(container, 'e1', 'start'));
    const el = input(container);
    el.value = '2026-01-02';
    el.dispatchEvent(new Event('change', { bubbles: true }));

    const after = dataset.entries.get('e1')!;
    expect(refusal(container)).toBeNull();
    expect(after.segments).toHaveLength(1);
    expect(after.segments[0]!.start).toBe(instant('2026-01-02T00:00:00Z'));
    expect(after.segments[0]!.start).toBe(after.start);
    expect(after.segments[0]!.id).toBe(before);
    gantt.destroy();
    container.remove();
  });

  it('a non-midnight instant refuses the default date editor with a named reason (issue #137 F11)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e2', 'start'));
    const notice = refusal(container)!;
    expect(notice).not.toBeNull();
    expect(notice.dataset['reason']).toBe('time-of-day');
    expect(notice.textContent).toBe(
      'this field carries a time of day; the default date editor cannot show it',
    );
    expect(container.querySelector('.fg-cell-editor-control')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('the notice lets the pointer through, and the next pointer press clears it', () => {
    const { container, gantt } = makeGantt();
    const cell = cellFor(container, 'e1', 'cost');
    dblclick(cell);
    const notice = refusal(container)!;
    // It sits over the cell, so it must never swallow the click that retries the cell. #171 moved
    // that rule into the stylesheet, so `styles.test.ts` asserts the declaration and this asserts
    // the two attributes the rule keys on.
    expect(notice.dataset['state']).toBe('invalid');
    expect(notice.dataset['reason']).toBe('no-parse-value');

    cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(refusal(container)).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('Escape dismisses the notice', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'cost'));
    expect(refusal(container)).not.toBeNull();
    escape(container);
    expect(refusal(container)).toBeNull();
    gantt.destroy();
    container.remove();
  });

  it('opening a real editor clears a notice left by an earlier refusal', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'cost'));
    expect(refusal(container)).not.toBeNull();
    dblclick(cellFor(container, 'e1', 'name'));
    expect(refusal(container)).toBeNull();
    expect(input(container).value).toBe('Task One');
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
      // Only the first open (on "name") gets an async veto. The second (on "quantity") resolves
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
    // containerA is appended to document.body first. An unscoped document-wide lookup by entry id
    // would find *its* row first, whichever Gantt's own Enter handler actually fired. So B's own
    // handler firing must still resolve to B's own row.
    const { container: containerA, gantt: ganttA, dataset: datasetA } = makeGantt();
    const { container: containerB, gantt: ganttB, dataset: datasetB } = makeGantt();

    // #212: the Selection holds Segments, so each Gantt selects the Segment its own Entry draws.
    ganttA.selectedSegmentIds = datasetA.entries.segmentIdsOfEntries(['e1']);
    ganttB.selectedSegmentIds = datasetB.entries.segmentIdsOfEntries(['e1']);

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

    // Exactly one live control — the budget editor, still holding the value it refused.
    expect(container.querySelectorAll('.fg-cell-editor-control')).toHaveLength(1);
    expect(input(container).value).toBe('not a number');
    expect(dataset.entries.get('e1')!.meta?.budget).toBe(500);

    gantt.destroy();
    container.remove();
  });

  it('a refused commit says why the second cell did not open (review SP1, carried from R1)', () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'budget'));
    input(container).value = 'not a number';
    dblclick(cellFor(container, 'e1', 'name'));

    const notice = refusal(container)!;
    expect(notice).not.toBeNull();
    expect(notice.dataset['reason']).toBe('unsaved-value');
    expect(notice.textContent).toContain('did not save');

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

// Review A5: the session is an object, so these run it with no mounted Gantt at all. They pass
// plain ports, a plain row, and a control that answers whatever the test needs.
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
      // #168: one `MountLayer` answers mount, resize and box. The fake is one object now, not two.
      mountLayer: {
        present: (content: HTMLElement) => {
          layer.append(content);
          return () => content.remove();
        },
        onResize: () => () => {},
        bounds: rectAt(0, 0, 0, 0),
      },
      // Review A3: the session asks one seam where its cell is now. So the fake answers with the
      // cell this test built, while that cell is still in the document. A real Gantt answers from
      // the current frame, and stops answering once virtualization takes the row away.
      dom: { cellFor: () => (cell.isConnected ? cell : undefined) },
      bindEscape: () => () => {},
      entryById: () => entry,
      storedValue: () => 'Task One',
      writeValue: () => {},
      announceEntryEdit: () => {},
      requestCommit: () => {},
      requestRevert: () => {},
      raiseError: () => {},
      ...overrides,
    };
    const session = new CellEditorSession(ports, { entryId: entryId('e1'), field: 'name' }, control);
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

  it('stillAnchored() goes false once the cell leaves the frame (review A3: one answer, not two)', () => {
    const { session, row } = mountSession();
    expect(session.stillAnchored()).toBe(true);

    row.remove();

    expect(session.stillAnchored()).toBe(false);
  });
});

// #169: the state used to be three `setup()` closure mutables, and the stale-veto race could only be
// reached through a choreographed double-click sequence. It is an object now, so these drive every
// transition by direct call, with no mounted Gantt at all.
describe('CellEditing (S5.8, #169)', () => {
  function makeEditing(overrides: Partial<CellEditorPorts> = {}): {
    editing: CellEditing;
    cellA: HTMLElement;
    cellB: HTMLElement;
    layer: HTMLElement;
    reported: PluginErrorReport[];
  } {
    const layer = document.createElement('div');
    const cells = new Map<string, HTMLElement>();
    for (const field of ['name', 'cost']) {
      const cell = document.createElement('div');
      cell.dataset['field'] = field;
      cells.set(field, cell);
      document.body.append(cell);
    }
    document.body.append(layer);
    const entry = { id: entryId('e1'), name: 'Task One', kind: 'span' } as unknown as Entry;
    const reported: PluginErrorReport[] = [];
    const ports: CellEditorPorts = {
      mountLayer: {
        present: (content: HTMLElement) => {
          layer.append(content);
          return () => content.remove();
        },
        onResize: () => () => {},
        bounds: rectAt(0, 0, 0, 0),
      },
      dom: { cellFor: (_id, field) => cells.get(String(field)) },
      bindEscape: () => () => {},
      entryById: () => entry,
      storedValue: () => 'Task One',
      writeValue: () => {},
      announceEntryEdit: () => {},
      requestCommit: () => {},
      requestRevert: () => {},
      raiseError: (report) => reported.push(report),
      ...overrides,
    };
    return {
      editing: new CellEditing(ports),
      cellA: cells.get('name')!,
      cellB: cells.get('cost')!,
      layer,
      reported,
    };
  }

  function control(): CellEditorControl {
    return {
      element: document.createElement('input'),
      read: () => ({ ok: true, value: 'x' }),
      bindCommitTriggers: () => () => {},
    };
  }

  it('a stale open attempt mounts nothing over the newer one', () => {
    const { editing, cellA, cellB, layer } = makeEditing();

    // Two double-clicks, both waiting on an async `beforeEntryEdit`. The second answer lands first.
    const first = editing.beginOpen({ entryId: entryId('e1'), field: 'name' }, cellA);
    const second = editing.beginOpen({ entryId: entryId('e1'), field: 'cost' }, cellB);
    second.mount(control());
    const opened = editing.editor;
    first.mount(control());

    expect(editing.editor).toBe(opened);
    expect(editing.editor!.field).toBe('cost');
    expect(layer.querySelectorAll('.fg-cell-editor')).toHaveLength(1);
    editing.clear();
  });

  it('a stale open attempt shows no refusal over the newer one', () => {
    const { editing, cellA, cellB } = makeEditing();

    const first = editing.beginOpen({ entryId: entryId('e1'), field: 'name' }, cellA);
    const second = editing.beginOpen({ entryId: entryId('e1'), field: 'cost' }, cellB);
    second.mount(control());
    first.refuse('no-date-value');

    expect(editing.notice).toBeUndefined();
    expect(editing.editor).toBeDefined();
    editing.clear();
  });

  it('onAnchorLost() closes an editor whose Entry left the Dataset (issue #137 F10)', () => {
    const { editing, cellA } = makeEditing({ entryById: () => undefined });
    editing.beginOpen({ entryId: entryId('e1'), field: 'name' }, cellA).mount(control());

    editing.onAnchorLost();

    expect(editing.editor).toBeUndefined();
  });

  it('onAnchorLost() closes an editor whose cell left the frame (issue #137 F1)', () => {
    const { editing, cellA } = makeEditing({ dom: { cellFor: () => undefined } });
    editing.beginOpen({ entryId: entryId('e1'), field: 'name' }, cellA).mount(control());

    editing.onAnchorLost();

    expect(editing.editor).toBeUndefined();
  });

  it('onAnchorLost() leaves an editor whose anchor is still there', () => {
    const { editing, cellA } = makeEditing();
    editing.beginOpen({ entryId: entryId('e1'), field: 'name' }, cellA).mount(control());

    editing.onAnchorLost();

    expect(editing.editor).toBeDefined();
    editing.clear();
  });

  it('a refused commit keeps its editor while the second cell names why — the one legal pair', () => {
    const { editing, cellA, cellB } = makeEditing();
    editing
      .beginOpen({ entryId: entryId('e1'), field: 'name' }, cellA)
      .mount({ ...control(), read: () => ({ ok: false }) });

    expect(editing.commit()).toBe(false);
    editing.refuse({ entryId: entryId('e1'), field: 'cost' }, cellB, 'unsaved-value');

    expect(editing.editor).toBeDefined();
    expect(editing.notice!.element.dataset['reason']).toBe('unsaved-value');
    editing.clear();
  });

  it('every refusal raises one report whose code is the notice own data-reason (D-S5-40)', () => {
    const reasons: CellEditorRefusal[] = [
      'derived-value',
      'no-parse-value',
      'no-date-value',
      'time-of-day',
      'unsaved-value',
      'segmented-entry',
    ];

    for (const reason of reasons) {
      const { editing, cellA, reported } = makeEditing();
      editing.refuse({ entryId: entryId('e1'), field: 'cost' }, cellA, reason);

      expect(reported).toHaveLength(1);
      expect(reported[0]?.code).toBe(editing.notice!.element.dataset['reason']);
      expect(reported[0]?.code).toBe(reason);
      expect(reported[0]?.severity).toBe('info');
      expect(reported[0]?.entryId).toBe(entryId('e1'));
      expect(reported[0]?.field).toBe('cost');
      // The report and the notice read the user the same words.
      expect(reported[0]?.message).toBe(editing.notice!.element.textContent);
      editing.clear();
    }
  });

  it('clear() takes both down and writes nothing', () => {
    const writes: unknown[] = [];
    const { editing, cellA, cellB, layer } = makeEditing({ writeValue: (...args) => writes.push(args) });
    editing.beginOpen({ entryId: entryId('e1'), field: 'name' }, cellA).mount(control());
    editing.refuse({ entryId: entryId('e1'), field: 'cost' }, cellB, 'unsaved-value');

    editing.clear();

    expect(editing.editor).toBeUndefined();
    expect(editing.notice).toBeUndefined();
    expect(layer.querySelectorAll('.fg-cell-editor')).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });
});

// Review SP1: the notice is an object of its own, so these run it with no mounted Gantt at all.
describe('presentRefusal() (S5.8, review SP1)', () => {
  function mountNotice(): {
    notice: ReturnType<typeof presentRefusal>;
    cell: HTMLElement;
    detached: () => number;
    /** What `cellFor` answers from now on — the seam virtualization moves under a mounted notice. */
    recycleCellTo: (next: HTMLElement | undefined) => void;
    resize: () => void;
  } {
    const cell = document.createElement('div');
    cell.getBoundingClientRect = () => rectAt(40, 120, 200, 24);
    const layer = document.createElement('div');
    document.body.append(cell, layer);
    let detaches = 0;
    let current: HTMLElement | undefined = cell;
    const resizeListeners = new Set<() => void>();
    const ports: RefusalNoticePorts = {
      mountLayer: {
        present: (content: HTMLElement) => {
          layer.append(content);
          return () => {
            detaches++;
            content.remove();
          };
        },
        onResize: (callback) => {
          resizeListeners.add(callback);
          return () => {
            resizeListeners.delete(callback);
          };
        },
        bounds: rectAt(0, 0, 0, 0),
      },
      dom: { cellFor: () => current },
      bindEscape: () => () => {},
    };
    const notice = presentRefusal(ports, { entryId: entryId('e1'), field: 'name' }, cell, 'time-of-day');
    return {
      notice,
      cell,
      detached: () => detaches,
      recycleCellTo: (next) => {
        current = next;
      },
      resize: () => {
        for (const listener of resizeListeners) listener();
      },
    };
  }

  it('mounts over the cell, in the invalid state, naming the reason', () => {
    const { notice } = mountNotice();
    expect(notice.element.className).toBe('fg-cell-editor');
    expect(notice.element.dataset['state']).toBe('invalid');
    expect(notice.element.dataset['reason']).toBe('time-of-day');
    expect(notice.element.getAttribute('role')).toBe('status');
    expect(notice.element.style.transform).toBe('translate(40.00px, 120.00px)');
    expect(notice.element.style.width).toBe('200px');
    notice.dismiss();
  });

  // #172: the notice used to hold the cell node it was raised on and reposition against that node
  // for ever. Virtualization recycles that node onto another entry, and the notice would then follow
  // a cell that is no longer its own. It re-asks `cellFor`, exactly as `CellEditorSession` does.
  it('re-finds its own cell after a recycle instead of following the node it was raised on', () => {
    const { notice, recycleCellTo, resize } = mountNotice();
    expect(notice.element.style.transform).toBe('translate(40.00px, 120.00px)');

    const reused = document.createElement('div');
    reused.getBoundingClientRect = () => rectAt(40, 300, 200, 24);
    recycleCellTo(reused);
    resize();

    expect(notice.element.style.transform).toBe('translate(40.00px, 300.00px)');
    notice.dismiss();
  });

  it('stays where it is when its cell has left the frame entirely', () => {
    const { notice, recycleCellTo, resize } = mountNotice();
    recycleCellTo(undefined);
    resize();

    // The same answer `CellEditorSession.reposition()` gives: no cell, no move. The next scroll or
    // pointer press is what takes the notice down.
    expect(notice.element.style.transform).toBe('translate(40.00px, 120.00px)');
    notice.dismiss();
  });

  it('dismisses once, however many times it is asked', () => {
    const { notice, detached } = mountNotice();
    notice.dismiss();
    notice.dismiss();
    expect(detached()).toBe(1);
    expect(notice.element.isConnected).toBe(false);
  });
});
