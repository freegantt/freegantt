---
status: amended by [0032](0032-a-gantt-plugins-code-runs-before-the-first-frame.md) — the Gantt
`view()` half this record left open is decided: a finished Gantt is built and configured, but not
painted, before any plugin's `view(ctx)` runs. Ruled 2026-09-23, out of the plan for
#533. PR 1 of 2 (this record; the `Dataset`
half) is planned; the Gantt `view()` half is PR 2, planned separately. Working material:
[`plans/issues/closed/533-plugin-lifecycle.md`](../../plans/issues/closed/533-plugin-lifecycle.md).
decided: a plugin declares on its definition everything that shapes construction — `fields`,
`fieldTypes`, `aggregators` and `hierarchySource`. The `Dataset` builds completely from those
declarations before any plugin's `data(ctx)` runs. `new Dataset({ entries })` checks the batch the
same way `load` does — a duplicate id, an unknown parent or a cycle throws, reading the raw
`parentId` even under a declared hierarchy source (coordinator correction: a source's own runtime
refusal rule, set in ADR 0020, still stands).
open: the Gantt half (the same rule for `view()`'s timing) is PR 2, out of scope here.
---

# A plugin declares its shape; its code runs on a finished object

**Amends [0019](0019-one-plugin-one-install-site.md) and [0020](0020-a-plugin-may-own-the-hierarchy.md).** Neither record states when a plugin's code runs relative to the object it installs on. This one does, for the `Dataset` half; the Gantt half follows in PR 2.

## Context

`new Dataset()` ran every plugin's `data(ctx)` inside the `DatasetState` constructor. At that moment:

- `ctx.dataset.*` threw, because `Dataset`'s own private state was not assigned yet.
- Parents had no Rollup values — the first Rollup runs after `installPlugins`.
- History did not exist — it is built last in `DatasetState`'s own constructor.

A plugin's `ctx.hierarchy.setSource` call arrived after the entries were already checked against the tree, so construction checked rows under a tree that never went live. Construction also never threw on a broken batch, even though `entries.load()` (#496) does — the same shape of input met two different doors with two different postures.

The harness lock plugin (`harness/plugins/lock-entries.ts`) worked around the first two problems with a lazy seed on first read. That is a harness workaround for a `src/` gap, and the stop rule (`CLAUDE.md`) names exactly this: the harness never patches the library.

## Decision

**A plugin declares everything that shapes construction; its code runs after the `Dataset` is built.**

`fields`, `fieldTypes`, `aggregators` and a new member, `hierarchySource`, sit on the plugin definition itself — not behind a `ctx` door a `data(ctx)` call reaches. `Dataset` reads every installed plugin's declarations, builds the store, the Field registry, the hierarchy source chain and the Rollup completely, and only then calls each plugin's `data(ctx)` in turn. `new Dataset({ entries, plugins })` keeps its one call; nothing about that call changes.

```ts
definePlugin<PhaseProps>({
  id: 'demo.phases',
  fields: [{ key: 'phaseId' }],
  hierarchySource: (next) => (entry) => entry.props.phaseId ?? next(entry),
  data(ctx) {
    // ctx.dataset.entries.all is readable here — the Dataset is finished.
  },
});
```

`hierarchySource(next: HierarchySource<P>): HierarchySource<P>` reads: its hierarchy source is the entry's phase id, or the next source's answer. `P` is the plugin's own `TProps`; on a `ChromePluginOf` the member is typed `never`, so a chrome-only plugin cannot declare one. Composition follows setup order (`resolveSetupOrder`) — the same order `data()` runs in: the first plugin wraps core's own `storedParentSource`, each later plugin wraps the one before it, and the last plugin answers first. That is the same idiom `setExtender` and `setLockRule` already use, so a plugin author meets one composing shape across every seam, not two.

**Supersedes [ADR 0020](0020-a-plugin-may-own-the-hierarchy.md)'s per-call generic on `setSource`.** `ctx.hierarchy.setSource<PhaseProps>(...)` carried a generic on each call so `entry.props` read with no cast, because a `ctx` door has no other way to learn a caller's props shape at that call. A method on the plugin definition does not need one: `definePlugin<PhaseProps>({ hierarchySource: ... })` already binds `P` for the whole object, so `hierarchySource`'s own `next`/`entry` types follow it, the same way `data(ctx)` already types `ctx.dataset` off the one type argument. A caller-picked generic on the seam itself is gone because there is no longer a seam left to pick one on.

**`ctx.hierarchy.setSource` is deleted.** It was one way to declare something that now has exactly one way to declare it (the same move that earlier retired `ctx.fields.register*`). `DatasetHierarchy`, `DatasetPluginContextOf.hierarchy`, `EntryStore.setHierarchySource` and `DatasetState.setHierarchySource` go with it. `EntryStore.#hierarchySource` becomes a plain readonly field the constructor sets, not a signal — nothing sets it later. Had `setSource` stayed, a source set inside `data()` would have arrived after the Rollup already ran, and the Rollup would be stale.

**`data` becomes optional on `DataPluginOf`.** A plugin that only declares — `hierarchySource` alone, say — installs no code that runs, so it must not be forced to write an empty `data() {}`. `assertChromeOnly` refuses a Gantt plugin that carries `fields`, `fieldTypes`, `aggregators` or `hierarchySource`, the same as it already refuses one that carries `data`.

## `new Dataset({ entries })` checks the batch like `load`

Construction never threw on a broken batch. `load` does: a duplicate id (`DuplicateEntryIdError`), an unknown parent (`EntryNotFoundError`) or a cycle (`ParentCycleError`), checked against the whole list before anything stages, order-tolerant (#496). The two doors take the same shape of input and now meet the same posture: `new Dataset({ entries })` runs `assertEntryBatchIsSound` before `new EntryStore`, with the operation label `'new Dataset'` so the error names the door the caller used.

**The check reads the raw `parentId`, exactly like `load` — even under a declared hierarchy source.** [ADR 0020](0020-a-plugin-may-own-the-hierarchy.md) already settled this shape for a source's own runtime refusals: an unknown parent or a cycle a *source* produces is a Fault (`unknown-parent`, `hierarchy-cycle`), never a throw. That stands. What this record adds is the batch check that runs once, at construction, before any source is asked anything — the same raw check `load` already runs. A consumer whose stored `parentId` values are stale, and whose plugin tree ignores them, now meets a throw it did not meet before. `entry-store.ts`'s `#assertParentValid` comment, which said ingest checks no authored `parentId`, was already stale before this record; step 3 of #533 corrects it.

## History starts before `data()`; construction ends with an empty History

`DatasetState` still builds `History` last, in its own constructor — ahead of every `change` handler a plugin's `data()` adds, so it is always the first subscriber, the same rule an ordinary consumer handler already keeps. A write inside `data()` is an ordinary write on a finished `Dataset`: its own transaction, `change` fired to the handlers that exist, recorded by `History` like any other write.

**After the last plugin's `data()` returns, `Dataset` clears History.** `canUndo` reads `false` right after `new Dataset()` — a plugin's setup seed is not an undo step (#137), the same rule `load` already keeps. The alternative — leaving setup writes undoable — was rejected: `Ctrl+Z` at app start would undo a plugin's own seed, which reads as the app breaking on the first keystroke.

A setup write inside one plugin's `data()` sees only the plugins that ran `data()` before it, in setup order — the same order everything else in this record follows.

## `Dataset` owns the plugin lifecycle

`DatasetState` stops taking `installPlugins`. Construction order becomes: build `DatasetState` → assign `#state` → install every plugin (`#disposePlugins = this.#installPlugins()`) → clear History. `destroy()` calls `#disposePlugins`; `DatasetState.destroy()` is deleted, because nothing but the plugin lifecycle needed unwinding. A `data()` that throws still unwinds the plugins installed before it, in reverse order, and still raises `PluginSetupError` — `installDatasetPlugins` keeps that job.

## Consequences

- A plugin author reads one story: declare the shape, then write code against a `Dataset` that already has it. There is no longer a moment where a plugin's own code runs against an unfinished object.
- The construction Rollup's `derived-values-dropped` report reaches `console.warn` when nothing else can hear it (`transaction.ts`) — before this record it was silently dropped, because no handler could exist yet; after this record no subscriber can exist at construction, so the fallback is the only channel there ever was.
- `RegistrationGate` still closes `setExtender` and `setLockRule` after `data()` returns, for a changed reason: a Dataset plugin never uninstalls one at a time, so a wrap installed later could never be undone, and every commit after construction would have to read a different composed occupant than the one before it.
- `EntryStore`'s constructor grows to a 7th optional positional argument, `hierarchySource`. An options object for that constructor is a separate refactor, out of scope here.

## Out of scope — PR 2 (the Gantt half)

The Gantt follows the same posture for `view()`: `ctx.gantt.*` works only once a Gantt has finished mounting. That is a separate build, against `view/gantt-shell.ts`, and this record does not decide its detail.
