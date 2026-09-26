# Plugin authoring guide

A plugin adds behavior to FreeGantt without a fork. This guide shows the one
plugin type and its two halves, where each half installs, every registration
seam a plugin can use, and the errors an author meets.

The Docusaurus site serves this page itself, so one rendering exists and not
two. This guide describes the current shipped surface, and its fenced examples typecheck
against HEAD.

Every claim below names the test that proves it. If a claim in an earlier
draft had no test, this guide drops the claim instead of stating it as fact.

## One plugin, two halves

A plugin is one object. It names an `id`, and it fills one or both halves.

| Half | What it sees | Context type | DOM access | Runs |
| --- | --- | --- | --- | --- |
| `data(ctx)` | fields, edits, events, its own store | `DatasetPluginContextOf` | No | once, on the finished Dataset |
| `view(ctx)` | rendering, interaction, commands | `PluginContextOf` | Yes | once per `Gantt`, once that Gantt is built, before its first frame |

**The install site is where the state lives.** A `data` half declares what
shapes the Dataset's own construction, and a Dataset installs its plugins
once, so a plugin with a `data` half installs on the `Dataset`.
Every `Gantt` bound to that Dataset then runs the `view` half once, each with
its own context. A chrome-only plugin — no `data` half — installs on the
`Gantt`, and `gantt.plugins` reconfigures it live.

A `data` half never touches `document` or `window` — the same DOM-free rule
`data/` itself follows.

`definePlugin` reads which halves an object fills and narrows to that arm. So a
plugin with a `data` half does not typecheck into `GanttOptions.plugins`.

### Reading the Gantt from `view()`

`view(ctx)` runs once its Gantt is built, before that Gantt's first frame — so
`ctx.gantt` is readable straight away: every option the constructor applied
(selection, zoom presets, theme, `a11yLabel`) already answers real state.

- A DOM or painted-bar question has no answer yet — `ctx.view.dom.barFor(id)`
  answers `undefined` inside `view()`. Read the DOM from a handler, never from
  the body of `view()`.
- A `view()`-time write to `ctx.gantt` (for example, `ctx.gantt.selectedEntryIds
  = [...]`) is silent: it fires no event, and no other plugin's handler hears
  it, because construction has not finished. The same write from a later
  `installPlugin` call fires normally.
- Seed data in `data()`, not in `view()`. A Dataset write inside `view()` is
  not a Gantt event — it fires the Dataset's own `change` and becomes an
  undo step, and the Gantt must never clear a shared Dataset's History on its
  own construction.
- `ctx.gantt.plugins` reads `[]` during `view()`, at construction and on a
  later `installPlugin` alike — the install commits only once every plugin's
  `view()` has returned.

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
the plugin is removed.

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

A plugin declares a field on itself, the same shape `Dataset`'s own `fields`
option takes — no new API, the same path a core field takes:

```ts
import { definePlugin } from 'freegantt';

function ownerField() {
  return definePlugin({
    id: 'demo.ownerField',
    fields: [{ key: 'owner', type: 'text', editable: true }],
  });
}

export { ownerField };
```

Every plugin's `fields` list is registered before any entry is read, so a
flat `owner: 'Ada'` value on a construction entry lands the same way
`entries.load()` already reads it. After that, the field is a normal field:
`dataset.entries.update(id, { owner: 'Ada' })` reads and writes it like any
other.

## Write your own Field

A plugin's type argument names its own keys, not the consumer's. Pass it to
read and write those keys off `ctx.dataset` with no cast, and to catch a
`fields` typo at compile time:

```ts
import { Dataset, definePlugin } from 'freegantt';
import type { DataPlugin } from 'freegantt';

export interface LockProps {
  locked?: boolean;
}

function locks(): DataPlugin<LockProps> & { lock(id: string): void } {
  let dataset: Dataset<LockProps> | undefined;
  return {
    ...definePlugin<LockProps>({
      id: 'demo.locks',
      fields: [{ key: 'locked', type: 'boolean', editable: 'api' }],
      data(ctx) {
        dataset = ctx.dataset;
      },
    }),
    lock(id) {
      dataset?.entries.update(id, { locked: true });
    },
  };
}

export { locks };
```

