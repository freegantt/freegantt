// extensions/features/ — the `entryDependencies()` built-in. It stores the Dependencies between
// Entries and draws one connector for each. It needs no scheduling plugin: a Gantt with only this
// plugin shows the lines and moves nothing. Confined by `extensions-public-only` to `api/`/`model/`
// imports, each from its own narrow file, never the `api/index.ts` barrel that re-exports it.

import type { DataPlugin } from '../../api/gantt.js';
import type { Dataset } from '../../api/dataset.js';
import {
  DependencyStoreNotInstalledError,
  DuplicateDependencyIdError,
  EntryNotFoundError,
  UnsupportedLagUnitError,
  entryId,
} from '../../model/index.js';
import type {
  Disposer,
  Duration,
  EntryId,
  PluginStore,
  PluginStoreName,
  PluginStoreView,
  StoreRowUpdated,
} from '../../model/index.js';
import { connectorIdOf, connectorSelection } from './entry-dependencies-selection.js';

/** The plugin id other plugins name in `requires`. */
export const ENTRY_DEPENDENCIES_ID = 'freegantt.entryDependencies';

/** Which edge of the predecessor drives which edge of the successor. */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/** Days between the two edges. A negative lag lets the successor overlap its predecessor. */
export interface DependencyLag {
  readonly value: number;
  readonly unit: 'day';
}

/** A Dependency as the store holds it and `all()` reads it. */
export interface Dependency {
  readonly id: string;
  readonly fromId: EntryId;
  readonly toId: EntryId;
  readonly type: DependencyType;
  readonly lag: DependencyLag;
}

/** A Dependency as a consumer writes it. The ids are loose strings. The lag unit must be `day`. */
export interface DependencyInput {
  readonly id: string;
  readonly fromId: EntryId | string;
  readonly toId: EntryId | string;
  readonly type: DependencyType;
  readonly lag: Duration;
}

/** What the remove events carry: the Dependency as it was stored. */
export interface DependencyRemoval {
  readonly dependency: Dependency;
}

/** Answer `false`, or a Promise of `false`, to keep the Dependency. Any other answer allows the remove. */
export type BeforeDependencyRemoveHandler = (
  removal: DependencyRemoval,
) => void | false | Promise<void | false>;

export type DependencyRemoveHandler = (removal: DependencyRemoval) => void;

/** The events `entryDependencies().on` takes, each with its handler type. */
export interface DependencyEvents {
  /** Fires before a user remove. The remove waits for every answer. */
  beforeDependencyRemove: BeforeDependencyRemoveHandler;
  /** Fires after a user remove committed. */
  dependencyRemove: DependencyRemoveHandler;
}

/** What `entryDependencies()` returns: the plugin, and the calls a consumer writes Dependencies with. */
export interface EntryDependencies extends DataPlugin {
  /** Makes the Dependencies equal `dependencies`. Records no undo step. An unknown Entry id throws,
   *  and nothing changes. */
  replaceAll(dependencies: readonly DependencyInput[]): void;
  /** Adds one Dependency. One undo step covers it. */
  add(dependency: DependencyInput): void;
  /** Removes the Dependency with this id. An unknown id changes nothing. One undo step covers it. */
  remove(id: string): void;
  /** Every Dependency, grouped by successor. */
  all(): readonly Dependency[];
  /** The Dependencies that make `entry` a successor. */
  predecessorsOf(entry: EntryId | string): readonly Dependency[];
  /** Calls `handler` for a remove the user makes with the keyboard. A call to `remove(id)` raises no
   *  event, because the consumer's own code made it. Returns the call that removes the handler. */
  on<Name extends keyof DependencyEvents>(name: Name, handler: DependencyEvents[Name]): Disposer;
}

/** The predecessors of one Entry. The store key is the successor, so the row omits `toId`. */
interface PredecessorRow {
  readonly id: string;
  readonly fromId: EntryId;
  readonly type: DependencyType;
  readonly lag: DependencyLag;
}

interface DependencyRow {
  readonly predecessors: readonly PredecessorRow[];
}

/** The rows `entryDependencies()` stores. A plugin that requires it reads them through `readDependencies`. */
export type DependencyStoreView = PluginStoreView<DependencyRow>;

type BarEdge = 'start' | 'end';

/** Each type joins one edge of the predecessor to one edge of the successor. */
export function edgesOf(type: DependencyType): readonly [from: BarEdge, to: BarEdge] {
  switch (type) {
    case 'FS':
      return ['end', 'start'];
    case 'SS':
      return ['start', 'start'];
    case 'FF':
      return ['end', 'end'];
    case 'SF':
      return ['start', 'end'];
  }
}

/** Which type joins these two edges? The inverse of `edgesOf`. */
function typeOfEdges(from: BarEdge, to: BarEdge): DependencyType {
  if (from === 'end') return to === 'start' ? 'FS' : 'FF';
  return to === 'start' ? 'SS' : 'SF';
}

