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
import type { Duration, EntryId, PluginStore } from '../../model/index.js';

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

type BarEdge = 'start' | 'end';

/** Each type joins one edge of the predecessor to one edge of the successor. */
function edgesOf(type: DependencyType): readonly [from: BarEdge, to: BarEdge] {
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

function assertEntryExists(dataset: Dataset, id: EntryId | string, operation: string): void {
  if (!dataset.entries.has(id)) throw new EntryNotFoundError(entryId(id), operation);
}

/** A plugin that stores Dependencies. Call: `new Dataset({ entries, plugins: [entryDependencies()] })`. */
export function entryDependencies(): EntryDependencies {
  let installed: { dataset: Dataset; store: PluginStore<DependencyRow> } | undefined;

  function installation(operation: string): NonNullable<typeof installed> {
    if (!installed) throw new DependencyStoreNotInstalledError(operation);
    return installed;
  }

  function all(): readonly Dependency[] {
    const { store } = installation('entryDependencies.all');
    return [...store.all].flatMap(([toId, row]) => row.predecessors.map((p) => toDependency(toId, p)));
  }

  function assertIdIsFree(id: string, operation: string): void {
    if (all().some((dependency) => dependency.id === id)) throw new DuplicateDependencyIdError(id, operation);
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
      };
    },

    view(ctx) {
      const nameOf = (id: EntryId): string => ctx.dataset.entries.get(id)?.name ?? '';
      // What lines does the Gantt draw? One per Dependency, from an edge of the predecessor's bar to
      // an edge of the successor's bar. The accessible name reads "<from name> → <to name>".
      ctx.view.registerConnector(() =>
        all().map((dependency) => {
          const [fromEdge, toEdge] = edgesOf(dependency.type);
          return {
            id: `dependency:${dependency.id}`,
            from: { entryId: dependency.fromId, edge: fromEdge },
            to: { entryId: dependency.toId, edge: toEdge },
            label: `${nameOf(dependency.fromId)} → ${nameOf(dependency.toId)}`,
          };
        }),
      );
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

    add(dependency) {
      const operation = 'entryDependencies.add';
      const { dataset, store } = installation(operation);
      assertEntryExists(dataset, dependency.fromId, operation);
      assertEntryExists(dataset, dependency.toId, operation);
      assertIdIsFree(dependency.id, operation);
      const row = toPredecessorRow(dependency, operation);
      const current = store.get(dependency.toId)?.predecessors ?? [];
      store.set(dependency.toId, { predecessors: [...current, row] });
    },

    remove(id) {
      const { store } = installation('entryDependencies.remove');
      const owner = all().find((dependency) => dependency.id === id);
      if (!owner) return;
      const kept = (store.get(owner.toId)?.predecessors ?? []).filter((p) => p.id !== id);
      if (kept.length === 0) store.remove(owner.toId);
      else store.set(owner.toId, { predecessors: kept });
    },

    all,

    predecessorsOf(entry) {
      const { store } = installation('entryDependencies.predecessorsOf');
      const toId = entryId(entry);
      return (store.get(toId)?.predecessors ?? []).map((p) => toDependency(toId, p));
    },
  };
}
