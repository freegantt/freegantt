import { describe, expect, it } from 'vitest';
import { ConnectHandlers, proposeConnect } from './connect-proposal.js';
import type { ConnectProposalPorts } from './connect-proposal.js';
import type { ConnectEnds } from './event-bus.js';
import { entryId } from '../model/index.js';

const ENDS: ConnectEnds = {
  from: { entryId: entryId('a'), edge: 'end' },
  to: { entryId: entryId('b'), edge: 'start' },
};

function setup(before: () => boolean | Promise<boolean> = () => true) {
  const log: string[] = [];
  const failures: unknown[] = [];
  const handlers: ((ends: ConnectEnds) => void)[] = [];
  const ports: ConnectProposalPorts = {
    emitBefore: () => {
      log.push('beforeConnect');
      return before();
    },
    emitAfter: () => {
      log.push('connect');
    },
    handlers: () => handlers,
    reportHandlerFailure: (error) => failures.push(error),
  };
  return { log, failures, handlers, ports };
}

describe('proposeConnect — event order', () => {
  it('runs beforeConnect, then each handler, then connect', () => {
    const { log, handlers, ports } = setup();
    handlers.push(
      () => log.push('handler 1'),
      () => log.push('handler 2'),
    );

    expect(proposeConnect(ENDS, ports, new AbortController().signal)).toBe(true);

    expect(log).toEqual(['beforeConnect', 'handler 1', 'handler 2', 'connect']);
  });

  it('hands each handler the two ends', () => {
    const { handlers, ports } = setup();
    const seen: ConnectEnds[] = [];
    handlers.push((ends) => seen.push(ends));

    expect(proposeConnect(ENDS, ports, new AbortController().signal)).toBe(true);

    expect(seen).toEqual([ENDS]);
  });

  it('a sync veto runs no handler and fires no connect', () => {
    const { log, handlers, ports } = setup(() => false);
    handlers.push(() => log.push('handler'));

    expect(proposeConnect(ENDS, ports, new AbortController().signal)).toBe(false);

    expect(log).toEqual(['beforeConnect']);
  });

  it('an async veto holds the handlers until it settles true', async () => {
    let settle: (allowed: boolean) => void = () => {};
    const { log, handlers, ports } = setup(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
        }),
    );
    handlers.push(() => log.push('handler'));

    const answer = proposeConnect(ENDS, ports, new AbortController().signal);
    expect(log).toEqual(['beforeConnect']);

    settle(true);
    expect(await answer).toBe(true);
    expect(log).toEqual(['beforeConnect', 'handler', 'connect']);
  });

  it('an async veto that settles false runs nothing', async () => {
    const { log, handlers, ports } = setup(() => Promise.resolve(false));
    handlers.push(() => log.push('handler'));

    expect(await proposeConnect(ENDS, ports, new AbortController().signal)).toBe(false);

    expect(log).toEqual(['beforeConnect']);
  });

  it('an aborted hold runs nothing even when the veto settles true later', async () => {
    let settle: (allowed: boolean) => void = () => {};
    const { log, handlers, ports } = setup(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
        }),
    );
    handlers.push(() => log.push('handler'));
    const abort = new AbortController();

    const answer = proposeConnect(ENDS, ports, abort.signal);
    abort.abort();
    settle(true);

    expect(await answer).toBe(false);
    expect(log).toEqual(['beforeConnect']);
  });

  it('a handler that throws is reported, and the others and connect still run', () => {
    const { log, failures, handlers, ports } = setup();
    const boom = new Error('boom');
    handlers.push(
      () => {
        throw boom;
      },
      () => log.push('handler 2'),
    );

    expect(proposeConnect(ENDS, ports, new AbortController().signal)).toBe(true);

    expect(failures).toEqual([boom]);
    expect(log).toEqual(['beforeConnect', 'handler 2', 'connect']);
  });
});

describe('ConnectHandlers', () => {
  it('reports any handler only while one is registered', () => {
    let changes = 0;
    const handlers = new ConnectHandlers(() => {
      changes += 1;
    });
    expect(handlers.any).toBe(false);

    const dispose = handlers.register(() => {});
    expect(handlers.any).toBe(true);
    dispose();
    dispose();

    expect(handlers.any).toBe(false);
    expect(changes).toBe(2);
  });

  it('one function registered twice disposes one registration at a time', () => {
    const handlers = new ConnectHandlers(() => {});
    const handler = (): void => {};

    const first = handlers.register(handler);
    handlers.register(handler);
    first();

    expect(handlers.list()).toHaveLength(1);
  });
});
