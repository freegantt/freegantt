// layout/ — connector provider types. A provider names the two Entries a line joins. `layout/`
// finds the bars, routes the path, and clips it to the window. The provider never sees pixels.
// This file imports `model/` only, so no plugin type can leak into the frame.

import type { EntryId } from '../model/index.js';

/** Every `ConnectorFlags` key — the connector-side twin of `BAR_FLAG_KEYS`. `render/` turns each
 *  true key into one `data-flag` token. */
export const CONNECTOR_FLAG_KEYS = ['inactive', 'cycle', 'selected'] as const;

export type ConnectorFlags = Partial<Record<(typeof CONNECTOR_FLAG_KEYS)[number], boolean>>;

/** Which side of a bar a connector touches. */
export type ConnectorEdge = 'start' | 'end';

/** One end of a connector: a bar edge of one Entry. */
export interface ConnectorEnd {
  entryId: EntryId;
  edge: ConnectorEdge;
}

/** What a provider states. `id` is a plain `string` because a plugin owns its id space. */
export interface ConnectorInput {
  id: string;
  from: ConnectorEnd;
  to: ConnectorEnd;
  flags?: ConnectorFlags;
  /** Lands on the connector node beside `.fg-connector`. */
  class?: string;
  /** The connector's accessible name. Core draws no label text. */
  label?: string;
}

/** Registered with `ctx.view.registerConnector`. Core calls it again after each dataset change. */
export type ConnectorProvider = () => readonly ConnectorInput[];

/** One part of an SVG-style path. Connector geometry uses `M` and `L` only. */
export type PathCommand =
  | { cmd: 'M'; x: number; y: number }
  | { cmd: 'L'; x: number; y: number }
  | { cmd: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };
