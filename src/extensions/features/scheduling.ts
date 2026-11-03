// extensions/features/ — the `scheduling()` built-in. It moves Entries so each Dependency holds, and
// it flags the connectors of a cycle. It needs `entryDependencies()` and never changes it. Without
// this plugin, connectors draw and nothing moves. Confined by `extensions-public-only` to `api/`/`model/`
// imports, each from its own narrow file, never the `api/index.ts` barrel that re-exports it.

import type { DataPlugin } from '../../api/gantt.js';
import type { Dataset } from '../../api/dataset.js';
import { mergeEntryEdits, overridingProposed } from '../../api/dataset-plugin.js';
import { findDrivingPath, schedule } from '../../api/schedule-facade.js';
import type {
  FloatRequest,
  ScheduleCalendar,
  ScheduleConstraint,
  ScheduleDiagnostic,
  ScheduleEntry,
  ScheduleResult,
  SuccessorMoves,
  WorkingCalendar,
} from '../../api/schedule-facade.js';
import { SchedulingNotInstalledError, entryId } from '../../model/index.js';
import type {
  Disposer,
  EditRequest,
  EntryEdit,
  EntryEdits,
  EntryId,
  FieldKey,
  Entry,
  Instant,
  PluginStore,
  StoreRowUpdated,
  StoreRowWrite,
} from '../../model/index.js';
import {
  ENTRY_DEPENDENCIES_ID,
  edgesOf,
  readDependencies,
  successorsOfAddedDependencies,
  writesDependencies,
} from './entry-dependencies.js';
import type { Dependency, DependencyStoreView } from './entry-dependencies.js';
import { CRITICAL_FIELD, FLOAT_FIELD, floatFields, floatWrites } from './scheduling-float.js';
import type { HeldFloat } from './scheduling-float.js';

/** The plugin id other plugins name in `requires`. */
export const SCHEDULING_ID = 'freegantt.scheduling';

/**
 * A date rule on one Entry: "start no earlier than", "finish no later than" or "must start on" a date.
 * An Entry holds one. The order of rules is: manually scheduled, must start on, Dependency, start no earlier than.
 */
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
  /**
   * The working calendar of every Entry. Pass the object that `timeShading()` shades from, so the shading
   * and the schedule agree. A lag counts workdays and a moved Entry keeps its length in workdays.
   * Omit it and a day is 24 hours.
   */
  readonly calendar?: WorkingCalendar;
  /** Named calendars, for Entries that follow a calendar other than `calendar`. */
  readonly calendars?: Readonly<Record<string, WorkingCalendar>>;
  /**
   * The key of a consumer Field whose value names a calendar in `calendars`. An Entry with no value, or
   * a name `calendars` lacks, uses `calendar`, then 24-hour days.
   * A lag counts in the calendar of its successor, the default of Primavera P6.
   */
  readonly calendarField?: string;
}

/** What `scheduleDiagnostics` handlers receive: every finding of the latest commit. */
export type ScheduleDiagnosticsHandler = (diagnostics: readonly ScheduleDiagnostic[]) => void;

/** What `scheduling()` returns: the plugin, and the calls a consumer reads its state with. */
export interface Scheduling extends DataPlugin {
  /** The constraint of one Entry, or `undefined` when it has none. */
  constraintOf(entry: EntryId | string): EntryConstraint | undefined;
  /**
   * Sets the constraint of one Entry and moves the Entry and its successors to meet it, in one undo step.
   * A "finish no later than" date moves nothing: when the Entry finishes later, `diagnostics()` names it.
   */
  setConstraint(entry: EntryId | string, constraint: EntryConstraint): void;
  /** Removes the constraint of one Entry. One undo step covers it. An Entry with none changes nothing. */
  clearConstraint(entry: EntryId | string): void;
  /**
   * The Entry ids, in order, of the chain of predecessors that sets this Entry's position. The Entry comes
   * last. At each step the predecessor is the one whose Dependency holds the successor with no slack.
   * An Entry that no Dependency holds gives itself alone. A loop member or an unknown Entry gives `[]`.
   */
  drivingPath(entry: EntryId | string): readonly EntryId[];
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
  // True from the start of `setConstraint` until its commit ends. The row writer and the extender run at
  // commit, so the flag must outlive the transaction body. The moves need no second engine run, and they
  // leave no floor rows.
  let applyingConstraint = false;
  let refreshQueued = false;

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

