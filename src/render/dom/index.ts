// render/dom — default backend: absolutely-positioned rows/bars, keyed reconciler (plans/01 §8.1).
// Scope is hard-bounded: attr/class/style/text + keyed child recycling only (plans/01 §8.1).

import type { FrameBar, GeometryFrame } from '../../layout/index.js';
import type { RenderBackend, InteractionState, HitResult } from '../backend.js';

export function createDomBackend(): RenderBackend {
  let host: HTMLElement | undefined;
  let barLayer: HTMLElement | undefined;
  const barNodes = new Map<string, HTMLElement>();
  const barGeom = new Map<string, Pick<FrameBar, 'kind' | 'x' | 'y' | 'width' | 'height'>>();

  return {
    mount(el: unknown) {
      host = el as HTMLElement;
      host.replaceChildren();
      barLayer = document.createElement('div');
      barLayer.className = 'fg-bars';
      barLayer.style.position = 'relative';
      host.append(barLayer);
    },
    sync(frame: GeometryFrame) {
      if (!barLayer) return;
      const seen = new Set<string>();
      for (const bar of frame.bars) {
        seen.add(bar.id);
        let node = barNodes.get(bar.id);
        if (!node) {
          node = document.createElement('div');
          node.className = 'fg-bar';
          node.dataset['itemId'] = bar.id;
          node.style.position = 'absolute';
          node.textContent = bar.taskId;
          barNodes.set(bar.id, node);
          barLayer.append(node);
        }
        const prev = barGeom.get(bar.id);
        if (
          !prev ||
          prev.kind !== bar.kind ||
          prev.x !== bar.x ||
          prev.y !== bar.y ||
          prev.width !== bar.width ||
          prev.height !== bar.height
        ) {
          node.dataset['kind'] = bar.kind;
          node.style.transform = `translate(${bar.x}px, ${bar.y}px)`;
          node.style.width = `${bar.width}px`;
          node.style.height = `${bar.height}px`;
          barGeom.set(bar.id, { kind: bar.kind, x: bar.x, y: bar.y, width: bar.width, height: bar.height });
        }
      }
      for (const [id, node] of barNodes) {
        if (!seen.has(id)) {
          node.remove();
          barNodes.delete(id);
          barGeom.delete(id);
        }
      }
    },
    applyState(_state: InteractionState) {
      // Hot path lands in S4: class toggles + transforms only, zero allocation (plans/01 §3).
    },
    hitTest(): HitResult | null {
      return null;
    },
    destroy() {
      host?.replaceChildren();
      barNodes.clear();
      barGeom.clear();
      host = undefined;
      barLayer = undefined;
    },
  };
}