function toPredecessorRow(input: DependencyInput, operation: string): PredecessorRow {
  if (input.lag.unit !== 'day') throw new UnsupportedLagUnitError(input.lag.unit, operation);
  return {
    id: input.id,
    fromId: entryId(input.fromId),
    type: input.type,
    lag: { value: input.lag.value, unit: 'day' },
  };
}

function toDependency(toId: EntryId, row: PredecessorRow): Dependency {
  return { id: row.id, fromId: row.fromId, toId, type: row.type, lag: row.lag };
}

/** Every Dependency in a store view, grouped by successor. A missing store holds none. */
export function readDependencies(store: DependencyStoreView | undefined): readonly Dependency[] {
  if (!store) return [];
  return [...store.all].flatMap(([toId, row]) => row.predecessors.map((p) => toDependency(toId, p)));
}

const DEPENDENCY_STORE_NAME: PluginStoreName = `plugin:${ENTRY_DEPENDENCIES_ID}`;

/**
 * The successors that gained a Dependency, or hold a changed one, in these store row changes. A row that
 * only loses Dependencies adds none: a removed Dependency moves nobody. Rows of other stores are ignored.
 */
export function successorsOfAddedDependencies(rows: readonly StoreRowUpdated[]): Set<EntryId> {
  const successors = new Set<EntryId>();
  for (const { store, id, from, to } of rows) {
    if (store !== DEPENDENCY_STORE_NAME) continue;
    const before = new Set(
      ((from as DependencyRow | undefined)?.predecessors ?? []).map((predecessor) =>
        JSON.stringify(predecessor),
      ),
    );
    const gained = ((to as DependencyRow | undefined)?.predecessors ?? []).some(
      (predecessor) => !before.has(JSON.stringify(predecessor)),
    );
    if (gained) successors.add(id);
  }
  return successors;
}

/** Does any of these store row changes write the Dependency store? */
export function writesDependencies(rows: readonly StoreRowUpdated[]): boolean {
  return rows.some((row) => row.store === DEPENDENCY_STORE_NAME);
}

function assertEntryExists(dataset: Dataset, id: EntryId | string, operation: string): void {
  if (!dataset.entries.has(id)) throw new EntryNotFoundError(entryId(id), operation);
}

/** What `entryDependencies()` accepts. */
export interface EntryDependenciesOptions {
  /** Does a connect drag between two bars add a Dependency? Default `true`. Pass `false` for an app
   * that only shows Dependencies: no port draws, and the user cannot drag one in. */
  readonly connectByDrag?: boolean;
  /** Which Field names an Entry in a connector label "<from> → <to>". Default `name`. The label is
   *  always the accessible name of the connector. */
  readonly labelField?: string;
  /** Draw the label as text on each connector. Default `false`: the label then serves screen readers only. */
  readonly showLabels?: boolean;
}

