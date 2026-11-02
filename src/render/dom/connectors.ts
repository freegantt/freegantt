// render/dom — connector paint. Routing, culling and clipping happened in layout/. This file turns
// each `FrameConnector` into one SVG path, keyed by connector id.

import type { FrameConnector, PathCommand } from '../../layout/index.js';
import { KeyedLayer } from './sync-keyed.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type ConnectorGeom = { d: string; flagTokens: string; className: string; label: string };

export interface ConnectorsAttachment {
  /** Call once per frame with the frame's connectors and the content's full extent. */
  sync(
    connectors: readonly FrameConnector[],
    contentWidth: number,
    contentHeight: number,
    paneHeight: number,
  ): void;
  destroy(): void;
}

function pathData(path: readonly PathCommand[]): string {
  return path
    .map((c) => (c.cmd === 'C' ? `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}` : `${c.cmd}${c.x} ${c.y}`))
    .join('');
}

function toGeom(connector: FrameConnector): ConnectorGeom {
  return {
    d: pathData(connector.path),
    flagTokens: connector.flagTokens,
    className: connector.class === undefined ? 'fg-connector' : `fg-connector ${connector.class}`,
    label: connector.label ?? '',
  };
}

function patch(node: SVGPathElement, geom: ConnectorGeom): void {
  node.setAttribute('class', geom.className);
  node.setAttribute('d', geom.d);
  if (geom.flagTokens === '') node.removeAttribute('data-flag');
  else node.setAttribute('data-flag', geom.flagTokens);
  // A connector with a label is an image a screen reader names. One without is decoration.
  if (geom.label === '') {
    node.removeAttribute('role');
    node.removeAttribute('aria-label');
    node.setAttribute('aria-hidden', 'true');
  } else {
    node.removeAttribute('aria-hidden');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', geom.label);
  }
}

/** Mounts one SVG layer above the bar layer. The layer ignores the pointer, so a bar under a line
 *  still takes its gesture. Call `sync` each frame. */
export function attachConnectors(timelineHost: HTMLElement, barLayer: HTMLElement): ConnectorsAttachment {
  const layer = document.createElement('div');
  layer.className = 'fg-connectors';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', 'fg-connectors-svg');
  layer.append(svg);
  timelineHost.insertBefore(layer, barLayer.nextSibling);

  const paths = new KeyedLayer<FrameConnector, string, ConnectorGeom, SVGPathElement>();

  return {
    sync(connectors, contentWidth, contentHeight, paneHeight) {
      // The svg box is the content box, so a line near an edge never widens the pane's scroll range.
      svg.setAttribute('width', String(contentWidth));
      svg.setAttribute('height', String(Math.max(contentHeight, paneHeight)));
      paths.sync(svg, connectors, {
        key: (connector) => connector.id,
        create: (connector) => {
          const node = document.createElementNS(SVG_NAMESPACE, 'path');
          node.dataset['connectorId'] = connector.id;
          return node;
        },
        toGeom,
        patch,
      });
    },
    destroy() {
      layer.remove();
      paths.clear();
    },
  };
}
