import { describe, expect, it } from 'vitest';
import type { PluginContext } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import { SchedulingNotInstalledError, entryId } from '../../model/index.js';
import type { Duration, Instant } from '../../model/index.js';
import { entryDependencies } from './entry-dependencies.js';
import type { DependencyInput, DependencyType } from './entry-dependencies.js';
import { SCHEDULING_ID, scheduling } from './scheduling.js';
import type { SchedulingOptions } from './scheduling.js';
import { workingCalendar } from '../../api/schedule-facade.js';

/** Midnight UTC of January 1 plus `offset` days. */
const day = (offset: number): number => Date.UTC(2026, 0, 1 + offset);
interface ScheduleProps {
  manuallyScheduled: boolean;
  calendar?: string;
}
/** The Instant of midnight UTC, `offset` days after January 1. */
const at = (offset: number): Instant => day(offset) as Instant;
const days = (value: number): Duration => ({ value, unit: 'day' });

function dependency(id: string, fromId: string, toId: string, type: DependencyType = 'FS'): DependencyInput {
  return { id, fromId, toId, type, lag: days(0) };
}

/** A chain a → b → c, one day each: a on day 0, b on day 1, c on day 2. Every link is tight. */
function chain(options?: SchedulingOptions) {
  const dependencies = entryDependencies();
  const plugin = scheduling(options);
  const dataset = new Dataset<ScheduleProps>({
    entries: ['a', 'b', 'c'].map((id, index) => ({
      id,
      name: id,
      start: day(index),
      end: day(index + 1),
    })),
    timeZone: 'UTC',
    plugins: [dependencies, plugin],
  });
  dependencies.replaceAll([dependency('d1', 'a', 'b'), dependency('d2', 'b', 'c')]);
  return { dependencies, plugin, dataset };
}

function startOf(dataset: Dataset<ScheduleProps>, id: string): number | undefined {
  return dataset.entries.get(id)?.start;
}

/** Runs the view half against a stub that keeps the connector providers it registers. */
function connectorsOf(
  plugins: readonly { view?: (ctx: PluginContext) => unknown }[],
  dataset: Dataset<ScheduleProps>,
) {
  const providers: (() => readonly { id: string; flags?: object }[])[] = [];
  const stub = {
    dataset,
    view: {
      registerConnector(next: () => readonly { id: string; flags?: object }[]) {
        providers.push(next);
        return () => {};
      },
      onConnect: () => () => {},
      onDomEvent: () => () => {},
    },
    interaction: { registerKeyHandler: () => () => {} },
  } as unknown as PluginContext;
  for (const plugin of plugins) plugin.view?.(stub);
  return providers.flatMap((provider) => provider());
}

