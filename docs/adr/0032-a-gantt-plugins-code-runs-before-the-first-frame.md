---
status: accepted — ruled 2026-09-23, out of the plan for #533. PR 2 of 2 (this record; the Gantt
half). PR 1 (the `Dataset` half, [ADR 0031](0031-a-plugin-declares-its-shape-its-code-runs-on-a-finished-object.md))
merged first. Working material:
[`plans/issues/open/533-gantt-view-lifecycle.md`](../../plans/issues/open/533-gantt-view-lifecycle.md).
decided: a finished Gantt is built and configured, but not painted, before any plugin's `view(ctx)`
runs. The `Gantt` constructor assigns `#shell`, then installs `options.plugins` through the same
public setter a later `gantt.plugins = [...]` call uses, then paints frame 1. `#constructed` still
flips last, at the end of that paint, so a `view()`-time write to `ctx.gantt` fires nothing until
`new Gantt()` returns — unlike the Dataset half, where a `data()`-time write reaches every handler
already registered. A throwing `view()` tears the half-built shell down through `destroy()` and
rethrows the original error.
open: a declared shape for a Gantt plugin, the way `hierarchySource` is declared for a Dataset
plugin — no construction step reads one today, so nothing asks for it yet.
---

# A Gantt plugin's code runs before the first frame

**Amends [0031](0031-a-plugin-declares-its-shape-its-code-runs-on-a-finished-object.md).** That
record settled the Dataset half and left the Gantt half open. This one settles it, on the same
posture: a plugin's code runs against a finished object, never a half-built one.

## Context

`view(ctx)` ran inside the `GanttShell` constructor, before `Gantt`'s own `#shell` field was
assigned. At that moment:

- Every `ctx.gantt.*` getter threw a `TypeError`, because the getter reads `this.#shell`.
- `ctx.gantt.resolvedTheme` failed even once `#shell` existed: the dark-scheme media query it
  reads was not built yet.
- The `selectedEntryIds` and `zoomPresets` options were not applied yet, so a plugin reading them
  back through `ctx.gantt` read the wrong answer.
- A code comment said no plugin runs before `#shell` is assigned. The code did the opposite.

A throwing `view()` also left the half-built shell connected to the page: its Dataset `change`
subscription and its document keydown listener both survived, because nothing ran their
disposers.

## Decision

**A finished Gantt is built and configured, but not painted. `view()` runs between those two
states.**

The `GanttShell` constructor builds every collaborator and applies every option — selection, zoom
presets, collapse state, theme, the theme `MutationObserver`, `a11yLabel` — before any plugin
installs. It stops taking a `plugins` option; `datasetPlugins` stays, because a Dataset plugin's
`view` half belongs to every Gantt that Dataset ever mounts. `GanttShell` gains one new public
method, `paintFirstFrame()`, that does what the constructor used to do last: it sets the shell
live, flushes the frame scheduler, and marks the shell constructed.

`Gantt`'s own constructor then runs three steps, in order:

```ts
this.#shell = new GanttShell({ container, dataset, /* every other option but plugins */ });
this.plugins = options.plugins ?? []; // the same public setter `gantt.plugins = [...]` uses
this.#shell.paintFirstFrame();
```

Read the last line aloud: "the shell paints its first frame." A plugin's `view(ctx)` runs inside
the second step, against a `ctx.gantt` whose getters all answer real state, because `#shell` is
already assigned and every option is already applied.

**Why paint after `view()`, not before.** A plugin's registrations shape frame 1: variants,
variant CSS, grid columns, decorations, renderers and capabilities. Painting frame 1 first and
then installing plugins would force a second full render, and every frame-level side effect —
column width, header band count, the roving-focus sweep — would run twice, once under each
configuration. The browser never shows the first, synchronous frame, so painting first buys no
visible improvement; it only doubles the work and hides a constructor-supplied plugin's DOM from a
caller who reads the container the instant `new Gantt()` returns.

This is the opposite order from the Dataset. A Dataset's derived state (the Rollup) depends on
declarations alone, so it exists before `data()` runs. A Gantt frame depends on code a plugin
writes inside `view()`, so the frame can only exist after `view()` returns.