/** A plugin that stores Dependencies. Call: `new Dataset({ entries, plugins: [entryDependencies()] })`. */
export function entryDependencies(options: EntryDependenciesOptions = {}): EntryDependencies {
  const { connectByDrag = true, labelField = 'name', showLabels = false } = options;
  const listeners: { [Name in keyof DependencyEvents]: Set<DependencyEvents[Name]> } = {
    beforeDependencyRemove: new Set(),
    dependencyRemove: new Set(),
  };
  let installed: { dataset: Dataset; store: PluginStore<DependencyRow> } | undefined;

  function installation(operation: string): NonNullable<typeof installed> {
    if (!installed) throw new DependencyStoreNotInstalledError(operation);
    return installed;
  }

  function all(): readonly Dependency[] {
    return readDependencies(installation('entryDependencies.all').store);
  }

  function assertIdIsFree(id: string, operation: string): void {
    if (all().some((dependency) => dependency.id === id)) throw new DuplicateDependencyIdError(id, operation);
  }

  function add(dependency: DependencyInput): void {
    const operation = 'entryDependencies.add';
    const { dataset, store } = installation(operation);
    assertEntryExists(dataset, dependency.fromId, operation);
    assertEntryExists(dataset, dependency.toId, operation);
    assertIdIsFree(dependency.id, operation);
    const row = toPredecessorRow(dependency, operation);
    const current = store.get(dependency.toId)?.predecessors ?? [];
    store.set(dependency.toId, { predecessors: [...current, row] });
  }

  /** Asks every `beforeDependencyRemove` handler. Any `false` keeps the Dependency. A Promise holds the
   *  remove until it settles. */
  function allowsRemove(removal: DependencyRemoval): boolean | Promise<boolean> {
    const answers = [...listeners.beforeDependencyRemove].map((handler) => handler(removal));
    if (answers.includes(false)) return false;
    const pending = answers.filter((answer) => answer instanceof Promise);
    if (pending.length === 0) return true;
    return Promise.all(pending).then((settled) => !settled.includes(false));
  }

  /** The keyboard remove: ask, remove with one undo step, then tell. The Dependency may be gone
   *  when a slow answer arrives, and then nothing happens. */
  function removeByUser(id: string): void {
    const dependency = all().find((stored) => stored.id === id);
    if (!dependency) return;
    const removal = { dependency };
    const commit = (): void => {
      if (!all().some((stored) => stored.id === id)) return;
      remove(id);
      for (const handler of [...listeners.dependencyRemove]) handler(removal);
    };
    const verdict = allowsRemove(removal);
    if (typeof verdict === 'boolean') {
      if (verdict) commit();
      return;
    }
    void verdict.then((allowed) => {
      if (allowed) commit();
    });
  }

  function remove(id: string): void {
    const { store } = installation('entryDependencies.remove');
    const owner = all().find((dependency) => dependency.id === id);
    if (!owner) return;
    const kept = (store.get(owner.toId)?.predecessors ?? []).filter((p) => p.id !== id);
    if (kept.length === 0) store.remove(owner.toId);
    else store.set(owner.toId, { predecessors: kept });
  }

  function predecessorsOf(entry: EntryId | string): readonly Dependency[] {
    const { store } = installation('entryDependencies.predecessorsOf');
    const toId = entryId(entry);
    return (store.get(toId)?.predecessors ?? []).map((p) => toDependency(toId, p));
  }

  return {
    id: ENTRY_DEPENDENCIES_ID,

    data(ctx) {
      const store = ctx.store.reserve<DependencyRow>();
      installed = { dataset: ctx.dataset, store };

      // What happens to a Dependency when an Entry goes? The row of a removed successor goes with the
      // Entry. A row that names a removed predecessor loses that one Dependency in the same change set.
      ctx.edits.writeRowsWithEdit((request) =>
        [...store.all]
          .filter(([, row]) => row.predecessors.some((p) => request.removedEntryIds.has(p.fromId)))
          .map(([toId, row]) => {
            const kept = row.predecessors.filter((p) => !request.removedEntryIds.has(p.fromId));
            return { id: toId, row: kept.length > 0 ? { predecessors: kept } : undefined };
          }),
      );

      return () => {
        installed = undefined;
        for (const handlers of Object.values(listeners)) handlers.clear();
      };
    },

    view(ctx) {
      const labelOf = (id: EntryId): string => {
        const value: unknown = ctx.dataset.entries.get(id)?.read(labelField);
        return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
      };
      // Which connector did the user select, and what do the keys do to it?
      const selection = connectorSelection(ctx, {
        dependencyIds: () => all().map((dependency) => dependency.id),
        removeByUser,
      });
      // What lines does the Gantt draw? One per Dependency, from an edge of the predecessor's bar to
      // an edge of the successor's bar. The accessible name reads "<from label> → <to label>".
      // The selected Dependency carries the `selected` flag.
      ctx.view.registerConnector(() =>
        all().map((dependency) => {
          const [fromEdge, toEdge] = edgesOf(dependency.type);
          return {
            id: connectorIdOf(dependency.id),
            from: { entryId: dependency.fromId, edge: fromEdge },
            to: { entryId: dependency.toId, edge: toEdge },
            flags: selection.isSelected(dependency.id) ? { selected: true } : {},
            label: `${labelOf(dependency.fromId)} → ${labelOf(dependency.toId)}`,
            showLabel: showLabels,
          };
        }),
      );

      // What does a connect drag do? It adds a Dependency of zero lag, typed by the two edges.
      // One undo step removes it. A repeat of an existing Dependency and a drop on the same Entry add nothing.
      if (connectByDrag) {
        ctx.view.onConnect(({ from, to }) => {
          if (from.entryId === to.entryId) return;
          const type = typeOfEdges(from.edge, to.edge);
          const alreadyStored = predecessorsOf(to.entryId).some(
            (stored) => stored.fromId === from.entryId && stored.type === type,
          );
          if (alreadyStored) return;
          add({
            id: `${from.entryId}:${type}:${to.entryId}`,
            fromId: from.entryId,
            toId: to.entryId,
            type,
            lag: { value: 0, unit: 'day' },
          });
        });
      }
    },

    replaceAll(dependencies) {
      const operation = 'entryDependencies.replaceAll';
      const { dataset, store } = installation(operation);
      const rows = new Map<EntryId, PredecessorRow[]>();
      const seen = new Set<string>();
      for (const input of dependencies) {
        if (seen.has(input.id)) throw new DuplicateDependencyIdError(input.id, operation);
        seen.add(input.id);
        assertEntryExists(dataset, input.fromId, operation);
        assertEntryExists(dataset, input.toId, operation);
        const toId = entryId(input.toId);
        rows.set(toId, [...(rows.get(toId) ?? []), toPredecessorRow(input, operation)]);
      }
      store.syncAll(new Map([...rows].map(([toId, predecessors]) => [toId, { predecessors }])));
    },

    add,

    remove,

    all,

    predecessorsOf,

    on(name, handler) {
      const handlers: Set<typeof handler> = listeners[name];
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
