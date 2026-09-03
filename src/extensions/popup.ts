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
import { DisposableStore } from './disposables.js';
// `./keymap.js` is a sibling `extensions/` module, not a `view/`/`render/` back door (D-S5-5 only
// forbids those) — see `KeyHandlerRegistrar`'s own doc for why Escape folds into it (C3,
// `plans/reviews/2026-09-02-s5-start-fixes.md`). The narrow structural type, not the concrete
// `Keymap` class: a third-party plugin has no `Keymap` instance, only the one bound method
// `ctx.interaction.registerKeyHandler` gives it, so requiring the whole class here would make
// `createPopup` uncallable from `ctx.view.overlay` alone (D-S5-8).
import type { KeyHandlerRegistrar } from './keymap.js';

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
  /** Calling `open()` while a popup is already open replaces it — the previous popup is closed
   *  first, then the new one opens at its own placement. */
  open(options: PopupOptions): void;
  close(): void;
  readonly isOpen: boolean;
}

function anchorRect(anchor: Anchor): DOMRect {
  return anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
}

type PaneName = 'grid' | 'timeline';

/** Which of the two panes `rect` sits in — geometric, not a class-name sniff, since neither `Anchor`
 *  nor a scroll event's target is guaranteed to carry one (D-S5-8: "bounds remains the outer clamp
 *  for a popup whose anchor is not inside either pane"). `undefined` means neither pane. */
function paneNameFor(rect: DOMRect, paneBounds: Overlay['paneBounds']): PaneName | undefined {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const inside = (r: DOMRect): boolean => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  if (inside(paneBounds.timeline)) return 'timeline';
  if (inside(paneBounds.grid)) return 'grid';
  return undefined;
}

/** Which of the two pane rects `anchor` sits in — falls back to the outer `bounds` clamp when
 *  `anchor` sits in neither pane. */
function paneRectFor(rect: DOMRect, paneBounds: Overlay['paneBounds'], bounds: DOMRect): DOMRect {
  const name = paneNameFor(rect, paneBounds);
  return name ? paneBounds[name] : bounds;
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

/** `Popup`'s one implementation (D-S5-8). `overlay` and `keymap` are the only things this reaches
 *  past plain DOM APIs. Escape folds into `keymap` (C3, `plans/reviews/2026-09-02-s5-start-fixes.md`)
 *  instead of a bespoke document-capture listener + per-`Overlay` `WeakMap` LIFO stack: `Keymap`
 *  already resolves newest-registration-first (D-S5-7), so a popup registering its Escape handler on
 *  `open()` and unregistering it on `close()` gets "innermost open thing wins" (D-S5-9) for free, and
 *  the shared `isEditableTarget` gate (S5.2, issue #137 F7) restores the IME-composition rule this
 *  primitive was missing — a lone document listener with no gate closed a popup mid-IME-cancel too. */
export function createPopup(overlay: Overlay, keymap: KeyHandlerRegistrar): Popup {
  let wrapper: HTMLElement | undefined;
  let handle: OverlayHandle | undefined;
  let focusTrap: FocusTrap | undefined;
  let disposables = new DisposableStore();
  let currentOptions: PopupOptions | undefined;

  const close = (): void => {
    if (!wrapper) return;
    disposables.disposeAll();
    // A fresh store, not the same one reused: `DisposableStore.disposeAll()` latches — a store that
    // has already disposed once ignores every later `add()` (fires it immediately instead), so the
    // next `open()` needs its own store rather than one already spent.
    disposables = new DisposableStore();
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
        // `stopPropagation` here, not in `Keymap.resolve` itself: only this dismissal needs "never
        // seen past this popup" (the same guarantee the old document-capture listener gave), and
        // scoping it to the handler keeps every other keybinding's propagation behaviour untouched.
        disposables.add(
          keymap.registerHandler('Escape', (event) => {
            event.stopPropagation();
            close();
          }),
        );
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
        disposables.add(() => document.removeEventListener('pointerdown', onPointerDown, true));
      }
      if (dismissOn.includes('scroll')) {
        // Scroll does not bubble (only its target fires it), so this listens on the capture phase of
        // `document` to hear every pane's own scroll. Scoped to the anchor's own pane (D-S5-9): a
        // popup anchored in the timeline pane stays open while the grid pane scrolls, and vice versa.
        // An anchor sitting in neither pane (a toolbar button, say) has no pane to scope to, so any
        // scroll still dismisses it — the same fallback `paneRectFor` gives the outer `bounds` clamp.
        const anchorPane = paneNameFor(anchorRect(options.anchor), overlay.paneBounds);
        const onScroll = (event: Event): void => {
          const target = event.target;
          if (anchorPane === undefined) {
            close();
            return;
          }
          if (!(target instanceof Element)) return;
          if (paneNameFor(target.getBoundingClientRect(), overlay.paneBounds) === anchorPane) close();
        };
        document.addEventListener('scroll', onScroll, true);
        disposables.add(() => document.removeEventListener('scroll', onScroll, true));
      }
      if (dismissOn.includes('blur')) {
        const onFocusOut = (event: FocusEvent): void => {
          const next = event.relatedTarget;
          if (next instanceof Node && wrapper?.contains(next)) return;
          close();
        };
        node.addEventListener('focusout', onFocusOut);
        disposables.add(() => node.removeEventListener('focusout', onFocusOut));
      }
      disposables.add(overlay.onResize(reposition));

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
