// extensions/features/ — the tooltip built-in (S5.5, D-S5-13). An ordinary `GanttPlugin`, confined
// by the `extensions-public-only` rule (D-S5-5) to `api/`/`model/` imports — the dogfood gate this
// step proves (`[S5-A1]`). Every import below names its own narrow source file, never the
// `api/index.ts` barrel (which re-exports `tooltips` itself, D-S5-13) — the same reason
// `extensions/popup.ts` imports `api/plugin.ts` directly instead of that barrel (no-circular).

import { createPopup } from '../popup.js';
import type { Popup, PopupPlacement } from '../popup.js';
import type { GanttPlugin, PluginContext } from '../../api/gantt.js';
import { entryIdOfItem } from '../../model/index.js';
import type { Entry, ItemId } from '../../model/index.js';
import { formatDate, formatEndInclusive } from '../../api/time-facade.js';

export interface TooltipsOptions {
  /** Milliseconds of hover before the tooltip opens. Default `400`. */
  delayMs?: number;
  /** Default `'top'`. */
  placement?: PopupPlacement;
}

const DEFAULT_DELAY_MS = 400;
const DEFAULT_PLACEMENT: PopupPlacement = 'top';

/** `.fg-bar` is the one DOM contract a hover plugin has (`render/dom/index.ts` writes
 *  `dataset.itemId` on every bar node) — the same seam `harness/plugins.ts`'s own popup demo already
 *  reaches through, not a back door (D-S5-5 only forbids `src/` imports, not plain DOM APIs). */
function barUnder(node: Node): HTMLElement | undefined {
  const el = node instanceof Element ? node.closest<HTMLElement>('.fg-bar') : null;
  return el ?? undefined;
}

function defaultContent(
  entry: Entry,
  timeZone: string,
  locale: Intl.LocalesArgument | undefined,
  columns: readonly { header: string; value: string }[],
) {
  const start = formatDate(timeZone, entry.start, locale);
  const end = formatEndInclusive(timeZone, entry.end, locale);
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

/** D-S5-13: hover a bar (or focus it — `role="img"` bars gain a real tabindex in S5.11's a11y pass;
 *  this plugin listens for `focusin`/`focusout` now so it needs no change once they do) and a popup
 *  shows the entry's name and dates. `focus: 'none'` (D-S5-9) — the pointer path never steals focus,
 *  and the keyboard path is `role="img"`'s own accessible label (`FrameBar.a11yLabel`, S5.11) rather
 *  than this popup. Content resolves through the `tooltip` renderer point (S5.4) via
 *  `ctx.view.resolveTooltip`, so a consumer's `tooltipRenderer` replaces the body with no change to
 *  the show/hide behaviour. */
export function tooltips(options: TooltipsOptions = {}): GanttPlugin {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const placement = options.placement ?? DEFAULT_PLACEMENT;

  return {
    id: 'freegantt.tooltips',
    setup(ctx: PluginContext) {
      const popup: Popup = createPopup(ctx.view.overlay, {
        registerHandler: (chord, handler, handlerOptions) =>
          ctx.interaction.registerKeyHandler(chord, handler, handlerOptions),
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let openBar: HTMLElement | undefined;

      // B1: these listeners are `document`-level (the pointer/focus target may be a descendant node
      // the plugin never touched), so `.fg-bar` alone is not enough to tell "this Gantt's own bar"
      // from a second Gantt's — two Datasets sharing an entry id would otherwise open Gantt A's
      // tooltip anchored on Gantt B's bar (I2). `overlay.contains` is the seam that tells them apart.
      const barInThisGantt = (node: Node): HTMLElement | undefined => {
        const bar = barUnder(node);
        return bar !== undefined && ctx.view.overlay.contains(bar) ? bar : undefined;
      };

      const clearTimer = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
      };

      const close = (): void => {
        clearTimer();
        openBar = undefined;
        popup.close();
      };

      const openFor = (bar: HTMLElement): void => {
        const rawItemId = bar.dataset['itemId'];
        if (rawItemId === undefined) return;
        const entryId = entryIdOfItem(rawItemId as ItemId);
        const entry = ctx.dataset.entries.get(entryId);
        if (entry === undefined) return;
        const content =
          ctx.view.resolveTooltip(entryId) ??
          defaultContent(
            entry,
            ctx.dataset.timeZone,
            ctx.gantt.locale,
            ctx.view.resolveTooltipColumns(entry),
          );
        openBar = bar;
        popup.open({ anchor: bar, placement, focus: 'none', content });
      };

      const onPointerOver = (event: PointerEvent): void => {
        const bar = event.target instanceof Node ? barInThisGantt(event.target) : undefined;
        if (bar === undefined || bar === openBar) return;
        clearTimer();
        timer = setTimeout(() => openFor(bar), delayMs);
      };
      const onPointerOut = (event: PointerEvent): void => {
        const bar = event.target instanceof Node ? barInThisGantt(event.target) : undefined;
        if (bar === undefined) return;
        const to = event.relatedTarget instanceof Node ? barUnder(event.relatedTarget) : undefined;
        if (to === bar) return;
        close();
      };
      const onFocusIn = (event: FocusEvent): void => {
        const bar = event.target instanceof Node ? barInThisGantt(event.target) : undefined;
        if (bar === undefined) return;
        clearTimer();
        openFor(bar);
      };
      const onFocusOut = (event: FocusEvent): void => {
        const bar = event.target instanceof Node ? barInThisGantt(event.target) : undefined;
        if (bar === undefined) return;
        close();
      };

      document.addEventListener('pointerover', onPointerOver);
      document.addEventListener('pointerout', onPointerOut);
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('focusout', onFocusOut);

      return () => {
        document.removeEventListener('pointerover', onPointerOver);
        document.removeEventListener('pointerout', onPointerOut);
        document.removeEventListener('focusin', onFocusIn);
        document.removeEventListener('focusout', onFocusOut);
        close();
      };
    },
  };
}