**Every seam `view()` can register already exists before `view()` runs.** No construction step
needs a plugin's shape in advance: `ctx.variants.add`, `registerGridColumn`, `registerRenderer`,
`registerDecoration`, `commands.register`, `registerKeybinding` and every capability all resolve
against a registry that already exists, read again at the point of use — the grid's `fitColumns`
measurement, each render, each keydown. A Gantt plugin declares nothing on its own definition the
way a Dataset plugin declares `hierarchySource`; it only registers, at `view()` time, into seams
that were already standing open.

**Inside `view()`, DOM and painted-bar questions have no answer yet.** `ctx.view.dom.barFor(id)`
answers `undefined`, and so do `resolveTooltipContent` and `lastPaintedBar` — frame 1 has not
painted. This is the same answer `view()` already gave before this record; the fix is that every
other question now answers correctly. Read the DOM from a handler, never from the body of
`view()`.

## `#constructed` still flips last, and a `view()`-time write stays silent

`#constructed` keeps its job: construction reports no change (issue #376). It now flips at the end
of `paintFirstFrame()`, after the first flush settles the starting preset and the header bands —
those are not events. A `ctx.gantt.on(...)` handler a plugin adds inside `view()` hears nothing
until `new Gantt()` returns.

**A plugin's own `view()`-time write to `ctx.gantt` is silent, on purpose.** `ctx.gantt.selection =
[...]` inside `view()` fires no `before*` veto and no event — an earlier-installed plugin's own
`selectionChange` handler hears nothing from it. The same write made later, inside
`installPlugin`, fires normally. The alternative — opening events before `view()` runs — was
rejected: it would need a second gate just to keep frame 1's own construction-time
`navigationChange` quiet, for no gain a caller can observe. Unlike the Dataset half, where a
`data()`-time write reaches every handler already registered, a `view()`-time Gantt write fires
nothing until `new Gantt()` returns.

**A Dataset write inside `view()` is not a Gantt event at all.** It fires the Dataset's own
`change` and becomes an ordinary undo step, because the Dataset the Gantt mounts may be shared with
other Ganttz, and a Gantt must never clear a shared Dataset's History on its own construction. A
plugin that wants to seed data seeds it in `data()`, not in `view()`.

**`ctx.gantt.plugins` reads `[]` during construction's own `view()` call.** The install commits
last, the same way `installPlugin` already worked before this record — a plugin cannot see itself,
or a later plugin in the same batch, already installed. A later `installPlugin` call behaves the
same way.

## Unwind: a throwing `view()` tears the shell down

The `Gantt` constructor wraps the plugin install and the first paint in one `try`. On a throw it
calls `this.destroy()`, then rethrows the original error unchanged — `PluginSetupError`,
`DuplicatePluginIdError`, `MissingPluginError` or `wrongInstallSite`. Before this record, the
plugin runtime unwound only the failed install batch in reverse; nothing ran the shell's own
teardown, so the container DOM, the variant `<style>` tag, resize observers, the viewport binding,
the Dataset `change` subscription and the document keydown listener all outlived the failed
`new Gantt()` call. After this record, `destroy()`'s own disposer store releases all of it, in
reverse, on every throw. `DisposableStore.disposeAll` does not catch a disposer's own throw; no
core disposer throws today, so a plugin's setup error is never hidden behind one.

## Consequences

- A plugin author reads one story on both halves: declare what construction needs in advance,
  then write code against an object construction has already finished. There is no longer a moment
  where a plugin's own code runs against a half-built Gantt, the same promise ADR 0031 already
  gives the Dataset.
- `RegistrationGate` does not change. It still opens for each `view()` call and closes when that
  call returns — one resolution per seam is what catches a renderer or keymap conflict at install
  time, for the same reason it already does on the Dataset side.
- No Gantt plugin declares its shape in advance in this record. No construction step reads a
  plugin's registrations before `view()` runs, so there is nothing today for a declaration to feed.
  A future construction step that needs to know a plugin's shape ahead of `view()` is the trigger
  for revisiting this.
