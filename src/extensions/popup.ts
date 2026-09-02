// extensions/ — the anchoring, flipping, clamping and dismissal primitive (S5.3, D-S5-8/D-S5-9). One
// implementation serves the tooltip, the context menu and the cell editor (S5.5+) — three positioners
// would be three sets of edge-case bugs. Built on `Overlay` alone (`ctx.view.overlay`), the same
// seam a third-party plugin reaches — no back door into `view/` or `render/` (D-S5-5).

import type { ElementDescription } from '../model/index.js';
// `../api/plugin.js` directly, not the `api/index.js` barrel: `api/index.ts` re-exports
// `createPopup` from this very file (D-S5-8's "a third party reaches the same primitive we do"), and
// importing the barrel back would close that edge into a cycle (no-circular).
import type { Overlay, OverlayHandle } from '../api/plugin.js';
import { activateFocusTrap } from './focus-trap.js';
import type { FocusTrap } from './focus-trap.js';

export type PopupPlacement = 'top' | 'bottom' | 'start' | 'end';
export type DismissTrigger = 'escape' | 'outsidePointer' | 'scroll' | 'blur';

/** A client rect, or an element to read one from. */
export type Anchor = DOMRect | HTMLElement;

const DEFAULT_DISMISS_ON: readonly DismissTrigger[] = Object.freeze(['escape', 'outsidePointer', 'scroll']);

export interface PopupOptions {
  anchor: Anchor;
  /** Default `'bottom'`. */
  placement?: PopupPlacement;
  /** Default `'none'`: never moves focus (the tooltip's own policy — a hover affordance that steals
   *  focus is a bug). `'trap'` moves focus in, cycles Tab inside, and restores it on close (the
   *  context menu's and the cell editor's policy). */
  focus?: 'trap' | 'none';
  /** Default `['escape', 'outsidePointer', 'scroll']`. */
  dismissOn?: readonly DismissTrigger[];
  content: ElementDescription;
}

export interface Popup {
  open(options: PopupOptions): void;
  close(): void;
  readonly isOpen: boolean;
}

function anchorRect(anchor: Anchor): DOMRect {
  return anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
}

/** Which of the two pane rects `anchor` sits in — geometric, not a class-name sniff, since `Anchor`
 *  may be a bare `DOMRect` with no element to walk (D-S5-8: "bounds remains the outer clamp for a
 *  popup whose anchor is not inside either pane"). */
function paneRectFor(rect: DOMRect, paneBounds: Overlay['paneBounds'], bounds: DOMRect): DOMRect {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const inside = (r: DOMRect): boolean => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  if (inside(paneBounds.timeline)) return paneBounds.timeline;
  if (inside(paneBounds.grid)) return paneBounds.grid;
  return bounds;
}

interface Box {
  top: number;
  left: number;
}

function placeAt(side: PopupPlacement, anchor: DOMRect, size: { width: number; height: number }): Box {
  switch (side) {
    case 'bottom':
      return { top: anchor.bottom, left: anchor.left };
    case 'top':
      return { top: anchor.top - size.height, left: anchor.left };
    case 'end':
      return { top: anchor.top, left: anchor.right };
    case 'start':
      return { top: anchor.top, left: anchor.left - size.width };
  }
}

const OPPOSITE: Record<PopupPlacement, PopupPlacement> = Object.freeze({
  top: 'bottom',
  bottom: 'top',
  start: 'end',
  end: 'start',
});

/** True when the box's own placement axis lands entirely inside `pane` — the only axis D-S5-8 asks
 *  a flip to fix; the cross axis is `clamp`'s job, below. */
function fitsOnPlacementAxis(
  side: PopupPlacement,
  box: Box,
  size: { width: number; height: number },
  pane: DOMRect,
): boolean {
  if (side === 'top' || side === 'bottom') {
    return box.top >= pane.top && box.top + size.height <= pane.bottom;
  }
  return box.left >= pane.left && box.left + size.width <= pane.right;
}

function clamp(side: PopupPlacement, box: Box, size: { width: number; height: number }, pane: DOMRect): Box {
  if (side === 'top' || side === 'bottom') {
    const maxLeft = Math.max(pane.left, pane.right - size.width);
    return { ...box, left: Math.min(Math.max(box.left, pane.left), maxLeft) };
  }
  const maxTop = Math.max(pane.top, pane.bottom - size.height);
  return { ...box, top: Math.min(Math.max(box.top, pane.top), maxTop) };
}

/** LIFO "innermost open thing wins" (D-S5-9): one shared, capture-phase `document` Escape listener
 *  per `Overlay`, added on the overlay's first open popup and removed once its last one closes.
 *  Capture fires before the container's own (bubble-phase) keydown listener ever sees the event, so
 *  a popup's Escape always beats S3's Escape-clears-selection; `stopPropagation` during capture halts
 *  that bubble phase entirely. Keyed by `Overlay` (not global), so two Gantt instances never
 *  share a stack (I2) — `WeakMap` is the ADR 0007 sanctioned shape for friend-only per-instance state
 *  attached without a public method. */
