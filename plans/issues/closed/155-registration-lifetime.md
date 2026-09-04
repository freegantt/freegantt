# #155 — the other three plugin registration seams

**Issue:** [#155](https://github.com/Pawel-IT/FreeGantt/issues/155). Parent review:
[#145](https://github.com/Pawel-IT/FreeGantt/issues/145) (S5.9 plugin registrations).
**Follows:** [#154](https://github.com/Pawel-IT/FreeGantt/issues/154) (`plans/issues/closed/154-registration-table.md`).
**Slice:** S5.9 follow-up. **Written and landed:** 2026-09-04.

## 1. What #145 framed, and what it missed

#145 reviewed the three seams S5.9 *added* and moved them onto one `createRegistrationTable`.
`GanttShell` ships six. The three the review never framed were `view.registerRenderer`,
`commands.register`, and `interaction.registerKeybinding`. Only the last one was already correct.

Three probes, all run before the fix:

| Probe | Expected | Before |
|---|---|---|
| plugin registers a `cell` renderer, then `gantt.plugins = []` | the entry's own text paints | the plugin's renderer still paints |
| …then `gantt.plugins = [thatSamePlugin]` | re-installs | `RendererAlreadyRegisteredError`, naming that plugin twice |
| plugin overrides `freegantt.selectAll`, then `gantt.plugins = []` | core select-all runs | the uninstalled plugin's body runs |
| plugin's own `demo.own` command, after uninstall | `UnknownCommandError` | runs |

Both are the defect #146/#147 fixed, in the two seams nobody looked at. Neither registry returned a
`Disposer`, so `GanttShell` had nothing to put in the plugin's `DisposableStore`.

## 2. What landed

### 2.1 `CommandRegistry` is the table's fourth adapter

`#commands` is `createRegistrationTable<string, CommandOf<TGantt>>()`. The core catalog registers
first and never disposes, so it sits at the bottom of every id it owns — which is exactly the restore
D-S5-7's "a plugin can override any of them" always implied and never performed. `register` returns
the table's `Disposer`; `available()` reads `active()` (one command per id, first-registration
order).

**Boundary.** `extensions/` may import only `api/` and `model/` (`extensions-public-only`). The table
is now the second named leaf in that rule, alongside `data/dev-mode.ts` — one file, one type import
from `model/`, no `layout/` behaviour routed anywhere. The alternative was a second hand-written
stack inside `commands.ts`, which is the duplication #154 existed to remove.

### 2.2 `RendererRegistry` keeps its collision policy and gains a lifetime

Two plugins claiming one point still throws `RendererAlreadyRegisteredError` (D-S5-11, `s5.4-renderers.md`
§ "diagnostics over a silent last-wins") — a single paint slot is not a stack. `register` now returns
a `Disposer`, so the point is free again when the plugin goes, and a plugin no longer collides with
what its own earlier installation left behind. `GanttShell` also requests a frame on the way *in*: a
renderer claim changes every painted cell, and the first install only repainted because the shell's
own first render happened to come after `setup()`.

### 2.3 `ColumnChrome` strips a baked column by one question

A resize commit bakes a plugin column into `#gridColumnInput` (D-S5-18). The disposer used to ask
"was I the one on screen?" and strip on yes — which, with a second plugin still registered on the
field, threw away the width the consumer had dragged. It now asks **"does any live registration still
ask for this field?"** and strips only when none does. This reverses the trade-off recorded in
`154-registration-table.md` §2.4 row 2, deliberately: a commit writes the consumer's own list, a
resize is a gesture the consumer performed, and a plugin leaving must not undo it. The surviving
plugin's own content re-supplies the column only once the committed one is gone.

### 2.4 Every `register*` returns a `Disposer`

All six seams and `commands.register`. The plugin's `DisposableStore` still holds a copy, so ignoring
the return value stays the common case; the return value is what lets a plugin retract a registration
while it keeps running (a column it shows in one mode only). Every one is idempotent, because the
store will dispose the same function the plugin may already have called. `RegistrationGate.guard` now
passes the wrapped function's return value through instead of swallowing it.

## 3. Where the rule is written down

`plans/02-public-api.md` §4.4 — one collision policy per seam shape (throw for a single paint slot,
newest-wins-with-restore for anything keyed by an identifier, additive for the rest), one lifetime for
all six, and the `Disposer` return. `CONTEXT.md` gains **Registration table**, so the mechanism has a
glossary name rather than living in three seams' doc comments.

## 4. Verification

`pnpm verify` green, `pnpm test:e2e` 56 passed. New tests: two `#155` cases in `src/api/gantt.test.ts`
(renderer uninstall + re-install; command uninstall restoring core), one mid-life retraction through a
returned `Disposer`, four in `src/extensions/commands.test.ts`, one in
`src/view/renderer-registry.test.ts`. The existing `#147` resize-commit test now asserts the width
survives while another plugin still asks for the field.
