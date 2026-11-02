// extensions/features/ — the `scheduling()` built-in. It moves Entries so each Dependency holds, and
// it flags the connectors of a cycle. It needs `entryDependencies()` and never changes it. Without
// this plugin, connectors draw and nothing moves. Confined by `extensions-public-only` to `api/`/`model/`
// imports, each from its own narrow file, never the `api/index.ts` barrel that re-exports it.

import type { DataPlugin } from '../../api/gantt.js';
import type { Dataset } from '../../api/dataset.js';
import { mergeEntryEdits } from '../../api/dataset-plugin.js';
import { schedule } from '../../api/schedule-facade.js';
import type {
  ScheduleConstraint,
  ScheduleDiagnostic,
  ScheduleEntry,
  SuccessorMoves,
} from '../../api/schedule-facade.js';
import { SchedulingNotInstalledError, entryId } from '../../model/index.js';
import type {
  Disposer,
  EditRequest,
  EntryEdit,
  EntryEdits,
  EntryId,
  Instant,
  PluginStore,
  StoreRowWrite,
} from '../../model/index.js';
import { ENTRY_DEPENDENCIES_ID, edgesOf, readDependencies } from './entry-dependencies.js';
import type { Dependency, DependencyStoreView } from './entry-dependencies.js';

/** The plugin id other plugins name in `requires`. */
export const SCHEDULING_ID = 'freegantt.scheduling';

/** A date rule on one Entry. Today: "start no earlier than" a date. */
export type EntryConstraint = ScheduleConstraint;

/** What a user date does when it breaks a Dependency. Only `userDateWins` exists today: the date stays and a diagnostic marks the link. */
export type EditedDate = 'userDateWins';

export interface SchedulingOptions {
  /** How a successor follows its predecessors. Defaults to `pushAndPull`. */
  readonly successorMoves?: SuccessorMoves;
  /** What a user date does when it breaks a Dependency. Defaults to `userDateWins`. */
  readonly editedDate?: EditedDate;
}

/** What `scheduleDiagnostics` handlers receive: every finding of the latest commit. */
export type ScheduleDiagnosticsHandler = (diagnostics: readonly ScheduleDiagnostic[]) => void;

/** What `scheduling()` returns: the plugin, and the calls a consumer reads its state with. */
export interface Scheduling extends DataPlugin {
  /** The constraint of one Entry, or `undefined` when it has none. */
  constraintOf(entry: EntryId | string): EntryConstraint | undefined;
  /** Removes the constraint of one Entry. One undo step covers it. An Entry with none changes nothing. */
  clearConstraint(entry: EntryId | string): void;
  /** The findings of the latest commit: cycles, blocked moves, Dependencies the engine cannot read. */
  diagnostics(): readonly ScheduleDiagnostic[];
  /** Calls `handler` after a commit changes the findings. Returns the call that removes the handler. */
  on(name: 'scheduleDiagnostics', handler: ScheduleDiagnosticsHandler): Disposer;
}

/** The plugin declares this Field, so a grid column binds to it with no glue. */
const MANUALLY_SCHEDULED = 'manuallyScheduled';

interface Installation {
  readonly dataset: Dataset;
  readonly store: PluginStore<EntryConstraint>;
  readonly dependencyStore: () => DependencyStoreView | undefined;
}

