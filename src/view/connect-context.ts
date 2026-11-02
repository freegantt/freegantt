// view/ — the seam `interaction/connect.ts` drives and `GanttShell` implements. The same rule as
// `entry-gesture-context.ts`: `interaction/` does no arithmetic of its own. Every pixel or date it
// needs arrives here already computed.

import type { ClientPoint, Entry, BarId } from '../model/index.js';
import type { ConnectDraft } from '../render/backend.js';
import type { ConnectEnds } from './event-bus.js';
import type { EntryHit } from './entry-gesture-context.js';

export type { ConnectDraft };

/** What the connect controller asks the shell. */
export interface ConnectGestureContext {
  /** Content-surface hit test, client-relative. A connector port answers with `port` set. */
  hitTest(at: ClientPoint): EntryHit | undefined;
  /** The Entry under a bar id, or undefined once a stale bar id outlives its frame. */
  entryFor(barId: BarId): Entry | undefined;
  /** The one resolution of the `connect` capability (I14). It gates the port and the drag alike. */
  canConnect(entry: Entry): boolean;
  /** Content-x under a pane-local offset, read through the bound x `ScrollAxis`. */
  contentXAtPaneOffset(offsetX: number): number;
  /** Content-y under a client-y, read through the bound y `ScrollAxis`. */
  contentYAtClientY(clientY: number): number;
  /** Paints the preview line, or parks it when `draft` is undefined. */
  paint(draft: ConnectDraft | undefined): void;
  /** `beforeConnect` → handlers → `connect`. Answers a Promise while an async veto holds the drop.
   *  An aborted `signal` ends that wait without running a handler. */
  propose(ends: ConnectEnds, signal: AbortSignal): boolean | Promise<boolean>;
}