describe('scheduling() moves successors', () => {
  it('pushes the whole chain when a predecessor moves later, and one undo restores every Entry', () => {
    const { dataset } = chain();

    dataset.entries.update('a', { start: day(3), end: day(4) });

    expect([startOf(dataset, 'a'), startOf(dataset, 'b'), startOf(dataset, 'c')]).toEqual([
      day(3),
      day(4),
      day(5),
    ]);
    dataset.undo();
    expect([startOf(dataset, 'a'), startOf(dataset, 'b'), startOf(dataset, 'c')]).toEqual([
      day(0),
      day(1),
      day(2),
    ]);
    expect(dataset.canUndo).toBe(false);
  });

  it('pulls successors earlier when a predecessor moves earlier', () => {
    const { dataset } = chain();
    dataset.entries.update('a', { start: day(3), end: day(4) });

    dataset.entries.update('a', { start: day(1), end: day(2) });

    expect([startOf(dataset, 'a'), startOf(dataset, 'b'), startOf(dataset, 'c')]).toEqual([
      day(1),
      day(2),
      day(3),
    ]);
  });

  it('leaves successors in place when successorMoves is pushOnly and the predecessor moves earlier', () => {
    const { dataset } = chain({ successorMoves: 'pushOnly' });
    dataset.entries.update('a', { start: day(3), end: day(4) });

    dataset.entries.update('a', { start: day(1), end: day(2) });

    expect([startOf(dataset, 'b'), startOf(dataset, 'c')]).toEqual([day(4), day(5)]);
  });

  it('places an Entry where its Dependency allows when the user start breaks it, and one undo restores the old date', () => {
    const { dataset, plugin } = chain();

    dataset.entries.update('b', { start: day(0), end: day(1) });

    expect([startOf(dataset, 'b'), startOf(dataset, 'c')]).toEqual([day(1), day(2)]);
    expect(plugin.constraintOf('b')).toEqual({ kind: 'startNoEarlierThan', date: day(0) });
    expect(plugin.diagnostics()).toEqual([]);
    dataset.undo();
    expect(startOf(dataset, 'b')).toBe(day(1));
    expect(plugin.constraintOf('b')).toBeUndefined();
  });

  it('moves nothing else when a Dependency overrules a drag', () => {
    const dependencies = entryDependencies();
    const plugin = scheduling();
    const dataset = new Dataset<ScheduleProps>({
      entries: [
        { id: 'x', name: 'x', start: day(0), end: day(1) },
        { id: 'y', name: 'y', start: day(6), end: day(7) },
        { id: 'p', name: 'p', start: day(0), end: day(3) },
        { id: 'q', name: 'q', start: day(5), end: day(6) },
      ],
      timeZone: 'UTC',
      plugins: [dependencies, plugin],
    });
    dependencies.replaceAll([dependency('d1', 'x', 'y'), dependency('d2', 'p', 'q')]);

    dataset.entries.update('q', { start: day(1), end: day(2) });

    expect(startOf(dataset, 'q')).toBe(day(3));
    expect(startOf(dataset, 'y')).toBe(day(6));
  });

  it('keeps the moved span when the Dependency overrules a bar move', () => {
    const { dataset } = chain();

    dataset.entries.update('b', { start: day(0), end: day(1) });

    expect(dataset.entries.get('b')?.end).toBe(day(2));
  });

  it('keeps a user start that breaks a Dependency and reports the blocked move when editedDate is userDateWins', () => {
    const { dataset, plugin } = chain({ editedDate: 'userDateWins' });
    const seen: number[] = [];
    plugin.on('scheduleDiagnostics', (found) => seen.push(found.length));

    dataset.entries.update('b', { start: day(0), end: day(1) });

    expect(startOf(dataset, 'b')).toBe(day(0));
    expect(plugin.diagnostics()).toMatchObject([{ code: 'blocked-move', reason: 'proposed', entryId: 'b' }]);
    expect(seen).toEqual([1]);
  });

  it('stores the user start as a floor that a later pull respects', () => {
    const { dataset, plugin } = chain();
    dataset.entries.update('b', { start: day(5), end: day(6) });
    expect(plugin.constraintOf('b')).toEqual({ kind: 'startNoEarlierThan', date: day(5) });

    dataset.entries.update('a', { start: day(0), end: day(1) });

    expect(startOf(dataset, 'b')).toBe(day(5));
  });

  it('removes a constraint with clearConstraint in one undo step', () => {
    const { dataset, plugin } = chain();
    dataset.entries.update('b', { start: day(5), end: day(6) });

    plugin.clearConstraint('b');
    expect(plugin.constraintOf('b')).toBeUndefined();
    dataset.undo();

    expect(plugin.constraintOf('b')).toEqual({ kind: 'startNoEarlierThan', date: day(5) });
  });
});

