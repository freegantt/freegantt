// extensions/ — the anchoring, flipping, clamping and dismissal primitive (S5.3, D-S5-8/D-S5-9). One
// implementation serves the tooltip, the context menu and the cell editor (S5.5+) — three positioners
// would be three sets of edge-case bugs. Built on `ctx.view` alone — the overlay layer it mounts in
// and the rects `ctx.view.dom` measures — the same seam a third-party plugin reaches, with no back
// door into `view/` or `render/` (D-S5-5).

import type { Disposer, ElementDescription } from '../model/index.js';
// `../api/plugin-context.js` directly, not the `api/index.js` barrel: `api/index.ts` re-exports
// `createPopup` from this very file (D-S5-8's "a third party reaches the same primitive we do"), and
// importing the barrel back would close that edge into a cycle (no-circular).
import type {
  DomEventHandler,
  DomEventOptions,
  GanttDom,
  MountLayer,
  PaneName,
} from '../api/plugin-context.js';
import { activateFocusTrap } from './focus-trap.js';
import type { FocusTrap } from './focus-trap.js';
import { DisposableStore } from './disposables.js';
// `./keymap.js` is a sibling `extensions/` module, not a `view/`/`render/` back door (D-S5-5 only
// forbids those) — see `KeyHandlerRegistrar`'s own doc for why Escape folds into it (C3,
// `plans/reviews/2026-09-02-s5-start-fixes.md`). The one method, not the whole interface: a
// third-party plugin has no `Keymap` instance, only the one bound method
// `ctx.interaction.registerKeyHandler` gives it, so `createPopup` takes that function directly
// instead of asking the caller to wrap it back into a one-field object (D-S5-8).
import type { RegisterKeyHandler } from './keymap.js';

export type PopupPlacement = 'top' | 'bottom' | 'start' | 'end';
/** Why a popup closed itself. `close()` called by the owner is not one of these — the owner already
 *  knows. */
export type DismissTrigger = 'escape' | 'outsidePointer' | 'scroll' | 'blur';

/** The three view seams a `Popup` needs: the layer it mounts in, the reconciler that builds its
 *  content, and the rects it places against (review N1 moved `bounds`/`paneBounds` off the mount
 *  layer onto `GanttDom`). A plugin passes `ctx.view`; the narrow `Pick`s keep a test's fake to what
 *  this file actually reads. */
export interface PopupSurface {
  overlay: MountLayer;
  /** Builds the popup body from `options.content` — `ctx.view.renderElement` (D-S5-10). */
  renderElement(description: ElementDescription): HTMLElement;
  dom: Pick<GanttDom, 'bounds' | 'paneBounds' | 'paneOf'>;
  /** One `document` listener, scoped to this Gantt (review A4). The scroll dismissal listens here
   *  (#177), which is what leaves `outsidePointer` below as the single unscoped listener
   *  `plans/01` §10 grants.
   *
   *  Declared as a property, not a method: `open()` hands this seam to one dismiss row, and the
   *  implementation behind it is a closure that never reads `this`. */
  readonly onDomEvent: <K extends keyof DocumentEventMap>(
    type: K,
    handler: DomEventHandler<K>,
    options?: DomEventOptions,
  ) => Disposer;
}

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
  /** Review C3: the popup closed itself, and this says why. It runs after the popup is already
   *  closed, so `isOpen` reads `false` inside it. An owner detaches its own listeners here instead
   *  of guarding every one of them on `isOpen` for the rest of the page's life. `close()` called by
   *  the owner never fires this — the owner already knows. */
  onDismiss?: (trigger: DismissTrigger) => void;
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

/** Which of the two panes `rect` sits in — geometric, not a class-name sniff, since neither `Anchor`
 *  nor a scroll event's target is guaranteed to carry one (D-S5-8: "bounds remains the outer clamp
 *  for a popup whose anchor is not inside either pane"). `undefined` means neither pane. */
function paneNameFor(rect: DOMRect, paneBounds: GanttDom['paneBounds']): PaneName | undefined {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const inside = (r: DOMRect): boolean => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  if (inside(paneBounds.timeline)) return 'timeline';
  if (inside(paneBounds.grid)) return 'grid';
  return undefined;
}

/** Which of the two pane rects `anchor` sits in — falls back to the outer `bounds` clamp when
 *  `anchor` sits in neither pane. */
