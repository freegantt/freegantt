import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { entryId, type EntryId, type Instant } from '../model/index.js';
import { MS, addMs } from '../time/index.js';
import { goldenScenarios } from './golden/index.js';
import { day, toExpectedResult, toRequest } from './golden/scenario.js';
import { schedule } from './schedule.js';
import type {
  ScheduleDependency,
  ScheduleDependencyType,
  ScheduleEntry,
  ScheduleRequest,
} from './schedule-request.js';
import { defaultPolicy, type SchedulingPolicy } from './scheduling-policy.js';

describe('schedule — golden scenarios', () => {
  it.each(goldenScenarios.map((scenario) => [scenario.name, scenario] as const))('%s', (_name, scenario) => {
    expect(schedule(toRequest(scenario))).toEqual(toExpectedResult(scenario));
  });
});

function chain(length: number): ScheduleRequest {
  const entries: ScheduleEntry[] = Array.from({ length: length + 1 }, (_, index) => ({
    id: entryId(`e${index}`),
    start: day(0),
    end: day(1),
    hasChildren: false,
  }));
  const dependencies: ScheduleDependency[] = Array.from({ length }, (_, index) => ({
    id: `d${index}`,
    fromId: entryId(`e${index}`),
    toId: entryId(`e${index + 1}`),
    type: 'FS',
    lag: { value: 0, unit: 'day' },
  }));
  return { entries, dependencies };
}

describe('schedule — deep chains', () => {
  it('lays a 5,000-link chain end to end with no recursion failure', () => {
    const result = schedule(chain(5000));
    expect(result.diagnostics).toEqual([]);
    expect(result.patch).toHaveLength(10_000);
    expect(result.patch.at(-2)).toEqual({ id: 'e5000', field: 'start', from: day(0), to: day(5000) });
    expect(result.patch.at(-1)).toEqual({ id: 'e5000', field: 'end', from: day(1), to: day(5001) });
  });

  it('pushes a 5,000-link chain from one edit', () => {
    const request: ScheduleRequest = {
      ...chain(5000),
      proposed: new Map([[entryId('e0'), { start: day(1), end: day(2) }]]),
    };
    const result = schedule(request);
    expect(result.patch).toHaveLength(2 * 5000);
    expect(result.patch.at(-1)).toEqual({ id: 'e5000', field: 'end', from: day(1), to: day(5002) });
  });

  it('names a 5,000-member cycle without recursion', () => {
    const request = chain(5000);
    const closing: ScheduleDependency = {
      id: 'closing',
      fromId: entryId('e5000'),
      toId: entryId('e0'),
      type: 'FS',
      lag: { value: 0, unit: 'day' },
    };
    const result = schedule({ ...request, dependencies: [...request.dependencies, closing] });
    expect(result.patch).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code: 'cycle' });
  });
});