  /** The calendars one run counts days with, or `undefined` when the options name none. */
  function scheduleCalendar(
    dataset: Dataset,
    calendarNames: Iterable<readonly [EntryId, unknown]>,
  ): ScheduleCalendar | undefined {
    const { calendar, calendars, calendarField } = options;
    if (!calendar && !calendars) return undefined;
    const ofEntry = new Map<EntryId, WorkingCalendar>();
    if (calendars && calendarField !== undefined) {
      for (const [id, name] of calendarNames) {
        const named =
          typeof name === 'string' && Object.hasOwn(calendars, name) ? calendars[name] : undefined;
        if (named) ofEntry.set(id, named);
      }
    }
    return { time: dataset.time, ...(calendar ? { calendar } : {}), ofEntry };
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

  /** Does the Entry hold a date the user set on purpose, so that an edit must not replace it? */
  function holdsHardConstraint(id: EntryId): boolean {
    const kind = installed?.store.get(id)?.kind;
    return kind === 'mustStartOn' || kind === 'finishNoLaterThan';
  }

  /**
   * Every user start becomes the "start no earlier than" row of its Entry. A cleared start clears the row.
   * An Entry with a "must start on" or "finish no later than" row keeps it, so a drag cannot erase it unseen.
   */
  function constraintRowsFor(request: EditRequest): readonly StoreRowWrite<EntryConstraint>[] {
    if (applyingConstraint) return [];
    return [...startProposals(request)]
      .filter(([id]) => !holdsHardConstraint(id))
      .map(([id, start]) => ({
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
      ...calendarOption(request),
      ...(options.successorMoves === undefined ? {} : { successorMoves: options.successorMoves }),
    });
  }

  function calendarOption(request: EditRequest): { calendar?: ScheduleCalendar } {
    const dataset = installed?.dataset;
    if (!dataset) return {};
    const key = options.calendarField;
    const names = [...request.entries.values()].map((entry) => [entry.id, key && entry.props[key]] as const);
    const calendar = scheduleCalendar(dataset, names);
    return calendar ? { calendar } : {};
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
    for (const id of overruled) {
      if (holdsHardConstraint(id)) continue;
      floors.set(id, { kind: 'startNoEarlierThan', date: dates.get(id)?.start as Instant });
    }
    return { result: runEngine(request, remaining, floors), overruled, dates };
  }

  /** Runs the engine against the edit and answers the cascade, keeping the findings for `change`. */
  function extend(request: EditRequest): EntryEdits {
    const store = installed?.store;
    if (!store || applyingConstraint) {
      pending = undefined;
      return new Map();
    }
    if (!touchesDates(request)) return extendForDependencyWrite(request);
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
    return mergeEntryEdits(edits, floatEdits(request, edits));
  }

  /**
   * Answers a write to the Dependency store. Each successor of an added or changed Dependency moves later
   * when it starts too early, with its followers. A removed Dependency moves nobody. Float follows in the
   * same edit, so one undo restores the link, the moves and the float.
   */
  function extendForDependencyWrite(request: EditRequest): EntryEdits {
    if (!writesDependencies(request.changedStoreRows)) {
      pending = undefined;
      return new Map();
    }
    const result = schedule({
      entries: scheduleEntries(request),
      dependencies: dependencies(),
      manuallyScheduled: manuallyScheduledIds(request),
      constraints: installed?.store.all ?? new Map(),
      ...calendarOption(request),
      successorMoves: 'pushOnly',
    });
    pending = result.diagnostics;
    const followers = followersOf(successorsOfAddedDependencies(request.changedStoreRows));
    const edits = new Map<EntryId, EntryEdit>();
    for (const change of result.patch)
      if (followers.has(change.id))
        edits.set(change.id, { ...edits.get(change.id), [change.field]: change.to });
    return mergeEntryEdits(edits, floatEdits(request, edits));
  }

  /**
   * Moves the followers of Dependencies a sync change set added, when they start too early. A sync write
   * carries no extension hook and no undo step, so the moves land in a sync change set of their own.
   */
  function pushAfterSync(rows: readonly StoreRowUpdated[]): void {
    const current = installed;
    const successors = successorsOfAddedDependencies(rows);
    if (!current || successors.size === 0) return;
    const entries = current.dataset.entries.all;
    const { patch } = schedule({
      entries,
      dependencies: dependencies(),
      manuallyScheduled: new Set(
        entries.filter((entry) => entry.read(MANUALLY_SCHEDULED) === true).map((entry) => entry.id),
      ),
      constraints: current.store.all,
      ...auditCalendarOption(current.dataset, entries),
      successorMoves: 'pushOnly',
    });
    const followers = followersOf(successors);
    const moves = new Map<EntryId, { start?: Instant; end?: Instant }>();
    for (const change of patch)
      if (followers.has(change.id))
        moves.set(change.id, { ...moves.get(change.id), [change.field]: change.to });
    if (moves.size === 0) return;
    current.dataset.entries.syncChanges({ upsert: [...moves].map(([id, move]) => ({ id, ...move })) });
  }

  /** The analysis input for the Entries as they stand in the store. */
  function floatRequest(entries: readonly Entry[], dataset: Dataset): FloatRequest {
    return { entries, dependencies: dependencies(), ...auditCalendarOption(dataset, entries) };
  }

  /** Writes `float` and `critical` into the edit, so one undo restores them with the dates. */
  function floatEdits(request: EditRequest, moved: ReadonlyMap<EntryId, EntryEdit>): EntryEdits {
    const ids = [...request.entries.keys(), ...request.addedEntryIds].filter(
      (id) => !request.removedEntryIds.has(id),
    );
    const entries: ScheduleEntry[] = [];
    for (const id of ids) {
      const entry = request.entryAfterEdits(id);
      if (!entry) continue;
      const edit = moved.get(id);
      const time = installed?.dataset.time;
      entries.push({
        id,
        start: edit?.start !== undefined && time ? time.toInstant(edit.start) : entry.start,
        end: edit?.end !== undefined && time ? time.toInstant(edit.end) : entry.end,
        hasChildren: request.hasChildren(id),
      });
    }
    const writes = floatWrites(
      { entries, dependencies: dependencies(), ...calendarOption(request) },
      entries.map((entry) => entry.id),
      (id) => request.entryAfterEdits(id)?.props ?? {},
    );
    return new Map([...writes].map(([id, write]) => [id, { ...write }]));
  }

  /**
   * Brings `float` and `critical` up to date after a change that ran no edit: a load, a replaced
   * Dependency set, an undo. It writes one sync change set, so it adds no undo step.
   */
  function refreshFloat(): void {
    if (!installed) return;
    const { dataset } = installed;
    const entries = dataset.entries.all;
    const held = new Map(entries.map((entry) => [entry.id, entry]));
    const writes = floatWrites(floatRequest(entries, dataset), held.keys(), (id): HeldFloat => {
      const entry = held.get(id);
      return { float: entry?.read(FLOAT_FIELD), critical: entry?.read(CRITICAL_FIELD) };
    });
    if (writes.size === 0) return;
    dataset.entries.syncChanges({ upsert: [...writes].map(([id, write]) => ({ id, ...write })) });
  }

  /** Runs `refreshFloat` once after the current change settles. Many changes in one turn share one run. */
  function queueFloatRefresh(): void {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refreshFloat();
    });
  }

