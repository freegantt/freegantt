// api/ — one handler over every emitter that raises (S5.12). An `api/` helper beside
// `attemptMutation`, and for the same reason: a common consumer job that needs boilerplate the
// library can write once.
//
// Reports originate in two places and `plans/02` §3 keeps them there — a Dataset raises what a
// Dataset observes, a Gantt raises what a Gantt observes. A consumer wants one subscription. The
// Gantt deliberately does **not** forward the Dataset's reports: two Gantts on one Dataset would
// deliver every Dataset report twice, reports raised during `new Dataset(...)` would be missed, and
// the Gantt would claim authorship of what it did not observe.

import type { Disposer, ErrorReport } from '../model/index.js';

/** What `watchAllErrors` subscribes to. `Dataset` and `Gantt` both satisfy it; so does a test double
 *  with nothing but `on`/`off`. Structural, so this file imports neither class and closes no cycle. */
export interface ErrorFeed {
  on(name: 'error', handler: (report: ErrorReport) => void): void;
  off(name: 'error', handler: (report: ErrorReport) => void): void;
}

/** Call: `const stop = watchAllErrors([dataset, gantt], (report) => toast(report.message))`.
 *
 *  Subscribes `handler` to every feed once — `[dataset, gantt1, gantt2]` sharing one Dataset
 *  subscribes that Dataset a single time, because de-duplication is by emitter identity — and returns
 *  one `Disposer` that unsubscribes all of them. Calling it twice is safe. */
export function watchAllErrors(
  feeds: readonly ErrorFeed[],
  handler: (report: ErrorReport) => void,
): Disposer {
  const subscribed = new Set(feeds);
  for (const feed of subscribed) feed.on('error', handler);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    for (const feed of subscribed) feed.off('error', handler);
  };
}
