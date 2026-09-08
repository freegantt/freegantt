# Plugin authoring guide

A plugin adds behavior to FreeGantt without a fork. This guide shows the two
plugin contracts, how to install each one, every registration seam a plugin
can use, and the errors an author meets.

Every claim below names the test that proves it. If a claim in an earlier
draft had no test, this guide drops the claim instead of stating it as fact.

## Two contracts, two hosts

FreeGantt has two plugin contracts. Pick the one that matches where your
behavior lives.

| Contract | Installs on | Context type | DOM access | Install site |
| --- | --- | --- | --- | --- |
| `GanttPlugin` | `Gantt` | `PluginContextOf` | Yes | `new Gantt({ plugins: [...] })` or `gantt.plugins = [...]` |
| `DatasetPlugin` | `Dataset` | `DatasetPluginContextOf` | No | `new Dataset({ plugins: [...] })` only |

A `GanttPlugin` sees rendering, interaction, and commands. A `DatasetPlugin`
sees fields, edits, and events, and never touches `document` or `window` —
the same DOM-free rule `data/` itself follows.

## The smallest working `GanttPlugin`

`harness/plugins/weekend-shading.ts` is a real, shipped example. It paints a
decoration under every bar for Saturday and Sunday, and registers nothing
else:

```ts
import type { GanttPlugin } from 'freegantt';

function weekendShading(): GanttPlugin {
  return {
    id: 'demo.weekendShading',
    setup(ctx) {
      ctx.view.registerDecoration('underBars', ({ span, time }) => {
        const bands = [];
        for (const day of time.eachDay(span)) {
          if (time.dayOfWeek(day) === 6 || time.dayOfWeek(day) === 7) {
            bands.push({ kind: 'rangeBand' as const, start: day, end: time.addDays(day, 1) });
          }
        }
        return bands;
      });
    },
  };
}

export { weekendShading };
```

The plugin returns nothing from `setup`. It does not need a `Disposer`,
because `ctx.disposables` already retracts the `registerDecoration` call when
the plugin is removed (review P4; `src/extensions/plugin-runtime.test.ts`,
"installs disposes plugin setup returns nothing").

## The smallest working `DatasetPlugin`

A `DatasetPlugin` declares a field and reads it back through the dataset's
own field system — no new API, the same path a core field takes:

```ts
import type { DatasetPlugin } from 'freegantt';

function ownerField(): DatasetPlugin {
  return {
    id: 'demo.ownerField',
    setup(ctx) {
      ctx.fields.register({ key: 'owner', type: 'text', editable: true });
    },
  };
}

export { ownerField };
```

`ctx.fields.register` runs once, while `setup` is on the stack. After that,
the field is a normal field: `dataset.entries.update(id, { owner: 'Ada' })`
reads and writes it like any other.

## Installing a plugin

### At construction

Both contracts take a `plugins` array in their constructor options:

```ts
import type { DatasetPlugin, GanttPlugin } from 'freegantt';
import { Dataset, Gantt } from 'freegantt';

declare function ownerField(): DatasetPlugin;
declare function weekendShading(): GanttPlugin;

const dataset = new Dataset({ entries: [], plugins: [ownerField()] });
const gantt = new Gantt({ container: '#app', dataset, plugins: [weekendShading()] });

export { gantt };
```

`ownerField()` and `weekendShading()` are the two factories written above.

### Live, on a `Gantt` only

