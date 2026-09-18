# Plugin authoring guide

A plugin adds behavior to FreeGantt without a fork. This guide shows the one
plugin type and its two halves, where each half installs, every registration
seam a plugin can use, and the errors an author meets.

The Docusaurus site serves this page itself, so one rendering exists and not
two. All four ADRs are accepted, so it describes one shipped surface and not a
draft of one. This guide describes HEAD, and its fenced examples typecheck
against HEAD.

Every claim below names the test that proves it. If a claim in an earlier
draft had no test, this guide drops the claim instead of stating it as fact.

## One plugin, two halves

A plugin is one object. It names an `id`, and it fills one or both halves.

| Half | What it sees | Context type | DOM access | Runs |
| --- | --- | --- | --- | --- |
| `data(ctx)` | fields, edits, events, its own store | `DatasetPluginContextOf` | No | once, as the `Dataset` constructs |
| `view(ctx)` | rendering, interaction, commands | `PluginContextOf` | Yes | once per `Gantt`, as that Gantt mounts |

**The install site is where the state lives.** A plugin with a `data` half
installs on the `Dataset`, because a field must exist before the first rollup.
Every `Gantt` bound to that Dataset then runs the `view` half once, each with
its own context. A chrome-only plugin — no `data` half — installs on the
`Gantt`, and `gantt.plugins` reconfigures it live.

A `data` half never touches `document` or `window` — the same DOM-free rule
`data/` itself follows.

`definePlugin` reads which halves an object fills and narrows to that arm. So a
plugin with a `data` half does not typecheck into `GanttOptions.plugins`
(`src/api/define-plugin.test.ts`, "does not typecheck").

## The smallest working chrome plugin

`harness/plugins/over-budget-rows.ts` is a real, shipped example. It stripes
every row whose `cost` field reads above a threshold, and registers nothing
else:

```ts
import { definePlugin } from 'freegantt';

function overBudgetRows(threshold: number) {
  return definePlugin({
    id: 'demo.overBudgetRows',
    view(ctx) {
      ctx.view.registerDecoration('underBars', ({ rows }) =>
        rows
          .filter((row) => {
            const entryId = row.entryIds[0];
            if (entryId === undefined) return false;
            const cost = ctx.dataset.entries.get(entryId)?.read('cost');
            return typeof cost === 'number' && cost > threshold;
          })
          .map((row) => ({ kind: 'rowStripe' as const, rowId: row.id })),
      );
    },
  });
}

export { overBudgetRows };
```

The plugin returns nothing from `view`. It does not need a `Disposer`,
because `ctx.disposables` already retracts the `registerDecoration` call when
the plugin is removed (review P4; `src/extensions/plugin-runtime.test.ts`,
"installs disposes plugin setup returns nothing").

Wrap `definePlugin` in a factory, as above. One factory call is one install's
worth of state, so two Gantts on one page share none of it.

### Give every band a Part, and theme it with a Token

A decoration paints a bare rectangle. Put a class on it, and CSS can reach it.
The shipped `timeShading()` plugin is the example to copy: every band it writes
carries the Part `.fg-time-shading`, and that Part's background reads the Token
`--fg-time-shading-fill`, so the plugin looks right with no page CSS at all.

```ts
import { timeShading, daysOfWeek, type Gantt } from 'freegantt';

declare const gantt: Gantt;

gantt.installPlugin(timeShading([{ covers: daysOfWeek(6, 7), class: 'weekend' }]));
```

```css
/* Level 1: retheme every band, no selector needed. */
:root { --fg-time-shading-fill: rgb(0 0 0 / 0.08); }

/* Level 2: a rule's own `class` rides beside the Part, so two rules differ. */
.fg-time-shading.weekend { background: rgb(180 40 40 / 0.06); }
```

Write the Part yourself for your own plugin, the same way: one stable class on
every band, plus whatever the caller asked for. A consumer then themes your
plugin with a Token and never has to know your selector.

## The smallest working `data` half

A `data` half declares a field and reads it back through the dataset's own
field system — no new API, the same path a core field takes:

```ts
import { definePlugin } from 'freegantt';

function ownerField() {
  return definePlugin({
    id: 'demo.ownerField',
    data(ctx) {
      ctx.fields.register({ key: 'owner', type: 'text', editable: true });
    },
  });
}

export { ownerField };
```

`ctx.fields.register` runs once, while `data` is on the stack. After that,
the field is a normal field: `dataset.entries.update(id, { owner: 'Ada' })`
reads and writes it like any other.

## Installing a plugin

### At construction

Both install sites take a `plugins` array in their constructor options:

