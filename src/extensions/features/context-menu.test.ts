import { describe, expect, it } from 'vitest';
import { Gantt } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import { sampleEntries } from '../../../fixtures/sample-dataset.js';
import { contextMenu } from './context-menu.js';
import type { ContextMenuOptions } from './context-menu.js';

// `container` must be attached to `document.body` — `contextMenu()` listens at the document level,
// and a bubbling event never reaches document from a detached tree.
function makeGantt(options?: ContextMenuOptions): { container: HTMLElement; gantt: Gantt; dataset: Dataset } {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
  const gantt = new Gantt({ container, dataset, plugins: [contextMenu(options)] });
  return { container, gantt, dataset };
}

/** One Row that owns three Entries. Only a `{ source: 'custom' }` resolver builds one, which is why
 *  #199's defect was invisible until #185 made a click on that row select all three. */
function makeGanttWithThreeOnOneRow(): { container: HTMLElement; gantt: Gantt; dataset: Dataset } {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: threeEntries, timeZone: 'UTC' });
  const gantt = new Gantt({
    container,
    dataset,
    rowSource: {
      source: 'custom',
      resolve: ({ entries }) => [{ id: 'lane-1', entryIds: entries.map((entry) => entry.id) }],
    },
    plugins: [contextMenu()],
  });
  return { container, gantt, dataset };
}

const threeEntries = sampleEntries.slice(0, 3);

function commandIds(container: HTMLElement): (string | null)[] {
  return menuItems(container).map((el) => el.getAttribute('data-command'));
}

function clickMenuItem(container: HTMLElement, command: string): void {
  const item = menuItems(container).find((el) => el.getAttribute('data-command') === command);
  item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function bars(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
}

function rightClick(
  target: HTMLElement,
  point: { clientX: number; clientY: number } = { clientX: 5, clientY: 5 },
): void {
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...point }));
}

function menuItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.fg-menu-item'));
}

