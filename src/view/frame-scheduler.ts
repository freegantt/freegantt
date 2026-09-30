// view/ — the single rAF owner (B10): every render request in view/ goes through this file,
// which is the only one allowed to call requestAnimationFrame.
//
// Not a second batcher. `BatchedNotifier` (layout/viewport) coalesces one synchronous fan-out — one
// `setPaneSize` touching two sub-models inside the same call stack. `FrameScheduler` coalesces one
// animation frame — independent signals (a resize, a zoom, a dataset change) arriving in the same
// tick, however many times each requests a render. Different scopes; neither subsumes the other.

/** One Gantt's rAF pipeline. `render` is `GanttShell.render()` — public, synchronous, and still
 *  callable directly by a caller that genuinely wants a frame now. */
export class FrameScheduler {
  readonly #render: () => void;
  #frameId: number | undefined;

  /** Built once, so a request in a hot loop creates no closure. */
  readonly #onFrame = (): void => {
    this.#frameId = undefined;
    this.#render();
  };

  constructor(render: () => void) {
    this.#render = render;
  }

  /** Coalesced: at most one render per animation frame, however many times this is called before
   *  the frame runs. */
  request(): void {
    if (this.#frameId !== undefined) return;
    this.#frameId = requestAnimationFrame(this.#onFrame);
  }

  /** Synchronous: runs `render` now and cancels a pending frame, so a caller never gets rendered
   *  twice for one request. Construction calls it; so do tests that assert DOM right after a change. */
  flush(): void {
    this.cancel();
    this.#render();
  }

  /** Cancels a pending frame without rendering. `GanttShell.destroy()` calls it. */
  cancel(): void {
    if (this.#frameId === undefined) return;
    cancelAnimationFrame(this.#frameId);
    this.#frameId = undefined;
  }
}
