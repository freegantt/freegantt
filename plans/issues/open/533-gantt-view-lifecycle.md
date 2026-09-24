# #533 — plugin code runs on a finished Gantt (PR 2 of 2)

**Status:** planned 2026-09-23, no code. Issue: #533. PR 1 (Dataset, `533-plugin-lifecycle.md`) lands first.
PR 2 applies the rule of ADR 0031, "a plugin declares its shape; its code runs on a finished object", to the Gantt.

## Problem

`view(ctx)` runs inside the `GanttShell` constructor, before `Gantt.#shell` is assigned. At that moment:
- Every `ctx.gantt.*` getter throws a `TypeError`, because the getters read `this.#shell`.
- `ctx.gantt.resolvedTheme` fails even with `#shell` assigned: `#darkSchemeQuery` does not exist yet.
- The `selectedEntryIds` and `zoomPresets` options are not applied yet.
- The comment at `gantt-shell.ts:898-903` says no plugin runs before `#shell` is assigned. The code does the opposite.

A throwing `view()` also leaves the half-built shell connected to the page. It keeps its `change` subscription and its document listener.

## Rulings

- **Q4 (owner, 2026-09-23).** The Gantt follows the Dataset rule: `view(ctx)` runs only on a finished Gantt.
- **ADR 0031 (PR 1).** PR 2 adds its Gantt section. The dispatch chose extend, not a new ADR.
- **PR 1 leaves these in place:** `datasetPlugins`, the shared `resolveSetupOrder`, `RegistrationGate`, and `PluginSetupError.wrongInstallSite`.

## Decisions

**D1. A finished Gantt is built and configured, but not painted. `view()` runs between those two states.**
- The `GanttShell` constructor builds everything and applies every option. It does not install plugins, and it does not paint.
  - Options: selection, zoom presets, collapse state, theme, the theme `MutationObserver`, `a11yLabel`.
  - Plugins: the `plugins` option leaves `GanttShellOptions`. `datasetPlugins` stays.
- `Gantt`'s constructor then does three things, in this order:
  1. It assigns `this.#shell`.
  2. It runs `this.plugins = options.plugins ?? []`. This is the public setter, the same one `gantt.plugins = [...]` uses (D5).
  3. It calls `this.#shell.paintFirstFrame()`.
- `paintFirstFrame()` sets `#phase = 'live'`, then runs `#frames.flush()`, then sets `#constructed = true`.
  - These are today's lines 1193, 1194 and 1232, in the same order.
  - Call site: `this.#shell.paintFirstFrame()`. Read aloud: "the shell paints its first frame."
- Why paint after `view()`:
  - A plugin's registrations shape frame 1: variants, variant CSS, grid columns, decorations, renderers and capabilities.
  - If frame 1 painted first, a second full render would run. Frame-level side effects would then run twice under two configurations: the `fitColumns` width, the #448 shadow report, the header band count and the roving-focus sweep.
  - The browser never shows a synchronous in-between frame. So the cost is not a visible flash. The cost is wasted work, and plugin DOM that a synchronous reader after `new Gantt()` does not see.
- Contrast with the Dataset: the Dataset's derived state (the Rollup) depends on declarations only, so it exists before `data()`. A Gantt frame depends on `view()` code, so it comes after `view()`.
- ⚠️ Consequence: inside `view()`, DOM and painted-bar questions have no answer yet.
  - `ctx.view.dom.barFor(id)` gives `undefined`. So do `resolveTooltipContent` and `lastPaintedBar`.
  - This is the same as today. Document it: read the DOM in a handler, not in `view()`.

**D2. Every seam `view()` registers exists before `view()` runs, and is read at the time of use.** No construction step needs a plugin's shape in advance.

| Seam | Where it resolves | New order |
| --- | --- | --- |
| `ctx.variants.add`, variant CSS | layout on each frame; `refreshVariantStyles` | registry (:758) and stylesheet (:778) exist; consumer variants outrank plugins by rank, not order |
| `registerGridColumn` | `rebindFields` → `#bindColumns` → `resizeToColumns`, synchronous | `fitColumns` measures the plugin column before frame 1 |
| `registerRenderer`, `registerDecoration` | each render | ok |
| `commands.register`, `registerKeybinding` | at run time and at each keydown | core commands (:1068) register first, so a plugin still wins (D-S5-7) |
| capabilities (`can`) | `refreshCapabilities` port | `#capabilities` (:972) exists |
| overlay, rowLayer, dom, `onDomEvent` | live | exist from :703 |
| zoom presets | no plugin seam | the option applies before `view()`; a `view()` write to `ctx.gantt.zoomPresets` lands before frame 1 |
| selection | `EntrySelection.propose` does not filter on `can.select` (`entry-selection.ts:116-123`) | applying it before plugins changes no result |

