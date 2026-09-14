# Function: contextMenu()

> **contextMenu**(`options?`): [`ChromePlugin`](../type-aliases/ChromePlugin.md)

Defined in: extensions/features/context-menu.ts:69

D-S5-13: right-click, or `Shift+F10`/the Menu key, opens a menu of the commands whose `when`
 passes for the target. `focus: 'trap'` (D-S5-9): arrow keys move between items. Enter or a click
 runs one item and closes the menu. Escape closes the menu and returns focus. `tooltips()` builds
 on the same primitive, `extensions/popup.ts`. This file reaches it through `createPopup` at
 `api/index.js`, and never imports it directly (D-S5-5).

 An item names a command and nothing else (D-S5-14). It carries no `run` of its own. The mouse
 path and the keyboard path are one action, never two that can drift apart.

## Parameters

### options?

[`ContextMenuOptions`](../interfaces/ContextMenuOptions.md) = `{}`

## Returns

[`ChromePlugin`](../type-aliases/ChromePlugin.md)
