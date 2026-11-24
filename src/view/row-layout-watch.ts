// view/ — one answer to "did a row move?". A plugin that mounts content beside a row re-reads
// `rowBox` when a row top or height changed. A scroll moves no row top, so it never asks.

import type { Disposer } from '../model/index.js';

/** What the last painted frame says about the rows: how many, how tall in all, and which plan. A
 *  row height change, a collapse, a filter and a data change each move at least one of the three. */
export interface RowLayoutStamp {
  readonly planRevision: number;
  readonly rowCount: number;
  readonly contentHeight: number;
}

/** Tells listeners after a frame whose rows sit differently from the frame before. The first frame
 *  only sets the baseline, because a plugin reads `rowBox` itself when it mounts. */
export class RowLayoutWatch {
  readonly #listeners = new Set<() => void>();
  #last: RowLayoutStamp | undefined;

  /** `reportFailure` hears each listener that throws. The other listeners still run, and the frame
   *  goes on. */
  constructor(private readonly reportFailure: (error: unknown) => void) {}

  onChange(callback: () => void): Disposer {
    this.#listeners.add(callback);
    return () => {
      this.#listeners.delete(callback);
    };
  }

  /** Call after the backend painted the frame, so a listener reads rows that are already drawn. */
  settle(stamp: RowLayoutStamp): void {
    const last = this.#last;
    this.#last = stamp;
    if (last === undefined) return;
    const moved =
      last.planRevision !== stamp.planRevision ||
      last.rowCount !== stamp.rowCount ||
      last.contentHeight !== stamp.contentHeight;
    if (!moved) return;
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch (error) {
        this.reportFailure(error);
      }
    }
  }

  destroy(): void {
    this.#listeners.clear();
  }
}
