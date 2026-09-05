import { describe, expect, it } from 'vitest';
import { watchAllErrors } from './watch-all-errors.js';
import type { ErrorFeed } from './watch-all-errors.js';
import type { Dataset } from './dataset.js';
import type { Gantt } from './gantt.js';
import type { ErrorReport } from '../model/index.js';
import { instant } from '../time/index.js';

/** Records every `on`/`off` call, so "subscribed once" is observable — a `Set` of handlers would
 *  swallow a second subscription of the same function and prove nothing. */
function recordingFeed(): {
  feed: ErrorFeed;
  subscribed: number;
  unsubscribed: number;
  raise(report: ErrorReport): void;
} {
  const handlers: ((report: ErrorReport) => void)[] = [];
  const record = {
    feed: {
      on: (_name: 'error', handler: (report: ErrorReport) => void) => {
        record.subscribed += 1;
        handlers.push(handler);
      },
      off: (_name: 'error', handler: (report: ErrorReport) => void) => {
        record.unsubscribed += 1;
        const at = handlers.indexOf(handler);
        if (at !== -1) handlers.splice(at, 1);
      },
    },
    subscribed: 0,
    unsubscribed: 0,
    raise: (report: ErrorReport) => {
      for (const handler of [...handlers]) handler(report);
    },
  };
  return record;
}

const aReport: ErrorReport = {
  at: instant('2026-01-01T00:00:00Z'),
  code: 'mutation-cancelled',
  message: 'transaction: a beforeChange handler refused this changeset',
  severity: 'info',
  by: 'consumer',
};

describe('watchAllErrors', () => {
  it('gives one handler the reports of every feed', () => {
    const dataset = recordingFeed();
    const gantt = recordingFeed();
    const seen: ErrorReport[] = [];

    watchAllErrors([dataset.feed, gantt.feed], (report) => seen.push(report));
    dataset.raise(aReport);
    gantt.raise(aReport);

    expect(seen).toEqual([aReport, aReport]);
  });

  it('subscribes a feed passed twice exactly once', () => {
    const dataset = recordingFeed();
    const firstGantt = recordingFeed();
    const secondGantt = recordingFeed();
    const seen: ErrorReport[] = [];

    watchAllErrors([dataset.feed, firstGantt.feed, dataset.feed, secondGantt.feed], (report) =>
      seen.push(report),
    );
    dataset.raise(aReport);

    expect(dataset.subscribed).toBe(1);
    expect(seen).toHaveLength(1);
  });

  it('unsubscribes every feed from one disposer', () => {
    const dataset = recordingFeed();
    const gantt = recordingFeed();
    const seen: ErrorReport[] = [];

    const stop = watchAllErrors([dataset.feed, gantt.feed], (report) => seen.push(report));
    stop();
    dataset.raise(aReport);
    gantt.raise(aReport);

    expect(dataset.unsubscribed).toBe(1);
    expect(gantt.unsubscribed).toBe(1);
    expect(seen).toEqual([]);
  });

  it('ignores a second call to its disposer', () => {
    const dataset = recordingFeed();
    const stop = watchAllErrors([dataset.feed], () => {});
    stop();
    stop();

    expect(dataset.unsubscribed).toBe(1);
  });

  it('accepts a Dataset and a Gantt', () => {
    // Compile-time only: both public classes satisfy `ErrorFeed`, which is the whole point of the
    // structural type. Constructing a Gantt needs a DOM, and this suite runs in plain Node.
    const feeds: readonly ErrorFeed[] = [] as readonly (Dataset | Gantt)[];
    expect(feeds).toEqual([]);
  });
});