**D3. `#constructed` stays. It now flips at the end of `paintFirstFrame()`.**
- Rule #376 holds: construction reports no change. The first flush settles the preset and the header bands. Those are not events.
- A `ctx.gantt.on(...)` handler that a plugin adds in `view()` hears nothing until `new Gantt()` returns.
- `view()` can now read the starting state from `ctx.gantt`. That was the plan all along (`gantt-shell.ts:615-620`).
- ⚠️ A plugin's own `view()`-time Gantt write is also silent. Example: `ctx.gantt.selection = [...]`. No `before*` veto runs, and an earlier plugin hears no event.
  - The same write in a later `installPlugin` fires the events.
  - Alternative: open the events before `view()`. Rejected: that needs a second gate to keep frame 1's own `navigationChange` quiet.
- A Dataset write in `view()` is not a Gantt event. It fires `change` and becomes an undo step. The Gantt must not clear a shared Dataset's History. Document: "seed data in `data()`, not in `view()`."

**D4. One install path.**
- The constructor and a later reconfiguration both go through `Gantt.set plugins` → `assertChromeOnly` → `GanttShell.set plugins` → `PluginRuntime.install`.
- `installPlugin` and `uninstallPlugin` already use it.
- ⚠️ During `view()` at construction, `ctx.gantt.plugins` reads `[]`, because the install commits last. A later install behaves the same way. Keep this and document it.

**D5. Unwind: the `Gantt` constructor wraps steps 2 and 3 of D1 in `try`. On a throw it calls `this.destroy()`, then rethrows the original error unchanged.**
- Today:
  - `PluginRuntime` disposes the failed batch in reverse. Nothing runs `#teardown`.
  - Left behind: the container DOM, the variant `<style>`, two resize observers, a viewport binding on a shared scale, the Dataset `change` handler, container and document keydown listeners, and wheel listeners.
  - The dead shell re-renders on every Dataset change. It also resolves keys that land outside the container.
- After: `#teardown.disposeAll()` releases all of it, in reverse. The error is still `PluginSetupError`, `DuplicatePluginIdError`, `MissingPluginError` or `wrongInstallSite`.
- `DisposableStore.disposeAll` does not catch. A core disposer that throws would hide the plugin's error. Accept that: no core disposer throws today.

**D6. No declared shape for a Gantt plugin in PR 2.** ⚠️
- The Dataset needs declarations because construction (the store, the tree, the Rollup) reads them before any code runs. On the Gantt, no construction step reads plugin shape before `view()`. D2 shows this.
- Gantt registrations resolve again on each frame. `gantt.plugins` is live, and the gate plus `ctx.disposables` already give each registration a lifetime.
- Declared `variants` or `gridColumns` would add a second door next to `ctx.variants.add` and would change nothing a reader can see.
- Follow-up only if a construction step starts to need plugin shape before `view()`.

**D7. `RegistrationGate` does not change.** It still opens for each `view()` and closes when `view()` returns. D-S5-4's Gantt reason stands: one resolution per seam catches renderer and keymap conflicts at install time.

**D8. ADR 0031 gets a "Gantt half" section.** It records D1, D3 and D5. The status in `docs/adr/README.md` stays "accepted". ⚠️ If ADR 0031 counts as accepted when PR 2 lands, the README rule ("never rewritten") asks for a new ADR 0032 instead.

## Facts found

- `src/api/gantt.ts`:
  - :325-428: the constructor. `#dataset` is set at :326, and `new GanttShell` runs at :338.
  - :373-377 and :414-422: stale comments ("`this` is captured, not read"). No `try` anywhere.
  - :283-290: `assertChromeOnly`. :1050-1052: the `plugins` setter. :1099-1103: `destroy`.