```ts
import type { ChromePlugin, DataPlugin } from 'freegantt';
import { Dataset, Gantt } from 'freegantt';

declare function ownerField(): DataPlugin;
declare function overBudgetRows(threshold: number): ChromePlugin;

const dataset = new Dataset({ entries: [], plugins: [ownerField()] });
const gantt = new Gantt({ container: '#app', dataset, plugins: [overBudgetRows(10000)] });

export { gantt };
```

`ownerField()` and `overBudgetRows()` are the two factories written above.

### Live, on a `Gantt` only

`gantt.plugins` is a live, reconfigurable property. Assign a new array and
FreeGantt diffs it by `id`, then by object identity: a new `id` is set up, a
missing `id` is disposed, the same object is left running, and a *fresh*
object under an installed `id` replaces that occupant. The last rule is what
makes one assignment reconfigure a plugin — `gantt.plugins =
[timeShading(next)]` paints the new rules (`src/extensions/plugin-runtime.test.ts`,
"runs setup once per plugin, in list order", "assigning the same object again
sets nothing up again" and "a fresh instance under an installed id replaces
it").

```ts
import type { ChromePlugin, Gantt } from 'freegantt';

declare const gantt: Gantt;
declare function overBudgetRows(threshold: number): ChromePlugin;

gantt.plugins = [...gantt.plugins, overBudgetRows(10000)];
```

`dataset.plugins` has no setter. A plugin with a `data` half installs once, at
construction, and never again. A field must exist before a rollup can use it,
so there is no safe later point to add one.

A plugin with a `data` half handed to a `Gantt` raises `PluginSetupError`, and
the message names the Dataset as the site to use instead
(`src/api/define-plugin.test.ts`, "the message says where to install it").

## Why a factory, not a name-keyed table (D-S5-2)

`overBudgetRows()` and `ownerField()` are functions that return a plugin
object. FreeGantt has no registry that looks a plugin up by a string name.
A factory carries its own configuration as ordinary function arguments and
closure state, so two installations of the same plugin with different
settings need no second, parallel config path — the arguments already are
the config. A name-keyed table would need one anyway, plus a place to keep
names unique.

## Every registration seam

All of these calls are legal only inside a plugin's own half. Each row
names the seam, the key it registers under, and what happens when two
plugins claim the same key.

| Seam | Key | Two claims on the same key | Test |
| --- | --- | --- | --- |
| `commands.register(command)` | `command.id` | Newest wins; falls back to the older one on dispose | `src/extensions/commands.test.ts` |
| `interaction.registerKeybinding(binding)` | `binding.chord` | Newest-first resolution; falls back on dispose | `src/extensions/keymap.test.ts` |
| `variants.add(variant)` | `variant.name` | Newest registration wins, and the older one answers again on dispose (ADR 0018) | `src/layout/bars/variants.test.ts`, "lets the newest of two plugin rules win, and disposing it restores the older one" |
| `view.registerRenderer(point, renderer)` | `RendererPoint` (`'bar'` \| `'cell'` \| `'header'` \| `'tooltip'`) | Exclusive — the second claim throws `RendererAlreadyRegisteredError` | `src/view/renderer-registry.test.ts`, "register: a second plugin claiming the whole bar point throws, naming both plugin ids" |
| `view.registerDecoration(layer, provider)` | `DecorationLayer` (`'underBars'` \| `'overBars'`) | Additive — every registered provider paints, in registration order | `src/view/plugin-registrations.test.ts` |
| `view.registerGridColumn(column)` | none | Additive — an ordered, appendable list | `src/view/plugin-registrations.test.ts` |
| `fields.register(field)` | `field.key` | Exclusive — throws `DuplicateFieldKeyError` | `src/data/fields/field-registry.ts` |
| `fields.registerType(name, type)` | type name | Exclusive — throws `DuplicateFieldKeyError` | `src/data/fields/field-registry.ts` |
| `fields.registerAggregator(name, fn)` | aggregator name | Exclusive — throws `DuplicateFieldKeyError` | `src/data/fields/field-registry.ts` |
| `store.reserve<T>()` | the calling plugin's own `id` | Idempotent — the same plugin gets the same store back on repeat calls | `src/extensions/plugin-runtime.test.ts` |
| `hierarchy.setSource(wrap)` | the one hierarchy seam | Composes — the second source receives the first and may call it (ADR 0020) | `src/api/hierarchy-source.test.ts`, "two sources compose: the second receives the first and may call it" |
| `edits.setExtender(wrap)` | the one edit hook | Composes — the second extender receives the first and may call it (D-S5-23) | `src/data/edit-extension.test.ts` |

`store.read<T>(pluginId)` is not a registration. It gives one plugin
read-only access (`get`/`all`, no `set`/`remove`) to a store another plugin
reserved, or `undefined` if that plugin never reserved one.

## The registration gate (D-S5-4)

Every `register*` and `fields.register*` call is legal only while that
plugin's own half is running. The moment that half returns, the gate closes for
that plugin (`src/view/plugin-ports.test.ts` names this
"buildPluginPorts — D-S5-4 gate"; `src/extensions/install-dataset-plugins.ts`
carries the matching "closes the gate the moment setup returns" test for the
`data` half).

Calling a gated method after that half has returned throws
`RegistrationClosedError`:

```ts
import { definePlugin } from 'freegantt';

function lateRegistration() {
  return definePlugin({
    id: 'demo.lateRegistration',
    view(ctx) {
      setTimeout(() => {
        // Throws RegistrationClosedError: view() already returned.
        ctx.commands.register({ id: 'demo.tooLate', label: 'Too late', run() {} });
      }, 0);
    },
  });
}

export { lateRegistration };
```

Some parts of the context stay open after that half returns, because they
are not registrations — `interaction.canWrite`, for example, is a plain
read and keeps working (`src/view/plugin-ports.test.ts`, "leaves ungated
parts open after setup returns").

## Disposal

`ctx.disposables` is a `DisposableStore`. Every gated registration a plugin
makes is added to it automatically, so removing the plugin retracts every
registration with no extra code from the plugin author
(`src/view/plugin-ports.test.ts`, "`disposables.disposeAll()` frees every
gated registration, uninstall needs no plugin help").

A half's own return value — a `Disposer` — is for a resource
the plugin owns itself: a timer, a socket, a subscription outside
FreeGantt. Most plugins return nothing, as `overBudgetRows()` above does.
When a plugin does return a `Disposer`, it runs after `ctx.disposables`
has already retracted every registration
(`src/extensions/plugin-runtime.test.ts`, "disposes plugin's own
ctx.disposables ahead returned Disposer").

Two `Gantt` instances never share a registration: disposing a plugin on one
leaves the other's registrations untouched
(`src/view/plugin-ports.test.ts`, "two Gantts share nothing: one plugin's
disposal leaves other's registrations (I2)").

## `requires` and setup order

A plugin may declare `requires: readonly PluginId[]` — the ids of plugins that
must finish setting up first. One list covers both halves:

```ts
import { definePlugin } from 'freegantt';

function lockAwareReport() {
  return definePlugin({
    id: 'demo.lockAwareReport',
    requires: ['demo.lockEntries'],
    data(ctx) {
      const locks = ctx.store.read<{ isLocked: boolean }>('demo.lockEntries');
      ctx.events.on('beforeChange', ({ changeSet }) => {
        const touchesLockedEntry = changeSet.updated.some(
          (row) => row.store === 'entries' && locks?.get(row.id)?.isLocked,
        );
        return touchesLockedEntry ? false : undefined;
      });
    },
  });
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

A `Gantt` sorts the Dataset's own plugins together with its own chrome, under
that one `requires` graph (`src/api/define-plugin.test.ts`, "lets a chrome
plugin require a plugin whose only half is data").

## Errors an author will meet

| Error | Code | Thrown when | Test |
| --- | --- | --- | --- |
| `DuplicatePluginIdError` | `'duplicate-plugin-id'` | Two plugins in one install share an `id` | `src/extensions/plugin-runtime.test.ts`, "a duplicate id throws DuplicatePluginIdError" |
| `MissingPluginError` | `'missing-plugin'` | A plugin's `requires` names an `id` not present in the install list | `src/extensions/plugin-order.test.ts` |
| `PluginRequirementCycleError` | `'plugin-requirement-cycle'` | Two or more plugins require each other in a cycle | `src/extensions/plugin-order.test.ts` |
| `RegistrationClosedError` | `'registration-closed'` | A gated method is called after that plugin's half has returned | `src/view/plugin-ports.test.ts` |
| `PluginSetupError` | `'plugin-setup-failed'` | A plugin's half throws, or a plugin with a `data` half reaches a `Gantt` | `src/api/define-plugin.test.ts`, "the message says where to install it" |
| `RendererAlreadyRegisteredError` | `'renderer-already-registered'` | Two plugins claim the same `RendererPoint` slot | `src/view/renderer-registry.test.ts` |
| `PluginNotInstalledError` | `'plugin-not-installed'` | `gantt.uninstallPlugin(id)` is called with an `id` that is not installed | `etc/freegantt.api.md` (constructor signature; see `gantt.uninstallPlugin`) |

A throw during a batch install unwinds only that batch, in
reverse order, and leaves the plugins that were already installed before
the batch started untouched (`src/extensions/plugin-runtime.test.ts`, "a
same-batch view() throw leaves dropped plugin installed undisposed, not
primed for double dispose (C1)").

## Where to go next

- `CONTEXT.md` — the glossary entries for `Plugin`, `PluginContext`, and
  `PluginStore`.
- `plans/02` — the full public API surface these types come from.
- `harness/plugins.html` — every plugin in this guide, running.
