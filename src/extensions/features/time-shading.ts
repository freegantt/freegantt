// extensions/features/ — the `timeShading()` built-in (#404, closes #97). An ordinary `ChromePlugin`,
// confined by `extensions-public-only` to `api/`/`model/` imports. Every import below names
// its own narrow source file, never the `api/index.ts` barrel — that barrel re-exports `timeShading`
// itself, so a feature file importing it back would close a cycle (no-circular). Same pattern
// `tooltips.ts` sets.
//
// Naming: the issue that specced this plugin (#404) calls it `shading()` throughout — that name was
// reopened once the four builder names and the five API decisions were already settled, and the
// issue text was never edited to match. `timeShading()` is the shipped name; read `shading` in the
// issue as `timeShading` wherever the two disagree.

import type { ChromePlugin, PluginContext } from '../../api/gantt.js';
import type { DecorationContext, DecorationInput } from '../../api/decoration-facade.js';
import { isCoarserThan } from '../../api/time-facade.js';
import type { ZonedTime } from '../../api/time-facade.js';
import type { Instant, TimeSpan, TimeUnit } from '../../model/index.js';
import { EmptyCoversError } from '../../model/index.js';
import { coarsestFloor, mergeSpans } from './time-shading-covers.js';
import type { TimeCover } from './time-shading-covers.js';

/** Asked once per `every` step in the window, in place of a `TimeCover` — the escape hatch for a
 *  calendar no builder covers (the consumer's own `WorkSchedule`, say). */
export type CoverPredicate = (start: Instant, time: ZonedTime) => boolean;

/**
 * One shading rule. `covers` names one cover, a list ("covered when any of them covers" — a list
 * means their union, and that is why there is no `anyOf` combinator), or a predicate asked once per
 * `every` step.
 *
 * `every?: never` on the first arm is load-bearing, not decorative. TypeScript's excess-property
 * check runs against the whole union, not the matched member, so without it
 * `{ covers: daysOfWeek(6, 7), every: 'day' }` would compile with `every` silently ignored — a real
 * bug an earlier draft shipped (2026-09-15). `never` refuses `every` on this arm whatever the other
 * arm allows.
 */
export type ShadingRule =
  | {
      covers: TimeCover | readonly TimeCover[];
      every?: never;
      hideWhenCoarserThan?: TimeUnit;
      class?: string;
    }
  | { covers: CoverPredicate; every: TimeUnit; hideWhenCoarserThan?: TimeUnit; class?: string };

/** The floor a rule hides above: its own `hideWhenCoarserThan` if it named one, otherwise the shape
 *  of what it covers decides it (D-H). A walking rule's floor is its walk unit — the issue's own
 *  table already gives this for `daysOfWeek`/`dates` (day/day) and `hours` (hour/hour); a predicate
 *  rule is the same shape with the walk named by the caller's `every` instead of by a builder, so it
 *  floors at `every` too. A list floors at the *coarsest* of its members: the floor is a hide
 *  threshold, and hiding on the finest member's floor would hide a rule the moment any one member
 *  wants a finer zoom (the `[daysOfWeek(6, 7), hours('17:00', '07:00')]` case — hide only when *no*
 *  member reads). */
type PredicateRule = Extract<ShadingRule, { covers: CoverPredicate }>;

function isPredicateRule(rule: ShadingRule): rule is PredicateRule {
  return typeof rule.covers === 'function';
}

function ruleFloor(rule: ShadingRule): TimeUnit {
  if (rule.hideWhenCoarserThan) return rule.hideWhenCoarserThan;
  if (isPredicateRule(rule)) return rule.every;
  const covers = Array.isArray(rule.covers) ? rule.covers : [rule.covers];
  return coarsestFloor(covers);
}

/** `window`, walked one `every` step early so a run that started before `window.start` and reaches
 *  into it is still found — the same reason `hours()` scans a day ahead of its own window. */
function predicateSpans(rule: PredicateRule, ctx: DecorationContext): TimeSpan[] {
  const { span, time } = ctx;
  const scanStart = time.step(span.start, rule.every, -1);
  return time
    .each({ start: scanStart, end: span.end }, rule.every)
    .filter((boundary) => rule.covers(boundary, time))
    .map((boundary) => ({ start: boundary, end: time.step(boundary, rule.every, 1) }))
    .filter((candidate) => candidate.start < span.end && candidate.end > span.start)
    .map((candidate) => ({
      start: candidate.start < span.start ? span.start : candidate.start,
      end: candidate.end > span.end ? span.end : candidate.end,
    }));
}

function ruleCoveredSpans(rule: ShadingRule, ctx: DecorationContext): TimeSpan[] {
  if (isPredicateRule(rule)) return predicateSpans(rule, ctx);
  const covers = Array.isArray(rule.covers) ? rule.covers : [rule.covers];
  return covers.flatMap((cover: TimeCover) => cover.coveredSpans(ctx.span, ctx.time));
}

/** `.fg-time-shading` beside the rule's own `class` (style, settled 2026-09-15): every band this
 *  plugin writes carries the Part class, so the zero-CSS default (`--fg-time-shading-fill`) always
 *  applies, and a rule's own class still tells two rules' bands apart in CSS. */
function classFor(ruleClass: string | undefined): string {
  return ruleClass ? `fg-time-shading ${ruleClass}` : 'fg-time-shading';
}

function assertNoEmptyCoversList(rules: readonly ShadingRule[]): void {
  for (const rule of rules) {
    if (Array.isArray(rule.covers) && rule.covers.length === 0) throw new EmptyCoversError('timeShading');
  }
}

/**
 * Shades regions of the time axis under the bars — a weekend, after-hours, a holiday, a shutdown,
 * whatever a rule's `covers` names. What a shaded region means is the consumer's; this plugin only
 * paints it. A chrome plugin (no `data` half), id `freegantt.timeShading`, layer `underBars` always.
 *
 * ```ts
 * import { timeShading, daysOfWeek, hours, dates, spans, notCovered } from 'freegantt';
 *
 * gantt.installPlugin(
 *   timeShading([
 *     { covers: daysOfWeek(6, 7), class: 'weekend' },
 *     { covers: hours('17:00', '07:00'), class: 'after-hours' },
 *   ]),
 * );
 * ```
 *
 * Reconfiguring the shaded set is one assignment — `gantt.plugins = [timeShading(next)]` replaces
 * the occupant of this id and paints the new rules (#404 review).
 *
 * A predicate rule that closes over changing data (a consumer's own `WorkSchedule`) does not repaint
 * when that object mutates in place: the decoration runner memoizes on the window, and mutating the
 * schedule changes none of it. Assign the list again to repaint — a fresh `timeShading()` is a fresh
 * provider, which is what makes the memo miss.
 */
export function timeShading(rules: readonly ShadingRule[]): ChromePlugin {
  assertNoEmptyCoversList(rules);
  return {
    id: 'freegantt.timeShading',
    view(ctx: PluginContext) {
      ctx.view.registerDecoration('underBars', (frame: DecorationContext): readonly DecorationInput[] => {
        const bands: DecorationInput[] = [];
        for (const rule of rules) {
          const floor = ruleFloor(rule);
          if (isCoarserThan(frame.tickUnit, floor) || frame.tickIncrement !== 1) continue;
          for (const span of mergeSpans(ruleCoveredSpans(rule, frame))) {
            bands.push({ kind: 'rangeBand', start: span.start, end: span.end, class: classFor(rule.class) });
          }
        }
        return bands;
      });
      // No disposer: `ctx.disposables` already retracts the registration the moment this plugin is
      // disposed (review P4) — the same reason every other gated registration writes none.
    },
  };
}