describe('schedule — contract', () => {
  const pair = (
    type: ScheduleDependencyType,
    lagValue: number,
    unit: 'hour' | 'week' | 'month',
  ): ScheduleRequest => ({
    entries: [
      { id: entryId('a'), start: day(0), end: day(2), hasChildren: false },
      { id: entryId('b'), start: day(0), end: day(1), hasChildren: false },
    ],
    dependencies: [
      { id: 'd1', fromId: entryId('a'), toId: entryId('b'), type, lag: { value: lagValue, unit } },
    ],
  });

  it('counts hours and weeks as fixed lengths', () => {
    expect(schedule(pair('FS', 12, 'hour')).patch[0]?.to).toBe(addMs(day(2), 12 * MS.HOUR));
    expect(schedule(pair('FS', 1, 'week')).patch[0]?.to).toBe(day(9));
  });

  it('skips a dependency whose unit has no fixed length', () => {
    expect(schedule(pair('FS', 1, 'month'))).toEqual({
      patch: [],
      diagnostics: [{ code: 'unsupported-lag-unit', dependencyId: 'd1' }],
    });
  });

  it('skips a dependency on an Entry with no dates', () => {
    const request = pair('FS', 0, 'hour');
    const undated: ScheduleEntry = { id: entryId('b'), hasChildren: false };
    expect(schedule({ ...request, entries: [request.entries[0] as ScheduleEntry, undated] }).patch).toEqual(
      [],
    );
  });

  it('never mutates its request and answers the same twice', () => {
    const request = toRequest(goldenScenarios[0] as (typeof goldenScenarios)[number]);
    const frozen = structuredClone({ ...request, proposed: undefined, manuallyScheduled: undefined });
    const first = schedule(request);
    expect({ ...request, proposed: undefined, manuallyScheduled: undefined }).toEqual(frozen);
    expect(schedule(request)).toEqual(first);
  });

  it('lets precedence put a dependency above a manual schedule', () => {
    const request = toRequest({
      name: 'manual',
      entries: [
        ['a', 0, 2],
        ['b', 0, 1],
      ],
      dependencies: [['d1', 'a', 'b', 'FS', 0]],
      manuallyScheduled: ['b'],
      expected: { patch: [] },
    });
    const policy: SchedulingPolicy = { ...defaultPolicy, precedence: ['dependency', 'manuallyScheduled'] };
    expect(schedule({ ...request, policy })).toEqual({
      patch: [
        { id: 'b', field: 'start', from: day(0), to: day(2) },
        { id: 'b', field: 'end', from: day(1), to: day(3) },
      ],
      diagnostics: [],
    });
  });

  it('lets a policy with no manuallyScheduled rule ignore manually scheduled Entries', () => {
    const request = toRequest({
      name: 'manual',
      entries: [
        ['a', 0, 2],
        ['b', 0, 1],
      ],
      dependencies: [['d1', 'a', 'b', 'FS', 0]],
      manuallyScheduled: ['b'],
      expected: { patch: [] },
    });
    const policy: SchedulingPolicy = { ...defaultPolicy, precedence: ['dependency'] };
    expect(schedule({ ...request, policy }).patch).toHaveLength(2);
  });

  it('throws when a policy moves a date the user proposed', () => {
    const request = toRequest({
      name: 'bad policy',
      entries: [
        ['a', 0, 2],
        ['b', 0, 1],
      ],
      dependencies: [['d1', 'a', 'b', 'FS', 0]],
      proposed: { b: { start: 1 } },
      expected: { patch: [] },
    });
    const policy: SchedulingPolicy = { ...defaultPolicy, resolveEdit: () => ({ moves: ['start', 'end'] }) };
    expect(() => schedule({ ...request, policy })).toThrow(/proposed start of Entry "b"/);
  });
});

describe('schedule — properties', () => {
  const typeArbitrary = fc.constantFrom<ScheduleDependencyType>('FS', 'SS', 'FF', 'SF');
  const requestArbitrary = fc
    .integer({ min: 2, max: 12 })
    .chain((count) =>
      fc.record({
        spans: fc.array(fc.tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 6 })), {
          minLength: count,
          maxLength: count,
        }),
        links: fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: count - 2 }),
            fc.integer({ min: 1, max: count - 1 }),
            typeArbitrary,
            fc.integer({ min: -3, max: 5 }),
          ),
          { maxLength: 20 },
        ),
      }),
    )
    .map(({ spans, links }): ScheduleRequest => ({
      entries: spans.map(([start, length], index) => ({
        id: entryId(`e${index}`),
        start: day(start),
        end: day(start + length),
        hasChildren: false,
      })),
      dependencies: links
        .filter(([from, to]) => from < to)
        .map(([from, to, type, lag], index) => ({
          id: `d${index}`,
          fromId: entryId(`e${from}`),
          toId: entryId(`e${to}`),
          type,
          lag: { value: lag, unit: 'day' as const },
        })),
    }));

  function applied(request: ScheduleRequest, patch: ReturnType<typeof schedule>['patch']): ScheduleRequest {
    const moved = new Map<EntryId, { start?: Instant; end?: Instant }>();
    for (const change of patch) moved.set(change.id, { ...moved.get(change.id), [change.field]: change.to });
    return {
      ...request,
      entries: request.entries.map((entry) => ({ ...entry, ...moved.get(entry.id) })),
    };
  }

  it('settles any acyclic schedule in one run: a second run changes nothing', () => {
    fc.assert(
      fc.property(requestArbitrary, (request) => {
        const first = schedule(request);
        expect(first.diagnostics).toEqual([]);
        expect(schedule(applied(request, first.patch)).patch).toEqual([]);
      }),
    );
  });

  it('keeps every span the same length', () => {
    fc.assert(
      fc.property(requestArbitrary, (request) => {
        const next = applied(request, schedule(request).patch).entries;
        request.entries.forEach((entry, index) => {
          const after = next[index] as ScheduleEntry;
          expect((after.end as number) - (after.start as number)).toBe(
            (entry.end as number) - (entry.start as number),
          );
        });
      }),
    );
  });
});
