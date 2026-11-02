// view/ — what happens after a user drops a connect drag on a bar edge: `beforeConnect` may veto,
// then every connect handler a plugin registered runs, then `connect` fires. Core knows no meaning
// for the pair of edges. The handlers own it (ADR 0041).
//
// A separate file from `gantt-shell.ts` so the order is testable with no mounted Gantt.

import type { Disposer } from '../model/index.js';
import type { ConnectEnds } from './event-bus.js';

/** What a plugin registers with `ctx.view.onConnect`. It writes the plugin's own data. */
export type ConnectHandler = (ends: ConnectEnds) => void;

/** What `proposeConnect` borrows from the shell. */
export interface ConnectProposalPorts {
  /** Fires one event. A `beforeConnect` answer is `false` for a veto, or a Promise of one. */
  emitBefore(ends: ConnectEnds): boolean | Promise<boolean>;
  emitAfter(ends: ConnectEnds): void;
  /** The connect handlers, in registration order. */
  handlers(): readonly ConnectHandler[];
  /** A handler threw. The remaining handlers still run. */
  reportHandlerFailure(error: unknown): void;
}

/** Runs `beforeConnect` → handlers → `connect`. Answers `true` when the handlers ran.
 *
 *  A `beforeConnect` handler may answer with a Promise. This then answers with a Promise too, and
 *  it settles after the veto does. An aborted `signal` ends the wait with `false`: nothing runs
 *  even when the veto settles `true` later. Escape during the hold aborts it. */
export function proposeConnect(
  ends: ConnectEnds,
  ports: ConnectProposalPorts,
  signal: AbortSignal,
): boolean | Promise<boolean> {
  const verdict = ports.emitBefore(ends);
  if (typeof verdict === 'boolean') return verdict ? finishConnect(ends, ports) : false;
  return verdict.then((allowed) => allowed && !signal.aborted && finishConnect(ends, ports));
}

function finishConnect(ends: ConnectEnds, ports: ConnectProposalPorts): true {
  for (const handler of ports.handlers()) {
    try {
      handler(ends);
    } catch (error) {
      ports.reportHandlerFailure(error);
    }
  }
  ports.emitAfter(ends);
  return true;
}

/** The connect handlers of one Gantt. Registration order is call order. */
export class ConnectHandlers {
  #handlers: ConnectHandler[] = [];
  #onChange: () => void;

  /** `onChange` runs after a handler joins or leaves. The shell attaches or detaches the connect
   *  controller there. */
  constructor(onChange: () => void) {
    this.#onChange = onChange;
  }

  /** True while at least one handler is registered. */
  get any(): boolean {
    return this.#handlers.length > 0;
  }

  list(): readonly ConnectHandler[] {
    return this.#handlers;
  }

  register(handler: ConnectHandler): Disposer {
    // A fresh wrapper per registration, so one function registered twice disposes one registration.
    const entry: ConnectHandler = (ends) => handler(ends);
    this.#handlers = [...this.#handlers, entry];
    this.#onChange();
    return () => {
      if (!this.#handlers.includes(entry)) return;
      this.#handlers = this.#handlers.filter((held) => held !== entry);
      this.#onChange();
    };
  }
}