function paneRectFor(rect: DOMRect, paneBounds: GanttDom['paneBounds'], bounds: DOMRect): DOMRect {
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

// Clamps both axes, not only the placement's own cross axis (#280). A flip already settles the
// placement axis when the box fits *somewhere* — `fitsOnPlacementAxis` above found a side that does
// — so clamping it too is a no-op there. When the box is taller (or wider) than the pane on every
// side, no flip fits either one, and the box that reaches here still stands at its unflipped
// placement, running past the pane on its own placement axis with nothing to pin it back. Pinning
// that axis here as well is the fallback the pane-relative `--fg-popup-max-height` cap (`reposition`,
// styles.ts's `.fg-popup`) needs: the box lands flush with the pane, and its own overflow scrolls.
function clamp(box: Box, size: { width: number; height: number }, pane: DOMRect): Box {
  const maxLeft = Math.max(pane.left, pane.right - size.width);
  const maxTop = Math.max(pane.top, pane.bottom - size.height);
  return {
    top: Math.min(Math.max(box.top, pane.top), maxTop),
    left: Math.min(Math.max(box.left, pane.left), maxLeft),
  };
}

/** What one dismiss listener works from: the popup that just opened, the seams it listens through,
 *  and the one call that closes it. `node` is the popup's own wrapper, so a listener can ask whether
 *  an event landed inside the popup. `dom` is the object, never a captured rect — `paneBounds` reads
 *  live geometry on every call. */
interface DismissContext {
  readonly node: HTMLElement;
  readonly options: PopupOptions;
  readonly dom: PopupSurface['dom'];
  readonly onDomEvent: PopupSurface['onDomEvent'];
  readonly registerKeyHandler: RegisterKeyHandler;
  dismiss(trigger: DismissTrigger): void;
}

/** One row per `DismissTrigger`. A row starts its own listener and hands back its own removal, so a
 *  fifth trigger is a fifth row here — not a fifth `if` block inside `open()`.
 *
 *  One row listens on `document` on purpose, and it may not move to `ctx.view.onDomEvent`:
 *  `outsidePointer` exists to hear a pointer the popup does *not* own, and that seam filters an
 *  event to this Gantt, which is a different question. `plans/01` §10 grants that exception in the
 *  singular, and `scroll` gave it back in #177. */
const DISMISS_LISTENERS: Readonly<Record<DismissTrigger, (ctx: DismissContext) => Disposer>> = Object.freeze({
  // `stopPropagation` here, not in `Keymap.resolve` itself: only this dismissal needs "never seen
  // past this popup" (the same guarantee the old document-capture listener gave). Scoping it to the
  // handler keeps every other keybinding's propagation behaviour untouched.
  // `captureInEditable: true` (issue #137 F1, `plans/reviews/2026-09-03-s5-start-fixes-qc.md`): the
  // editable-target gate protects page-level editables from a stray keybinding. It does not exist to
  // protect a popup's own `<input>` from its own close button. Without this flag, Escape typed
  // inside the popup's own input never reaches this handler at all.
  escape: (ctx) =>
    ctx.registerKeyHandler(
      'Escape',
      (event) => {
        event.stopPropagation();
        ctx.dismiss('escape');
      },
      { captureInEditable: true },
    ),

  outsidePointer: (ctx) => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ctx.node.contains(target)) return;
      if (ctx.options.anchor instanceof HTMLElement && ctx.options.anchor.contains(target)) return;
      ctx.dismiss('outsidePointer');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  },

  // Scroll does not bubble — only its own target fires it — so this listens on the capture phase.
  // It scopes to the anchor's own pane (D-S5-9): a popup anchored in the timeline pane stays open
  // while the grid pane scrolls, and the other way round.
  //
  // "Whose scroll was that" is an ownership question, so `paneOf` answers it by element identity
  // (#177). It used to be asked as geometry, which cost two `getBoundingClientRect` calls plus the
  // target's own, on every scroll anywhere in the document. Placement below still asks by geometry,
  // because "where do I clamp this box" genuinely is geometry.
  //
  // An anchor sitting in neither pane (a toolbar button, say) has no pane to scope to, so any scroll
  // of this Gantt dismisses it — the same fallback `paneRectFor` gives the outer `bounds` clamp.
  scroll: (ctx) => {
    // An `HTMLElement` anchor knows which pane holds it. A bare `DOMRect` anchor has no node, so
    // geometry stays the only answer available for that one.
    const anchor = ctx.options.anchor;
    const anchorPane =
      anchor instanceof HTMLElement ? ctx.dom.paneOf(anchor) : paneNameFor(anchor, ctx.dom.paneBounds);
    return ctx.onDomEvent(
      'scroll',
      (event) => {
        if (anchorPane === undefined) {
          ctx.dismiss('scroll');
          return;
        }
        const target = event.target;
        if (target instanceof Node && ctx.dom.paneOf(target) === anchorPane) ctx.dismiss('scroll');
      },
      { capture: true },
    );
  },

  blur: (ctx) => {
    const onFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget;
      if (next instanceof Node && ctx.node.contains(next)) return;
      ctx.dismiss('blur');
    };
    ctx.node.addEventListener('focusout', onFocusOut);
    return () => ctx.node.removeEventListener('focusout', onFocusOut);
  },
});

