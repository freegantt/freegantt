// data/ — where an Error report is stamped and raised (S5.12, D-S5-35/36, ADR 0009). One file,
// because `at` comes from `time/`'s `now()` and `data/` is the lowest layer allowed to reach `time/`
// (I10 forbids reading a clock anywhere else). `view/` and `api/` import this directly; `render/` and
// `extensions/` may not reach `data/` at all, so they take a `RaiseError` by injection instead.

import type { ErrorReport, ErrorReportInput, RaiseError } from '../model/index.js';
import { now } from '../time/index.js';

/** The two members raising needs of an event bus, and nothing else. `EventBus<DatasetEventMap>` and
 *  `EventBus<GanttEventMap, AsyncCancelableEvent>` both satisfy it, which is what lets one raiser
 *  serve the Dataset feed and the Gantt feed without this file naming either event map. */
export interface ErrorBus {
  emit(name: 'error', report: ErrorReport): unknown;
  hasHandler(name: 'error'): boolean;
}

/** Raises one report on `bus`. `fallback` runs only when nothing is subscribed (D-S5-36) — the
 *  site's own `console` line, unchanged, so an unsubscribed consumer sees what they always saw. */
export function raiseErrorOn(bus: ErrorBus, report: ErrorReportInput, fallback?: () => void): void {
  if (!bus.hasHandler('error')) {
    fallback?.();
    return;
  }
  bus.emit('error', { at: now(), ...report });
}

/** The `RaiseError` for one bus, for a collaborator that cannot reach the bus itself — `render/dom`'s
 *  backend options, `PluginRuntime`'s constructor, `PluginContext.raiseError`. */
export function createErrorRaiser(bus: ErrorBus): RaiseError {
  return (report, fallback) => {
    raiseErrorOn(bus, report, fallback);
  };
}
