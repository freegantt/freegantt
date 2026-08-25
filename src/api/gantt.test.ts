import { describe, expect, it } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import { TimeScaleModel } from './index.js';
import { sampleEntries } from '../../fixtures/sample-project.js';

describe('Gantt', () => {
  it('mounts fixture entries as bars in the host element', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({ host, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });
    const bars = host.querySelectorAll('.fg-bar');
    expect(bars.length).toBe(sampleEntries.length);
    gantt.destroy();
  });

  it('two Gantt instances on one page have fully independent state (I2)', () => {
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    const ganttA = new Gantt({
      host: hostA,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 5), timeZone: 'UTC' }),
    });
    const ganttB = new Gantt({
      host: hostB,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' }),
    });

    expect(hostA.querySelectorAll('.fg-bar').length).toBe(5);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttA.destroy();
    expect(hostA.children.length).toBe(0);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttB.destroy();
  });

  it('two Gantt instances sharing one TimeScaleModel compute identical bar positions (D9 seam)', () => {
    const scale = new TimeScaleModel({
      range: { start: sampleEntries[0]!.start, end: sampleEntries[0]!.end },
    });
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    const ganttA = new Gantt({
      host: hostA,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' }),
      scale,
    });
    const ganttB = new Gantt({
      host: hostB,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' }),
      scale,
    });

    const xOf = (host: HTMLElement): string[] =>
      Array.from(host.querySelectorAll<HTMLElement>('.fg-bar')).map((el) => el.style.transform);

    expect(xOf(hostA)).toEqual(xOf(hostB));

    ganttA.destroy();
    ganttB.destroy();
  });
});

describe('Gantt gridWidth and events (S1.8, plans/02 §6)', () => {
  it('beforeGridWidthChange returning false vetoes the change: gridWidth stays put', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    gantt.on('beforeGridWidthChange', () => false);
    gantt.gridWidth = 220;

    expect(gantt.gridWidth).toBe(160);
    const gridPane = host.querySelector<HTMLElement>('.fg-grid-pane')!;
    expect(gridPane.style.width).toBe('160px');

    gantt.destroy();
  });

  it('a non-vetoed change fires gridWidthChange exactly once with {from, to}', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    const seen: Array<{ from: number; to: number }> = [];
    gantt.on('gridWidthChange', (payload) => {
      seen.push(payload);
    });
    gantt.gridWidth = 220;

    expect(seen).toEqual([{ from: 160, to: 220 }]);
    expect(gantt.gridWidth).toBe(220);

    gantt.destroy();
  });

  it('off stops a handler from being called', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    const seen: Array<{ from: number; to: number }> = [];
    const handler = (payload: { from: number; to: number }): void => {
      seen.push(payload);
    };
    gantt.on('gridWidthChange', handler);
    gantt.off('gridWidthChange', handler);
    gantt.gridWidth = 220;

    expect(seen).toEqual([]);

    gantt.destroy();
  });

  it('setting gantt.gridWidth directly fires the same before/after pair a drag would', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    const before: Array<{ from: number; to: number }> = [];
    const after: Array<{ from: number; to: number }> = [];
    gantt.on('beforeGridWidthChange', (payload) => {
      before.push(payload);
    });
    gantt.on('gridWidthChange', (payload) => {
      after.push(payload);
    });
    gantt.gridWidth = 300;

    expect(before).toEqual([{ from: 160, to: 300 }]);
    expect(after).toEqual([{ from: 160, to: 300 }]);

    gantt.destroy();
  });
});
