---
status: accepted — verdict: `verify:full PASS — all 16 checks green, test:e2e included.` (2026-09-25).
  Amends [ADR 0019](0019-one-plugin-one-install-site.md): the two plugin generic shapes do not
  change, but what the `TProps` argument on them means does.
decided: a plugin's type argument names the keys that plugin itself reads and writes, never the
  consumer's declared props. `DatasetOptions.plugins` and `GanttOptions.plugins` hold each plugin
  with its props erased (`PluginOf<unknown, unknown>` and `ChromePlugin` with no type argument), so
  a `Dataset<TaskProps>` or a `Gantt<TaskProps>` installs a plugin typed with any `TProps` at all.
  `DataPluginOf.fields` still checks each declared key against that plugin's own type argument, so a
  typo such as `{ key: 'lockd' }` on a `definePlugin<LockProps>` call fails to compile.
open: value-type propagation (a Field's declared `type` checked against the props key's own type)
  stays open — ADR 0005 already tracks it, and this record adds nothing there.
---

# A plugin's type argument names its own keys

**Amends [ADR 0019](0019-one-plugin-one-install-site.md).** That record fixed where a plugin
installs. It never said what a plugin's own `TProps` argument means once installed, and issue #530
found that meaning ambiguous in a way that broke a typed install.

## Context

`Dataset<TProps>` and `Gantt<TProps>` both took `plugins?: readonly PluginOf<unknown, Dataset<TProps>>[]`
and `plugins?: readonly ChromePlugin<TProps>[]`, tying a plugin's own generic to the *consumer's*
`TProps`. A published plugin cannot know the consumer's props shape in advance, so every plugin
author wrote either an untyped plugin (`definePlugin({ … })`, `TProps` defaulting to `unknown`, no
typed `ctx.dataset` read or write) or `definePlugin<TaskProps>({ … })` naming a consumer type the
plugin itself has no business knowing.

