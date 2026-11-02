// render/dom — the connect gesture's paint: one connector port beside each edge of the hovered bar,
// and the preview line a drag draws. Both are shared nodes, built the first time they show and moved
// after that, never one per bar. With no connect handler, nothing here ever builds a node.

import type { BarId, FrameBar } from '../../layout/index.js';
import type { ConnectDraft } from '../backend.js';
import { CONNECTOR_PORT_CLASS, CONNECT_PREVIEW_CLASS } from './dom-contract.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** How far a port sits outside its bar edge, and how wide it is. */
const PORT_WIDTH_PX = 14;

type Edge = 'start' | 'end';
type BarBox = Pick<FrameBar, 'x' | 'y' | 'width' | 'height'>;

export interface ConnectAffordance {
  /** Moves the ports onto `connectableBarId`'s edges, or parks them. Draws the preview line for
   *  `draft`, or parks it. */
  paint(connectableBarId: BarId | undefined, draft: ConnectDraft | undefined): void;
  /** Which port, if any, is this node part of. */
  portAt(node: Element | null): { barId: BarId; edge: Edge } | undefined;
  destroy(): void;
}

/** The point on a bar's edge where a port sits and a preview line starts. */
function portCenter(box: BarBox, edge: Edge): { x: number; y: number } {
  const x = edge === 'start' ? box.x - PORT_WIDTH_PX / 2 : box.x + box.width + PORT_WIDTH_PX / 2;
  return { x, y: box.y + box.height / 2 };
}

export function attachConnectAffordance(
  layer: HTMLElement,
  boxOf: (barId: BarId) => BarBox | undefined,
): ConnectAffordance {
  let ports: Record<Edge, HTMLElement> | undefined;
  let preview: { svg: SVGSVGElement; line: SVGLineElement } | undefined;
  let portsBar: BarId | undefined;

  function buildPorts(): Record<Edge, HTMLElement> {
    const make = (edge: Edge): HTMLElement => {
      const port = document.createElement('div');
      port.className = CONNECTOR_PORT_CLASS;
      port.dataset['edge'] = edge;
      port.hidden = true;
      return port;
    };
    const built = { start: make('start'), end: make('end') };
    layer.append(built.start, built.end);
    return built;
  }

  function buildPreview(): { svg: SVGSVGElement; line: SVGLineElement } {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    svg.setAttribute('class', CONNECT_PREVIEW_CLASS);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
    const line = document.createElementNS(SVG_NAMESPACE, 'line');
    svg.append(line);
    layer.append(svg);
    return { svg, line };
  }

  function paintPorts(barId: BarId | undefined, targetEdge: Edge | undefined): void {
    const box = barId === undefined ? undefined : boxOf(barId);
    if (box === undefined) {
      portsBar = undefined;
      if (ports === undefined) return;
      ports.start.hidden = true;
      ports.end.hidden = true;
      return;
    }
    ports ??= buildPorts();
    portsBar = barId;
    for (const edge of ['start', 'end'] as const) {
      const port = ports[edge];
      port.hidden = false;
      const left = edge === 'start' ? box.x - PORT_WIDTH_PX : box.x + box.width;
      port.style.transform = `translate(${left}px, ${box.y}px)`;
      port.style.height = `${box.height}px`;
      if (edge === targetEdge) port.setAttribute('data-active', '');
      else port.removeAttribute('data-active');
    }
  }

  function paintPreview(draft: ConnectDraft | undefined): void {
    const fromBox = draft === undefined ? undefined : boxOf(draft.fromBarId);
    if (draft === undefined || fromBox === undefined) {
      if (preview !== undefined) preview.svg.setAttribute('hidden', '');
      return;
    }
    preview ??= buildPreview();
    const from = portCenter(fromBox, draft.fromEdge);
    preview.svg.removeAttribute('hidden');
    preview.svg.toggleAttribute('data-pending', draft.pending);
    preview.line.setAttribute('x1', String(from.x));
    preview.line.setAttribute('y1', String(from.y));
    preview.line.setAttribute('x2', String(draft.cursorX));
    preview.line.setAttribute('y2', String(draft.cursorY));
  }

  return {
    paint(connectableBarId, draft) {
      paintPorts(connectableBarId, draft?.targetEdge);
      paintPreview(draft);
    },
    portAt(node) {
      const port = node?.closest<HTMLElement>(`.${CONNECTOR_PORT_CLASS}`);
      const edge = port?.dataset['edge'];
      if (port === undefined || port === null || portsBar === undefined || port.hidden) return undefined;
      return edge === 'start' || edge === 'end' ? { barId: portsBar, edge } : undefined;
    },
    destroy() {
      ports?.start.remove();
      ports?.end.remove();
      preview?.svg.remove();
      ports = undefined;
      preview = undefined;
      portsBar = undefined;
    },
  };
}