function sameFindings(a: readonly ScheduleDiagnostic[], b: readonly ScheduleDiagnostic[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

/** A plugin that keeps Dependencies true. Call: `new Dataset({ entries, plugins: [entryDependencies(), scheduling()] })`. */
export function scheduling(options: SchedulingOptions = {}): Scheduling {
  let installed: Installation | undefined;
  let latest: readonly ScheduleDiagnostic[] = [];
  // The findings of the last edit the extender computed. A drag preview overwrites it every frame,
  // and the next commit overwrites it again before `change` reads it.
  let pending: readonly ScheduleDiagnostic[] = [];
  const handlers = new Set<ScheduleDiagnosticsHandler>();

  function installation(operation: string): Installation {
    if (!installed) throw new SchedulingNotInstalledError(operation);
    return installed;
  }

  function publish(diagnostics: readonly ScheduleDiagnostic[]): void {
    if (sameFindings(latest, diagnostics)) return;
    latest = diagnostics;
    for (const handler of [...handlers]) handler(latest);
  }

  /** Is the Entry manually scheduled, counting what this edit sets? */
  function isManuallyScheduled(request: EditRequest, id: EntryId): boolean {
    const proposed = request.proposed.get(id);
    if (proposed?.proposedKeys.has(MANUALLY_SCHEDULED)) return proposed.props[MANUALLY_SCHEDULED] === true;
    return request.entries.get(id)?.props[MANUALLY_SCHEDULED] === true;
  }

  function manuallyScheduledIds(request: EditRequest): Set<EntryId> {
    const ids = new Set<EntryId>();
    for (const id of request.entries.keys()) if (isManuallyScheduled(request, id)) ids.add(id);
    return ids;
  }

  function scheduleEntries(request: EditRequest): ScheduleEntry[] {
    return [...request.entries.values()].map((entry) => ({
      id: entry.id,
      start: entry.start,
      end: entry.end,
      hasChildren: request.hasChildren(entry.id),
    }));
  }

  /** Which Entries did the user give a new start? A moved bar, a resize from the start and a grid edit all do. */
  function startProposals(request: EditRequest): Map<EntryId, Instant | undefined> {
    const starts = new Map<EntryId, Instant | undefined>();
    for (const [id, proposed] of request.proposed) {
      if (proposed.proposedKeys.has('start') && !isManuallyScheduled(request, id))
        starts.set(id, proposed.start);
    }
    return starts;
  }

  /** Every user start becomes the "start no earlier than" row of its Entry. A cleared start clears the row. */
  function constraintRowsFor(request: EditRequest): readonly StoreRowWrite<EntryConstraint>[] {
    return [...startProposals(request)].map(([id, start]) => ({
      id,
      row: start === undefined ? undefined : { kind: 'startNoEarlierThan', date: start },
    }));
  }

  function touchesDates(request: EditRequest): boolean {
    return [...request.proposed.values()].some(
      (proposed) => proposed.proposedKeys.has('start') || proposed.proposedKeys.has('end'),
    );
  }

  function proposedDates(request: EditRequest): Map<EntryId, { start?: Instant; end?: Instant }> {
    const dates = new Map<EntryId, { start?: Instant; end?: Instant }>();
    for (const [id, proposed] of request.proposed) {
      const touched: { start?: Instant; end?: Instant } = {};
      if (proposed.proposedKeys.has('start') && proposed.start !== undefined) touched.start = proposed.start;
      if (proposed.proposedKeys.has('end') && proposed.end !== undefined) touched.end = proposed.end;
      if (touched.start !== undefined || touched.end !== undefined) dates.set(id, touched);
    }
    return dates;
  }

  function dependencies(): readonly Dependency[] {
    return readDependencies(installed?.dependencyStore());
  }

  /** Runs the engine against the edit and answers the cascade, keeping the findings for `change`. */
  function extend(request: EditRequest): EntryEdits {
    const store = installed?.store;
    if (!store || !touchesDates(request)) {
      pending = [];
      return new Map();
    }
    const result = schedule({
      entries: scheduleEntries(request),
      dependencies: dependencies(),
      proposed: proposedDates(request),
      manuallyScheduled: manuallyScheduledIds(request),
      constraints: store.all,
      ...(options.successorMoves === undefined ? {} : { successorMoves: options.successorMoves }),
    });
    pending = result.diagnostics;
    const edits = new Map<EntryId, EntryEdit>();
    for (const change of result.patch)
      edits.set(change.id, { ...edits.get(change.id), [change.field]: change.to });
    return edits;
  }

  /** The findings of a state nobody edited: an undo, a load or a replaced Dependency set. */
  function auditCurrentState(): readonly ScheduleDiagnostic[] {
    if (!installed) return [];
    const entries = installed.dataset.entries.all;
    return schedule({
      entries,
      dependencies: dependencies(),
      manuallyScheduled: new Set(
        entries.filter((entry) => entry.read(MANUALLY_SCHEDULED) === true).map((entry) => entry.id),
      ),
      constraints: installed.store.all,
      ...(options.successorMoves === undefined ? {} : { successorMoves: options.successorMoves }),
    }).diagnostics;
  }

  return {
    id: SCHEDULING_ID,
    requires: [ENTRY_DEPENDENCIES_ID],
    fields: [
      {
        key: MANUALLY_SCHEDULED,
        type: 'boolean',
        inputType: 'checkbox',
        editable: 'anywhere',
        column: { header: 'Manual', align: 'center', width: 80 },
      },
    ],

    data(ctx) {
      const store = ctx.store.reserve<EntryConstraint>();
      installed = {
        dataset: ctx.dataset,
        store,
        dependencyStore: () => ctx.store.read(ENTRY_DEPENDENCIES_ID),
      };
      // What does an edit leave behind? A row per user start: the floor a later move respects.
      ctx.edits.writeRowsWithEdit(constraintRowsFor);
      // What moves with an edit? Each successor the Dependencies and constraints push or pull.
      ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), extend(request)));
      // When do the findings change? After each commit, from the edit that made it.
      const stopListening = ctx.events.on('change', ({ changeSet }) => {
        publish(changeSet.origin === 'user' ? pending : auditCurrentState());
      });
      return () => {
        stopListening();
        installed = undefined;
        handlers.clear();
        latest = [];
        pending = [];
      };
    },

    view(ctx) {
      // Which connectors sit in a cycle? Those that join two members of one loop. Same id as the
      // line `entryDependencies()` draws, with the flag only.
      ctx.view.registerConnector(() => {
        const loops = latest.flatMap((finding) =>
          finding.code === 'cycle' ? [new Set(finding.entryIds)] : [],
        );
        if (loops.length === 0) return [];
        return dependencies()
          .filter((dependency) =>
            loops.some((loop) => loop.has(dependency.fromId) && loop.has(dependency.toId)),
          )
          .map((dependency) => {
            const [fromEdge, toEdge] = edgesOf(dependency.type);
            return {
              id: `dependency:${dependency.id}`,
              from: { entryId: dependency.fromId, edge: fromEdge },
              to: { entryId: dependency.toId, edge: toEdge },
              flags: { cycle: true },
            };
          });
      });
    },

    constraintOf(entry) {
      return installation('scheduling.constraintOf').store.get(entryId(entry));
    },

    clearConstraint(entry) {
      installation('scheduling.clearConstraint').store.remove(entryId(entry));
    },

    diagnostics() {
      return latest;
    },

    on(_name, handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
