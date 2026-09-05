// extensions/features/ — the context menu built-in (S5.5, D-S5-13/14). An ordinary `GanttPlugin`,
// confined by the `extensions-public-only` rule (D-S5-5) to `api/`/`model/` imports — the dogfood
// gate this step proves (`[S5-A1]`). Every import below names its own narrow source file, never the
// `api/index.ts` barrel. That barrel re-exports `contextMenu` itself (D-S5-13). `extensions/popup.ts`
// imports `api/plugin.ts` directly instead of that barrel, for the same reason (no-circular).
//
// Review A3/A4: this file names no `.fg-*` class and no `data-*` key of the rendered Gantt. It asks
// `ctx.view.dom` what a node is, and `ctx.view.onDomEvent` scopes every document listener to this
// Gantt. Review C3: a dismissed menu detaches its own listeners through `Popup.onDismiss`, so
// nothing polls `popup.isOpen` on every click in the page.

import { createPopup } from '../popup.js';
import type { Anchor, Popup } from '../popup.js';
import type { Command, CommandContext, CommandTarget, GanttPlugin, PluginContext } from '../../api/gantt.js';
import { resolveActedOnEntryIds } from '../../api/command.js';
import type { DomTarget } from '../../api/plugin.js';
import type { Entry, EntryId } from '../../model/index.js';
import { DisposableStore } from '../disposables.js';
import { buildMenu, menuItemUnder, menuItemsIn, resolveMenuEntries } from './menu-view.js';
import type { MenuEntry } from './menu-view.js';

export type { MenuItem, MenuEntry } from './menu-view.js';

export interface ContextMenuOptions {
  /** Returns the final entry list; `defaults` is `commands.available(ctx)` mapped to items, in
   *  registration order. Append, remove, reorder or replace — the returned array is what renders. */
  items?(ctx: { entry?: Entry; defaults: readonly MenuEntry[] }): readonly MenuEntry[];
}

/** The resolved DOM target as a `CommandContext.target`. Both name the same five `TargetKind` words
 *  and the same `entryIds`/`field`. So this drops the element a command has no use for, and copies
 *  the rest across. A command's `when` can now read "on a header cell" from a right-click, which the
 *  menu never filled in before.
 *
 *  `entryIds` is the one member the menu does not copy. `DomTarget.entryIds` states a DOM fact:
 *  what the node stands for. The command acts on what `clickLandsInSelection` decides (#199), so
 *  the caller resolves that set first and hands it in. */
function commandTargetOf(target: DomTarget, entryIds: readonly EntryId[]): CommandTarget {
  return {
    kind: target.kind,
    entryIds,
    ...(target.field !== undefined ? { field: target.field } : {}),
  };
}

/** D-S5-13: right-click, or `Shift+F10`/the Menu key, opens a menu of the commands whose `when`
 *  passes for the target. `focus: 'trap'` (D-S5-9): arrow keys move between items. Enter or a click
 *  runs one item and closes the menu. Escape closes the menu and returns focus. `tooltips()` builds
 *  on the same primitive, `extensions/popup.ts`. This file reaches it through `createPopup` at
 *  `api/index.js`, and never imports it directly (D-S5-5).
 *
 *  An item names a command and nothing else (D-S5-14). It carries no `run` of its own. The mouse
 *  path and the keyboard path are one action, never two that can drift apart. */
