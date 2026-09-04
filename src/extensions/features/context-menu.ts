// extensions/features/ — the context menu built-in (S5.5, D-S5-13/14). An ordinary `GanttPlugin`,
// confined by the `extensions-public-only` rule (D-S5-5) to `api/`/`model/` imports — the dogfood
// gate this step proves (`[S5-A1]`). Every import below names its own narrow source file, never the
// `api/index.ts` barrel (which re-exports `contextMenu` itself, D-S5-13) — the same reason
// `extensions/popup.ts` imports `api/plugin.ts` directly instead of that barrel (no-circular).

import { createPopup } from '../popup.js';
import type { Anchor, Popup } from '../popup.js';
import type { Command, GanttPlugin, PluginContext, CommandContext } from '../../api/gantt.js';
import { entryIdFromDataset, entryIdOfItem, itemIdFromDataset } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import { buildMenu, resolveMenuEntries } from './menu-view.js';
import type { MenuEntry } from './menu-view.js';
import { barUnder, rowUnder } from './bar-under.js';

export type { MenuItem, MenuEntry } from './menu-view.js';

export interface ContextMenuOptions {
  /** Returns the final entry list; `defaults` is `commands.available(ctx)` mapped to items, in
   *  registration order. Append, remove, reorder or replace — the returned array is what renders. */
  items?(ctx: { entry?: Entry; defaults: readonly MenuEntry[] }): readonly MenuEntry[];
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
      // B2: the menu lists commands resolved for the right-clicked (or focused-row) target — `run()`
      // below must invoke that same command against that same context, not against whatever
      // `ctx.commands`'s own `#buildCommandContext` would rebuild from the current selection
      // (D-S5-14: the mouse path and the keyboard path are one action). `CommandOf.run` is public
      // (`api/command.ts`), so this needs no wider access than `available()` already returned.
      let openCommands: { readonly available: readonly Command[]; readonly ctx: CommandContext } | undefined;

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
        openCommands = undefined;
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
        openCommands = { available, ctx: commandCtx };

        popup.open({ anchor, placement: 'bottom', focus: 'trap', content: buildMenu(resolved) });

        // Popup dismisses itself (Escape, an outside pointer, scroll) with no callback out (a real
        // gap this step found no need to close: every listener below guards on `popup.isOpen`, so a
        // stray fire after a self-dismiss is a harmless no-op until the next `openAt`'s own
        // `closeMenu()` sweeps it, or this plugin is disposed).
        onDocumentClick = (event) => {
          if (!popup.isOpen) return;
          const target = event.target;
          // B1 was incomplete here: this listener is document-wide (menu items live outside
          // `ctx.view.overlay`'s DOM subtree once presented, same as `onContextMenu`'s own reasoning
          // below), so a click on a *different* Gantt's open menu item must not run a command against
          // this Gantt's `openCommands`. Scope the same way `onContextMenu` already does.
          if (!(target instanceof Node) || !ctx.view.overlay.contains(target)) return;
          const button = target instanceof Element ? target.closest<HTMLElement>('.fg-menu-item') : null;
          if (button === null) return;
          const commandId = button.getAttribute('data-command');
          const commands = openCommands;
          closeMenu();
          if (commandId === null || commands === undefined) return;
          // B2: run the command found in *this menu's own* `available` list, against *this menu's
          // own* `commandCtx` (the right-clicked bar, or the focused row) — not
          // `ctx.commands.run(commandId)`, which would rebuild context from the current selection and
          // silently no-op when that selection is not the entry the menu was opened for.
          const command = commands.available.find((c) => c.id === commandId);
          command?.run(commands.ctx);
        };
        onDocumentKeydown = (event) => {
          if (!popup.isOpen) return;
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          // Scoped to this Gantt's own overlay for the same reason `onDocumentClick` is above — a
          // document-wide query would also walk a second open Gantt's menu items (I2: `contains` is
          // the one seam this plugin has to ask "is this mine?", same as `onContextMenu`).
          const items = Array.from(document.querySelectorAll<HTMLElement>('.fg-menu-item')).filter((item) =>
            ctx.view.overlay.contains(item),
          );
          if (items.length === 0) return;
          event.preventDefault();
          const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const activeIndex = active !== null ? items.indexOf(active) : -1;
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
        const itemId = itemIdFromDataset(bar.dataset['itemId']);
        if (itemId === undefined) return undefined;
        return ctx.dataset.entries.get(entryIdOfItem(itemId));
      };

      const entryForRow = (row: HTMLElement): Entry | undefined => {
        const entryId = entryIdFromDataset(row.dataset['entryId']);
        if (entryId === undefined) return undefined;
        return ctx.dataset.entries.get(entryId);
      };

      // A right-click resolves the same entry a click on that entry's bar *or* its grid row would —
      // parity with `render/dom/index.ts`'s own `hitTest` grid-row fallback (bar first, row second).
      const entryUnder = (node: Node): Entry | undefined => {
        const bar = barUnder(node);
        if (bar !== undefined) return entryForBar(bar);
        const row = rowUnder(node);
        return row !== undefined ? entryForRow(row) : undefined;
      };

      const onContextMenu = (event: MouseEvent): void => {
        // B1: this Gantt's menu owns only right-clicks that land inside its own container — a click
        // on page chrome, a second widget, or a second Gantt must reach the browser's own menu (or
        // that other Gantt's) untouched. `document`-level is still the right level: the header pane,
        // grid pane and timeline pane are separate elements, and none of the built-in row/cell/bar DOM
        // is a boundary a plugin may name (D-S5-5) — `overlay.contains` is the one seam this plugin
        // has to ask "is this mine?" (I2).
        if (!(event.target instanceof Node) || !ctx.view.overlay.contains(event.target)) return;
        event.preventDefault();
        openAt(new DOMRect(event.clientX, event.clientY, 0, 0), entryUnder(event.target));
      };
      document.addEventListener('contextmenu', onContextMenu);

      const openAtFocusedRow = (): void => {
        const selectedId = ctx.gantt.selectedIds[0];
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