`fields: [{ key: 'lockd' }]` — a typo — fails to compile: `LockProps` names
`locked`, not `lockd`. `dataset?.entries.update(id, { locked: true })`
compiles with no cast, because `dataset` is typed `Dataset<LockProps>`.

A consumer installs `locks()` on any Dataset, typed with its own props or
none: `new Dataset({ entries, plugins: [locks()] })`. That Dataset sees
`locked` as `unknown` on its own `entries.get(id)?.read('locked')` — for a
typed read, the consumer writes its own props to include it:
`new Dataset<TaskProps & LockProps>({ … })`.

A chrome plugin cannot declare a Field (`fields?: never`) — its type argument
names the keys its `view()` half reads and writes instead, and the page that
installs it declares those keys itself. `entries.update()` refuses an
undeclared one with `UnknownFieldError`, at the same door it refuses one from
any other caller.

## Hierarchy source

A plugin that owns the tree declares `hierarchySource` on itself, the same
way it declares `fields` (ADR 0031):

```ts
import { definePlugin } from 'freegantt';

interface PhaseProps {
  phaseId?: string;
}

function phases() {
  return definePlugin<PhaseProps>({
    id: 'demo.phases',
    fields: [{ key: 'phaseId' }],
    hierarchySource: (next) => (entry) => entry.props.phaseId ?? next(entry),
  });
}

export { phases };
```

Read aloud: "its hierarchy source is the entry's phase id, or the next
source's answer." `next` is the source composed so far — core's own
`(entry) => entry.parentId` for the first plugin to declare one, or the
plugin declared just before it in setup order. `Dataset` folds every
declared source before the construction Rollup runs, so the Rollup always
walks the finished tree.

`entry` is a `StoredEntry`, not the live `Entry` — `parent()`, `children()`,
`depth` and `descendants()` are all built from this function, so a source
that read one of those would ask the question it exists to answer.

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

## Edit extender

A `data` half can cascade one edit into more writes — a `Field` a document
computes for itself, a scheduling plugin that shifts a dependent's dates when
its predecessor moves. `ctx.edits.setExtender` claims the one hook every
proposed edit passes through before it commits. `docs/edit-extension-flow.md`
walks the whole mechanism; this section covers the two seams a plugin author
reaches through `ctx.edits` — the extender, and the per-entry lock rule.

```ts
import { definePlugin, mergeEntryEdits } from 'freegantt';
import type { EditExtender } from 'freegantt';

const cascadeStartDate: EditExtender = ({ entries, proposed }) => {
  const extraEdits = new Map();
  for (const [id, edit] of proposed) {
    if (edit.start === undefined) continue;
    const dependent = [...entries.values()].find((e) => e.parentId === id);
    if (dependent) extraEdits.set(dependent.id, { start: edit.start });
  }
  return extraEdits;
};

function cascadesStart() {
  return definePlugin({
    id: 'demo.cascadesStart',
    data(ctx) {
      ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), cascadeStartDate(request)));
    },
  });
}

export { cascadesStart };
```

### Opening a locked Field for one Entry, or a subtree

`Field.editable` locks a Field for every Entry alike — the grid never opens
it, and `entries.update()` refuses it. A plugin that must open one locked
Field on one Entry, or on a whole subtree, installs a per-entry lock rule
instead of asking for the Field to reopen everywhere:

```ts
import { definePlugin } from 'freegantt';

function unlockCostUnder(subtreeRootId: string) {
  return definePlugin({
    id: 'demo.unlockCost',
    data(ctx) {
      ctx.edits.setLockRule(
        (next) => (entry, field) =>
          field === 'cost' && entry.isDescendantOf(subtreeRootId) ? 'anywhere' : next(entry, field),
      );
    },
  });
}

export { unlockCostUnder };
```

That reads: open `cost` on every descendant of one subtree root, otherwise
whatever the next rule says. `entry` is a `FieldLockQuery` — `id`, and
`isDescendantOf(ancestorId)` for the subtree question — not the live `Entry`.
`undefined` is silence: the resolver falls back to `Field.editable` when no
installed rule has an opinion on a cell.