/** `Popup`'s one implementation (D-S5-8). `view` and `registerKeyHandler` are the only things this
 *  reaches past plain DOM APIs. Escape folds into `registerKeyHandler` (C3,
 *  `plans/reviews/2026-09-02-s5-start-fixes.md`) instead of a bespoke document-capture listener +
 *  per-layer `WeakMap` LIFO stack: `Keymap` already resolves newest-registration-first (D-S5-7), so
 *  a popup registering its Escape handler on `open()` and unregistering it on `close()` gets
 *  "innermost open thing wins" (D-S5-9) for free, and the shared `isEditableTarget` gate (S5.2,
 *  issue #137 F7) restores the IME-composition rule this primitive was missing — a lone document
 *  listener with no gate closed a popup mid-IME-cancel too. */
export function createPopup(view: PopupSurface, registerKeyHandler: RegisterKeyHandler): Popup {
  const { overlay, dom } = view;
  let wrapper: HTMLElement | undefined;
  let unmount: Disposer | undefined;
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
    unmount?.();
    unmount = undefined;
    wrapper = undefined;
    currentOptions = undefined;
  };

  /** Review C3: the popup closed itself, so it says so. Reading `onDismiss` before `close()` matters
   *  — `close()` drops `currentOptions`, and the callback belongs to the popup that just closed. */
  const dismiss = (trigger: DismissTrigger): void => {
    const onDismiss = currentOptions?.onDismiss;
    close();
    onDismiss?.(trigger);
  };

  const reposition = (): void => {
    if (!wrapper || !currentOptions) return;
    const anchor = anchorRect(currentOptions.anchor);
    const pane = paneRectFor(anchor, dom.paneBounds, dom.bounds);
    // Caps content taller than the pane before `offsetHeight` below reads it (#280). Without this, a
    // menu taller than the pane never enters `clamp`'s size-aware branch at all — only its top moves,
    // so the box still stands taller than the pane and its lowest items sit off screen with no way to
    // reach them. The CSS side of the cap is styles.ts's `.fg-popup` rule, so any popup content —
    // a menu today, whatever else `Popup` grows tomorrow — scrolls the same way past this height.
    // `- 2` is that rule's own 1px top and bottom border, styles.ts's own comment on the same line.
    wrapper.style.setProperty('--fg-popup-max-height', `${Math.max(0, pane.bottom - pane.top - 2)}px`);
    const size = { width: wrapper.offsetWidth, height: wrapper.offsetHeight };
    const requested = currentOptions.placement ?? 'bottom';
    let box = placeAt(requested, anchor, size);
    if (!fitsOnPlacementAxis(requested, box, size, pane)) {
      const flipped = OPPOSITE[requested];
      const flippedBox = placeAt(flipped, anchor, size);
      if (fitsOnPlacementAxis(flipped, flippedBox, size, pane)) {
        box = flippedBox;
      }
    }
    box = clamp(box, size, pane);
    // Two different boxes on purpose (#168). `pane` above is the region the popup must stay inside.
    // `overlay.bounds` is the frame it is mounted in, so it is the origin its own transform counts
    // from — the layer you mounted into is the layer you position against.
    const origin = overlay.bounds;
    wrapper.style.transform = `translate(${(box.left - origin.left).toFixed(2)}px, ${(box.top - origin.top).toFixed(2)}px)`;
  };

  return {
    open(options: PopupOptions): void {
      close();
      currentOptions = options;
      const node = document.createElement('div');
      node.className = 'fg-popup';
      node.append(view.renderElement(options.content));
      wrapper = node;
      unmount = overlay.present(node);
      reposition();

      // A trigger named twice arms once: `new Set` keeps `dismissOn` a set of triggers, which is
      // what `includes` already made it.
      const dismissContext: DismissContext = {
        node,
        options,
        dom,
        onDomEvent: view.onDomEvent,
        registerKeyHandler,
        dismiss,
      };
      for (const trigger of new Set(options.dismissOn ?? DEFAULT_DISMISS_ON)) {
        disposables.add(DISMISS_LISTENERS[trigger](dismissContext));
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
