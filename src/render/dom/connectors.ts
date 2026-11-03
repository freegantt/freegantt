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

function isSelected(connector: FrameConnector): boolean {
  return connector.flags.selected === true;
}

/** Mounts two SVG layers. Lines lie below the bars, so a long line passes behind the bars it crosses.
 *  A second layer above the bars repeats the selected line and draws the label text. Both layers
 *  ignore the pointer, so a bar still takes its gesture. Call `sync` each frame. */
export function attachConnectors(timelineHost: HTMLElement, barLayer: HTMLElement): ConnectorsAttachment {
  const layer = document.createElement('div');
  layer.className = 'fg-connectors';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', 'fg-connectors-svg');
  layer.append(svg);
  timelineHost.insertBefore(layer, barLayer);

  const overLayer = document.createElement('div');
  overLayer.className = 'fg-connectors fg-connectors-over';
  const overSvg = document.createElementNS(SVG_NAMESPACE, 'svg');
  overSvg.setAttribute('class', 'fg-connectors-svg');
  overLayer.append(overSvg);
  timelineHost.insertBefore(overLayer, barLayer.nextSibling);

  const paths = new KeyedLayer<FrameConnector, string, ConnectorGeom, SVGPathElement>();
  // The selected line stays readable over a bar. This copy has no pointer events and no accessible
  // name: the real line below keeps the click, the focus and the label.
  const selectedCopies = new KeyedLayer<FrameConnector, string, ConnectorGeom, SVGPathElement>();
  // The drawn label text sits above the bars. The path keeps the accessible name,
  // so a screen reader never hears the text twice.
  const textGroup = document.createElementNS(SVG_NAMESPACE, 'g');
  overSvg.append(textGroup);
  const texts = new KeyedLayer<FrameConnector, string, ConnectorTextGeom, SVGTextElement>();

  return {
    sync(connectors, contentWidth, contentHeight, paneHeight) {
      // The svg box is the content box, so a line near an edge never widens the pane's scroll range.
      for (const target of [svg, overSvg]) {
        target.setAttribute('width', String(contentWidth));
        target.setAttribute('height', String(Math.max(contentHeight, paneHeight)));
      }
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
      selectedCopies.sync(overSvg, connectors.filter(isSelected), {
        key: (connector) => connector.id,
        create: () => document.createElementNS(SVG_NAMESPACE, 'path'),
        toGeom: (connector) => toGeom(connector, undefined),
        patch: (node, geom) => {
          node.setAttribute('class', `${geom.className} fg-connector-copy`);
          node.setAttribute('d', geom.d);
          node.setAttribute('data-flag', geom.flagTokens);
          node.setAttribute('aria-hidden', 'true');
        },
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
      overLayer.remove();
      paths.clear();
      selectedCopies.clear();
      texts.clear();
    },
  };
}