describe('scheduling() setConstraint', () => {
  it('moves an Entry with no Dependency to its start floor, with its successors, in one undo step', () => {
    const { dataset, plugin } = chain();

    plugin.setConstraint('a', { kind: 'startNoEarlierThan', date: at(5) });

    expect([startOf(dataset, 'a'), startOf(dataset, 'b'), startOf(dataset, 'c')]).toEqual([
      day(5),
      day(6),
      day(7),
    ]);
    expect(plugin.constraintOf('a')).toEqual({ kind: 'startNoEarlierThan', date: at(5) });
    dataset.undo();
    expect([startOf(dataset, 'a'), startOf(dataset, 'c')]).toEqual([day(0), day(2)]);
    expect(plugin.constraintOf('a')).toBeUndefined();
  });

  it('leaves no start floor on the followers that a constraint moved', () => {
    const { dataset, plugin } = chain();
    plugin.setConstraint('a', { kind: 'startNoEarlierThan', date: at(3) });
    expect(plugin.constraintOf('b')).toBeUndefined();
    expect(plugin.constraintOf('c')).toBeUndefined();

    plugin.clearConstraint('a');
    dataset.entries.update('a', { start: day(0), end: day(1) });

    expect([startOf(dataset, 'b'), startOf(dataset, 'c')]).toEqual([day(1), day(2)]);
  });

  it('puts an Entry on its must-start-on date and reports the Dependency it breaks', () => {
    const { dataset, plugin } = chain();

    plugin.setConstraint('b', { kind: 'mustStartOn', date: at(0) });

    expect(startOf(dataset, 'b')).toBe(day(0));
    expect(plugin.diagnostics()).toMatchObject([
      { code: 'blocked-move', reason: 'mustStartOn', entryId: 'b', dependencyIds: ['d1'] },
    ]);
  });

  it('moves nothing for a finish ceiling and names the Entry when it finishes late', () => {
    const { dataset, plugin } = chain();
    const seen: number[] = [];
    plugin.on('scheduleDiagnostics', (found) => seen.push(found.length));

    plugin.setConstraint('c', { kind: 'finishNoLaterThan', date: at(2) });

    expect(startOf(dataset, 'c')).toBe(day(2));
    expect(plugin.diagnostics()).toMatchObject([
      { code: 'constraint-violated', constraint: 'finishNoLaterThan', entryId: 'c', dependencyIds: ['d2'] },
    ]);
    expect(seen).toEqual([1]);
    plugin.clearConstraint('c');
    expect(plugin.diagnostics()).toEqual([]);
  });

  it('keeps a must-start-on date when the user drags the Entry', () => {
    const { dataset, plugin } = chain();
    plugin.setConstraint('c', { kind: 'mustStartOn', date: at(2) });

    dataset.entries.update('c', { start: day(6), end: day(7) });

    expect(plugin.constraintOf('c')).toEqual({ kind: 'mustStartOn', date: at(2) });
    expect(plugin.diagnostics()).toMatchObject([
      { code: 'constraint-violated', constraint: 'mustStartOn', entryId: 'c' },
    ]);
  });

  it('throws for an Entry the Dataset lacks, and without scheduling installed', () => {
    const { plugin } = chain();

    expect(() => plugin.setConstraint('zzz', { kind: 'mustStartOn', date: at(0) })).toThrow();
    expect(() => scheduling().setConstraint('a', { kind: 'mustStartOn', date: at(0) })).toThrow(
      SchedulingNotInstalledError,
    );
  });
});

describe('scheduling() manually scheduled Entries', () => {
  it('declares a boolean Field that a grid column binds to', () => {
    const { dataset } = chain();

    expect(dataset.fields.all.find((field) => field.key === 'manuallyScheduled')?.type).toBe('boolean');
  });

  it('never moves a manually scheduled Entry and reports the broken Dependency', () => {
    const { dataset, plugin } = chain();
    dataset.entries.update('b', { manuallyScheduled: true });

    dataset.entries.update('a', { start: day(3), end: day(4) });

    expect(startOf(dataset, 'b')).toBe(day(1));
    expect(plugin.diagnostics()).toMatchObject([
      { code: 'blocked-move', reason: 'manuallyScheduled', entryId: 'b' },
    ]);
  });
});