describe('[S5-A1] contextMenu() (S5.5, D-S5-13/14)', () => {
  it('right-click opens the menu at the pointer', () => {
    const { container, gantt } = makeGantt();

    rightClick(bars(container)[0]!);
    expect(container.querySelector('.fg-menu')).not.toBeNull();
    expect(menuItems(container).length).toBeGreaterThan(0);

    gantt.destroy();
    container.remove();
  });

  it('a right-click on a row that owns three Entries reaches all three (#199)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    let reached: readonly string[] | undefined;
    gantt.commands.register({
      id: 'demo.lockRow',
      label: 'Lock the row',
      run: (ctx) => (reached = ctx.target?.entryIds),
    });

    rightClick(container.querySelector<HTMLElement>('.fg-row')!);
    clickMenuItem(container, 'demo.lockRow');

    // The menu now says what the selection says: a click on this row selects all three (#185).
    expect(reached).toEqual(threeEntries.map((entry) => entry.id));

    gantt.destroy();
    container.remove();
  });

  it('a command that wants exactly one Entry can still say so (#199)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    gantt.commands.register({
      id: 'demo.renameOne',
      label: 'Rename',
      when: (ctx) => ctx.target?.entryIds.length === 1,
      run: () => {},
    });

    // A bar draws one Entry, and nothing is selected, so the command offers itself there.
    rightClick(bars(container)[0]!);
    expect(commandIds(container)).toContain('demo.renameOne');

    // The row owns three, but the Selection (the one bar above) is entirely inside what the row
    // names, so #212 keeps the narrower Selection rather than widening to the row: the command
    // still sees one Entry and still offers itself.
    rightClick(container.querySelector<HTMLElement>('.fg-row')!);
    expect(commandIds(container)).toContain('demo.renameOne');

    gantt.destroy();
    container.remove();
  });

  it('a right-click on one bar of a multi-Entry row that is not selected reaches that bar alone (#199)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    let reached: readonly string[] | undefined;
    gantt.commands.register({
      id: 'demo.reached',
      label: 'Reached',
      run: (ctx) => (reached = ctx.target?.entryIds),
    });

    rightClick(bars(container)[1]!);
    clickMenuItem(container, 'demo.reached');

    expect(reached).toEqual([threeEntries[1]!.id]);

    gantt.destroy();
    container.remove();
  });

  it('a right-click on a multi-Entry row widens neither the Selection nor the acted-on set (#212)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    gantt.selectedEntryIds = [threeEntries[0]!.id];
    let reached: readonly string[] | undefined;
    gantt.commands.register({
      id: 'demo.reached',
      label: 'Reached',
      run: (ctx) => (reached = ctx.target?.entryIds),
    });

    // The row owns all three Entries, but the Selection (Entry 0 alone) sits entirely inside what
    // the row names. #212: this must act on the narrower Selection, not silently grow it to the row.
    rightClick(container.querySelector<HTMLElement>('.fg-row')!);
    clickMenuItem(container, 'demo.reached');

    expect(reached).toEqual([threeEntries[0]!.id]);
    expect(gantt.selectedEntryIds).toEqual([threeEntries[0]!.id]);

    gantt.destroy();
    container.remove();
  });

  it('a right-click on a bar inside the Selection reaches the whole Selection (#199)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    let reached: readonly string[] | undefined;
    gantt.commands.register({
      id: 'demo.reached',
      label: 'Reached',
      run: (ctx) => (reached = ctx.target?.entryIds),
    });
    gantt.selectedEntryIds = threeEntries.map((entry) => entry.id);

    rightClick(bars(container)[1]!);
    clickMenuItem(container, 'demo.reached');

    // The bar is part of the Selection, so the command acts on all three and not on the one bar.
    expect(reached).toEqual(threeEntries.map((entry) => entry.id));

    gantt.destroy();
    container.remove();
  });

  it('a right-click outside the Selection replaces the Selection with what you clicked (#199)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    gantt.selectedEntryIds = [threeEntries[0]!.id];

    rightClick(bars(container)[2]!);

    expect(gantt.selectedEntryIds).toEqual([threeEntries[2]!.id]);

    gantt.destroy();
    container.remove();
  });

  it('a right-click on a header cell leaves the Selection alone and names no Entry (#199)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    let reached: readonly string[] | undefined;
    gantt.commands.register({
      id: 'demo.reached',
      label: 'Reached',
      run: (ctx) => (reached = ctx.target?.entryIds),
    });
    gantt.selectedEntryIds = [threeEntries[0]!.id];

    rightClick(container.querySelector<HTMLElement>('.fg-col-header')!);
    clickMenuItem(container, 'demo.reached');

    // A header cell stands for no Entry, so it is part of nothing: the Selection stays, and the
    // command does not inherit it.
    expect(reached).toEqual([]);
    expect(gantt.selectedEntryIds).toEqual([threeEntries[0]!.id]);

    gantt.destroy();
    container.remove();
  });

  it('Shift+F10 with three bars selected reaches all three (#205, D-S5-14)', () => {
    const { container, gantt } = makeGanttWithThreeOnOneRow();
    let reached: readonly string[] | undefined;
    gantt.commands.register({
      id: 'demo.reached',
      label: 'Reached',
      run: (ctx) => (reached = ctx.target?.entryIds),
    });
    gantt.selectedEntryIds = threeEntries.map((entry) => entry.id);

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    );
    clickMenuItem(container, 'demo.reached');

    // The keyboard path resolves through the bar of the first selected Entry, and that bar is part of the
    // Selection, so it names the same three a right-click on any of them names.
    expect(reached).toEqual(threeEntries.map((entry) => entry.id));

    gantt.destroy();
    container.remove();
  });

  it('a native contextmenu event is suppressed (preventDefault)', () => {
    const { container, gantt } = makeGantt();
    const bar = bars(container)[0]!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
    bar.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);

    gantt.destroy();
    container.remove();
  });

  it('Shift+F10 opens at the focused row (the current selection, D-S5-6 precedent)', () => {
    const { container, gantt } = makeGantt();
    gantt.selectedEntryIds = [sampleEntries[0]!.id];

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    );

    expect(container.querySelector('.fg-menu')).not.toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('only commands whose when passes for the target appear', () => {
    const { container, gantt } = makeGantt();
    // `freegantt.expandRow`/`collapseRow` need `ctx.entry` (their own `when`) — right-clicking empty
    // canvas (no bar under the pointer) must not show them; right-clicking a bar must.
    const canvas = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    rightClick(canvas);
    const withoutEntry = menuItems(container).map((el) => el.getAttribute('data-command'));
    expect(withoutEntry).not.toContain('freegantt.collapseRow');

    rightClick(bars(container)[0]!);
    const withEntry = menuItems(container).map((el) => el.getAttribute('data-command'));
    expect(withEntry).toContain('freegantt.collapseRow');

    gantt.destroy();
    container.remove();
  });

  it('items() can append, reorder and replace the defaults', () => {
    const { container, gantt } = makeGantt({
      items: ({ defaults }) => [
        { command: 'demo.custom', label: 'Custom action' },
        { separator: true },
        ...defaults,
      ],
    });
    gantt.commands.register({ id: 'demo.custom', label: 'Custom action', run: () => {} });

    rightClick(bars(container)[0]!);
    const items = menuItems(container);
    expect(items[0]!.textContent).toBe('Custom action');
    expect(container.querySelector('.fg-menu-separator')).not.toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('Enter/click runs the command and closes the menu', () => {
    const { container, gantt } = makeGantt();
    gantt.selectedEntryIds = [sampleEntries[0]!.id];
    let ran = false;
    gantt.commands.register({ id: 'demo.run', label: 'Run me', run: () => (ran = true) });

    rightClick(bars(container)[0]!);
    const before = menuItems(container).find((el) => el.getAttribute('data-command') === 'demo.run');
    // The default items list is commands.available(ctx); demo.run has no when, so it is present.
    expect(before).toBeDefined();
    before!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(ran).toBe(true);
    expect(container.querySelector('.fg-menu')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it("Escape closes the menu and restores focus (Popup's own dismissal, D-S5-9)", () => {
    const { container, gantt } = makeGantt();
    const bar = bars(container)[0]!;
    (bar as unknown as { tabIndex: number }).tabIndex = 0;
    bar.focus();

    rightClick(bar);
    expect(container.querySelector('.fg-menu')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(container.querySelector('.fg-menu')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('a self-dismissal detaches the menu listeners, so nothing polls isOpen afterwards (review C3)', () => {
    // Before `PopupOptions.onDismiss`, Escape closed the popup and left this plugin's `click` and
    // `keydown` listeners on `document`. They stayed until the next open or plugin disposal. An
    // `isOpen` read on every click and keystroke in the page was the only guard.
    const added: string[] = [];
    const removed: string[] = [];
    type Listen = (type: string, listener: EventListener, options?: boolean) => void;
    const realAdd = document.addEventListener.bind(document) as Listen;
    const realRemove = document.removeEventListener.bind(document) as Listen;
    document.addEventListener = ((type: string, listener: EventListener, options?: boolean): void => {
      added.push(type);
      realAdd(type, listener, options);
    }) as Document['addEventListener'];
    document.removeEventListener = ((type: string, listener: EventListener, options?: boolean): void => {
      removed.push(type);
      realRemove(type, listener, options);
    }) as Document['removeEventListener'];

    const { container, gantt } = makeGantt();
    rightClick(bars(container)[0]!);
    expect(added.filter((type) => type === 'click')).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(removed.filter((type) => type === 'click')).toHaveLength(1);
    expect(removed.filter((type) => type === 'keydown')).toHaveLength(1);

    document.addEventListener = realAdd as Document['addEventListener'];
    document.removeEventListener = realRemove as Document['removeEventListener'];
    gantt.destroy();
    container.remove();
  });

  it('right-click outside the container does not open the menu or cancel the browser default (B1)', () => {
    const { container, gantt } = makeGantt();
    const outside = document.createElement('div');
    document.body.append(outside);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
    outside.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(container.querySelector('.fg-menu')).toBeNull();

    gantt.destroy();
    container.remove();
    outside.remove();
  });

  it('a second Gantt does not open its menu for a right-click on the first (B1, I2)', () => {
    const { container: containerA, gantt: ganttA } = makeGantt();
    const containerB = document.createElement('div');
    document.body.append(containerB);
    const datasetB = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
    const ganttB = new Gantt({ container: containerB, dataset: datasetB, plugins: [contextMenu()] });

    rightClick(bars(containerA)[0]!);
    expect(containerA.querySelector('.fg-menu')).not.toBeNull();
    expect(containerB.querySelector('.fg-menu')).toBeNull();

    ganttA.destroy();
    ganttB.destroy();
    containerA.remove();
    containerB.remove();
  });

  it("a click on Gantt B's open menu item never runs against Gantt A's context, even while A's menu is also open (B1 follow-up)", () => {
    const { container: containerA, gantt: ganttA } = makeGantt();
    let ranOnA = false;
    ganttA.commands.register({ id: 'demo.a', label: 'A action', run: () => (ranOnA = true) });

    const containerB = document.createElement('div');
    document.body.append(containerB);
    const datasetB = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
    const ganttB = new Gantt({ container: containerB, dataset: datasetB, plugins: [contextMenu()] });
    let ranOnB = false;
    ganttB.commands.register({ id: 'demo.b', label: 'B action', run: () => (ranOnB = true) });

    rightClick(bars(containerA)[0]!); // A's menu opens (its own document click/keydown listeners attach)
    rightClick(bars(containerB)[0]!); // B's menu also opens, independently
    expect(containerA.querySelector('.fg-menu')).not.toBeNull();
    expect(containerB.querySelector('.fg-menu')).not.toBeNull();

    const itemInB = menuItems(containerB).find((el) => el.getAttribute('data-command') === 'demo.b');
    itemInB!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Without the fix, A's document-wide click listener also matches this click. It only checks
    // `.closest('.fg-menu-item')`, not "is this mine". It would run and close against A's own menu.
    expect(ranOnB).toBe(true);
    expect(ranOnA).toBe(false);
    expect(containerA.querySelector('.fg-menu')).not.toBeNull();

    ganttA.destroy();
    ganttB.destroy();
    containerA.remove();
    containerB.remove();
  });

  it("ArrowDown inside Gantt B's open menu only cycles B's own items (B1 follow-up)", () => {
    const { container: containerA, gantt: ganttA } = makeGantt();
    const containerB = document.createElement('div');
    document.body.append(containerB);
    const datasetB = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
    const ganttB = new Gantt({ container: containerB, dataset: datasetB, plugins: [contextMenu()] });

    rightClick(bars(containerA)[0]!);
    rightClick(bars(containerB)[0]!);

    const itemsB = menuItems(containerB);
    itemsB[0]!.focus();
    containerB.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );

    // Without the fix, the document-wide querySelectorAll('.fg-menu-item') mixes A's and B's items
    // into one list. The "next" index can then land on an item that belongs to the wrong Gantt.
    expect(itemsB).toContain(document.activeElement);

    ganttA.destroy();
    ganttB.destroy();
    containerA.remove();
    containerB.remove();
  });

  it('runs the command for the right-clicked bar, not the current selection (B2, D-S5-14)', () => {
    const { container, gantt } = makeGantt();
    // Selection is empty; right-clicking a bar must still run a command whose `when` needs `ctx.entry`
    // against *that* bar's entry, not against `#buildCommandContext`'s own (empty) selection.
    expect(gantt.selectedEntryIds).toEqual([]);
    let ranFor: string | undefined;
    gantt.commands.register({
      id: 'demo.needsEntry',
      label: 'Needs entry',
      when: (ctx) => ctx.entry !== undefined,
      run: (ctx) => (ranFor = ctx.entry?.id),
    });

    const bar = bars(container)[1]!;
    rightClick(bar);
    const item = menuItems(container).find((el) => el.getAttribute('data-command') === 'demo.needsEntry');
    expect(item).toBeDefined();
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(ranFor).toBe(sampleEntries[1]!.id);

    gantt.destroy();
    container.remove();
  });

  it('runs the command for the right-clicked grid row, not just the bar (grid/bar parity)', () => {
    const { container, gantt } = makeGantt();
    let ranFor: string | undefined;
    gantt.commands.register({
      id: 'demo.needsEntry',
      label: 'Needs entry',
      when: (ctx) => ctx.entry !== undefined,
      run: (ctx) => (ranFor = ctx.entry?.id),
    });

    const row = container.querySelectorAll<HTMLElement>('.fg-row')[1]!;
    rightClick(row);
    const item = menuItems(container).find((el) => el.getAttribute('data-command') === 'demo.needsEntry');
    expect(item).toBeDefined();
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(ranFor).toBe(sampleEntries[1]!.id);

    gantt.destroy();
    container.remove();
  });

  it('removing the plugin removes its listeners and any open menu', () => {
    const { container, gantt } = makeGantt();

    rightClick(bars(container)[0]!);
    expect(container.querySelector('.fg-menu')).not.toBeNull();

    gantt.plugins = [];
    expect(container.querySelector('.fg-menu')).toBeNull();

    rightClick(bars(container)[0]!);
    expect(container.querySelector('.fg-menu')).toBeNull();

    gantt.destroy();
    container.remove();
  });
});
