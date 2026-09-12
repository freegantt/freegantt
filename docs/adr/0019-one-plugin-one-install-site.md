---
status: accepted — built and merged on 2026-09-12 (`plans/row-redesign/build/build-3-0019-install-site.md`). Gate: `verify:full PASS — all 16 checks green, test:e2e included (70s).` Opened 2026-09-11, out of a design session on the plugin variant surface. The working material is in `plans/row-redesign/`.
decided: a chrome-only plugin — one with no `data` half — keeps its own install site on the `Gantt`, and `gantt.plugins` stays live-reconfigurable (2026-09-11). Every plugin with a `data` half installs on the `Dataset`.
open: nothing. A plugin with a `data` half, handed to a `Gantt`, raises **`PluginSetupError`**, and the message says where to install it (2026-09-11, author's ruling — `Q4`). No new error type ships. **The type refuses it before the runtime does** — `GanttOptions.plugins` takes a chrome-only plugin alone (2026-09-11, review fix) — see *The compiler refuses it first*. A silent install of the `view` half alone is refused — see *Consequences*. This ADR also takes ownership of the live-install hazard that [#192](https://github.com/Pawel-IT/FreeGantt/issues/192) left behind (2026-09-11); it names the hazard and does not repair it.
---

# One plugin, one install site

**Lands after [0017](0017-the-entry-answers-questions-about-itself.md) and [0018](0018-a-variant-is-a-rule-not-an-id-list.md).** Those two join the row. This one joins the plugin that reads it.

## Context

A plugin author picks between two contracts today, and `docs/06-plugin-authoring.md` opens with the table:

| Contract        | Installs on | Sees                             |
| --------------- | ----------- | -------------------------------- |
| `GanttPlugin`   | `Gantt`     | rendering, interaction, commands |
| `DatasetPlugin` | `Dataset`   | fields, edits, events, store     |

**A real feature is usually both.** "This value is true, and the row draws as a milestone" is one thought. It installs twice: a `DatasetPlugin` for the Field, a `GanttPlugin` for the variant. `requires` exists only on the Dataset side, so the pair cannot even state that it is a pair. The S7 scheduling plugin is the same shape at full size — Fields, an edit hook and a store on one side; variants, painting and commands on the other.

## Decision

**One plugin type, two halves, one install site.**

```ts
const scheduling = () =>
  definePlugin({
    id: 'freegantt.scheduling',
    requires: ['freegantt.calendar'],
    data(ctx) {
      /* fields, the edit hook, the store — DOM-free, runs as the Dataset constructs */
    },
    view(ctx) {
      /* variants, renderers, commands, keys — runs as a Gantt mounts */
    },
  });

const dataset = new Dataset({ entries, plugins: [scheduling()] });
const gantt = new Gantt({ dataset }); // its Fields, variants, bars and menu are already there
```

**The install site is where the state lives.** A plugin with a `data` half installs on the `Dataset`, because a Field must exist before the first Rollup (D-S5-4). Every `Gantt` bound to that Dataset then runs the `view` half once, each with its own context. Two Gantts on one page still share nothing, so I2 holds: one `view(ctx)` call is one Gantt's worth of state, the same way one factory call is today.

A chrome-only plugin — `weekendShading()` — has no `data` half and keeps installing on the `Gantt`. `gantt.plugins` stays live-reconfigurable. `dataset.plugins` stays read-only, for the reason it already is.

`requires` moves onto the one type and covers both halves.

**No new type parameter on the `Dataset` constructor.** Refuted item 3 stands: TypeScript stops inferring later type parameters once an earlier one is written, so a plugin generic there breaks `new Dataset<TaskProps>({ plugins: [...] })`. Module augmentation stays the route for a plugin's Field keys.

## Consequences

`GanttPlugin` and `DatasetPlugin` retire into one `Plugin`. `PluginContextOf` and `DatasetPluginContextOf` become the two halves' context types, and each keeps the members it has.

A plugin author reads one table row, not two. `docs/06-plugin-authoring.md` loses its "Two contracts, two hosts" section.

**The failure mode has a name.** A plugin with a `data` half, installed on a `Gantt`, has arrived too late to declare a Field. It fails loudly and says where to install it: `PluginSetupError.wrongInstallSite(id)`, whose message names the Dataset and shows the call (`Q4`).

**A silent partial install is refused, so the open question is narrower than it looks.** Installing the `view` half alone gives an author a Gantt that paints variants for a Field that was never declared, and every `entry.read(key)` answers `undefined`. That is the failure this ADR exists to remove. So the answer is a throw; what is open is only which error and what it says. `PluginSetupError` (`model/`, raised at `extensions/install-dataset-plugins.ts:124`) already names a plugin id and already unwinds the plugins installed before it, so it is the candidate with no new type behind it.

### The compiler refuses it first

**A throw at mount is the second line of defence, not the first.** `definePlugin` sees both halves at the call, so the type knows which install sites a plugin has. An illegal combination stays unrepresentable — the same rule that keeps a shared `scale` off a `Gantt` that names `preset` (`plans/02`, `CLAUDE.md`).

```ts
interface ChromePlugin { id: PluginId; requires?: readonly PluginId[]; view(ctx): Disposer | void; data?: never }
interface DataPlugin   { id: PluginId; requires?: readonly PluginId[]; data(ctx): Disposer | void; view?(ctx): Disposer | void }
type Plugin = ChromePlugin | DataPlugin;

GanttOptions.plugins:   readonly ChromePlugin[];   // a `data` half does not typecheck here
DatasetOptions.plugins: readonly Plugin[];         // both halves install here
```

`definePlugin` keeps the narrower type at the call site through two overloads, so `new Gantt({ plugins: [scheduling()] })` is a red squiggle in the editor and never a runtime discovery. **`PluginSetupError` stays**, for the caller the compiler never met: plain JavaScript, a plugin list built at runtime, a `Plugin` widened by a helper. A library refuses in both languages it is read in.

### What shipped, where it differs from the sketch above

The three declarations are real, with two differences a reader should not have to discover:

- A plugin shape takes the `view` half's **context** as its type argument, not the `Gantt` and
  `Dataset` pair — `ChromePluginOf<TViewContext>`, `DataPluginOf<TViewContext, TDataset>`. That is
  what keeps `api/plugin.ts` importable from `api/dataset.ts`: naming the context's own file would
  pull `view/` in, and `view/` reaches back to `api/dataset.ts` (`J43`, `J44`).
- `DatasetOptions.plugins` is `readonly PluginOf<unknown, Dataset<TProps>>[]`. A Dataset never calls
  a `view` half, so it needs no Gantt type to hold one, and `api/dataset.ts` may not name `Gantt`
  (`J45`). The fully bound `Plugin<TProps>`, `ChromePlugin<TProps>` and `DataPlugin<TProps>` are
  published from `api/gantt.ts`, the one file that sees both classes, and assign here unchanged.

One consequence the sketch did not state: a Gantt sorts the Dataset's own plugins together with its
own chrome under one `requires` graph, so a chrome plugin may require a plugin whose only half is
`data` (`J47`). `gantt.plugins` still reports this Gantt's own chrome alone.

## The hazard this ADR inherits

**A plugin may install over values it did not write.** Install a plugin on a `Dataset` whose `props` already carries that plugin's key, and the plugin declares the key over values with no recorded writer. Nothing says who wrote them, and nothing repairs them.

This was [#192](https://github.com/Pawel-IT/FreeGantt/issues/192)'s hazard at one level down. The issue is **closed**: its `fromJSON` half died with [ADR 0016](0016-the-library-holds-no-save-format.md), which deleted the save format. The live-install half did not die, and [ADR 0016](0016-the-library-holds-no-save-format.md)'s own dependency table assigned it to a draft the author later withdrew ([the gap at 0014](README.md#the-gap-at-0014)). **It has had no owner since 2026-09-11. This ADR takes it**, because install is what this ADR decides.

Two facts bound it, and both already hold:

- **The library never writes an undeclared key** ([ADR 0011](0011-consumer-values-live-in-props.md)). An undeclared key is carried at ingest and never named at `update()`, so the values in question are always the consumer's own.
- **A duplicate *declaration* is already refused** by the registry. What is unrefused is a *value* the consumer wrote before the plugin existed.

**This ADR does not decide the repair**, and it does not gate its build on one. A prefix is a convention a plugin follows (`scheduling:progress`, [ADR 0008](0008-progress-is-scheduling-not-core.md)), and a convention narrows this hazard without closing it. Naming the owner is the point: the next reader of `definePlugin` finds the hazard here rather than in a deleted file.