describe('scheduling() cycles', () => {
  it('lists the members of a cycle and flags only their connectors', () => {
    const { dependencies, plugin, dataset } = chain();

    dependencies.replaceAll([
      dependency('d1', 'a', 'b'),
      dependency('d2', 'b', 'a'),
      dependency('d3', 'b', 'c'),
    ]);

    expect(plugin.diagnostics()).toEqual([{ code: 'cycle', entryIds: [entryId('a'), entryId('b')] }]);
    expect(connectorsOf([plugin], dataset)).toMatchObject([
      { id: 'dependency:d1', flags: { cycle: true } },
      { id: 'dependency:d2', flags: { cycle: true } },
    ]);
  });
});

describe('a Dataset without scheduling()', () => {
  it('draws connectors, moves nothing and declares no manuallyScheduled Field', () => {
    const dependencies = entryDependencies();
    const dataset = new Dataset({
      entries: [
        { id: 'a', start: day(0), end: day(1) },
        { id: 'b', start: day(1), end: day(2) },
      ],
      timeZone: 'UTC',
      plugins: [dependencies],
    });
    dependencies.replaceAll([dependency('d1', 'a', 'b')]);

    dataset.entries.update('a', { start: day(3), end: day(4) });

    expect(startOf(dataset, 'b')).toBe(day(1));
    expect(dataset.fields.all.some((field) => field.key === 'manuallyScheduled')).toBe(false);
    expect(connectorsOf([dependencies], dataset)).toHaveLength(1);
  });

  it('refuses a plugin call before a Dataset installs the plugin', () => {
    expect(() => scheduling().constraintOf('a')).toThrow(SchedulingNotInstalledError);
  });

  it('names entryDependencies() in requires', () => {
    expect(scheduling().id).toBe(SCHEDULING_ID);
    expect(scheduling().requires).toEqual(['freegantt.entryDependencies']);
  });
});

describe('scheduling({ calendar }) counts workdays', () => {
  const office = workingCalendar({ workdays: [1, 2, 3, 4, 5] });
  const shop = workingCalendar({ workdays: [1, 2, 3, 4, 5, 6] });

  /** Thursday January 1 2026 is day 0. Task a ends on Friday after the move below, and b follows by one day. */
  function twoTasks(options: SchedulingOptions, bCalendar?: string) {
    const dependencies = entryDependencies();
    const dataset = new Dataset<ScheduleProps>({
      entries: [
        { id: 'a', name: 'a', start: day(0), end: day(1) },
        { id: 'b', name: 'b', start: day(1), end: day(2), ...(bCalendar ? { calendar: bCalendar } : {}) },
      ],
      fields: [{ key: 'calendar', type: 'text' }],
      timeZone: 'UTC',
      plugins: [dependencies, scheduling(options)],
    });
    dependencies.replaceAll([{ id: 'd1', fromId: 'a', toId: 'b', type: 'FS', lag: days(1) }]);
    dataset.entries.update('a', { start: day(7), end: day(8) });
    return dataset;
  }

  it('skips the weekend when a lag counts workdays', () => {
    const dataset = twoTasks({ calendar: office });

    expect([startOf(dataset, 'b'), dataset.entries.get('b')?.end]).toEqual([day(11), day(12)]);
  });

  it('counts 24-hour days when no calendar is given', () => {
    const dataset = twoTasks({});

    expect(startOf(dataset, 'b')).toBe(day(9));
  });

  it('follows the calendar an Entry names in calendarField', () => {
    const calendars = { office, shop };
    const options = { calendar: office, calendars, calendarField: 'calendar' };

    expect(startOf(twoTasks(options, 'shop'), 'b')).toBe(day(9));
    expect(startOf(twoTasks(options, 'unknown'), 'b')).toBe(day(11));
    expect(startOf(twoTasks(options), 'b')).toBe(day(11));
  });
});
