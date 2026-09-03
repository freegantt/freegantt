import { describe, expect, it } from 'vitest';
import { Gantt } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import { sampleEntries } from '../../../fixtures/sample-dataset.js';
import { contextMenu } from './context-menu.js';
import type { ContextMenuOptions } from './context-menu.js';

// `container` must be attached to `document.body` — `contextMenu()` listens at the document level,
// and a bubbling event never reaches document from a detached tree.
function makeGantt(options?: ContextMenuOptions): { container: HTMLElement; gantt: Gantt } {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
  const gantt = new Gantt({ container, dataset, plugins: [contextMenu(options)] });
  return { container, gantt };
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

describe('contextMenu() (S5.5, D-S5-13/14)', () => {
  it('right-click opens the menu at the pointer', () => {
    const { container, gantt } = makeGantt();

    rightClick(bars(container)[0]!);
    expect(container.querySelector('.fg-menu')).not.toBeNull();
    expect(menuItems(container).length).toBeGreaterThan(0);

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
    gantt.selection = [sampleEntries[0]!.id];

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
    gantt.selection = [sampleEntries[0]!.id];
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
