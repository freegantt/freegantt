import { describe, expect, it } from 'vitest';
import type { ChromePlugin, PluginContext } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import type { DecorationContext, DecorationInput, DecorationLayer } from '../../api/decoration-facade.js';
import type { ZonedTime } from '../../api/time-facade.js';
import { EmptyCoversError } from '../../model/index.js';
import type { TimeUnit } from '../../model/index.js';
import { daysOfWeek, dates, hours, notCovered } from './time-shading-covers.js';
import { timeShading } from './time-shading.js';
import type { ShadingRule } from './time-shading.js';

const CHICAGO = 'America/Chicago';

function zonedTime(zone: string): ZonedTime {
  return new Dataset({ entries: [], timeZone: zone }).time;
}

/** Installs `plugin` against a stub `PluginContext` that answers only `view.registerDecoration` —
 *  the one member `timeShading()` calls — and hands back the captured provider so a test can invoke
 *  it directly with a hand-built `DecorationContext`. No DOM, no full `Gantt` mount: every other
 *  `PluginContext` member is unreachable code for this plugin, so a stub proves it. */
function capturedProvider(plugin: ChromePlugin): (ctx: DecorationContext) => readonly DecorationInput[] {
  let captured: ((ctx: DecorationContext) => readonly DecorationInput[]) | undefined;
  const stub = {
    view: {
      registerDecoration(
        _layer: DecorationLayer,
        provider: (ctx: DecorationContext) => readonly DecorationInput[],
      ) {
        captured = provider;
        return () => {};
      },
    },
  } as unknown as PluginContext;
  plugin.view(stub);
  if (!captured) throw new Error('timeShading() never called ctx.view.registerDecoration');
  return captured;
}

function context(
  time: ZonedTime,
  start: string,
  end: string,
  tickUnit: TimeUnit = 'day',
  tickIncrement = 1,
): DecorationContext {
  return {
    span: { start: time.toInstant(start), end: time.toInstant(end) },
    rows: [],
    time,
    tickUnit,
    tickIncrement,
  };
}

describe('timeShading()', () => {
  it('id is freegantt.timeShading, and it fills only the view half', () => {
    const plugin = timeShading([{ covers: daysOfWeek(6, 7) }]);
    expect(plugin.id).toBe('freegantt.timeShading');
    expect(plugin.data).toBeUndefined();
  });

  it('paints one rangeBand per merged run, carrying .fg-time-shading beside the rule class', () => {
    const time = zonedTime(CHICAGO);
    const provider = capturedProvider(timeShading([{ covers: daysOfWeek(6, 7), class: 'weekend' }]));
    const bands = provider(context(time, '2026-06-01', '2026-06-08'));
    expect(bands).toEqual([
      {
        kind: 'rangeBand',
        start: time.toInstant('2026-06-06'),
        end: time.toInstant('2026-06-08'),
        class: 'fg-time-shading weekend',
      },
    ]);
  });

  it('a rule with no class still carries .fg-time-shading alone', () => {
    const time = zonedTime(CHICAGO);
    const provider = capturedProvider(timeShading([{ covers: daysOfWeek(6, 7) }]));
    const [band] = provider(context(time, '2026-06-06', '2026-06-08'));
    expect(band!.class).toBe('fg-time-shading');
  });

  it('a list of covers unions them into one rule', () => {
    const time = zonedTime(CHICAGO);
    const provider = capturedProvider(
      timeShading([{ covers: [daysOfWeek(6, 7), dates('2026-06-10')], class: 'closed' }]),
    );
    const bands = provider(context(time, '2026-06-01', '2026-06-15'));
    // Two weekends (06-06/07 and 06-13/14) plus the single named date (06-10) — none touching,
    // so nothing merges and the union carries all three.
    expect(bands).toHaveLength(3);
    expect(bands[0]).toMatchObject({
      start: time.toInstant('2026-06-06'),
      end: time.toInstant('2026-06-08'),
    });
    expect(bands[1]).toMatchObject({
      start: time.toInstant('2026-06-10'),
      end: time.toInstant('2026-06-11'),
    });
    expect(bands[2]).toMatchObject({
      start: time.toInstant('2026-06-13'),
      end: time.toInstant('2026-06-15'),
    });
  });

  it('notCovered() shades everything the inner cover does not', () => {
    const time = zonedTime(CHICAGO);
    const provider = capturedProvider(
      timeShading([{ covers: notCovered(daysOfWeek(6, 7)), class: 'working' }]),
    );
    const bands = provider(context(time, '2026-06-01', '2026-06-08'));
    expect(bands).toEqual([
      {
        kind: 'rangeBand',
        start: time.toInstant('2026-06-01'),
        end: time.toInstant('2026-06-06'),
        class: 'fg-time-shading working',
      },
    ]);
  });

  it('the escape hatch predicate is asked once per `every` step, and the argument is an Instant', () => {
    const time = zonedTime(CHICAGO);
    const seen: number[] = [];
    const rule: ShadingRule = {
      every: 'day',
      covers: (start) => {
        seen.push(start);
        return time.dayOfWeek(start) >= 6;
      },
      class: 'closed',
    };
    const provider = capturedProvider(timeShading([rule]));
    const bands = provider(context(time, '2026-06-06', '2026-06-08'));
    expect(seen.length).toBeGreaterThan(0);
    expect(bands).toEqual([
      {
        kind: 'rangeBand',
        start: time.toInstant('2026-06-06'),
        end: time.toInstant('2026-06-08'),
        class: 'fg-time-shading closed',
      },
    ]);
  });

  describe('the zoom-default floor (D-H)', () => {
    it('daysOfWeek hides above day zoom', () => {
      const time = zonedTime(CHICAGO);
      const provider = capturedProvider(timeShading([{ covers: daysOfWeek(6, 7) }]));
      expect(provider(context(time, '2026-06-01', '2026-06-08', 'day', 1))).not.toEqual([]);
      expect(provider(context(time, '2026-06-01', '2026-06-08', 'week', 1))).toEqual([]);
    });

    it('hours hides above hour zoom', () => {
      const time = zonedTime(CHICAGO);
      const provider = capturedProvider(timeShading([{ covers: hours('17:00', '07:00') }]));
      expect(provider(context(time, '2026-06-06', '2026-06-08', 'hour', 1))).not.toEqual([]);
      expect(provider(context(time, '2026-06-06', '2026-06-08', 'day', 1))).toEqual([]);
    });

    it('spans() never hides on granularity, at any tick unit with increment 1', () => {
      const time = zonedTime(CHICAGO);
      const provider = capturedProvider(
        timeShading([
          {
            covers: {
              hideWhenCoarserThan: 'year',
              coveredSpans: () => [
                { start: time.toInstant('2026-06-01'), end: time.toInstant('2026-06-15') },
              ],
            },
          },
        ]),
      );
      expect(provider(context(time, '2026-06-01', '2026-06-08', 'month', 1))).not.toEqual([]);
    });

    it("a rule's own hideWhenCoarserThan overrides the cover's own default", () => {
      const time = zonedTime(CHICAGO);
      const provider = capturedProvider(
        timeShading([{ covers: daysOfWeek(6, 7), hideWhenCoarserThan: 'week' }]),
      );
      expect(provider(context(time, '2026-06-01', '2026-06-08', 'week', 1))).not.toEqual([]);
    });

    it('a mixed list floors at the coarsest member — the weekend still paints at day zoom beside an hour cover', () => {
      const time = zonedTime(CHICAGO);
      const provider = capturedProvider(
        timeShading([{ covers: [daysOfWeek(6, 7), hours('17:00', '07:00')], class: 'closed' }]),
      );
      expect(provider(context(time, '2026-06-01', '2026-06-08', 'day', 1))).not.toEqual([]);
    });

    it('a tick at the floor unit with tickIncrement above 1 still hides', () => {
      const time = zonedTime(CHICAGO);
      const provider = capturedProvider(timeShading([{ covers: daysOfWeek(6, 7) }]));
      expect(provider(context(time, '2026-06-01', '2026-06-08', 'day', 2))).toEqual([]);
    });
  });

  describe('empty covers refusal', () => {
    it('throws EmptyCoversError for { covers: [] } on a rule, at plugin construction', () => {
      expect(() => timeShading([{ covers: [] }])).toThrow(EmptyCoversError);
    });
  });

  describe("reconfigure by id is the setter's job, not a second door (documented, not re-implemented here)", () => {
    it('two timeShading() calls with different rules both mint the same plugin id', () => {
      expect(timeShading([{ covers: daysOfWeek(6, 7) }]).id).toBe(
        timeShading([{ covers: dates('2026-12-25') }]).id,
      );
    });
  });
});

