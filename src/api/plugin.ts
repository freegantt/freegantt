// api/ — what a plugin is (ADR 0019). One plugin type, two halves, one install site.
//
// The `view` half's context arrives as a plain type argument, never as an import. Naming
// `api/plugin-context.ts` here would pull `view/` in, and `view/` reaches back to `api/command.ts`
// and `api/dataset.ts`. Dependency-cruiser's `no-circular` rule treats a type-only edge the same as
// a runtime one, so that import would close a ring. `api/gantt.ts` is the one file that sees both
// concrete classes, and it binds `TViewContext` and `TDataset` there — `export type ChromePlugin =
// ChromePluginOf<PluginContext>`. `api/index.ts` re-exports the bound aliases alongside these
// generic shapes, the same `*Of` pairing `api/command.ts` uses.
//
// A plugin author writes `definePlugin` (`api/define-plugin.ts`) and meets the bound names.

import type {
  Aggregator,
  Disposer,
  EntryStoreView,
  Field,
  FieldType,
  HierarchySource,
  PluginId,
} from '../model/index.js';
import type { DatasetPluginContextOf } from './dataset-plugin.js';

/** The props a `TDataset` type argument carries, read off its own `entries` collection — the same
 *  trust boundary `api/dataset.ts`'s class note describes. Falls back to a plain record when
 *  `TDataset` names no Dataset type (the default, `unknown`), so `hierarchySource` still type-checks
 *  with no `props` shape declared. The untyped `DataPlugin<unknown>` arm infers `TProps` as `unknown`
 *  too. The `unknown extends TProps` arm catches that case the same way. `DataPluginOf.fields`
 *  narrows each `key` against this same answer. Not exported: `ae-forgotten-export` records it, same
 *  as `EntryEnvelope` today. */
type PropsOf<TDataset> = TDataset extends { entries: EntryStoreView<infer TProps> }
  ? unknown extends TProps
    ? Record<string, unknown>
    : TProps
  : Record<string, unknown>;

/** The two members every plugin declares, whichever halves it fills.
 *
 *  #178: a plugin that page scope has to call back into publishes those calls **on itself**, beside
 *  `id` and its halves. Declare an interface extending `ChromePluginOf` or `DataPluginOf`, return it
 *  from the factory, and hold what the half built in a variable inside that factory call. The page
 *  then keeps the plugin object it installed and calls it. That is the supported way to reach a
 *  plugin's own state. It is also why no `Gantt` method hands a `PluginContext` back. One factory
 *  call is one install's worth of state, so two Gantts on one page share none of it (I2). A
 *  module-level stash shares all of it. */
export interface PluginIdentity {
  id: PluginId;
  /** Plugin ids that must also be installed. Does not imply an order in the array: installation
   *  resolves setup order from `requires` alone, so `[a, b]` and `[b, a]` install identically
   *  (D-S5-31). A required id nobody installs throws `MissingPluginError`. One list covers both
   *  halves (ADR 0019). */
  requires?: readonly PluginId[];
}

/** A plugin that is chrome and nothing else — `timeShading()`. It declares no Field, reserves no
 *  store and claims no edit hook. So it installs on the `Gantt`, and `gantt.plugins` reconfigures it
 *  live.
 *
 *  `data?: never` makes the wrong install site unrepresentable. `GanttOptions.plugins` takes this arm
 *  alone. So a plugin with a `data` half is a red squiggle in the editor, never a runtime discovery.
 *  It is the rule that keeps a shared `scale` off a `Gantt` that names `preset`. */
export interface ChromePluginOf<TViewContext = unknown> extends PluginIdentity {
  /** Variants, renderers, decorations, commands and keys. Runs once, as a Gantt mounts. It returns a
   *  `Disposer` for the plugin's own resources, or nothing at all (review P4). Every `register*` and
   *  every `onDomEvent` files its own removal in `ctx.disposables`. */
  view(ctx: TViewContext): Disposer | void;
  data?: never;
  /** Dataset-owned state, registered at construction (#496 grill round 3, R1). Unrepresentable here
   *  for the same reason `data?: never` is: a chrome-only plugin has no `data()` to run them against.
   *  So a Field it named would install silently dropped, on the wrong site, with no error —
   *  `GanttOptions.plugins` never reads this member. */
  fields?: never;
  fieldTypes?: never;
  aggregators?: never;
  hierarchySource?: never;
}