- `src/view/gantt-shell.ts`:
  - :394-409: option docs that cite N7. :615-620: the `#constructed` doc. :630: `#phase`.
  - :895-896: registry and keymap. :898-903: the false comment. :909: `PluginRuntime`.
  - :928-935: viewport bind, dropped while constructing. :944: Dataset subscription. :973-1008: selection, collapse, focus, live region.
  - :1110: document keydown listener. :1189-1192: plugins, then zoom presets, then selection. :1193-1194: live, then flush.
  - :1196: `#darkSchemeQuery`. :1207: theme. :1222: `MutationObserver`. :1229: `a11yLabel`. :1232: `#constructed`.
  - :1397: the `#emit` gate. :2288: `resolvedTheme` reads `#matchMedia`, which is undefined before :1196.
  - :2429-2431: `zoomPresets` emits only when live. :2559-2562: the `plugins` setter.
  - :1785 and :2528: synchronous flush from `reveal` and the focus ports.
  - :2780-2788: `destroy`.
- `src/extensions/plugin-runtime.ts:110-170`: `install` unwinds the batch and commits last. `:148-150`: closes the gate.
- `src/view/column-chrome.ts:146-151` → `gantt-shell.ts:1812` → `:2616`: a plugin column resizes `fitColumns` synchronously.
- `src/view/frame-scheduler.ts:21-34`: `flush` cancels a pending `request`.
- No library or harness plugin reads `ctx.gantt` in the body of `view()`: `tooltips.ts:99`, `inline-editing.ts:739`, `context-menu.ts:117-202`, `harness/plugins/selection-shortcuts.ts:18` and `log-everything.ts:15` all read it in handlers. The harness has no Gantt-side workaround.
- 67 direct `new GanttShell` sites: `view/gantt-shell.test.ts` 54, `view/keyboard-navigation.test.ts` 8, `view/styles.test.ts` 4, `interaction/extender-preview.test.ts` 1. None passes `plugins`.
- `GanttShell` has 0 hits in `etc/freegantt.api.md`. The public API report does not change.
- Tests that touch the order:
  - `api/gantt.test.ts:1569` (#376): stays green, and gets extended.
  - `:3368-3370`: a stale "one rAF away" comment.
  - `:6839`: `seenGantt`.
  - `api/define-plugin.test.ts:89`: first frame.
  - `extensions/plugin-runtime.test.ts`: no change.
- The worktree holds uncommitted PR 1 step 1 edits in `plans/01`, `plans/02` and `s5.1`. PR 2's doc step builds on them.

## Steps

Every commit is green on `pnpm verify:full`. The steps run in order, and none run in parallel. No step changes a public type.

1. **Specs lead** (docs only, about 45 min).
   - ADR 0031: add the Gantt section (D1, D3, D5).
   - `plans/02-public-api.md:659`: "runs as a Gantt mounts" becomes "runs on a finished Gantt, before its first frame".
   - `plans/01-domain-architecture.md` ~790, the `ChromePlugin` doc: add the timing sentence.
   - `s5.1` D-S5-4: add one sentence. A Gantt plugin's gate opens when `view()` runs on a finished Gantt.
   - `plans/issues/open/README.md`: add this plan.
2. **Test helper, no behaviour change** (about 40 min).
   - In each of the 4 test files, add a local `paintedShell(options)` that returns `new GanttShell(options)`.
   - Replace the 67 sites with it. Keep the `#does-not-exist` throw cases as `new GanttShell`.
3. **`view()` runs on a finished Gantt** (medium-large, about 3 h).
   - Red tests in `api/gantt.test.ts`:
     - (a) `view()` reads `ctx.gantt.selection`, `zoomPresets`, `resolvedTheme`, `a11yLabel` and `gridWidth`, and each one equals the constructor option.
     - (b) With no `await`, a plugin variant, a plugin grid column (under `fitColumns`) and a decoration are in the DOM when `new Gantt()` returns.
     - (c) Extend #376: plugin B sets `ctx.gantt.selection` in `view()`. Plugin A's `selectionChange` handler hears nothing, and `gantt.selection` reads B's ids.
   - Red test in `view/gantt-shell.test.ts`: `new GanttShell` paints no `.fg-bar` and emits nothing until `paintFirstFrame()`.
   - Code (D1):
     - Shell: move :1196-1229 above the plugin block. Delete :1189-1190 and :1193-1194, and move them into `paintFirstFrame()`. Delete the `plugins` option. Keep `datasetPlugins`.
     - `gantt.ts`: assign `#shell`, then `this.plugins = …`, then `this.#shell.paintFirstFrame()`.
     - The `paintedShell` helper now calls `paintFirstFrame()`.
   - Rewrite these comments, and state in each the question it answers:
     - `gantt-shell.ts` :394-409, :615-620, :898-903, :1178-1188, :1230-1231
     - `gantt.ts` :373-377, :414-422
     - `gantt.test.ts:3368-3370`
   - Docs that become true in this commit:
     - `CONTEXT.md` Plugin entry (:669): the `view` half "runs once the Gantt is built, before its first frame".
     - `docs/06-plugin-authoring.md:21`: the same row. Add a short note to the Gantt section of `docs/06`:
       - `ctx.gantt` is readable in `view()`.
       - DOM questions answer from the first frame on.
       - A `view()`-time Gantt write is silent (D3).
       - Seed data in `data()`.
4. **A throwing `view()` tears the shell down** (small, about 1 h).
   - Red test: construct with a plugin whose `view()` throws. Expect `PluginSetupError`, an empty container, `dataset.off('change', …)` called, and the document keydown capture listener removed.
   - Code: D5's `try`/`catch` in the `Gantt` constructor.
5. **Harness: `logEverything` reads the finished Gantt** (small, about 15 min). In `harness/plugins/log-everything.ts`, `view()` writes `logEverything: installed, ${ctx.gantt.selectedEntryIds.length} selected`. First grep `e2e/` for the old log line. Harness only.
6. **Close out** (about 30 min).
   - Run `ocr review --from origin/main --to HEAD`.
   - Run the full e2e suite. Watch `plugins.spec`, `mount-destroy.spec` and `hierarchy.spec`.
   - Review `harness/main.ts` (the stop rule).

## Risks

- A `view()` that calls `ctx.gantt.reveal(id)` or a focus port flushes a frame early. That frame carries only the plugins installed so far. Today such a call throws, so no existing plugin does it.
- A consumer that relied on the rAF repaint after construction sees no change: the plugins' seams are already in frame 1.
- A plugin that keeps `ctx.gantt` from a `view()` that ran before a later plugin threw now holds a destroyed Gantt. Its calls read a torn-down shell. Document this, and do not guard against it.
- The 67-site test churn hides a real failure only if a test asserts DOM before `paintFirstFrame()`. The step 3 shell test pins that case.

## Out of scope

- Declared Gantt shape (D6): a follow-up only if a construction step needs it.
- Merging `#phase` and `#constructed` into one state.
- Anything PR 1 owns: the Dataset lifecycle, `hierarchySource`, `data` optional, and `assertChromeOnly`'s new refusals.

## Coordinator review (2026-09-23, approved with amendments)

The coordinator checked the plan against `docs/adr/README.md:5`: "An accepted record is superseded,
never rewritten."

- **B1 — New ADR 0032, not a section in 0031 (replaces D8).** ADR 0031 is accepted when PR 1 merges, so
  PR 2 writes ADR 0032, "A Gantt plugin's code runs before the first frame". It records D1, D3 and
  D5, and its status reads "amends 0031". `docs/adr/README.md` marks 0031 "amended by 0032". This
  closes the D8 ⚠️.
- **B2 — The same working rules as PR 1.** Step 1 carries the ADR and the `plans/` specs only. A
  `CONTEXT.md` or `docs/06` line lands with the code that makes it true (step 3). The implementer
  commits each step, then stops for the commit reviewer.
- **B3 — The ⚠️ calls stand for tonight:** D1 (DOM questions have no answer in `view()`), D3 (a
  `view()`-time Gantt write is silent), D4 (`ctx.gantt.plugins` reads `[]` during `view()`) and D6 (no
  declared Gantt shape). The owner confirms them in the morning.
- **Branch:** PR 2 branches off `main` after PR 1 merges. The worktree note in "Facts found" is out of
  date: PR 1 step 1 is committed (754ba330).

## Coordinator note (after PR 1 merged)

- ADR numbers are fixed now, so parallel branches do not clash: this PR writes **ADR 0032**. #529 writes
  0033. #528 writes 0034.
