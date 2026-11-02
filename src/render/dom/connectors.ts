// render/dom — connector paint. Routing, culling and clipping happened in layout/. This file turns
// each `FrameConnector` into one SVG path, keyed by connector id.

import type { FrameConnector, PathCommand } from '../../layout/index.js';
import { CONNECTOR_CLASS, CONNECTOR_ID_KEY, CONNECTOR_TEXT_CLASS } from './dom-contract.js';
import { KeyedLayer } from './sync-keyed.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type ConnectorTextGeom = { text: string; x: number; y: number };

type ConnectorGeom = { d: string; flagTokens: string; className: string; label: string; tabStop: boolean };

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

/** Which connector is the one tab stop? The selected one. With none selected, the first labelled
 *  one in frame order. An unlabelled connector is decoration, so it never takes focus. */
function tabStopId(connectors: readonly FrameConnector[]): string | undefined {
  const labelled = connectors.filter((connector) => connector.label !== undefined && connector.label !== '');
  return (labelled.find((connector) => connector.flags.selected === true) ?? labelled[0])?.id;
}

function toGeom(connector: FrameConnector, stopId: string | undefined): ConnectorGeom {
  return {
    tabStop: connector.id === stopId,
    d: pathData(connector.path),
    flagTokens: connector.flagTokens,
    className: connector.class === undefined ? CONNECTOR_CLASS : `${CONNECTOR_CLASS} ${connector.class}`,
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
  // Roving tab index: a labelled connector takes focus from a click or a key, and one is the tab stop.
  if (geom.label === '') node.removeAttribute('tabindex');
  else node.setAttribute('tabindex', geom.tabStop ? '0' : '-1');
  if (geom.flagTokens.split(' ').includes('selected')) node.setAttribute('aria-current', 'true');
  else node.removeAttribute('aria-current');
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
  // The drawn label text sits in its own group above the lines. The path keeps the accessible name,
  // so a screen reader never hears the text twice.
  const textGroup = document.createElementNS(SVG_NAMESPACE, 'g');
  svg.append(textGroup);
  const texts = new KeyedLayer<FrameConnector, string, ConnectorTextGeom, SVGTextElement>();

  return {
    sync(connectors, contentWidth, contentHeight, paneHeight) {
      // The svg box is the content box, so a line near an edge never widens the pane's scroll range.
      svg.setAttribute('width', String(contentWidth));
      svg.setAttribute('height', String(Math.max(contentHeight, paneHeight)));
      const stopId = tabStopId(connectors);
      paths.sync(svg, connectors, {
        key: (connector) => connector.id,
        create: (connector) => {
          const node = document.createElementNS(SVG_NAMESPACE, 'path');
          node.dataset[CONNECTOR_ID_KEY] = connector.id;
          return node;
        },
        toGeom: (connector) => toGeom(connector, stopId),
        patch,
      });
      texts.sync(
        textGroup,
        connectors.filter((connector) => connector.labelAnchor !== undefined),
        {
          key: (connector) => connector.id,
          create: () => {
            const node = document.createElementNS(SVG_NAMESPACE, 'text');
            node.setAttribute('class', CONNECTOR_TEXT_CLASS);
            node.setAttribute('aria-hidden', 'true');
            return node;
          },
          toGeom: (connector) => ({
            text: connector.label ?? '',
            x: connector.labelAnchor?.x ?? 0,
            y: connector.labelAnchor?.y ?? 0,
          }),
          patch: (node, geom) => {
            node.setAttribute('x', String(geom.x));
            node.setAttribute('y', String(geom.y));
            node.textContent = geom.text;
          },
        },
      );
    },
    destroy() {
      layer.remove();
      paths.clear();
      texts.clear();
    },
  };
}
