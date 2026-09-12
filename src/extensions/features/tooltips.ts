// extensions/features/ — the tooltip built-in (S5.5, D-S5-13). An ordinary `ChromePlugin`, confined
// by the `extensions-public-only` rule (D-S5-5) to `api/`/`model/` imports — the dogfood gate this
// step proves (`[S5-A1]`). Every import below names its own narrow source file, never the
// `api/index.ts` barrel. That barrel re-exports `tooltips` itself (D-S5-13). `extensions/popup.ts`
// imports `api/plugin.ts` directly instead of that barrel, for the same reason (no-circular).

import { createPopup } from '../popup.js';
import type { Popup, PopupPlacement } from '../popup.js';
import type { ChromePlugin, PluginContext } from '../../api/gantt.js';
import type { DomTarget } from '../../api/plugin.js';
import type { ElementDescription, Entry, TimeSpan, TooltipColumn } from '../../model/index.js';
import { spansTime } from '../../model/index.js';
import { formatDate, formatEndInclusive } from '../../api/time-facade.js';

export interface TooltipsOptions {
  /** Milliseconds of hover before the tooltip opens. Default `400`. */
  delayMs?: number;
  /** Default `'top'`. */
  placement?: PopupPlacement;
}

const DEFAULT_DELAY_MS = 400;
const DEFAULT_PLACEMENT: PopupPlacement = 'top';

/** A tooltip belongs to a bar, so the Entry it describes always spans (`spansTime`, ADR 0012).
 *  The parameter type says so, and `openFor` is where the question is asked. Three casts used to
 *  say it instead, and nothing tested them (Q5). */
function defaultContent(
  entry: Entry & TimeSpan,
  timeZone: string,
  locale: Intl.LocalesArgument | undefined,
  columns: readonly TooltipColumn[],
): ElementDescription {
  const start = formatDate(timeZone, entry.start, locale);
  const end = formatEndInclusive(timeZone, { start: entry.start, end: entry.end }, locale);
  const dates = start === end ? start : `${start} – ${end}`;
  return {
    class: { 'fg-tooltip': true },
    children: [
      { key: 'title', class: { 'fg-tooltip-title': true }, text: entry.name },
      { key: 'dates', class: { 'fg-tooltip-dates': true }, text: dates },
      // D-S5-13: "and any column marked `tooltip: true`" — one row per such column, in `gridColumns`
      // order (`ctx.view.resolveTooltipColumns` already filtered and formatted them).
      ...columns.map((column, i) => ({
        key: `column-${i}`,
        class: { 'fg-tooltip-field': true },
        children: [
          { key: 'label', class: { 'fg-tooltip-field-label': true }, text: column.header },
          { key: 'value', class: { 'fg-tooltip-field-value': true }, text: column.value },
        ],
      })),
    ],
  };
}

/** D-S5-13: hover a bar, or focus it, and a popup shows the entry's name and dates. `role="img"`
 *  bars gain a real tabindex in S5.11's a11y pass. This plugin listens for `focusin`/`focusout`
 *  now, so it needs no change once they do. `focus: 'none'` (D-S5-9) — the pointer path never steals focus,
 *  and the keyboard path is `role="img"`'s own accessible label (`FrameBar.a11yLabel`, S5.11) rather
 *  than this popup. Content resolves through the `tooltip` renderer point (S5.4) via
 *  `ctx.view.resolveTooltipContent`, so a consumer's `tooltipRenderer` replaces the body with no change to
 *  the show/hide behaviour. */
export function tooltips(options: TooltipsOptions = {}): ChromePlugin {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const placement = options.placement ?? DEFAULT_PLACEMENT;

  return {
    id: 'freegantt.tooltips',
    view(ctx: PluginContext) {
      const popup: Popup = createPopup(ctx.view, ctx.interaction.registerKeyHandler);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let openTarget: DomTarget | undefined;

      const clearTimer = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
      };

      const close = (): void => {
        clearTimer();
        openTarget = undefined;
        popup.close();
      };

      const openFor = (target: DomTarget): void => {
        const entry = target.entry;
        if (entry === undefined) return;
        // The default content states the entry's dates, so it needs an Entry that spans
        // (`spansTime`, ADR 0012). A bar only exists for one, so this never refuses on a shipped
        // path. Consumer content is unaffected: it names its own fields and needs no date.
        const content =
          ctx.view.resolveTooltipContent(entry.id) ??
          (spansTime(entry)
            ? defaultContent(
                entry,
                ctx.dataset.timeZone,
                ctx.gantt.locale,
                ctx.view.resolveTooltipColumns(entry),
              )
            : undefined);
        if (content === undefined) return;
        openTarget = target;
        popup.open({ anchor: target.element, placement, focus: 'none', content });
      };

      /** A tooltip belongs to a bar, so every other resolved target is a miss. `ctx.view.onDomEvent`
       *  has already answered "is this Gantt mine?" (I2, bug hunt B1). A hand-written `.fg-bar` walk
       *  could not. Two Datasets sharing an entry id used to open Gantt A's tooltip anchored on
       *  Gantt B's bar. */
      const barTarget = (target: DomTarget | undefined): DomTarget | undefined =>
        target?.kind === 'bar' ? target : undefined;

      ctx.view.onDomEvent('pointerover', (_event, resolved) => {
        const target = barTarget(resolved);
        if (target === undefined || target.element === openTarget?.element) return;
        clearTimer();
        timer = setTimeout(() => openFor(target), delayMs);
      });
      ctx.view.onDomEvent('pointerout', (event, resolved) => {
        const target = barTarget(resolved);
        if (target === undefined) return;
        // Moving within one bar is not leaving it. `relatedTarget` is where the pointer went, and it
        // may be a descendant of the same bar node.
        const to =
          event.relatedTarget instanceof Node ? ctx.view.dom.targetUnder(event.relatedTarget) : undefined;
        if (to?.element === target.element) return;
        close();
      });
      ctx.view.onDomEvent('focusin', (_event, resolved) => {
        const target = barTarget(resolved);
        if (target === undefined) return;
        clearTimer();
        openFor(target);
      });
      ctx.view.onDomEvent('focusout', (_event, resolved) => {
        if (barTarget(resolved) === undefined) return;
        close();
      });

      // The four listeners above remove themselves through `ctx.disposables`, which runs before this
      // disposer (S5.1, D-S5-3). Only the open popup is left to close.
      return close;
    },
  };
}
