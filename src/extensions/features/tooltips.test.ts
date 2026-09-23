import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Gantt } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import { sampleEntries } from '../../../fixtures/sample-dataset.js';
import { tooltips } from './tooltips.js';

// `container` must be attached to `document.body`, not just constructed. `tooltips()` listens at
// the document level, and a bubbling event never reaches document from a detached tree.
function makeGantt(): { container: HTMLElement; gantt: Gantt } {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
  const gantt = new Gantt({ container, dataset, plugins: [tooltips({ delayMs: 100 })] });
  return { container, gantt };
}

function bars(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
}

function hover(bar: HTMLElement): void {
  bar.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
}

function unhover(bar: HTMLElement, relatedTarget: EventTarget | null = null): void {
  bar.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget }));
}

describe('[S5-A1] tooltips() (S5.5, D-S5-13)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('appears after the delay, not before', () => {
    const { container, gantt } = makeGantt();

    hover(bars(container)[0]!);
    expect(container.querySelector('.fg-tooltip')).toBeNull();

    vi.advanceTimersByTime(99);
    expect(container.querySelector('.fg-tooltip')).toBeNull();

    vi.advanceTimersByTime(1);
    expect(container.querySelector('.fg-tooltip')).not.toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('follows the hovered bar', () => {
    const { container, gantt } = makeGantt();
    const [first, second] = bars(container);

    hover(first!);
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip-title')!.textContent).toBe(sampleEntries[0]!.name);

    hover(second!);
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip-title')!.textContent).toBe(sampleEntries[1]!.name);

    gantt.destroy();
    container.remove();
  });

  it('hides on pointer-out to somewhere that is not another bar', () => {
    const { container, gantt } = makeGantt();
    const bar = bars(container)[0]!;

    hover(bar);
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip')).not.toBeNull();

    unhover(bar);
    expect(container.querySelector('.fg-tooltip')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('hides on scroll (Popup\'s own dismissOn: "scroll")', () => {
    const { container, gantt } = makeGantt();
    const bar = bars(container)[0]!;

    hover(bar);
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip')).not.toBeNull();

    const timeline = container.querySelector('.fg-timeline-pane')!;
    timeline.dispatchEvent(new Event('scroll'));
    expect(container.querySelector('.fg-tooltip')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('never moves focus (focus: "none")', () => {
    const { container, gantt } = makeGantt();
    const activeBefore = document.activeElement;

    hover(bars(container)[0]!);
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip')).not.toBeNull();
    expect(document.activeElement).toBe(activeBefore);

    gantt.destroy();
    container.remove();
  });

  it('a hover on a row, not a bar, opens no tooltip (miss)', () => {
    const { container, gantt } = makeGantt();
    const row = container.querySelector<HTMLElement>('.fg-row')!;

    row.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('a tooltipRenderer replaces the body', () => {
    const { container, gantt } = makeGantt();
    gantt.tooltipRenderer = () => ({ class: { 'my-tip': true }, text: 'custom tip' });

    hover(bars(container)[0]!);
    vi.advanceTimersByTime(100);

    const tooltip = container.querySelector('.my-tip');
    expect(tooltip?.textContent).toBe('custom tip');
    expect(container.querySelector('.fg-tooltip-title')).toBeNull();

    gantt.destroy();
    container.remove();
  });

  it('a second Gantt does not open its tooltip for a hover on the first (B1, I2)', () => {
    const { container: containerA, gantt: ganttA } = makeGantt();
    const containerB = document.createElement('div');
    document.body.append(containerB);
    // Same entry ids in both Datasets. That is the failure mode B1 found. A document-level listener
    // with no container check opens Gantt A's popup anchored on Gantt B's bar.
    const datasetB = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
    const ganttB = new Gantt({
      container: containerB,
      dataset: datasetB,
      plugins: [tooltips({ delayMs: 100 })],
    });

    hover(bars(containerB)[0]!);
    vi.advanceTimersByTime(100);

    expect(containerB.querySelector('.fg-tooltip')).not.toBeNull();
    expect(containerA.querySelector('.fg-tooltip')).toBeNull();

    ganttA.destroy();
    ganttB.destroy();
    containerA.remove();
    containerB.remove();
  });

  it('the default body includes every column marked tooltip: true (B4, D-S5-13)', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({
      entries: [{ id: 'e1', name: 'Task', start: '2026-01-01', end: '2026-01-02', props: { cost: 500 } }],
      fields: [{ key: 'cost', column: {} }],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', { field: 'cost', tooltip: true }],
      plugins: [tooltips({ delayMs: 100 })],
    });

    hover(bars(container)[0]!);
    vi.advanceTimersByTime(100);

    expect(container.querySelector('.fg-tooltip-field-label')?.textContent).toBe('cost');
    expect(container.querySelector('.fg-tooltip-field-value')?.textContent).toBe('500');

    gantt.destroy();
    container.remove();
  });

  it('removing the plugin removes its listeners and any open tooltip', () => {
    const { container, gantt } = makeGantt();

    hover(bars(container)[0]!);
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip')).not.toBeNull();

    gantt.plugins = [];
    expect(container.querySelector('.fg-tooltip')).toBeNull();

    hover(bars(container)[0]!);
    vi.advanceTimersByTime(100);
    expect(container.querySelector('.fg-tooltip')).toBeNull();

    gantt.destroy();
    container.remove();
  });
});
