// extensions/features/ — the `scheduling()` built-in. It moves Entries so each Dependency holds, and
// it flags the connectors of a cycle. It needs `entryDependencies()` and never changes it. Without
// this plugin, connectors draw and nothing moves. Confined by `extensions-public-only` to `api/`/`model/`
// imports, each from its own narrow file, never the `api/index.ts` barrel that re-exports it.

import type { DataPlugin } from '../../api/gantt.js';
import type { Dataset } from '../../api/dataset.js';
import { mergeEntryEdits, overridingProposed } from '../../api/dataset-plugin.js';
import { schedule } from '../../api/schedule-facade.js';
import type {
  ScheduleConstraint,
  ScheduleDiagnostic,
  ScheduleEntry,
  ScheduleResult,
  SuccessorMoves,
} from '../../api/schedule-facade.js';
import { SchedulingNotInstalledError, entryId } from '../../model/index.js';
import type {
  Disposer,
  EditRequest,
  EntryEdit,
  EntryEdits,
  EntryId,
  FieldKey,
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

/**
 * What a user date does when it breaks a Dependency. `dependencyWins` places the Entry where the
 * Dependency allows and keeps the user date as a "start no earlier than" floor. `userDateWins` keeps the
 * date and a diagnostic marks the broken link.
 */
export type EditedDate = 'dependencyWins' | 'userDateWins';

export interface SchedulingOptions {
  /** How a successor follows its predecessors. Defaults to `pushAndPull`. */
  readonly successorMoves?: SuccessorMoves;
  /** What a user date does when it breaks a Dependency. Defaults to `dependencyWins`. */
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

/** The dates a user proposed on one Entry. */
interface ProposedDates {
  start?: Instant;
  end?: Instant;
}

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
  let pending: readonly ScheduleDiagnostic[] | undefined;
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

  function proposedDates(request: EditRequest): Map<EntryId, ProposedDates> {
    const dates = new Map<EntryId, ProposedDates>();
    for (const [id, proposed] of request.proposed) {
      const touched: ProposedDates = {};
      if (proposed.proposedKeys.has('start') && proposed.start !== undefined) touched.start = proposed.start;
      if (proposed.proposedKeys.has('end') && proposed.end !== undefined) touched.end = proposed.end;
      if (touched.start !== undefined || touched.end !== undefined) dates.set(id, touched);
    }
    return dates;
  }

  function dependencies(): readonly Dependency[] {
    return readDependencies(installed?.dependencyStore());
  }

  /** Which user-dated Entries does a Dependency overrule? Those the engine could not place on the user's start. */
  function overruledByDependency(
    result: ScheduleResult,
    request: EditRequest,
    dates: ReadonlyMap<EntryId, ProposedDates>,
  ): Set<EntryId> {
    const ids = new Set<EntryId>();
    for (const finding of result.diagnostics) {
      if (finding.code !== 'blocked-move' || finding.reason !== 'proposed') continue;
      const proposed = dates.get(finding.entryId);
      if (proposed?.start !== undefined && !isManuallyScheduled(request, finding.entryId))
        ids.add(finding.entryId);
    }
    return ids;
  }

  function runEngine(
    request: EditRequest,
    proposed: ReadonlyMap<EntryId, ProposedDates>,
    constraints: ReadonlyMap<EntryId, EntryConstraint>,
  ): ScheduleResult {
    return schedule({
      entries: scheduleEntries(request),
      dependencies: dependencies(),
      proposed,
      manuallyScheduled: manuallyScheduledIds(request),
      constraints,
      ...(options.successorMoves === undefined ? {} : { successorMoves: options.successorMoves }),
    });
  }

  /** The engine's answer to an edit. A Dependency that overrules a user start reruns it with that start as a floor. */
  function place(
    request: EditRequest,
    store: PluginStore<EntryConstraint>,
  ): { result: ScheduleResult; overruled: ReadonlySet<EntryId>; dates: ReadonlyMap<EntryId, ProposedDates> } {
    const dates = proposedDates(request);
    const first = runEngine(request, dates, store.all);
    const overruled =
      options.editedDate === 'userDateWins'
        ? new Set<EntryId>()
        : overruledByDependency(first, request, dates);
    if (overruled.size === 0) return { result: first, overruled, dates };
    const remaining = new Map([...dates].filter(([id]) => !overruled.has(id)));
    const floors = new Map(store.all);
    for (const id of overruled)
      floors.set(id, { kind: 'startNoEarlierThan', date: dates.get(id)?.start as Instant });
    return { result: runEngine(request, remaining, floors), overruled, dates };
  }

  /** Runs the engine against the edit and answers the cascade, keeping the findings for `change`. */
  function extend(request: EditRequest): EntryEdits {
    const store = installed?.store;
    if (!store || !touchesDates(request)) {
      pending = undefined;
      return new Map();
    }
    const { result, overruled, dates } = place(request, store);
    pending = result.diagnostics;
    const edits = new Map<EntryId, EntryEdit>();
    for (const change of result.patch)
      edits.set(change.id, { ...edits.get(change.id), [change.field]: change.to });
    // The engine placed an overruled Entry where its Dependency allows. The user's own dates sit in the
    // edit, so the placement replaces them, even when the Entry stays where it was.
    for (const id of overruled) {
      const entry = request.entries.get(id);
      const placed = edits.get(id);
      const proposed = dates.get(id);
      const replaced: FieldKey[] = proposed?.end === undefined ? ['start'] : ['start', 'end'];
      edits.set(
        id,
        overridingProposed(replaced, {
          ...placed,
          start: placed?.start ?? entry?.start,
          ...(proposed?.end === undefined ? {} : { end: placed?.end ?? entry?.end }),
        }),
      );
    }
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
        publish((changeSet.origin === 'user' ? pending : undefined) ?? auditCurrentState());
      });
      return () => {
        stopListening();
        installed = undefined;
        handlers.clear();
        latest = [];
        pending = undefined;
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
