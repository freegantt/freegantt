---
status: proposed — draft, not decision. Opened 2026-09-11, out of a design session on the plugin variant surface. The working material is in `plans/row-redesign/`.
decided: a chrome-only plugin — one with no `data` half — keeps its own install site on the `Gantt`, and `gantt.plugins` stays live-reconfigurable (2026-09-11). Every plugin with a `data` half installs on the `Dataset`.
open: what happens when a plugin with a `data` half is handed to a `Gantt` — a throw, or a silent install of the `view` half alone.
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
const scheduling = definePlugin({
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

**The failure mode needs a name.** A plugin with a `data` half, installed on a `Gantt`, has arrived too late to declare a Field. It must fail loudly and say where to install it. That is the open question in the frontmatter.
