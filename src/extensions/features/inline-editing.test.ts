import { describe, expect, it, vi } from 'vitest';
import { Gantt } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import type {
  DataPlugin,
  Entry,
  EntryFieldEdit,
  EntryInput,
  ErrorReport,
  GridColumnInput,
  PluginErrorReport,
} from '../../api/index.js';
import {
  EntryNotFoundError,
  MutationCancelledError,
  UnreadableCellValueError,
  entryId,
  instant,
} from '../../api/index.js';
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
  owner?: string;
  showDaysOnRow?: boolean;
}

const ENTRIES: readonly EntryInput<Meta>[] = [
  { id: 'root', name: 'Root' },
  {
    id: 'e1',
    name: 'Task One',
    parentId: 'root',
    start: '2026-01-01',
    end: '2026-01-05',
    props: { cost: 100, budget: 500, quantity: 3, showDaysOnRow: false },
  },
  {
    id: 'e2',
    name: 'Task Two',
    start: '2026-01-01T14:00:00Z', // not local midnight (issue #137 F11)
    end: '2026-01-02T14:00:00Z',
    props: { cost: 200, budget: 700 },
  },
];

// #142: `editable` is the Field's own answer now, so no column here restates it — see the `fields`
// declarations below for what opens and what refuses.
const GRID_COLUMNS: readonly GridColumnInput[] = [
  'name',
  'start',
  'end', // explicit override: not editable (see the `fields` array below)
  { field: 'cost' }, // money, no parseValue — F12 refuses to open
  { field: 'budget' }, // money, WITH parseValue — round-trips
  { field: 'quantity' }, // no `type`, `inputType: 'number'` only
  { field: 'owner' }, // editable: 'api' — the app writes it, the user never types it
  { field: 'showDaysOnRow' }, // type: 'boolean' — opens a checkbox, not a text input (Q31)
];

