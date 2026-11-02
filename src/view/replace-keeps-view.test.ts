import { describe, expect, it } from 'vitest';
import { GanttShell } from './gantt-shell.js';
import { ScrollAxis, TimeScaleModel } from '../layout/index.js';
import { rowId } from '../model/index.js';
import { DatasetState } from '../data/index.js';
import type { FlatEntryInput, Instant } from '../model/index.js';

// The consumer replaces every entry at once: after an approval, on a schedule switch, on a version
// compare. These tests ask whether the view (scroll, zoom, collapsed groups) survives that.

// view/ has no import edge to time/, so the test casts epoch milliseconds the way gantt-shell.test.ts does.
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

const FIRST_VERSION: readonly FlatEntryInput[] = [
  { id: 'g1', name: 'Group one', start: '2026-01-01', end: '2026-01-10' },
  { id: 'g1a', name: 'One A', parentId: 'g1', start: '2026-01-01', end: '2026-01-05' },
  { id: 'g2', name: 'Group two', start: '2026-01-01', end: '2026-01-10' },
  { id: 'g2a', name: 'Two A', parentId: 'g2', start: '2026-01-01', end: '2026-01-05' },
];

// Version two renames every entry. Group two vanishes only when the test says so.
function secondVersion(keepGroupTwo: boolean): readonly FlatEntryInput[] {
  const kept = FIRST_VERSION.filter((input) => keepGroupTwo || !String(input.id).startsWith('g2'));
  return kept.map((input) => ({ ...input, name: `${input.name} (v2)` }));
}

const doors = {
  'entries.load()': (dataset: DatasetState, inputs: readonly FlatEntryInput[]) =>
    dataset.entries.load(inputs),
  'entries.syncAll()': (dataset: DatasetState, inputs: readonly FlatEntryInput[]) =>
    dataset.entries.syncAll(inputs),
};

function mountWithViewChanged() {
  const dataset = new DatasetState({ entries: FIRST_VERSION, timeZone: 'UTC' });
  const scale = new TimeScaleModel({
    range: { start: instant('2026-09-01T00:00:00Z'), end: instant('2026-09-06T00:00:00Z') },
    fit: 0.00001,
  });
  const scrollX = new ScrollAxis();
  const scrollY = new ScrollAxis();
  const shell = new GanttShell({
    wiring: {},
    container: document.createElement('div'),
    dataset,
    scale,
    scroll: { x: scrollX, y: scrollY },
  });
  shell.paintFirstFrame();
  shell.zoomBy(2);
  scrollX.panTo(scrollX.state.max);
  scrollY.panTo(scrollY.state.max);
  shell.collapse('g1');
  return { dataset, shell, scale, scrollX, scrollY };
}

describe.each(Object.entries(doors))('a full replace through %s keeps scroll and zoom', (_name, replace) => {
  it.each([
    ['the collapsed group survives', true],
    ['another group goes away', false],
  ])('%s', (_case, keepGroupTwo) => {
    const { dataset, shell, scale, scrollX, scrollY } = mountWithViewChanged();
    const before = {
      pxPerMs: scale.scale.pxPerMs,
      x: scrollX.state.position,
      y: scrollY.state.position,
    };
    expect(before.x).toBeGreaterThan(0);

    replace(dataset, secondVersion(keepGroupTwo));

    expect(scale.scale.pxPerMs).toBe(before.pxPerMs);
    expect(scrollX.state.position).toBe(before.x);
    expect(scrollY.state.position).toBe(before.y);
    shell.destroy();
  });
});

describe('collapsed groups through entries.syncAll()', () => {
  it('a collapsed group that survives the replace stays collapsed', () => {
    const { dataset, shell } = mountWithViewChanged();

    dataset.entries.syncAll(secondVersion(true));

    expect(shell.collapsed).toEqual([rowId('g1')]);
    expect(shell.collapseStateOf('g1')).toBe('collapsed');
    shell.destroy();
  });

  it('a collapsed group that the replace removes leaves no collapse state behind', () => {
    const { dataset, shell } = mountWithViewChanged();
    shell.collapse('g2');

    dataset.entries.syncAll(secondVersion(false));

    expect(shell.collapsed).toEqual([rowId('g1')]);
    expect(shell.collapseStateOf('g2')).toBeUndefined();
    shell.destroy();
  });

  it('announces the dropped id once, so a consumer that stores the set stays in step', () => {
    const { dataset, shell } = mountWithViewChanged();
    shell.collapse('g2');
    const changes: unknown[] = [];
    shell.on('collapseChange', (change) => {
      changes.push(change);
    });

    dataset.entries.syncAll(secondVersion(false));

    expect(changes).toEqual([{ from: [rowId('g1'), rowId('g2')], to: [rowId('g1')] }]);
    shell.destroy();
  });
});

// A load is a new baseline (#496): it clears History and selection, and collapse returns to the
// Gantt's starting state. A consumer who wants the view kept calls `entries.syncAll()`.
describe('collapsed groups through entries.load()', () => {
  it('return to the starting state, even when the group survives', () => {
    const { dataset, shell } = mountWithViewChanged();

    dataset.entries.load(secondVersion(true));

    expect(shell.collapsed).toEqual([]);
    shell.destroy();
  });
});
