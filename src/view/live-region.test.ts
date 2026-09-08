import { describe, expect, it } from 'vitest';
import { LiveRegion } from './live-region.js';
import type { LiveRegionFeed } from './live-region.js';
import type { ErrorReport } from '../model/index.js';

/** A minimal `LiveRegionFeed`: one `error` subscriber, and a `fire()` this test drives directly —
 *  the same structural-fake shape `plugin-ports.test.ts` builds for other Gantt-shaped ports. */
function fakeFeed(): {
  feed: LiveRegionFeed;
  fire: (report: ErrorReport) => void;
  listenerCount: () => number;
} {
  const handlers = new Set<(report: ErrorReport) => void>();
  return {
    feed: {
      on: (_name, handler) => {
        handlers.add(handler);
      },
      off: (_name, handler) => {
        handlers.delete(handler);
      },
    },
    fire: (report) => {
      for (const handler of handlers) handler(report);
    },
    listenerCount: () => handlers.size,
  };
}

function report(overrides: Partial<ErrorReport> = {}): ErrorReport {
  return {
    at: 0,
    code: 'test-code',
    message: 'Something happened.',
    severity: 'info',
    by: 'test',
    ...overrides,
  } as ErrorReport;
}

describe('LiveRegion (S5.11, D-S5-25/D-S5-26)', () => {
  it('mounts one visually-hidden, polite node at construction', () => {
    const container = document.createElement('div');
    const { feed } = fakeFeed();
    new LiveRegion(container, feed);

    const node = container.querySelector('.fg-live-region')!;
    expect(node).not.toBeNull();
    expect(node.getAttribute('aria-live')).toBe('polite');
    expect(node.getAttribute('role')).toBe('status');
  });

  it('attach() subscribes, and an info/error report reaches the node as text', () => {
    const container = document.createElement('div');
    const { feed, fire } = fakeFeed();
    const region = new LiveRegion(container, feed);
    region.attach();

    fire(report({ severity: 'info', message: 'Cost is not editable here.' }));
    expect(container.querySelector('.fg-live-region')!.textContent).toBe('Cost is not editable here.');

    fire(report({ severity: 'error', message: 'Something broke.' }));
    expect(container.querySelector('.fg-live-region')!.textContent).toBe('Something broke.');
  });

  it('a warning report never reaches the node (the library already recovered on its own)', () => {
    const container = document.createElement('div');
    const { feed, fire } = fakeFeed();
    const region = new LiveRegion(container, feed);
    region.attach();

    fire(report({ severity: 'warning', message: 'Should never be read.' }));
    expect(container.querySelector('.fg-live-region')!.textContent).toBe('');
  });

  it('a second attach() does not subscribe the handler twice', () => {
    const container = document.createElement('div');
    const { feed, fire, listenerCount } = fakeFeed();
    const region = new LiveRegion(container, feed);

    region.attach();
    region.attach();
    expect(listenerCount()).toBe(1);

    fire(report({ message: 'Once.' }));
    expect(container.querySelector('.fg-live-region')!.textContent).toBe('Once.');
  });

  it('detach() unsubscribes and removes the node; a second detach() is safe', () => {
    const container = document.createElement('div');
    const { feed, fire, listenerCount } = fakeFeed();
    const region = new LiveRegion(container, feed);
    region.attach();

    region.detach();
    expect(listenerCount()).toBe(0);
    expect(container.querySelector('.fg-live-region')).toBeNull();

    // A report fired after detach reaches nobody — there is no node left to write into anyway.
    fire(report());

    region.detach();
  });

  it('detach() on a LiveRegion that was never attached still removes the node', () => {
    const container = document.createElement('div');
    const { feed } = fakeFeed();
    const region = new LiveRegion(container, feed);

    region.detach();
    expect(container.querySelector('.fg-live-region')).toBeNull();
  });
});