// The issue's own probe table (#404): `every?: never` on the cover arm is load-bearing against
// TypeScript's excess-property check running against the whole union rather than the matched member.
// Each row is pinned so the day any one of them starts (or stops) compiling, this test fails loudly.
describe('ShadingRule — the every?: never probe table', () => {
  it('{ covers: aCover } compiles', () => {
    const rule: ShadingRule = { covers: daysOfWeek(6, 7) };
    expect(rule.covers).toBeDefined();
  });

  it('{ covers: [a, b] } compiles', () => {
    const rule: ShadingRule = { covers: [daysOfWeek(6, 7), dates('2026-12-25')] };
    expect(rule.covers).toBeDefined();
  });

  it("{ every: 'day', covers: fn } compiles, and fn's argument infers Instant", () => {
    const rule: ShadingRule = { every: 'day', covers: (start) => start > 0 };
    expect(rule.every).toBe('day');
  });

  it("{ every: 'hour', covers: fn } compiles", () => {
    const rule: ShadingRule = { every: 'hour', covers: () => false };
    expect(rule.every).toBe('hour');
  });

  it('{ covers: fn } with no every does not typecheck', () => {
    // @ts-expect-error a predicate cover needs `every` — there is no default step to ask it at.
    const rule: ShadingRule = { covers: () => false };
    expect(rule).toBeDefined();
  });

  it("{ covers: aCover, every: 'day' } does not typecheck — every?: never refuses it on the cover arm", () => {
    // @ts-expect-error `every` is unrepresentable beside a TimeCover — it already knows its own step.
    const rule: ShadingRule = {
      covers: daysOfWeek(6, 7),
      every: 'day',
    };
    expect(rule).toBeDefined();
  });

  it("{ covers: [aCover], every: 'day' } does not typecheck either", () => {
    // @ts-expect-error same refusal, a list of covers is still the cover arm.
    const rule: ShadingRule = {
      covers: [daysOfWeek(6, 7)],
      every: 'day',
    };
    expect(rule).toBeDefined();
  });

  it('{ covers: [] } compiles — refused at runtime instead, see the empty-covers describe above', () => {
    const rule: ShadingRule = { covers: [] };
    expect(rule.covers).toEqual([]);
  });

  it('a data-half plugin does not typecheck into GanttOptions.plugins (ChromePlugin has data?: never)', () => {
    const plugin = timeShading([{ covers: daysOfWeek(6, 7) }]);
    expect(plugin.data).toBeUndefined();
    // @ts-expect-error `timeShading()` always returns a chrome-only plugin — `data` is `never` on it,
    // so a Dataset-half plugin can never be assembled from this factory's return type.
    const asDataPlugin: { data(): void } = plugin;
    expect(asDataPlugin).toBe(plugin);
  });
});