/** A plugin that owns state — Fields, the edit hook, a store — and may paint it too.
 *
 *  **The install site is where the state lives.** A `data` half declares what shapes the Dataset's
 *  own construction, and a Dataset installs its plugins once. This arm installs on the `Dataset` for
 *  that reason. Every `Gantt` bound to that Dataset then runs `view` once, each with its own context,
 *  so I2 holds by construction. */
export interface DataPluginOf<TViewContext = unknown, TDataset = unknown> extends PluginIdentity {
  /** Fields, the edit hook and the store. DOM-free, and runs once, on the finished Dataset. Optional:
   *  a plugin that only declares `fields`, `fieldTypes`, `aggregators` or `hierarchySource`
   *  needs no `data()` to run. */
  data?(ctx: DatasetPluginContextOf<TDataset>): Disposer | void;
  /** The same shape `DatasetOptions.fields`/`fieldTypes`/`aggregators` take (#496 grill round 3,
   *  R1). Registered before any entry is read — alongside the Dataset's own, and before `data()`
   *  runs. So a flat value an entry carries for one of these keys survives `new Dataset(...)`, the
   *  same way `entries.load()` already does. A duplicate key across the Dataset and every plugin
   *  throws `DuplicateFieldKeyError`, the same error two ordinary declarations sharing a key throw.
   *
   *  This is the one way a plugin declares: there is no `ctx.fields.register` door. A Field whose
   *  shape depends on this plugin's own options is built in the factory that returns this object —
   *  `const costing = (opts) => ({ id: 'acme.costing', fields: [{ key: 'cost', ...opts }], data() {} })`.
   *
   *  Each `key` must be one of this plugin's own props (`PropsOf<TDataset>`), so a typo such as
   *  `{ key: 'lockd' }` on a `definePlugin<LockProps>` call fails to compile. An untyped plugin
   *  (`definePlugin({ … })`, `TDataset` left as `unknown`) names any key. */
  fields?: readonly (Field & { key: keyof PropsOf<TDataset> & string })[];
  /** Named Field type bundles this plugin adds, resolved before any Field naming one (D-S4-3). */
  fieldTypes?: Readonly<Record<string, FieldType>>;
  /** Aggregators this plugin adds, resolved before any Field naming one in `rollUp`. */
  aggregators?: Readonly<Record<string, Aggregator>>;
  /** The same half a chrome-only plugin fills. Optional: a headless plugin paints nothing. */
  view?(ctx: TViewContext): Disposer | void;
  /** Declares the tree, instead of composing it from inside `data()` (ADR 0031). Call:
   *  `definePlugin<PhaseProps>({ id, fields: [{ key: 'phaseId' }], hierarchySource: (next) => (entry) =>
   *  entry.props.phaseId ?? next(entry) })` — "its hierarchy source is the entry's phase id, or the
   *  next source's answer."
   *
   *  Composes in setup order (`resolveSetupOrder`), the same order `data()` runs in. The
   *  first plugin wraps core's own `storedParentSource`, and a later plugin wraps the one before it —
   *  the last plugin answers first. Same composing idiom `setExtender`/`setLockRule` already use. */
  hierarchySource?: (next: HierarchySource<PropsOf<TDataset>>) => HierarchySource<PropsOf<TDataset>>;
}

/** One installed plugin, either arm. `DatasetOptions.plugins` takes this; `GanttOptions.plugins`
 *  takes `ChromePluginOf` alone. */
export type PluginOf<TViewContext = unknown, TDataset = unknown> =
  ChromePluginOf<TViewContext> | DataPluginOf<TViewContext, TDataset>;