`gantt.plugins` is a live, reconfigurable property. Assign a new array and
FreeGantt diffs it by `id`: a plugin already installed under the same `id`
is left running, a new `id` is set up, and a missing `id` is disposed
(`src/extensions/plugin-runtime.test.ts`, "runs setup once per plugin, in
list order" and "assigning list same ids sets nothing up again").

```ts
import type { Gantt, GanttPlugin } from 'freegantt';

declare const gantt: Gantt;
declare function weekendShading(): GanttPlugin;

gantt.plugins = [...gantt.plugins, weekendShading()];
```

`dataset.plugins` has no setter. A `DatasetPlugin` installs once, at
construction, and never again. A field must exist before a rollup can use
it, so there is no safe later point to add one.

## Why a factory, not a name-keyed table (D-S5-2)

`weekendShading()` and `ownerField()` are functions that return a plugin
object. FreeGantt has no registry that looks a plugin up by a string name.
A factory carries its own configuration as ordinary function arguments and
closure state, so two installations of the same plugin with different
settings need no second, parallel config path — the arguments already are
the config. A name-keyed table would need one anyway, plus a place to keep
names unique.

## Every registration seam

All of these calls are legal only inside a plugin's own `setup()`. Each row
names the seam, the key it registers under, and what happens when two
plugins claim the same key.

| Seam | Key | Two claims on the same key | Test |
| --- | --- | --- | --- |
| `commands.register(command)` | `command.id` | Newest wins; falls back to the older one on dispose | `src/extensions/commands.test.ts` |
| `interaction.registerKeybinding(binding)` | `binding.chord` | Newest-first resolution; falls back on dispose | `src/extensions/keymap.test.ts` |
| `interaction.registerKindDefaults(kind, defaults)` | `EntryKind` | Last registration wins; falls back on dispose | `src/view/plugin-registrations.test.ts` (#154) |
| `layout.registerItemProducer(kind, producer)` | `EntryKind` | Last registration wins; falls back to the built-in span producer | `src/layout/items/produce-items.test.ts`, "disposing the first of two registrations on one kind leaves the second producing" |
| `view.registerRenderer(point, renderer)` | `RendererPoint` (`'bar'` \| `'cell'` \| `'header'` \| `'tooltip'`, optionally keyed by kind) | Exclusive — the second claim throws `RendererAlreadyRegisteredError` | `src/view/renderer-registry.test.ts`, "register: second plugin claiming whole bar point throws, naming both plugin ids" |
| `view.registerDecoration(layer, provider)` | `DecorationLayer` (`'underBars'` \| `'overBars'`) | Additive — every registered provider paints, in registration order | `src/view/plugin-registrations.test.ts` |
| `view.registerGridColumn(column)` | none | Additive — an ordered, appendable list | `src/view/plugin-registrations.test.ts` |
| `fields.register(field)` | `field.key` | Exclusive — throws `DuplicateFieldKeyError` | `src/data/fields/field-registry.ts` |
| `fields.registerType(name, type)` | type name | Exclusive — throws `DuplicateFieldKeyError` | `src/data/fields/field-registry.ts` |
| `fields.registerAggregator(name, fn)` | aggregator name | Exclusive — throws `DuplicateFieldKeyError` | `src/data/fields/field-registry.ts` |
| `store.reserve<T>()` | the calling plugin's own `id` | Idempotent — the same plugin gets the same store back on repeat calls | `src/extensions/plugin-runtime.test.ts` |

`store.read<T>(pluginId)` is not a registration. It gives one plugin
read-only access (`get`/`all`, no `set`/`remove`) to a store another plugin
reserved, or `undefined` if that plugin never reserved one.

## The registration gate (D-S5-4)

Every `register*` and `fields.register*` call is legal only while that
plugin's own `setup()` is running. The moment `setup()` returns, the gate
closes for that plugin (`src/extensions/plugin-ports.test.ts` names this
"buildPluginPorts — D-S5-4 gate"; `src/extensions/install-dataset-plugins.ts`
carries the matching "closes the gate the moment setup returns" test for
`DatasetPlugin`).

Calling a gated method after `setup()` has returned throws
`RegistrationClosedError`:

```ts
import type { GanttPlugin } from 'freegantt';

function lateRegistration(): GanttPlugin {
  return {
    id: 'demo.lateRegistration',
    setup(ctx) {
      setTimeout(() => {
        // Throws RegistrationClosedError: setup() already returned.
        ctx.commands.register({ id: 'demo.tooLate', label: 'Too late', run() {} });
      }, 0);
    },
  };
}

export { lateRegistration };
```

Some parts of the context stay open after `setup()` returns, because they
are not registrations — `interaction.canWrite`, for example, is a plain
read and keeps working (`src/view/plugin-ports.test.ts`, "leaves ungated
parts open after setup returns").

## Disposal

`ctx.disposables` is a `DisposableStore`. Every gated registration a plugin
makes is added to it automatically, so removing the plugin retracts every
registration with no extra code from the plugin author
(`src/view/plugin-ports.test.ts`, "`disposables.disposeAll()` frees every
gated registration, uninstall needs no plugin help").

A plugin's own `setup()` return value — a `Disposer` — is for a resource
the plugin owns itself: a timer, a socket, a subscription outside
FreeGantt. Most plugins return nothing, as `weekendShading()` above does.
When a plugin does return a `Disposer`, it runs after `ctx.disposables`
has already retracted every registration
(`src/extensions/plugin-runtime.test.ts`, "disposes plugin's own
ctx.disposables ahead returned Disposer").

Two `Gantt` instances never share a registration: disposing a plugin on one
leaves the other's registrations untouched
(`src/view/plugin-ports.test.ts`, "two Gantts share nothing: one plugin's
disposal leaves other's registrations (I2)").

## `requires` and setup order

A `DatasetPlugin` may declare `requires: readonly PluginId[]` — the ids of
plugins that must finish `setup()` first:

```ts
import type { DatasetPlugin } from 'freegantt';

function lockAwareReport(): DatasetPlugin {
  return {
    id: 'demo.lockAwareReport',
    requires: ['demo.lockEntries'],
    setup(ctx) {
      const locks = ctx.store.read<{ isLocked: boolean }>('demo.lockEntries');
      ctx.events.on('beforeChange', ({ changeSet }) => {
        const touchesLockedEntry = changeSet.updated.some(
          (row) => row.store === 'entries' && locks?.get(row.id)?.isLocked,
        );
        return touchesLockedEntry ? false : undefined;
      });
    },
  };
}

export { lockAwareReport };
```

Setup order follows `requires`, not array position — a required plugin runs
first no matter where the array places it
(`src/extensions/install-dataset-plugins.test.ts`, "sets up required plugin
first, whichever order array writes"). A chain of requirements resolves
transitively (`"resolves chain requirements before dependents"`).

Two errors come from a bad `requires` list:

- A required plugin that is not in the array at all throws
  `MissingPluginError`, naming both the plugin and the missing requirement
  (`"throws MissingPluginError naming both ids prerequisite absent"`).
- A requirement cycle throws `PluginRequirementCycleError`, naming every
  plugin in the cycle (`"throws PluginRequirementCycleError naming plugin
  in cycle"`).

`GanttPlugin` has no `requires` field. Order there follows the `plugins`
array as written.

## Errors an author will meet

| Error | Code | Thrown when | Test |
| --- | --- | --- | --- |
| `DuplicatePluginIdError` | `'duplicate-plugin-id'` | Two plugins in one install share an `id` | `src/extensions/plugin-runtime.test.ts`, "a duplicate id throws DuplicatePluginIdError" |
| `MissingPluginError` | `'missing-plugin'` | A `DatasetPlugin`'s `requires` names an `id` not present in the install list | `src/extensions/install-dataset-plugins.test.ts` |
| `PluginRequirementCycleError` | `'plugin-requirement-cycle'` | Two or more `DatasetPlugin`s require each other in a cycle | `src/extensions/install-dataset-plugins.test.ts` |
| `RegistrationClosedError` | `'registration-closed'` | A gated method is called after that plugin's `setup()` has returned | `src/view/plugin-ports.test.ts` |
| `PluginSetupError` | `'plugin-setup-failed'` | A plugin's `setup()` throws; wraps the original cause | `src/extensions/plugin-runtime.test.ts`, "a setup() throw unwinds already-set-up plugins batch, in reverse, rethrows PluginSetupError" |
| `RendererAlreadyRegisteredError` | `'renderer-already-registered'` | Two plugins claim the same `RendererPoint` slot | `src/view/renderer-registry.test.ts` |
| `PluginNotInstalledError` | `'plugin-not-installed'` | `gantt.uninstallPlugin(id)` is called with an `id` that is not installed | `etc/freegantt.api.md` (constructor signature; see `gantt.uninstallPlugin`) |

A `setup()` throw during a batch install unwinds only that batch, in
reverse order, and leaves the plugins that were already installed before
the batch started untouched (`src/extensions/plugin-runtime.test.ts`, "a
same-batch setup() throw leaves dropped plugin installed undisposed, not
primed for double dispose (C1)").

## Where to go next

- `CONTEXT.md` — the glossary entries for `GanttPlugin`, `DatasetPlugin`,
  `PluginContext`, and `PluginStore`.
- `plans/02` — the full public API surface these types come from.
- `harness/plugins.html` — every plugin in this guide, running.