function makeGantt(
  options?: InlineEditingOptions,
  ganttOptions?: { locale?: Intl.LocalesArgument },
  datasetOptions?: { locale?: Intl.LocalesArgument },
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
    ...datasetOptions,
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
      { key: 'cost', type: 'money', editable: true },
      { key: 'budget', type: 'budgetMoney', editable: true },
      { key: 'quantity', inputType: 'number', editable: true, column: { header: 'Quantity' } },
      // #142: `name`/`start` are core Fields that already default to editable (`core-fields.ts`);
      // `end` is the one demonstration this suite pins closed, so it states the override itself.
      { key: 'end', editable: false },
      // ADR 0015's middle state: `entries.update()` writes it, and this cell stays dead.
      { key: 'owner', editable: 'api', column: { header: 'Owner' } },
      { key: 'showDaysOnRow', type: 'boolean', editable: true },
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
 *  It carries its own class and the machine-readable `data-reason` whose text the user reads. The
 *  class alone tells a notice from a refused *commit*'s own editor, which also carries `data-reason`
 *  (#160) — the same one selector `view/styles.ts` writes (#231). */
function refusal(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(NOTICE_SELECTOR);
}

/** The selector `view/styles.ts` ships for the notice, and the one this plugin documents. It is one
 *  string here because one test asserts it reaches no live editor. */
const NOTICE_SELECTOR = '.fg-cell-notice[data-reason]';

function enter(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

function escape(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

describe('[S5-A1] inlineEditing() (S5.8, D-S5-19/D-S5-20)', () => {
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

  it('Escape discards the edit and writes nothing (#160, D-S5-47)', () => {
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
  it("a locked column never opens, and says nothing (editable: 'never')", () => {
    const { container, gantt } = makeGantt();
    dblclick(cellFor(container, 'e1', 'end'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(refusal(container)).toBeNull();
    gantt.destroy();
    container.remove();
  });

  // ADR 0015, the second threshold: `entries.update()` writes this Field, and the cell still refuses
  // the editor. One key answers both doors, and they answer differently on purpose.
  it("an editable: 'api' column keeps its cell dead, while entries.update() writes the value", () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'owner'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(refusal(container)).toBeNull();

    dataset.entries.update('e1', { owner: 'bo' });

    expect(dataset.entries.get('e1')?.read('owner')).toBe('bo');
    gantt.destroy();
    container.remove();
  });

  // #473: a plugin's per-entry lock rule opens a Field `Field.editable` itself locks for every
  // Entry. `end` stays `'never'` on the Field, and the cell opens on `e1` only — `e2` stays dead.
  it("a plugin's per-entry lock rule opens one locked cell, and its sibling stays locked", () => {
    const opensEndOnE1: DataPlugin = {
      id: 'demo.unlock',
      data(ctx) {
        ctx.edits.setLockRule(
          (next) => (entry, field) =>
            entry.id === entryId('e1') && field === 'end' ? 'anywhere' : next(entry, field),
        );
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset<Meta>({
      entries: structuredClone([...ENTRIES]),
      timeZone: 'UTC',
      fields: [{ key: 'end', editable: false }],
      plugins: [opensEndOnE1],
    });
    const gantt = new Gantt({ container, dataset, gridColumns: ['name', 'end'], plugins: [inlineEditing()] });
    const before = dataset.entries.get('e1')!.end;

    dblclick(cellFor(container, 'e1', 'end'));
    const el = input(container);
    el.value = '2026-01-10';
    enter(el);
    expect(dataset.entries.get('e1')!.end).not.toBe(before);
    expect(container.querySelector('.fg-cell-editor')).toBeNull();

    dblclick(cellFor(container, 'e2', 'end'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(refusal(container)).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('a parentId column keeps its cell dead, while entries.update() writes parentId', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset<Meta>({ entries: structuredClone([...ENTRIES]), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', { field: 'parentId', header: 'Authored parent' }],
      plugins: [inlineEditing()],
    });

    dblclick(cellFor(container, 'e1', 'parentId'));
    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(refusal(container)).toBeNull();

    dataset.entries.update('e1', { parentId: 'e2' });
    expect(dataset.entries.get('e1')?.read('parentId')).toBe('e2');

    gantt.destroy();
    container.remove();
  });

  it('capabilities.edit: false refuses every cell', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset<Meta>({ entries: structuredClone([...ENTRIES]), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      capabilities: { edit: false },
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
    expect(notice.textContent).toContain('comes from its children');
    expect(notice.title).toBe(notice.textContent);
    expect(container.querySelector('.fg-cell-editor-control')).toBeNull();
    gantt.destroy();
    container.remove();
  });

  // Retired (ADR 0026, #421): 'a segmented entry refuses its start cell instead of throwing on
  // commit' pinned the 'segmented-entry' refusal reason, and 'a segmented entry still edits a field
  // that is not its envelope' pinned the flip side of the same guard — both gone with the several-
  // Segment single Entry the guard existed to protect. Every Entry now writes start/end the same way
  // ('committing a new date writes one transaction' below), so there is no envelope guard left to
  // refuse a start edit, and no distinct "non-envelope field" case left to name — the plain name-edit
  // path ('Enter commits one transaction and closes the editor') already covers editing a field that
  // is not start/end.

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
    expect(dataset.entries.get('e1')!.read('budget')).toBe(650);
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
    expect(dataset.entries.get('e1')!.read('budget')).toBe(500);
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

  it('a type: boolean cell opens a checkbox seeded from its stored value, and writes through .checked (Q31)', () => {
    const { container, gantt, dataset } = makeGantt();
    dblclick(cellFor(container, 'e1', 'showDaysOnRow'));
    const el = input(container);
    expect(el.type).toBe('checkbox');
    expect(el.checked).toBe(false); // seeded from e1's stored `false`
    el.checked = true;
    enter(el);
    expect(dataset.entries.get('e1')!.read('showDaysOnRow')).toBe(true);
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

  it('core end opens the date editor by type, not by key', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({
      entries: structuredClone([...ENTRIES]),
      timeZone: 'UTC',
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'start', 'end'],
      plugins: [inlineEditing()],
    });
    dblclick(cellFor(container, 'e1', 'end'));
    expect(input(container).type).toBe('date');
    gantt.destroy();
    container.remove();
  });

  it('a consumer Instant Field with type: date opens the date editor with no local fieldTypes.date', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({
      entries: [
        {
          id: 'e1',
          name: 'Task',
          start: '2026-01-01',
          end: '2026-01-05',
          props: { permitExpiry: instant('2026-06-15T00:00:00Z') },
        },
      ],
      timeZone: 'UTC',
      fields: [{ key: 'permitExpiry', type: 'date', column: { header: 'Permit' } }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'permitExpiry'],
      plugins: [inlineEditing()],
    });
    dblclick(cellFor(container, 'e1', 'permitExpiry'));
    expect(input(container).type).toBe('date');
    expect(input(container).value).toBe('2026-06-15');
    gantt.destroy();
    container.remove();
  });

  it('a Field with no type does not open the date editor', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({
      entries: [
        {
          id: 'e1',
          name: 'Task',
          start: '2026-01-01',
          end: '2026-01-05',
          props: { permitExpiry: instant('2026-06-15T00:00:00Z') },
        },
      ],
      timeZone: 'UTC',
      fields: [{ key: 'permitExpiry', column: { header: 'Permit' } }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'permitExpiry'],
      plugins: [inlineEditing()],
    });
    dblclick(cellFor(container, 'e1', 'permitExpiry'));
    expect(input(container).type).toBe('text');
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

  // Retired (ADR 0026, #421): 'a one-segment entry edits its start cell, and its lone segment moves
  // too' pinned an envelope guard that only let a start/end write through when the Entry's one
  // Segment tracked it — the guard, the Segment, and `Entry.segments` are all gone, and 'committing a
  // new date writes one transaction' above already proves the surviving question: editing `start`
  // writes it straight to the Entry, no Segment involved.

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
    // what the rule keys on.
    expect(notice.className).toBe('fg-cell-notice');
    expect(notice.dataset['reason']).toBe('no-parse-value');

    cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(refusal(container)).toBeNull();

    gantt.destroy();
    container.remove();
  });

  // #231: the notice's selector is published (`plans/02` §S5.8 Parts), so a consumer writes it by
  // hand. While a notice and a refused editor shared one class, that hand-written selector matched
  // the live editor too, and the notice's own `pointer-events: none` put the editor's control and its
  // discard button out of reach. Two classes are what stop it, so this asserts the two never cross.
  it('the published notice selector reaches no live editor, and the editor selector reaches no notice', () => {
    const { container, gantt, dataset } = makeGantt();
    dataset.on('beforeChange', () => false);

    dblclick(cellFor(container, 'e1', 'cost'));
    const notice = refusal(container)!;
    expect(notice).not.toBeNull();
    expect(notice.matches('.fg-cell-editor')).toBe(false);

    dblclick(cellFor(container, 'e1', 'name'));
    const el = input(container);
    el.value = 'Vetoed';
    enter(el);
    const editor = container.querySelector<HTMLElement>('.fg-cell-editor[data-state="invalid"]')!;

    // The editor is refused and carries its own `data-reason`, and it still stays outside every
    // selector written for the notice.
    expect(editor.dataset['reason']).toBe('refused-write');
    expect(editor.matches(NOTICE_SELECTOR)).toBe(false);
    expect(container.querySelectorAll(NOTICE_SELECTOR)).toHaveLength(0);
    expect(editor.querySelector('.fg-cell-editor-discard')).not.toBeNull();

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

  it("a consumer dateInput factory receives the Dataset's own locale when the Gantt names none (#583)", () => {
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
      undefined,
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

  // #160: the invalid editor's own exit, for a pointer user who does not know Escape.
  describe('the invalid editor has a visible exit (#160, D-S5-47)', () => {
    function discardButton(container: HTMLElement): HTMLButtonElement | null {
      return container.querySelector<HTMLButtonElement>('.fg-cell-editor-discard');
    }

    it('a valid open editor shows no discard button, and a successful commit never grows one', () => {
      const { container, gantt, dataset } = makeGantt();
      dblclick(cellFor(container, 'e1', 'name'));
      expect(discardButton(container)).toBeNull();

      const el = input(container);
      el.value = 'Renamed';
      enter(el);

      expect(dataset.entries.get('e1')!.name).toBe('Renamed');
      expect(container.querySelector('.fg-cell-editor')).toBeNull();
      gantt.destroy();
      container.remove();
    });

    it('a beforeChange veto shows the discard button, naming the reason on the wrapper', () => {
      const { container, gantt, dataset } = makeGantt();
      dataset.on('beforeChange', () => false);
      dblclick(cellFor(container, 'e1', 'name'));
      const el = input(container);
      el.value = 'Vetoed';
      enter(el);

      const button = discardButton(container)!;
      expect(button).not.toBeNull();
      expect(button.getAttribute('aria-label')).toBe('Discard edit');
      expect(button.textContent).toBe('×');
      const wrapper = container.querySelector<HTMLElement>('.fg-cell-editor[data-state="invalid"]')!;
      expect(wrapper.dataset['reason']).toBe('refused-write');

      gantt.destroy();
      container.remove();
    });

    it('a vetoed cell commit raises two reports — core says who refused, the editor says what is unsaved (#234)', () => {
      const { container, gantt, dataset } = makeGantt();
      const reports: ErrorReport[] = [];
      dataset.on('error', (report) => {
        reports.push(report);
      });
      gantt.on('error', (report) => {
        reports.push(report);
      });
      dataset.on('beforeChange', () => false);

      dblclick(cellFor(container, 'e1', 'name'));
      const el = input(container);
      el.value = 'Vetoed';
      enter(el);

      expect(reports.map((report) => report.code)).toEqual(['mutation-cancelled', 'refused-write']);
      expect(reports[0]?.by).toBe('consumer');
      expect(reports[1]?.by).toBe('freegantt.inlineEditing');
      expect(reports[1]?.severity).toBe('info');
      expect(reports[1]?.entryId).toBe(entryId('e1'));
      expect(reports[1]?.field).toBe('name');
      // The two say different things on one feed. Core's names the refusal; the editor's names the
      // unsaved value it still holds. Neither restates the other (#234's first condition).
      expect(reports[0]?.message).toContain('refused');
      expect(reports[1]?.message).not.toContain('refused');
      expect(reports[1]?.message).toBe(
        'this editor still holds a value that did not save; correct it, or discard the edit',
      );
      // One cause, two reports: the refused ChangeSet is readable off either one.
      expect(reports[1]?.cause).toBeInstanceOf(MutationCancelledError);
      expect(reports[1]?.cause).toBe(reports[0]?.cause);

      gantt.destroy();
      container.remove();
    });

    it('a parseValue refusal reports, carrying the field and the text the user typed (#234)', () => {
      const { container, gantt } = makeGantt();
      const reports: ErrorReport[] = [];
      gantt.on('error', (report) => {
        reports.push(report);
      });

      dblclick(cellFor(container, 'e1', 'budget'));
      const el = input(container);
      el.value = 'not a number';
      enter(el);

      expect(reports).toHaveLength(1);
      expect(reports[0]?.code).toBe('unreadable-value');
      expect(reports[0]?.severity).toBe('info');
      expect(reports[0]?.field).toBe('budget');
      // The typed text is a member, never spliced into the message a consumer logs.
      expect(reports[0]?.message).not.toContain('not a number');
      const cause = reports[0]?.cause;
      expect(cause).toBeInstanceOf(UnreadableCellValueError);
      expect((cause as UnreadableCellValueError).text).toBe('not a number');
      expect((cause as UnreadableCellValueError).field).toBe('budget');

      gantt.destroy();
      container.remove();
    });

    it('the invalid editor hovers the same words its report carries', () => {
      const { container, gantt } = makeGantt();
      const reports: ErrorReport[] = [];
      gantt.on('error', (report) => {
        reports.push(report);
      });

      dblclick(cellFor(container, 'e1', 'budget'));
      const el = input(container);
      el.value = 'not a number';
      enter(el);

      const wrapper = container.querySelector<HTMLElement>('.fg-cell-editor[data-state="invalid"]')!;
      expect(wrapper.title).toBe(reports[0]?.message);
      expect(wrapper.title).toBe(
        'this editor cannot read a value from the text; correct it, or discard the edit',
      );

      gantt.destroy();
      container.remove();
    });

    it('an invalid parseValue result names unreadable-value, and shows the discard button', () => {
      const { container, gantt } = makeGantt();
      dblclick(cellFor(container, 'e1', 'budget'));
      const el = input(container);
      el.value = 'not a number';
      enter(el);

      const wrapper = container.querySelector<HTMLElement>('.fg-cell-editor[data-state="invalid"]')!;
      expect(wrapper.dataset['reason']).toBe('unreadable-value');
      expect(discardButton(container)).not.toBeNull();

      gantt.destroy();
      container.remove();
    });

    it('clicking the discard button closes the editor and writes nothing', () => {
      const { container, gantt, dataset } = makeGantt();
      dataset.on('beforeChange', () => false);
      dblclick(cellFor(container, 'e1', 'name'));
      input(container).value = 'Vetoed';
      enter(input(container));

      discardButton(container)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(container.querySelector('.fg-cell-editor')).toBeNull();
      expect(dataset.entries.get('e1')!.name).toBe('Task One');
      gantt.destroy();
      container.remove();
    });

    it("gantt.commands.run('freegantt.discardCellEdit') closes the editor and writes nothing", () => {
      const { container, gantt, dataset } = makeGantt();
      dataset.on('beforeChange', () => false);
      dblclick(cellFor(container, 'e1', 'name'));
      input(container).value = 'Vetoed';
      enter(input(container));
      expect(container.querySelector('.fg-cell-editor')).not.toBeNull();

      gantt.commands.run('freegantt.discardCellEdit');

      expect(container.querySelector('.fg-cell-editor')).toBeNull();
      expect(dataset.entries.get('e1')!.name).toBe('Task One');
      gantt.destroy();
      container.remove();
    });

    // #231: one command behind both entry points. Escape used to call the plugin's own method and
    // skip the registry, so a consumer's override changed the button and left the keyboard alone.
    it('an overridden freegantt.discardCellEdit answers Escape and the discard button alike', () => {
      const { container, gantt, dataset } = makeGantt();
      const ran: string[] = [];
      gantt.commands.register({
        id: 'freegantt.discardCellEdit',
        label: 'Discard edit',
        run: () => ran.push('override'),
      });

      // Escape over a valid editor: the override runs, and it alone decides the editor stays open.
      dblclick(cellFor(container, 'e1', 'name'));
      escape(input(container));
      expect(ran).toEqual(['override']);
      expect(container.querySelector('.fg-cell-editor')).not.toBeNull();

      // The invalid editor's own button: the same override, the same answer.
      dataset.on('beforeChange', () => false);
      input(container).value = 'Vetoed';
      enter(input(container));
      discardButton(container)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(ran).toEqual(['override', 'override']);
      expect(container.querySelector('.fg-cell-editor')).not.toBeNull();

      gantt.destroy();
      container.remove();
    });

    it("the command's when declines with no editor open, and run() is then a silent no-op", () => {
      const { container, gantt, dataset } = makeGantt();
      expect(container.querySelector('.fg-cell-editor')).toBeNull();

      expect(() => gantt.commands.run('freegantt.discardCellEdit')).not.toThrow();
      expect(gantt.commands.available().map((c) => c.id)).not.toContain('freegantt.discardCellEdit');
      expect(dataset.entries.get('e1')!.name).toBe('Task One');
      gantt.destroy();
      container.remove();
    });

    it('blur while invalid does not re-commit and does not pull focus back (Q4)', () => {
      const { container, gantt, dataset } = makeGantt();
      dataset.on('beforeChange', () => false);
      dblclick(cellFor(container, 'e1', 'name'));
      const el = input(container);
      el.value = 'Vetoed';
      enter(el);
      expect(container.querySelector('.fg-cell-editor[data-state="invalid"]')).not.toBeNull();

      // A second `#markInvalid()` call would call `el.focus()` again — the trap this issue closes.
      const focusSpy = vi.spyOn(el, 'focus');
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

      expect(focusSpy).not.toHaveBeenCalled();
      expect(container.querySelector('.fg-cell-editor[data-state="invalid"]')).not.toBeNull();
      expect(dataset.entries.get('e1')!.name).toBe('Task One');

      gantt.destroy();
      container.remove();
    });

    it("the discard button joins the invalid editor's focus cycle (Q6)", () => {
      const { container, gantt } = makeGantt();
      dblclick(cellFor(container, 'e1', 'budget'));
      const el = input(container);
      el.value = 'not a number';
      enter(el);
      const button = discardButton(container)!;

      // `activateFocusTrap` only ever moves focus by explicit call, on the wrap-around edges — a
      // plain forward Tab from the control relies on the browser's own tab order, which this test
      // environment does not simulate. Both wraps below are the trap's own JS, and both prove the
      // button is a second stop in the cycle rather than the pre-#160 single-item loop.
      el.focus();
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(button);

      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(el);

      gantt.destroy();
      container.remove();
    });

    it('a second cell double-clicked over an invalid editor still raises unsaved-value (C2 unbroken)', () => {
      const { container, gantt, dataset } = makeGantt();
      dataset.on('beforeChange', () => false);
      dblclick(cellFor(container, 'e1', 'name'));
      input(container).value = 'Vetoed';
      enter(input(container));

      dblclick(cellFor(container, 'e1', 'budget'));

      const notice = refusal(container)!;
      expect(notice).not.toBeNull();
      expect(notice.dataset['reason']).toBe('unsaved-value');
      // The first editor is still there, still invalid: opening a second cell never orphaned it.
      expect(
        container.querySelector('.fg-cell-editor[data-state="invalid"] .fg-cell-editor-control'),
      ).not.toBeNull();
      expect(dataset.entries.get('e1')!.name).toBe('Task One');

      gantt.destroy();
      container.remove();
    });
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
    const { container: containerA, gantt: ganttA } = makeGantt();
    const { container: containerB, gantt: ganttB } = makeGantt();

    // Enter opens the cell that holds keyboard focus, not the selected entry. Real
    // focus lives on one Gantt's own DOM at a time, so B's own cell must not affect A's.
    cellFor(containerB, 'e1', 'name').focus();

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
    expect(dataset.entries.get('e1')!.read('budget')).toBe(500);

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
      gridColumns: ['name'],
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

describe('entryActivate precedence against inlineEditing() (#434)', () => {
  it('Enter on an editable, focused cell opens the editor and does not activate', () => {
    const { container, gantt } = makeGantt();
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    cellFor(container, 'e1', 'name').focus();
    enter(container);

    expect(input(container).value).toBe('Task One');
    expect(activations).toEqual([]);

    gantt.destroy();
    container.remove();
  });

  it('Enter on a non-editable, focused cell activates instead of opening an editor', () => {
    // 'end' is the fixture's own locked column (editable: false, see GRID_COLUMNS above).
    const { container, gantt, dataset } = makeGantt();
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    cellFor(container, 'e1', 'end').focus();
    enter(container);

    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(activations).toEqual([{ entry: dataset.entries.get('e1'), cause: 'key', target: 'gridCell' }]);

    gantt.destroy();
    container.remove();
  });

  it('a double-click on an editable cell opens the editor and does not activate, even opted in', () => {
    const { container, gantt } = makeGantt();
    // Opt in after mount — the getter/setter pair `Gantt.pointerActivation` reconfigures live.
    gantt.pointerActivation = 'dblclick';
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    // #434: a real double-click's first mousedown moves DOM focus onto the cell before `dblclick`
    // fires — the gantt-shell listener asks the same "does the editor take this cell?" question
    // `Enter` does, off that same real focus. This synthetic `dblclick` carries no
    // mousedown of its own, so the test moves focus itself first.
    const cell = cellFor(container, 'e1', 'name');
    cell.focus();
    dblclick(cell);

    expect(input(container).value).toBe('Task One');
    expect(activations).toEqual([]);

    gantt.destroy();
    container.remove();
  });

  it('a double-click on a non-editable cell activates in double-click mode', () => {
    // 'end' is the fixture's own locked column (editable: false, see GRID_COLUMNS above).
    const { container, gantt, dataset } = makeGantt();
    gantt.pointerActivation = 'dblclick';
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    dblclick(cellFor(container, 'e1', 'end'));

    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(activations).toEqual([
      { entry: dataset.entries.get('e1'), cause: 'dblclick', target: 'gridCell' },
    ]);

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
      requestDiscard: () => {},
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

    session.discard();
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
    const entry = { id: entryId('e1'), name: 'Task One' } as unknown as Entry;
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
      requestDiscard: () => {},
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

  it('mounts over the cell under its own class, naming the reason', () => {
    const { notice } = mountNotice();
    expect(notice.element.className).toBe('fg-cell-notice');
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

// ADR 0017 deleted `fieldContextFor()`: `FieldContext` is `{ timeZone }`, which is public, and a
// `parseValue` that needs a sibling value reads it off the live `entry` it is parsing into.
describe('parseValue reads the ambient zone and the row it parses into (ADR 0017)', () => {
  /** A Field whose parse depends on two things `extensions/` used to build a shim to reach. */
  function makeSiblingReadingGantt(): { container: HTMLElement; gantt: Gantt; dataset: Dataset } {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({
      timeZone: 'Europe/Warsaw',
      entries: [
        { id: 'e1', name: 'One', start: '2026-01-01', end: '2026-01-05', props: { unit: 'day', span: 2 } },
      ],
      fields: [
        { key: 'unit' },
        {
          key: 'span',
          editable: true,
          column: { header: 'Span' },
          formatValue: (value) => (typeof value === 'number' ? String(value) : ''),
          // The zone is ambient; the unit is a sibling Field on the row this text is typed into.
          parseValue: (text, ctx, entry) => {
            const typed = Number(text);
            if (!Number.isFinite(typed)) return undefined;
            return entry.read('unit') === 'day' && ctx.timeZone === 'Europe/Warsaw' ? typed : -1;
          },
        },
      ],
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', { field: 'span' }],
      plugins: [inlineEditing()],
    });
    return { container, gantt, dataset };
  }

  it('parses with a sibling Field off the entry, and with the Dataset zone off the context', () => {
    const { container, gantt, dataset } = makeSiblingReadingGantt();

    dblclick(cellFor(container, 'e1', 'span'));
    const el = input(container);
    el.value = '7';
    enter(el);

    expect(dataset.entries.get('e1')!.read('span')).toBe(7);

    gantt.destroy();
    container.remove();
  });
});

describe('the End editor shows the last covered day and stores the next day (#577)', () => {
  function makeEndGantt(entry: EntryInput): {
    container: HTMLElement;
    gantt: Gantt;
    dataset: Dataset;
  } {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({ entries: [entry], timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'start', 'end'],
      plugins: [inlineEditing()],
    });
    return { container, gantt, dataset };
  }

  it('opens on the last covered day, and an unchanged Enter leaves the stored end untouched', () => {
    const { container, gantt, dataset } = makeEndGantt({
      id: 'e1',
      name: 'Task',
      start: '2026-03-02',
      end: '2026-03-04',
    });
    dblclick(cellFor(container, 'e1', 'end'));
    expect(input(container).value).toBe('2026-03-04');
    enter(input(container));
    expect(dataset.entries.get('e1')!.end).toBe(instant('2026-03-05T00:00:00Z'));
    gantt.destroy();
    container.remove();
  });

  it('typing a day stores the day after it', async () => {
    const { container, gantt, dataset } = makeEndGantt({
      id: 'e1',
      name: 'Task',
      start: '2026-03-02',
      end: '2026-03-04',
    });
    dblclick(cellFor(container, 'e1', 'end'));
    const el = input(container);
    el.value = '2026-03-10';
    enter(el);
    expect(dataset.entries.get('e1')!.end).toBe(instant('2026-03-11T00:00:00Z'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(cellFor(container, 'e1', 'end').textContent).toBe('Mar 10, 2026');
    gantt.destroy();
    container.remove();
  });

  it('an end with no start opens on its own last covered day', () => {
    const { container, gantt } = makeEndGantt({ id: 'e1', name: 'Task', end: '2026-03-04' });
    dblclick(cellFor(container, 'e1', 'end'));
    expect(input(container).value).toBe('2026-03-04');
    gantt.destroy();
    container.remove();
  });

  it('a zero-length span opens on its own day, and an unchanged Enter keeps it zero-length', () => {
    // A date-only `end` always ingests to the next day's start (ruling 2), so a genuine
    // zero-length span needs its own end written as an already-resolved instant, matching start.
    const { container, gantt, dataset } = makeEndGantt({
      id: 'e1',
      name: 'Task',
      start: '2026-03-05',
      end: '2026-03-05T00:00:00Z',
    });
    dblclick(cellFor(container, 'e1', 'end'));
    expect(input(container).value).toBe('2026-03-05');
    enter(input(container));
    expect(dataset.entries.get('e1')!.end).toBe(instant('2026-03-05T00:00:00Z'));
    gantt.destroy();
    container.remove();
  });

  it('a blank End commits the typed day as the next day, and the cell shows the typed day', async () => {
    const { container, gantt, dataset } = makeEndGantt({
      id: 'e1',
      name: 'Task',
      start: '2026-03-02',
    });
    dblclick(cellFor(container, 'e1', 'end'));
    expect(input(container).value).toBe('');
    const el = input(container);
    el.value = '2026-03-04';
    enter(el);
    expect(dataset.entries.get('e1')!.end).toBe(instant('2026-03-05T00:00:00Z'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(cellFor(container, 'e1', 'end').textContent).toBe('Mar 4, 2026');
    gantt.destroy();
    container.remove();
  });

  it('a timed end still refuses the default editor with the time-of-day reason (#137)', () => {
    const { container, gantt } = makeEndGantt({
      id: 'e1',
      name: 'Task',
      start: '2026-03-02',
      end: '2026-03-04T14:00:00Z',
    });
    dblclick(cellFor(container, 'e1', 'end'));
    expect(refusal(container)!.dataset['reason']).toBe('time-of-day');
    gantt.destroy();
    container.remove();
  });

  it('an edited end, saved as an Instant, loads back unchanged', () => {
    const { container, gantt, dataset } = makeEndGantt({
      id: 'e1',
      name: 'Task',
      start: '2026-03-02',
      end: '2026-03-04',
    });
    dblclick(cellFor(container, 'e1', 'end'));
    const el = input(container);
    el.value = '2026-03-10';
    enter(el);
    const edited = dataset.entries.get('e1')!;
    gantt.destroy();
    container.remove();

    const {
      container: container2,
      gantt: gantt2,
      dataset: dataset2,
    } = makeEndGantt({ id: 'e1', name: 'Task', start: edited.start, end: edited.end });
    expect(dataset2.entries.get('e1')!.end).toBe(edited.end);
    expect(cellFor(container2, 'e1', 'end').textContent).toBe('Mar 10, 2026');
    gantt2.destroy();
    container2.remove();
  });
});