export function contextMenu(options: ContextMenuOptions = {}): GanttPlugin {
  return {
    id: 'freegantt.contextMenu',
    setup(ctx: PluginContext) {
      const popup: Popup = createPopup(ctx.view, {
        registerHandler: (chord, handler, handlerOptions) =>
          ctx.interaction.registerKeyHandler(chord, handler, handlerOptions),
      });
      /** The listeners one open menu needs. They live exactly as long as that menu. `forgetOpenMenu`
       *  reassigns the store on every close, because `DisposableStore.disposeAll()` latches. A spent
       *  store fires every later `add` at once. `createPopup`'s own store avoids that trap the same
       *  way. */
      let menuListeners = new DisposableStore();
      // B2: the menu lists commands resolved for the right-clicked (or focused-row) target. `run()`
      // below must invoke that same command against that same context. It must not use whatever
      // `ctx.commands`'s own `#buildCommandContext` would rebuild from the current selection.
      // D-S5-14: the mouse path and the keyboard path are one action. `CommandOf.run` is public
      // (`api/command.ts`), so this needs no wider access than `available()` already returned.
      let openCommands: { readonly available: readonly Command[]; readonly ctx: CommandContext } | undefined;

      /** What the menu forgets when it goes, however it went. */
      const forgetOpenMenu = (): void => {
        menuListeners.disposeAll();
        menuListeners = new DisposableStore();
        openCommands = undefined;
      };

      const closeMenu = (): void => {
        forgetOpenMenu();
        popup.close();
      };

      const runMenuItem = (commandId: string | null): void => {
        const commands = openCommands;
        closeMenu();
        if (commandId === null || commands === undefined) return;
        // B2: run the command found in *this menu's own* `available` list. Run it against *this
        // menu's own* `commandCtx` — the right-clicked bar, or the focused row. Do not call
        // `ctx.commands.run(commandId)`. That call rebuilds context from the current selection.
        // It then no-ops silently when that selection is not the entry the menu opened for.
        const command = commands.available.find((c) => c.id === commandId);
        command?.run(commands.ctx);
      };

      const openAt = (anchor: Anchor, target: DomTarget | undefined): void => {
        closeMenu();
        const entry = target?.entry;
        // #199/#212, and the one place the Selection and the clicked node meet. `DomTarget` states
        // a DOM fact and must keep doing that, so the rule lives in `resolveActedOnEntryIds`
        // instead, in the command layer.
        const clicked = target?.entryIds ?? [];
        const entryIds = resolveActedOnEntryIds(clicked, ctx.gantt.selectedIds);
        // Inferred from standard right-click behaviour, not stated on #199: a right-click outside
        // the Selection replaces the Selection with what you clicked, before the menu opens.
        // Without it the command acts on Entries the user cannot see highlighted. A consumer that
        // cancels `beforeSelectionChange` keeps its Selection; the command still acts on what the
        // user clicked, because that is what the menu offered. When the click landed inside the
        // Selection (or the Selection landed inside the click, #212), `entryIds` is already the
        // current Selection, so this assignment is a no-op — nothing is silently widened.
        if (clicked.length > 0) ctx.gantt.selectedIds = entryIds;
        const commandCtx: CommandContext = {
          dataset: ctx.dataset,
          gantt: ctx.gantt,
          ...(entry !== undefined ? { entry } : {}),
          ...(target !== undefined ? { target: commandTargetOf(target, entryIds) } : {}),
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

        popup.open({
          anchor,
          placement: 'bottom',
          focus: 'trap',
          content: buildMenu(resolved),
          // Review C3: Escape, an outside pointer or a scroll dismisses the popup itself. This is
          // how the plugin hears about it, so the two listeners below go at the same moment.
          onDismiss: forgetOpenMenu,
        });

        // A click runs the item's command. `onDomEvent` keeps this to nodes inside this Gantt's own
        // container. A click on a *second* Gantt's open menu never runs a command against this
        // Gantt's `openCommands` (I2, bug hunt B1).
        menuListeners.add(
          ctx.view.onDomEvent('click', (event) => {
            const item = menuItemUnder(event.target);
            if (item === undefined) return;
            runMenuItem(item.getAttribute('data-command'));
          }),
        );
        // Arrow keys move between the items of the one menu the focus is in.
        menuListeners.add(
          ctx.view.onDomEvent(
            'keydown',
            (event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const items = menuItemsIn(event.target);
              if (items.length === 0) return;
              event.preventDefault();
              const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              const activeIndex = active !== null ? items.indexOf(active) : -1;
              const nextIndex =
                event.key === 'ArrowDown'
                  ? (activeIndex + 1) % items.length
                  : (activeIndex - 1 + items.length) % items.length;
              items[nextIndex]?.focus();
            },
            { capture: true },
          ),
        );
      };

      // B1: this Gantt's menu owns only right-clicks that land inside its own container. A click on
      // page chrome or a second widget reaches the browser's own menu untouched. A click on a
      // second Gantt reaches that other Gantt's menu untouched. `ctx.view.onDomEvent` is that
      // scope. The target it resolves names the same entry for a bar, a grid cell or a row alike.
      // That is parity with `render/dom`'s own `hitTest` grid-row fallback.
      ctx.view.onDomEvent('contextmenu', (event, target) => {
        event.preventDefault();
        openAt(new DOMRect(event.clientX, event.clientY, 0, 0), target);
      });

      /** #205, and the same rule the pointer path runs. The Selection is what the keyboard landed
       *  on. So `openAt` answers with the whole Selection, not with `selectedIds[0]` alone
       *  (D-S5-14 — one action, two ways in). The bar of the first selected Entry stays the
       *  popup's anchor. A popup needs a box on screen, and `GanttDom` has no row node for an
       *  Entry. */
      const openAtFocusedRow = (): void => {
        const selectedId = ctx.gantt.selectedIds[0];
        const entry = selectedId !== undefined ? ctx.dataset.entries.get(selectedId) : undefined;
        const bar = entry !== undefined ? ctx.view.dom.barFor(entry.id) : undefined;
        const timeline = ctx.view.dom.paneBounds.timeline;
        const anchor = bar ?? new DOMRect(timeline.left, timeline.top, 0, 0);
        openAt(anchor, bar !== undefined ? ctx.view.dom.targetUnder(bar) : undefined);
      };
      const disposeShiftF10 = ctx.interaction.registerKeyHandler('Shift+F10', () => openAtFocusedRow());
      const disposeMenuKey = ctx.interaction.registerKeyHandler('ContextMenu', () => openAtFocusedRow());

      // The `contextmenu` listener removes itself through `ctx.disposables`, which runs ahead of this
      // disposer (S5.1, D-S5-3).
      return () => {
        disposeShiftF10();
        disposeMenuKey();
        closeMenu();
      };
    },
  };
}