**The root itself stays locked.** `isDescendantOf(subtreeRootId)` answers
`false` when `entry.id` is `subtreeRootId` — an Entry is not its own
ancestor (#473). A caller who checks before writing sees the difference:

```ts
function checkCostLock(request: import('freegantt').EditRequest, subtreeRootId: string, childId: string) {
  const rootLock = request.editableOf(subtreeRootId, 'cost'); // 'never' unless Field.editable already opened it
  const childLock = request.editableOf(childId, 'cost'); // 'anywhere', once childId sits under subtreeRootId
  return { rootLock, childLock };
}
```

Write `entry.id === subtreeRootId || entry.isDescendantOf(subtreeRootId)` in
the lock rule itself to open the root too.

**The cascade meets the same lock a person at a keyboard meets.** A cascade
that writes a `'never'` Field throws `FieldNotEditableError`, the same as
`entries.update()`, unless a lock rule opened that cell first
(`docs/edit-extension-flow.md`, "A cascade onto a locked Field"). An extender
can check `request.editableOf(id, field)` before it writes, and a consumer
can check the same answer through `dataset.editableOf(id, field)` — one
resolved answer, published on both doors (I14, `plans/01` §11).

**Installing composes**, the same way `setExtender` and a declared
`hierarchySource` do (D-S5-23): the wrapper receives the current occupant, so
a second plugin's rule adds to the first's instead of evicting it. See
"Every registration seam" below for `edits.setLockRule`'s row.

## Data a consumer must keep

A plugin's own store (`ctx.store.reserve<T>()`) is not export data. `entries.load()`
(#496) does not read it, and `toInput()` does not either — a store is state the plugin
needs while it runs, never a document (#496 Q8).

Per-entry data a consumer must save and load back goes in a Field instead — the one door
`toInput()` and `entries.load()` both read. Declare it `editable: 'api'`: an app writes
it through `entries.update()`, and no gesture writes it — not the cell editor, not a
drag, not a resize. Give it no `column`, and no grid draws one either.

`harness/plugins/lock-entries.ts` is the model case: `locked` is a Field, not a store
row, so a saved document that names a locked entry loads locked again.

**Where a Field does not fit:** state a consumer does not save — which subtree is open
right now (`harness/plugins/subtree-unlock.ts`) — stays in the plugin's own store. A
store row belongs to one Entry, keyed by its id: `store.set` throws `EntryNotFoundError`
for an id with no Entry, and removing the Entry removes its rows. The plugin publishes
its own reader and writer (ADR 0016).

### Reacting to a load

`entries.load()` replaces the whole Dataset in one commit, `origin: 'load'`. A plugin
reads it the same way it reads any other commit — through `change`, which every `data`
half already subscribes to:

```ts
import { definePlugin } from 'freegantt';

function resetsOnLoad() {
  let cache: unknown;
  return definePlugin({
    id: 'demo.resetsOnLoad',
    data(ctx) {
      ctx.events.on('change', ({ changeSet }) => {
        if (changeSet.origin === 'load') cache = undefined;
      });
    },
  });
}

export { resetsOnLoad };
```

`beforeChange` carries the same `origin`, so a plugin may veto a load too. A veto that
depends on state a load is about to remove has to let `origin: 'load'` through, or a
load could never remove that state — `lock-entries.ts`'s "is this entry locked" refusal
steps aside for a load for exactly this reason.

### Reacting to a sync

`entries.sync()` also commits its whole change in one step, `origin: 'sync'` — but unlike
a load, a sync carries only the rows that changed: entry Field rows for an added, removed
or edited entry, and a plugin-store row only for a removed id. A plugin reads a sync the
same `change` subscription reads a load, and does not need a second one. It reads every
other origin — `'user'`, `'undo'`, `'redo'` — the same way: only `'load'` is a fresh start,
so a plugin folds `added`/`removed`/`updated` into its cache on every other origin, sync
included, rather than singling sync out:

```ts
import { definePlugin } from 'freegantt';
import type { EntryId } from 'freegantt';

function resetsOnLoadOnly() {
  const cache = new Map<EntryId, string>();
  return definePlugin({
    id: 'demo.resetsOnLoadOnly',
    data(ctx) {
      ctx.events.on('change', ({ changeSet }) => {
        if (changeSet.origin === 'load') {
          cache.clear(); // a full fresh start: nothing survives
          return;
        }
        // Every other origin — a user edit, an undo, a redo, a sync — carries only the rows
        // that changed: fold them into the cache instead of resetting it.
        for (const { entity } of changeSet.removed) cache.delete(entity.id);
        for (const { entity } of changeSet.added) cache.set(entity.id, entity.name ?? '');
        for (const row of changeSet.updated) {
          if (row.store === 'entries' && row.field === 'name') cache.set(row.id, String(row.to ?? ''));
        }
      });
    },
  });
}

export { resetsOnLoadOnly };
```

A plugin must not reset a cache on `origin: 'sync'` the way it does on `'load'`: sync keeps
per-entry state for a kept id on purpose, and clearing a cache on every poll throws that
away for no reason. It must instead fold the changed rows into the cache it already holds —
on every origin but `'load'`, not sync alone, or a rename or an undo leaves the cache stale.

A sync is not an undo step: it records nothing on the History stack. An undo after a sync
can carry rows the recorded step never had — it writes onto the entry's current value, not
the value the step recorded, so a plugin's `change` handler must read `row.to`, never assume
it matches what the plugin remembers recording earlier (`docs/11-server-data.md`).

## Why a factory, not a name-keyed table

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
| `variants.add(variant)` | `variant.name` | Newest registration wins, and the older one answers again on dispose | `src/layout/bars/variants.test.ts` |
| `view.registerRenderer(point, renderer)` | `RendererPoint` (`'bar'` \| `'cell'` \| `'header'` \| `'tooltip'`) | Exclusive — the second claim throws `RendererAlreadyRegisteredError` | `src/view/renderer-registry.test.ts`, "register: a second plugin claiming the whole bar point throws, naming both plugin ids" |
| `view.registerDecoration(layer, provider)` | `DecorationLayer` (`'underBars'` \| `'overBars'`) | Additive — every registered provider paints, in registration order | `src/view/plugin-registrations.test.ts` |
| `view.registerGridColumn(column)` | none | Additive — an ordered, appendable list | `src/view/plugin-registrations.test.ts` |
| `store.reserve<T>()` | the calling plugin's own `id` | Idempotent — the same plugin gets the same store back on repeat calls | `src/extensions/plugin-runtime.test.ts` |
| `edits.setExtender(wrap)` | the one edit hook | Composes — the second extender receives the first and may call it | `src/data/edit-extension.test.ts` |
| `edits.setLockRule(wrap)` | the one lock seam | Composes — the second rule receives the first and may call it | `src/data/entry-store.mutation.test.ts`, "a plugin's per-entry lock rule opens a locked Field (#473)" |
| `events.on(name, handler)` | none | Additive — every handler runs, in registration order; the returned `Disposer` removes only that one handler | `src/data/event-bus.test.ts` |

A Field, a Field type or an Aggregator is not on this table: a plugin
declares those on itself — `fields`, `fieldTypes`, `aggregators` — never
through a `ctx` call (#496 grill round 3, R1/R2). `Dataset`'s constructor
registers every plugin's declarations, alongside its own, before any entry
is read — a key two sources both declare throws `DuplicateFieldKeyError`,
the same error a claimed key in the table above throws. See "The smallest
working `data` half" above.

`events.on` is not gated — a plugin may call it after its own half returns,
for example from inside another handler — but it is still tracked like every
other seam: uninstalling the plugin, reassigning `plugins`, or calling
`destroy()` removes the handler. The returned `Disposer` still works too, for
a plugin that wants to remove its own handler early.

`store.read<T>(pluginId)` is not a registration. It gives one plugin
read-only access (`get`/`all`, no `set`/`remove`) to a store another plugin
reserved, or `undefined` if that plugin never reserved one.

## The registration gate

Every `register*` call in the table above is legal only while that plugin's
own half is running. The moment that half returns, the gate closes for that
plugin. `fields`/`fieldTypes`/`aggregators` are not on this gate at all —
they are read before `data()` ever runs (see "Every registration seam"
above), so there is no later call to refuse.

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
read and keeps working.

## Disposal

`ctx.disposables` is a `DisposableStore`. Every gated registration a plugin
makes is added to it automatically, so removing the plugin retracts every
registration with no extra code from the plugin author.

A half's own return value — a `Disposer` — is for a resource
the plugin owns itself: a timer, a socket, a subscription outside
FreeGantt. Most plugins return nothing, as `overBudgetRows()` above does.
When a plugin does return a `Disposer`, it runs after `ctx.disposables`
has already retracted every registration.

Two `Gantt` instances never share a registration: disposing a plugin on one
leaves the other's registrations untouched.

## `requires` and setup order

A plugin may declare `requires: readonly PluginId[]` — the ids of plugins that
must finish setting up first. One list covers both halves:

```ts
import { definePlugin, fieldRowsOf } from 'freegantt';

function lockAwareReport() {
  return definePlugin({
    id: 'demo.lockAwareReport',
    requires: ['demo.lockEntries'],
    data(ctx) {
      // `locked` is `demo.lockEntries`'s own Field (#496 Q8), read the same way any consumer reads
      // it — not a store, so `requires` names an ordering preference here, not a read that would
      // otherwise fail: every plugin's Field is registered before the first commit either way.
      ctx.events.on('beforeChange', ({ changeSet }) => {
        const touchesLockedEntry = fieldRowsOf(changeSet).some(
          (row) => ctx.dataset.entries.get(row.id)?.read('locked') === true,
        );
        return touchesLockedEntry ? false : undefined;
      });
    },
  });
}

export { lockAwareReport };
```

Setup order follows `requires`, not array position — a required plugin runs
first no matter where the array places it. A chain of requirements resolves
transitively.

Two errors come from a bad `requires` list:

- A required plugin that is not in the array at all throws
  `MissingPluginError`, naming both the plugin and the missing requirement.
- A requirement cycle throws `PluginRequirementCycleError`, naming every
  plugin in the cycle.

A `Gantt` sorts the Dataset's own plugins together with its own chrome, under
that one `requires` graph.

## Errors an author will meet

| Error | Code | Thrown when | Test |
| --- | --- | --- | --- |
| `DuplicatePluginIdError` | `'duplicate-plugin-id'` | Two plugins in one install share an `id` | `src/extensions/plugin-runtime.test.ts`, "a duplicate id throws DuplicatePluginIdError" |
| `MissingPluginError` | `'missing-plugin'` | A plugin's `requires` names an `id` not present in the install list | `src/extensions/plugin-order.test.ts` |
| `PluginRequirementCycleError` | `'plugin-requirement-cycle'` | Two or more plugins require each other in a cycle | `src/extensions/plugin-order.test.ts` |
| `RegistrationClosedError` | `'registration-closed'` | A gated method is called after that plugin's half has returned | `src/view/plugin-ports.test.ts` |
| `PluginSetupError` | `'plugin-setup-failed'` | A plugin's half throws, or a plugin with a `data` half reaches a `Gantt` | `src/api/define-plugin.test.ts`, "the message says where to install it" |
| `RendererAlreadyRegisteredError` | `'renderer-already-registered'` | Two plugins claim the same `RendererPoint` slot | `src/view/renderer-registry.test.ts` |
| `PluginNotInstalledError` | `'plugin-not-installed'` | `gantt.uninstallPlugin(id)` is called with an `id` that is not installed | |
| `EntryNotFoundError` | `'entry-not-found'` | `store.set` names an id with no Entry | `src/data/plugin-store.test.ts`, "throws EntryNotFoundError that names store.set, and commits nothing" |

A throw during a batch install unwinds only that batch, in
reverse order, and leaves the plugins that were already installed before
the batch started untouched.

## Where to go next

- `CONTEXT.md` — the glossary entries for `Plugin`, `PluginContext`, and
  `PluginStore`.
- `harness/e2e/plugins.html` — every plugin in this guide, running.