  /** Runs `pushAfterSync` once after the current change settles, then refreshes float over the moves. */
  function queuePushAfterSync(rows: readonly StoreRowUpdated[]): void {
    queueMicrotask(() => {
      pushAfterSync(rows);
      queueFloatRefresh();
    });
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
      ...auditCalendarOption(installed.dataset, entries),
      ...(options.successorMoves === undefined ? {} : { successorMoves: options.successorMoves }),
    }).diagnostics;
  }

  function auditCalendarOption(
    dataset: Dataset,
    entries: readonly { readonly id: EntryId; read(key: string): unknown }[],
  ): { calendar?: ScheduleCalendar } {
    const key = options.calendarField;
    const calendar = scheduleCalendar(
      dataset,
      entries.map((entry) => [entry.id, key && entry.read(key)] as const),
    );
    return calendar ? { calendar } : {};
  }

  /** Every Entry that follows one of `ids` through a Dependency, the `ids` included. */
  function followersOf(ids: Iterable<EntryId>): Set<EntryId> {
    const followers = new Set<EntryId>(ids);
    const successors = new Map<EntryId, EntryId[]>();
    for (const { fromId, toId } of dependencies()) {
      const list = successors.get(fromId) ?? [];
      list.push(toId);
      successors.set(fromId, list);
    }
    const waiting = [...followers];
    for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
      for (const successor of successors.get(next) ?? []) {
        if (followers.has(successor)) continue;
        followers.add(successor);
        waiting.push(successor);
      }
    }
    return followers;
  }

  /**
   * Writes the moves a new constraint causes: the Entry and its followers, and only when the Entry itself moves.
   * A ceiling moves nothing. A start floor only pushes later, so slack elsewhere in the plan stays as it is.
   */
  function moveToConstraint(current: Installation, id: EntryId, constraint: EntryConstraint): void {
    if (constraint.kind === 'finishNoLaterThan') return;
    const entries = current.dataset.entries.all;
    const successorMoves = constraint.kind === 'startNoEarlierThan' ? 'pushOnly' : options.successorMoves;
    const { patch } = schedule({
      entries,
      dependencies: dependencies(),
      manuallyScheduled: new Set(
        entries.filter((entry) => entry.read(MANUALLY_SCHEDULED) === true).map((entry) => entry.id),
      ),
      constraints: current.store.all,
      ...auditCalendarOption(current.dataset, entries),
      ...(successorMoves === undefined ? {} : { successorMoves }),
    });
    if (!patch.some((change) => change.id === id)) return;
    const followers = followersOf([id]);
    const edits = new Map<EntryId, { start?: Instant; end?: Instant }>();
    for (const change of patch)
      if (followers.has(change.id))
        edits.set(change.id, { ...edits.get(change.id), [change.field]: change.to });
    for (const [entry, edit] of edits) current.dataset.entries.update(entry, edit);
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
      ...floatFields(),
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
        const fromEdit = changeSet.origin === 'user' ? pending : undefined;
        pending = undefined;
        publish(fromEdit ?? auditCurrentState());
        queueFloatRefresh();
        // A replaced Dependency set is a sync write: no hook ran, so the moves follow in a sync write too.
        if (changeSet.origin === 'sync') {
          queuePushAfterSync(
            changeSet.updated.filter((row): row is StoreRowUpdated => row.store !== 'entries'),
          );
        }
      });
      // What do the first rows hold? The float of the Dataset as it was built.
      queueFloatRefresh();
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

    setConstraint(entry, constraint) {
      const current = installation('scheduling.setConstraint');
      const id = entryId(entry);
      applyingConstraint = true;
      try {
        current.dataset.transaction(() => {
          current.store.set(id, constraint);
          moveToConstraint(current, id, constraint);
        });
      } finally {
        applyingConstraint = false;
      }
    },

    clearConstraint(entry) {
      installation('scheduling.clearConstraint').store.remove(entryId(entry));
    },

    drivingPath(entry) {
      const { dataset } = installation('scheduling.drivingPath');
      const entries = dataset.entries.all;
      return findDrivingPath(floatRequest(entries, dataset), entry);
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
