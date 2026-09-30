import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { Gantt } from './gantt.js';
import type { DataPlugin } from './gantt.js';
import type { ErrorReport } from '../model/index.js';
import { ROW_DROP_REFUSAL_TEXT } from '../view/row-drop.js';

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function mount(options: { plugins?: DataPlugin[] } = {}): {
  container: HTMLDivElement;
  dataset: Dataset;
  gantt: Gantt;
} {
  const container = document.createElement('div');
  const dataset = new Dataset({
    timeZone: 'UTC',
    entries: [
      { id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-03' },
      { id: 'p2', name: 'P2', start: '2026-01-01', end: '2026-01-10' },
    ],
    ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
  });
  return { container, dataset, gantt: new Gantt({ container, dataset }) };
}

const rowOf = (container: HTMLElement, id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`.fg-row[data-entry-id="${id}"]`)!;
const barOf = (container: HTMLElement, id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`.fg-bar[data-bar-id^="${id}"]`)!;

describe('a locked Entry looks locked', () => {
  it('stamps data-locked on the row and the bar, and clears it when the Entry unlocks', async () => {
    const { container, dataset, gantt } = mount();
    expect(rowOf(container, 'a').hasAttribute('data-locked')).toBe(false);
    expect(barOf(container, 'a').hasAttribute('data-locked')).toBe(false);

    dataset.entries.update('a', { locked: true });
    await frame();
    expect(rowOf(container, 'a').hasAttribute('data-locked')).toBe(true);
    expect(barOf(container, 'a').hasAttribute('data-locked')).toBe(true);
    expect(rowOf(container, 'p2').hasAttribute('data-locked')).toBe(false);
    expect(barOf(container, 'p2').hasAttribute('data-locked')).toBe(false);

    dataset.entries.update('a', { locked: undefined });
    await frame();
    expect(rowOf(container, 'a').hasAttribute('data-locked')).toBe(false);
    expect(barOf(container, 'a').hasAttribute('data-locked')).toBe(false);
    gantt.destroy();
  });

  it('follows a lock rule that changes with no write, once the plugin calls rulesChanged()', async () => {
    let closed = false;
    let announce: (() => void) | undefined;
    const toggleable: DataPlugin = {
      id: 'demo.toggleable-bar',
      data(ctx) {
        ctx.edits.setBarMoveRule((next) => (entry) => (closed && entry.id === 'a' ? false : next(entry)));
        announce = () => ctx.edits.rulesChanged();
      },
    };
    const { container, gantt } = mount({ plugins: [toggleable] });
    expect(barOf(container, 'a').hasAttribute('data-locked')).toBe(false);

    closed = true;
    announce!();
    await frame();
    expect(rowOf(container, 'a').hasAttribute('data-locked')).toBe(true);
    expect(barOf(container, 'a').hasAttribute('data-locked')).toBe(true);

    closed = false;
    announce!();
    await frame();
    expect(rowOf(container, 'a').hasAttribute('data-locked')).toBe(false);
    expect(barOf(container, 'a').hasAttribute('data-locked')).toBe(false);
    gantt.destroy();
  });
});

describe('a refused drop says why', () => {
  const refuseP2: DataPlugin = {
    id: 'demo.refuse-p2',
    data(ctx) {
      ctx.edits.setPlaceRule((next) => (place) => (place.parent?.id === 'p2' ? 'never' : next(place)));
    },
  };

  function dragRowOnto(container: HTMLElement, row: HTMLElement, clientY: number, release: boolean): void {
    const rowsLayer = container.querySelector<HTMLElement>('.fg-rows')!;
    rowsLayer.setPointerCapture = () => undefined;
    rowsLayer.releasePointerCapture = () => undefined;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? row : original(x, y));
    rowsLayer.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    rowsLayer.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY, pointerId: 1 }));
    if (release)
      rowsLayer.dispatchEvent(new PointerEvent('pointerup', { clientX: 40, clientY, pointerId: 1 }));
    document.elementFromPoint = original;
  }

  it('shows the reason beside the pointer while the drop is refused, and hides it after', async () => {
    const { container, gantt } = mount({ plugins: [refuseP2] });
    const note = (): HTMLElement => container.querySelector<HTMLElement>('.fg-drop-note')!;
    expect(note().hidden).toBe(true);

    dragRowOnto(container, rowOf(container, 'a'), 54, false);
    await frame();
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe(ROW_DROP_REFUSAL_TEXT.parentLocked);

    container
      .querySelector('.fg-rows')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 40, clientY: 54, pointerId: 1 }));
    await frame();
    expect(note().hidden).toBe(true);
    gantt.destroy();
  });

  it('announces the reason in the live region when the refused drop is released', async () => {
    const { container, gantt } = mount({ plugins: [refuseP2] });
    const reports: ErrorReport[] = [];
    gantt.on('error', (report) => {
      reports.push(report);
    });

    dragRowOnto(container, rowOf(container, 'a'), 54, true);
    await frame();

    expect(reports.map((report) => report.code)).toEqual(['entry-drop-refused']);
    expect(container.querySelector('.fg-live-region')!.textContent).toBe(ROW_DROP_REFUSAL_TEXT.parentLocked);
    gantt.destroy();
  });

  it('gives a bar drag that reorder: false stops vertically no refused cursor and no note', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-03' },
        { id: 'p2', name: 'P2', start: '2026-01-01', end: '2026-01-10' },
      ],
    });
    const gantt = new Gantt({ container, dataset, capabilities: { reorder: false } });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.setPointerCapture = () => undefined;
    timeline.releasePointerCapture = () => undefined;
    const bar = barOf(container, 'a');
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 54, pointerId: 1 }));
    await frame();
    document.elementFromPoint = original;

    expect(container.hasAttribute('data-drop')).toBe(false);
    expect(container.querySelector<HTMLElement>('.fg-drop-note')!.hidden).toBe(true);
    gantt.destroy();
  });
});
