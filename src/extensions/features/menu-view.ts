// extensions/features/ — the context menu's own vocabulary and `ElementDescription` builder (S5.5,
// D-S5-14). Pure: no DOM mounting, no plugin context, so it stays testable with plain data in and
// plain data out. Kept separate from `context-menu.ts` so that file stays about behaviour
// (open/close/navigate), not menu shape or label-resolution rules.

import type { Command } from '../../api/gantt.js';
import type { ElementDescription } from '../../model/index.js';

export interface MenuItem {
  /** An id in the command registry (`ctx.commands`). */
  command: string;
  /** Overrides the command's own label for this menu only. */
  label?: string;
}
export type MenuEntry = MenuItem | { separator: true };

/** A `MenuEntry` with `label` resolved (never `undefined`) — `resolveMenuEntries`'s own output, and
 *  `buildMenu`'s input, so the render step never re-derives label precedence. */
export type ResolvedMenuEntry = (MenuItem & { label: string }) | { separator: true };

function isSeparator(entry: MenuEntry): entry is { separator: true } {
  return 'separator' in entry;
}

/** D-S5-14: menu items come from commands, filtered by `when`. `defaults` (built by `context-menu.ts`
 *  from `commands.available(ctx)`) embeds each available command's own label, so `items()` can pass
 *  them through unchanged; a caller-supplied `MenuItem` with no `label` still resolves to the
 *  command's own, and a `MenuItem` naming a command that is not currently available renders nothing —
 *  the same posture `when` already takes on the keybinding path. */
export function resolveMenuEntries(
  entries: readonly MenuEntry[],
  available: readonly Command[],
): readonly ResolvedMenuEntry[] {
  const byId = new Map<string, Command>(available.map((command) => [command.id, command]));
  const resolved: ResolvedMenuEntry[] = [];
  for (const entry of entries) {
    if (isSeparator(entry)) {
      resolved.push(entry);
      continue;
    }
    const command = byId.get(entry.command);
    if (command === undefined) continue;
    resolved.push({ command: entry.command, label: entry.label ?? command.label });
  }
  return resolved;
}

/** One `<button>` per command (real DOM focus, in `extensions/focus-trap.ts`'s own `FOCUSABLE_SELECTOR`
 *  — the trap's `focusFirst()` lands on the first one with no extra wiring) and one `<div>` per
 *  separator. `data-command` is the only channel `context-menu.ts` needs back — a delegated `click`
 *  listener reads it off `event.target.closest('.fg-menu-item')` (D-S5-10: `ElementDescription` never
 *  carries event handlers, so a container-level listener plus a data attribute is the read path every
 *  interactive `ElementDescription` in this codebase already uses, e.g. `render/dom/index.ts`'s own
 *  `data-item-id`). Every `ResolvedMenuEntry` reaching this function already has its final `label` —
 *  `resolveMenuEntries`'s job, not this one's. */
export function buildMenu(entries: readonly ResolvedMenuEntry[]): ElementDescription {
  return {
    tag: 'div',
    class: { 'fg-menu': true },
    attrs: { role: 'menu' },
    children: entries.map((entry, index) =>
      isSeparator(entry)
        ? {
            key: `separator-${index}`,
            tag: 'div',
            class: { 'fg-menu-separator': true },
            attrs: { role: 'separator' },
          }
        : {
            key: `item-${index}`,
            tag: 'button',
            class: { 'fg-menu-item': true },
            attrs: { type: 'button', role: 'menuitem', 'data-command': entry.command },
            text: entry.label,
          },
    ),
  };
}