const escapeStacks = new WeakMap<Overlay, { stack: (() => void)[]; listener: (e: KeyboardEvent) => void }>();

function pushEscapeHandler(overlay: Overlay, onEscape: () => void): () => void {
  let entry = escapeStacks.get(overlay);
  if (!entry) {
    const created: { stack: (() => void)[]; listener: (e: KeyboardEvent) => void } = {
      stack: [],
      listener: (event) => {
        if (event.key !== 'Escape') return;
        const top = created.stack[created.stack.length - 1];
        if (!top) return;
        event.stopPropagation();
        top();
      },
    };
    document.addEventListener('keydown', created.listener, true);
    escapeStacks.set(overlay, created);
    entry = created;
  }
  entry.stack.push(onEscape);
  const settled = entry;
  return () => {
    const index = settled.stack.indexOf(onEscape);
    if (index >= 0) settled.stack.splice(index, 1);
    if (settled.stack.length === 0) {
      document.removeEventListener('keydown', settled.listener, true);
      escapeStacks.delete(overlay);
    }
  };
}

/** `Popup`'s one implementation (D-S5-8). `overlay` is the only thing this reaches past plain DOM APIs —
 *  the same `ctx.view.overlay` a third-party plugin gets. */
export function createPopup(overlay: Overlay): Popup {
  let wrapper: HTMLElement | undefined;
  let handle: OverlayHandle | undefined;
  let focusTrap: FocusTrap | undefined;
  let unsubscribers: (() => void)[] = [];
  let currentOptions: PopupOptions | undefined;

  const close = (): void => {
    if (!wrapper) return;
    for (const off of unsubscribers) off();
    unsubscribers = [];
    focusTrap?.deactivate();
    focusTrap = undefined;
    handle?.detach();
    handle = undefined;
    wrapper = undefined;
    currentOptions = undefined;
  };

  const reposition = (): void => {
    if (!wrapper || !currentOptions) return;
    const anchor = anchorRect(currentOptions.anchor);
    const size = { width: wrapper.offsetWidth, height: wrapper.offsetHeight };
    const pane = paneRectFor(anchor, overlay.paneBounds, overlay.bounds);
    const requested = currentOptions.placement ?? 'bottom';
    let box = placeAt(requested, anchor, size);
    let side = requested;
    if (!fitsOnPlacementAxis(requested, box, size, pane)) {
      const flipped = OPPOSITE[requested];
      const flippedBox = placeAt(flipped, anchor, size);
      if (fitsOnPlacementAxis(flipped, flippedBox, size, pane)) {
        side = flipped;
        box = flippedBox;
      }
    }
    box = clamp(side, box, size, pane);
    wrapper.style.transform = `translate(${(box.left - overlay.bounds.left).toFixed(2)}px, ${(box.top - overlay.bounds.top).toFixed(2)}px)`;
  };

  return {
    open(options: PopupOptions): void {
      close();
      currentOptions = options;
      const node = document.createElement('div');
      node.className = 'fg-popup';
      node.append(overlay.render(options.content));
      wrapper = node;
      handle = overlay.present(node);
      reposition();

      const dismissOn = options.dismissOn ?? DEFAULT_DISMISS_ON;
      if (dismissOn.includes('escape')) {
        unsubscribers.push(pushEscapeHandler(overlay, close));
      }
      if (dismissOn.includes('outsidePointer')) {
        const onPointerDown = (event: PointerEvent): void => {
          const target = event.target;
          if (!(target instanceof Node)) return;
          if (wrapper?.contains(target)) return;
          if (options.anchor instanceof HTMLElement && options.anchor.contains(target)) return;
          close();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        unsubscribers.push(() => document.removeEventListener('pointerdown', onPointerDown, true));
      }
      if (dismissOn.includes('scroll')) {
        // Scroll does not bubble (only its target fires it), so this listens on the capture phase of
        // `document` to hear every pane's own scroll, the same reasoning `scroll-attachment.ts`'s own
        // caller-facing doc gives for D-D's single scroll owner not applying here — a Popup dismisses
        // on ANY pane scrolling, not just the one it is anchored in.
        const onScroll = (): void => close();
        document.addEventListener('scroll', onScroll, true);
        unsubscribers.push(() => document.removeEventListener('scroll', onScroll, true));
      }
      if (dismissOn.includes('blur')) {
        const onFocusOut = (event: FocusEvent): void => {
          const next = event.relatedTarget;
          if (next instanceof Node && wrapper?.contains(next)) return;
          close();
        };
        node.addEventListener('focusout', onFocusOut);
        unsubscribers.push(() => node.removeEventListener('focusout', onFocusOut));
      }
      unsubscribers.push(overlay.onResize(reposition));

      if (options.focus === 'trap') {
        focusTrap = activateFocusTrap(node);
      }
    },
    close,
    get isOpen(): boolean {
      return wrapper !== undefined;
    },
  };
}
