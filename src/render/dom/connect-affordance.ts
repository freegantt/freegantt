// render/dom — the connect gesture's paint: two connector ports on each edge of the hovered bar (every connectable bar during a drag),
// the outline on the bar a drop would join, and the preview line a drag draws. Both are shared nodes, built the first time they show and moved
// after that, never one per bar. With no connect handler, nothing here ever builds a node.

import type { BarId, FrameBar } from '../../layout/index.js';
import type { ConnectDraft } from '../backend.js';
import { CONNECTOR_PORT_CLASS, CONNECT_PREVIEW_CLASS, CONNECT_TARGET_CLASS } from './dom-contract.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** How far the visible dot's center sits outside its bar edge. The dot stays clear of the bar body
 *  and of the resize handle. The port box around it is wider (see `.fg-connector-port`). */
const DOT_CENTER_OFFSET_PX = 5;

type Edge = 'start' | 'end';
type BarBox = Pick<FrameBar, 'x' | 'y' | 'width' | 'height'>;
type PortPair = Record<Edge, HTMLElement>;

export interface ConnectAffordance {
  /** Moves the ports onto the edges of `hoveredBarId`, or onto every connectable bar while `draft`
   *  runs, or parks them. Draws the preview line and the target outline for `draft`, or parks both. */
  paint(hoveredBarId: BarId | undefined, draft: ConnectDraft | undefined): void;
  /** Which port, if any, is this node part of. */
  portAt(node: Element | null): { barId: BarId; edge: Edge } | undefined;
  destroy(): void;
}

/** The point near a bar's edge where a preview line starts. */
function lineStart(box: BarBox, edge: Edge): { x: number; y: number } {
  const x = edge === 'start' ? box.x - DOT_CENTER_OFFSET_PX : box.x + box.width + DOT_CENTER_OFFSET_PX;
  return { x, y: box.y + box.height / 2 };
}

export function attachConnectAffordance(
  layer: HTMLElement,
  boxOf: (barId: BarId) => BarBox | undefined,
): ConnectAffordance {
  /** Port pairs are shared nodes. The pool grows to the most bars one paint shows, never per bar. */
  const pool: { pair: PortPair; barId: BarId | undefined }[] = [];
  let preview: { svg: SVGSVGElement; line: SVGLineElement } | undefined;
  let targetOutline: HTMLElement | undefined;

  function buildPair(): PortPair {
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

  function paintPorts(barIds: readonly BarId[], draft: ConnectDraft | undefined): void {
    const shown = barIds.flatMap((barId) => {
      const box = boxOf(barId);
      return box === undefined ? [] : [{ barId, box }];
    });
    while (pool.length < shown.length) pool.push({ pair: buildPair(), barId: undefined });
    pool.forEach((slot, index) => {
      const bar = shown[index];
      slot.barId = bar?.barId;
      for (const edge of ['start', 'end'] as const) {
        const port = slot.pair[edge];
        port.hidden = bar === undefined;
        if (bar === undefined) continue;
        const edgeX = edge === 'start' ? bar.box.x : bar.box.x + bar.box.width;
        port.style.transform = `translate(${edgeX}px, ${bar.box.y}px)`;
        port.style.height = `${bar.box.height}px`;
        const active = bar.barId === draft?.targetBarId && edge === draft.targetEdge;
        port.toggleAttribute('data-active', active);
      }
    });
  }

  function paintTarget(draft: ConnectDraft | undefined): void {
    const box = draft?.targetBarId === undefined ? undefined : boxOf(draft.targetBarId);
    if (box === undefined) {
      targetOutline?.setAttribute('hidden', '');
      return;
    }
    if (targetOutline === undefined) {
      targetOutline = document.createElement('div');
      targetOutline.className = CONNECT_TARGET_CLASS;
      layer.append(targetOutline);
    }
    targetOutline.removeAttribute('hidden');
    targetOutline.style.transform = `translate(${box.x}px, ${box.y}px)`;
    targetOutline.style.width = `${box.width}px`;
    targetOutline.style.height = `${box.height}px`;
  }

  function paintPreview(draft: ConnectDraft | undefined): void {
    const fromBox = draft === undefined ? undefined : boxOf(draft.fromBarId);
    if (draft === undefined || fromBox === undefined) {
      if (preview !== undefined) preview.svg.setAttribute('hidden', '');
      return;
    }
    preview ??= buildPreview();
    const from = lineStart(fromBox, draft.fromEdge);
    preview.svg.removeAttribute('hidden');
    preview.svg.toggleAttribute('data-pending', draft.pending);
    preview.line.setAttribute('x1', String(from.x));
    preview.line.setAttribute('y1', String(from.y));
    preview.line.setAttribute('x2', String(draft.cursorX));
    preview.line.setAttribute('y2', String(draft.cursorY));
  }

  return {
    paint(hoveredBarId, draft) {
      paintPorts(draft?.connectableBarIds ?? (hoveredBarId === undefined ? [] : [hoveredBarId]), draft);
      paintTarget(draft);
      paintPreview(draft);
    },
    portAt(node) {
      const port = node?.closest<HTMLElement>(`.${CONNECTOR_PORT_CLASS}`);
      const edge = port?.dataset['edge'];
      if (port === undefined || port === null || port.hidden) return undefined;
      if (edge !== 'start' && edge !== 'end') return undefined;
      const slot = pool.find((candidate) => candidate.pair[edge] === port);
      return slot?.barId === undefined ? undefined : { barId: slot.barId, edge };
    },
    destroy() {
      for (const slot of pool) {
        slot.pair.start.remove();
        slot.pair.end.remove();
      }
      pool.length = 0;
      preview?.svg.remove();
      targetOutline?.remove();
      preview = undefined;
      targetOutline = undefined;
    },
  };
}