`Dataset<TProps>` and `Gantt<TProps>` both carry `#private` members, so TypeScript compares two
instances of either by their type argument. A `DataPlugin<LockProps>` installed on a
`Dataset<TaskProps>` then failed to compile (`TS2375`), because `Dataset<LockProps>` (the type
`ctx.dataset` resolves to inside that plugin's `data()`) is not assignable to `Dataset<TaskProps>`
(the type the install site expected). The only way around it, in `harness/plugins/lock-entries.ts`
and the chrome plugins `harness/plugins/buffer-kind.ts`/`risk-kind.ts`, was a hand-written
`as EntryEdit` cast on every write — the harness workaround the project's stop rule exists to
surface, not hide.

## Decision

**A plugin's `TProps` argument names the keys that plugin itself reads and writes. It says nothing
about a consumer's own props, and a consumer's props say nothing about a plugin's.**

`Dataset<TProps>` holds every installed plugin with its props erased:

```ts
// DatasetOptions.plugins — before and after
plugins?: readonly PluginOf<unknown, Dataset<TProps>>[];   // before: tied to the consumer's TProps
plugins?: readonly PluginOf<unknown, unknown>[];            // after: each plugin's props are its own
```

`Gantt<TProps>` does the same for a chrome plugin — `GanttOptions.plugins`, the `plugins` getter and
setter, `installPlugin`, `hasPlugin`, `uninstallPlugin`, and the internal `assertChromeOnly` guard all
take `ChromePlugin` with no type argument in place of `ChromePlugin<TProps>`.

`data`/`view` are method signatures, so TypeScript compares their parameter types bivariantly: a
context built for one `TProps` still satisfies a method declared to want another. So `ctx.dataset`
inside a plugin's own `data(ctx)` still reads and writes only that plugin's own declared keys —
`ctx.dataset.entries.update('t1', { locked: true })` compiles inside a `definePlugin<LockProps>` call,
and `{ cost: 1 }` (a consumer key `LockProps` never named) does not.

`DataPluginOf.fields` narrows each declared key to the plugin's own props:

```ts
// before                                                  // after
fields?: readonly Field[];    fields?: readonly (Field & { key: keyof PropsOf<TDataset> & string })[];
```

`PropsOf<TDataset>` reads the props a `TDataset` type argument carries off its own `entries`
collection, and falls back to `Record<string, unknown>` for an untyped plugin, so an untyped
`definePlugin({ … })` still names any key. A typed plugin does not: `definePlugin<LockProps>({ id,
fields: [{ key: 'lockd' }] })` fails to compile, because `'lockd'` is not a key of `LockProps`.

### Not a lying generic

A plugin's type argument narrowing to its own keys, with no check against the consumer's, is not a
weaker promise than the one `Dataset<TProps>` already makes:

- The caller of `definePlugin<LockProps>` is the plugin author, and `LockProps` types only what that
  author's own code reads and writes. No library code reads `LockProps` to decide anything at
  runtime.
- Every `Dataset<X>` is a view onto one monomorphic store — `data/` holds `Entry<unknown>`
  throughout, by design, with no static dependency on any one consumer's props shape. `Dataset<LockProps>`
  is the same object seen through a narrower key set. `entry.props` is `Partial<…>` on every door, so
  a narrower view never promises a key is present.
- The compile-time check this record adds stops the one lie a plugin author can type by accident: a
  `fields` key that is not in their own declared props.
- The runtime still refuses the other lie. A key in a plugin's `TProps` that nothing declares throws
  `UnknownFieldError` at `entries.update()` — the same guarantee `Dataset<TProps>` itself already
  gives a consumer.
- Before this record the generic lied in the other direction: `definePlugin<TaskProps>` told a
  plugin author it saw the consumer's own keys, but a plugin published for any consumer cannot know
  them in advance.

## Consequences

- `harness/plugins/lock-entries.ts` writes its `locked` Field through `dataset.entries.update(id, {
  locked: true })` with no cast. `LockProps` is exported, so a consumer that wants a typed read adds
  it to its own props: `Dataset<TaskProps & LockProps>`.
- `harness/plugins/buffer-kind.ts` and `risk-kind.ts` write `consumed`/`accepted` the same way, with
  no cast. Both stay chrome plugins (a chrome plugin cannot declare a Field), so the page that
  installs them still declares those two keys itself, in its own `fields` list — `entries.update()`
  refuses either key if the page does not.
- `Dataset.plugins`, `DatasetOptions.plugins`, `GanttOptions.plugins`, `Gantt.plugins`,
  `installPlugin`, `hasPlugin` and `uninstallPlugin` all change their published type. No shape
  changes — every plugin that compiled before still compiles, and every value that installed before
  still installs.

## Rejected alternatives

- **Infer a plugin's `TProps` from its own `fields` array.** A `hierarchySource`-only plugin
  declares no `fields` at all, so inference would answer `unknown` for a plugin whose author wrote a
  real props type. A caller who writes `definePlugin<LockProps>(...)` explicitly would also fight
  inference for no reason.
- **The consumer writes the intersection at the install site** (`Dataset<TaskProps & LockProps>` to
  install `lockEntries()`). This is still legal, and still how a consumer gets a typed *read* back
  through its own Dataset. But requiring it to *install* the plugin at all would force every consumer
  to know and restate every plugin's own props, which is exactly the coupling a published plugin
  cannot assume.
- **A reverse check — every key in a plugin's props must appear in its `fields`.** This would refuse
  a plugin typed with a broader props shape than the one Field it happens to declare this release,
  and it would break every consumer's own app-local plugin typed against its own props for
  convenience. It also cannot run when `TProps` is written explicitly, because TypeScript then infers
  nothing to check it against. The runtime already refuses an undeclared key with `UnknownFieldError`,
  so no promise is lost by not adding this check.

## Out of scope

Value-type propagation — checking a Field's declared `type` against the matching key's type in a
plugin's own `TProps` — stays open. [ADR 0005](0005-fields-are-declared-and-grid-columns-reference-them.md)
already tracks it; this record checks a `fields` key's name, never its type.
