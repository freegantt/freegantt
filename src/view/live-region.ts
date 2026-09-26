// view/ — one polite live region per Gantt (S5.11). A screen reader announces a
// change to a live region's text, so this is how a keyboard action reaches a screen-reader user
// without a second, sighted-only notice being the only place the words live.
//
// S5.12 built the feed this reads (`s5.11-a11y-completion.md` §0.2): `error` fires on the Gantt's own
// bus, carrying an `ErrorReport`, and a refused cell edit already raises one with the same `code` the
// cell's own `data-reason` holds. So this module subscribes to that one event and grows no second call
// path for `inlineEditing()` — or any other plugin — to reach it through. Naming a plugin here would
// also break the rule a plugin never reaches into view state (`plans/01` §8).
//
// Mirrors `view/roving-focus.ts`'s attach/detach shape: one instance per Gantt (I2 — two Gantt
// instances on one page share no state), constructed in `GanttShell`'s constructor and detached in
// `destroy()`.

import type { ErrorReport, ErrorSeverity } from '../model/index.js';

const LIVE_REGION_CLASS = 'fg-live-region';

/** What `LiveRegion` subscribes to — the Gantt's own `error` event, read through the same `on`/`off`
 *  pair `GanttShell` already exposes publicly. Structural, so this file names no `Gantt`/`GanttShell`
 *  type and closes no cycle — the same trick `api/watch-all-errors.ts`'s own `ErrorFeed` plays, one
 *  layer up, for the same reason. */
export interface LiveRegionFeed {
  on(name: 'error', handler: (report: ErrorReport) => void): void;
  off(name: 'error', handler: (report: ErrorReport) => void): void;
}

/** Which `ErrorSeverity` levels reach a screen reader (§0.2's "live announcements").
 *
 *  `'info'` announces: a Refusal is the library saying no to a keystroke the user just made, and the
 *  reason is exactly what a sighted user reads off the notice `inline-editing.ts` mounts over the
 *  cell — a screen-reader user needs the same sentence, the same moment.
 *
 *  `'error'` announces: something broke and nothing caught it. A sighted user has no notice for this
 *  either, only a `console` line, so a screen-reader user is no worse off hearing it than a sighted
 *  user is seeing it — and strictly worse off hearing nothing.
 *
 *  `'warning'` stays silent: the library already recovered on its own — a renderer fell back, a
 *  rollup value got corrected. The user asked for nothing and can act on nothing, so announcing one
 *  on every frame that trips it would be noise, not help. */
function isAnnounced(severity: ErrorSeverity): boolean {
  return severity !== 'warning';
}

/** One polite, visually-hidden `role="status"` node, appended to `container` at construction and
 *  removed by `detach()`. `attach()`/`detach()` are separate from construction on purpose — the same
 *  reason `RovingFocus` keeps its listeners live across a `syncAfterRender()` but drops them once,
 *  in `detach()` — so a `GanttShell` under test can build one with no subscription yet live. */
export class LiveRegion {
  readonly #node: HTMLElement;
  readonly #feed: LiveRegionFeed;
  readonly #onError = (report: ErrorReport): void => {
    if (!isAnnounced(report.severity)) return;
    this.#node.textContent = report.message;
  };
  #attached = false;

  constructor(container: HTMLElement, feed: LiveRegionFeed) {
    this.#feed = feed;
    const node = container.ownerDocument.createElement('div');
    node.className = LIVE_REGION_CLASS;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    this.#node = node;
    container.append(node);
  }

  /** Subscribes to the feed's `error` event. A second call while already attached is a no-op — it
   *  never subscribes the same handler twice. */
  attach(): void {
    if (this.#attached) return;
    this.#attached = true;
    this.#feed.on('error', this.#onError);
  }

  /** Unsubscribes and removes the node. Safe to call more than once, and safe to call on a
   *  `LiveRegion` that was never attached. */
  detach(): void {
    if (this.#attached) {
      this.#attached = false;
      this.#feed.off('error', this.#onError);
    }
    this.#node.remove();
  }
}
