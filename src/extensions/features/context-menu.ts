// extensions/features/ — the context menu built-in (S5.5, D-S5-13/14). An ordinary `GanttPlugin`,
// confined by the `extensions-public-only` rule (D-S5-5) to `api/`/`model/` imports — the dogfood
// gate this step proves (`[S5-A1]`). Every import below names its own narrow source file, never the
// `api/index.ts` barrel (which re-exports `contextMenu` itself, D-S5-13) — the same reason
// `extensions/popup.ts` imports `api/plugin.ts` directly instead of that barrel (no-circular).

import { createPopup } from '../popup.js';
import type { Anchor, Popup } from '../popup.js';
import type { GanttPlugin, PluginContext, CommandContext } from '../../api/gantt.js';
import { entryIdOfItem } from '../../model/index.js';
import type { Entry, ItemId } from '../../model/index.js';
import { buildMenu, resolveMenuEntries } from './menu-view.js';
import type { MenuEntry } from './menu-view.js';

export type { MenuItem, MenuEntry } from './menu-view.js';

export interface ContextMenuOptions {
  /** Returns the final entry list; `defaults` is `commands.available(ctx)` mapped to items, in
   *  registration order. Append, remove, reorder or replace — the returned array is what renders. */
  items?(ctx: { entry?: Entry; defaults: readonly MenuEntry[] }): readonly MenuEntry[];
}

/** `.fg-bar` is the one DOM contract a hover/click plugin has (`render/dom/index.ts` writes
 *  `dataset.itemId` on every bar node) — same seam `tooltips.ts` reaches through. */
function barUnder(node: Node): HTMLElement | undefined {
  const el = node instanceof Element ? node.closest<HTMLElement>('.fg-bar') : null;
  return el ?? undefined;
}

/** D-S5-13: right-click, or `Shift+F10`/the Menu key, opens a menu of the commands whose `when`
 *  passes for the target. `focus: 'trap'` (D-S5-9): arrow keys move between items, Enter/click runs
 *  one and closes, Escape closes and returns focus — the same primitive `tooltips()` builds on
 *  (`extensions/popup.ts`, reached through `createPopup` at `api/index.js`, never imported directly —
 *  D-S5-5). An item names a command and nothing else (D-S5-14): it carries no `run` of its own, so
 *  the mouse path and the keyboard path are one action, never two that can drift apart. */
export function contextMenu(options: ContextMenuOptions = {}): GanttPlugin {
  return {
    id: 'freegantt.contextMenu',
    setup(ctx: PluginContext) {
      const popup: Popup = createPopup(ctx.view.overlay, {
        registerHandler: (chord, handler, handlerOptions) =>
          ctx.interaction.registerKeyHandler(chord, handler, handlerOptions),
      });
      let onDocumentClick: ((event: MouseEvent) => void) | undefined;
      let onDocumentKeydown: ((event: KeyboardEvent) => void) | undefined;

      const detachMenuListeners = (): void => {
        if (onDocumentClick !== undefined) {
          document.removeEventListener('click', onDocumentClick);
          onDocumentClick = undefined;
        }
        if (onDocumentKeydown !== undefined) {
          document.removeEventListener('keydown', onDocumentKeydown, true);
          onDocumentKeydown = undefined;
        }
      };

      const closeMenu = (): void => {
        detachMenuListeners();
        popup.close();
      };

      const openAt = (anchor: Anchor, entry: Entry | undefined): void => {
        closeMenu();
        const commandCtx: CommandContext = {
          dataset: ctx.dataset,
          gantt: ctx.gantt,
          ...(entry !== undefined ? { entry } : {}),
        };
        const available = ctx.commands.available(commandCtx);
        const defaults: MenuEntry[] = available.map((command) => ({
          command: command.id,
          label: command.label,
        }));
        const entries = options.items
          ? options.items({ ...(entry !== undefined ? { entry } : {}), defaults })
          : defaults;
        const resolved = resolveMenuEntries(entries, available);

        popup.open({ anchor, placement: 'bottom', focus: 'trap', content: buildMenu(resolved) });

        // Popup dismisses itself (Escape, an outside pointer, scroll) with no callback out (a real
        // gap this step found no need to close: every listener below guards on `popup.isOpen`, so a
        // stray fire after a self-dismiss is a harmless no-op until the next `openAt`'s own
        // `closeMenu()` sweeps it, or this plugin is disposed).
        onDocumentClick = (event) => {
          if (!popup.isOpen) return;
          const target = event.target;
          const button = target instanceof Element ? target.closest<HTMLElement>('.fg-menu-item') : null;
          if (button === null) return;
          const command = button.getAttribute('data-command');
          closeMenu();
          if (command !== null) ctx.commands.run(command);
        };
        onDocumentKeydown = (event) => {
          if (!popup.isOpen) return;
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          const items = Array.from(document.querySelectorAll<HTMLElement>('.fg-menu-item'));
          if (items.length === 0) return;
          event.preventDefault();
          const activeIndex = items.indexOf(document.activeElement as HTMLElement);
          const nextIndex =
            event.key === 'ArrowDown'
              ? (activeIndex + 1) % items.length
              : (activeIndex - 1 + items.length) % items.length;
          items[nextIndex]?.focus();
        };
        document.addEventListener('click', onDocumentClick);
        document.addEventListener('keydown', onDocumentKeydown, true);
      };

      const entryForBar = (bar: HTMLElement): Entry | undefined => {
        const rawItemId = bar.dataset['itemId'];
        if (rawItemId === undefined) return undefined;
        return ctx.dataset.entries.get(entryIdOfItem(rawItemId as ItemId));
      };

      const onContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        const bar = event.target instanceof Node ? barUnder(event.target) : undefined;
        openAt(new DOMRect(event.clientX, event.clientY, 0, 0), bar ? entryForBar(bar) : undefined);
      };
      document.addEventListener('contextmenu', onContextMenu);

      const openAtFocusedRow = (): void => {
        const selectedId = ctx.gantt.selection[0];
        const entry = selectedId !== undefined ? ctx.dataset.entries.get(selectedId) : undefined;
        const anchorEl = entry !== undefined ? ctx.view.overlay.elementForEntry(entry.id) : undefined;
        const timeline = ctx.view.overlay.paneBounds.timeline;
        const anchor = anchorEl ?? new DOMRect(timeline.left, timeline.top, 0, 0);
        openAt(anchor, entry);
      };
      const disposeShiftF10 = ctx.interaction.registerKeyHandler('Shift+F10', () => openAtFocusedRow());
      const disposeMenuKey = ctx.interaction.registerKeyHandler('ContextMenu', () => openAtFocusedRow());

      return () => {
        document.removeEventListener('contextmenu', onContextMenu);
        disposeShiftF10();
        disposeMenuKey();
        closeMenu();
      };
    },
  };
}
