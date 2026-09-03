import { describe, expect, it, vi } from 'vitest';
import { createPopup } from './popup.js';
import { Keymap } from './keymap.js';
import { CommandRegistry } from './commands.js';
import type { Overlay, OverlayHandle } from '../api/index.js';

function rect(partial: Partial<DOMRect>): DOMRect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...partial };
}

/** `createPopup`'s own `Keymap` dependency (C3) — no commands are ever registered on it in these
 *  tests, so `find`/`when` never run; only `registerHandler` (Escape's own path) exercises it. */
function makeKeymap(): Keymap<unknown> {
  const registry = new CommandRegistry<unknown>(() => ({}) as never);
  return new Keymap<unknown>(registry, () => ({}) as never);
}

/** A minimal `Overlay` fake — the same seam a third-party plugin gets (D-S5-8) — so `Popup` can be
 *  driven with no `PaneLayout`/DOM measurement at all. `present` mounts into a plain container;
 *  `render` mirrors `render/dom/element-description.ts`'s own text-only behaviour, enough for these
 *  tests' content. */
function fakeAnchor(options: {
  bounds: DOMRect;
  grid: DOMRect;
  timeline: DOMRect;
}): Overlay & { container: HTMLElement; resizeListeners: Set<() => void> } {
  const container = document.createElement('div');
  document.body.append(container);
  const resizeListeners = new Set<() => void>();
  return {
    container,
    resizeListeners,
    present(content: HTMLElement): OverlayHandle {
      container.append(content);
      return { detach: () => content.remove() };
    },
    render(description) {
      const node = document.createElement(description.tag ?? 'div');
      if (description.text !== undefined) node.textContent = description.text;
      return node;
    },
    get bounds() {
      return options.bounds;
    },
    get paneBounds() {
      return { grid: options.grid, timeline: options.timeline };
    },
    onResize(callback: () => void) {
      resizeListeners.add(callback);
      return () => resizeListeners.delete(callback);
    },
    elementForEntry() {
      return undefined;
    },
  };
}

/** Stubs `offsetWidth`/`offsetHeight` for every `.fg-popup` node — happy-dom does no layout, so
 *  `Popup`'s own size measurement needs a fixed box to place and flip against. A prototype getter,
 *  not a per-node `Object.defineProperty` after mount: `Popup.open()` measures synchronously, right
 *  after `overlay.present()` returns, so a `MutationObserver`-based stub (queued as a microtask) would
 *  never run in time. */
function withFixedPopupSize(
  overlay: ReturnType<typeof fakeAnchor>,
  size: { width: number; height: number },
): void {
  void overlay;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('fg-popup') ? size.width : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('fg-popup') ? size.height : 0;
    },
  });
}

describe('Popup', () => {
  it('opens at the requested placement and reports isOpen', () => {
    const overlay = fakeAnchor({
      bounds: rect({ left: 0, top: 0, right: 1000, bottom: 500 }),
      grid: rect({ left: 0, top: 0, right: 160, bottom: 500 }),
      timeline: rect({ left: 160, top: 0, right: 1000, bottom: 500 }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const popup = createPopup(overlay, makeKeymap());

    expect(popup.isOpen).toBe(false);
    popup.open({ anchor: rect({ left: 300, top: 100, right: 340, bottom: 120 }), content: { text: 'hi' } });
    expect(popup.isOpen).toBe(true);
    expect(overlay.container.querySelector('.fg-popup')).not.toBeNull();
    expect(overlay.container.textContent).toBe('hi');

    popup.close();
    expect(popup.isOpen).toBe(false);
    expect(overlay.container.querySelector('.fg-popup')).toBeNull();
  });

  it('flips to the opposite side when the requested side does not fit its pane, and clamps the cross axis to the pane, not the wider container', () => {
    // The timeline pane's right and bottom sit strictly inside the overlay's own `bounds` (900/400
    // vs. 1000/500) — if flip or clamp read `bounds` instead of the resolved pane, the assertions
    // below would come out different (no flip; no vertical clamp), so this fixture actually proves
    // pane-scoped math rather than merely restating it.
    const overlay = fakeAnchor({
      bounds: rect({ left: 0, top: 0, right: 1000, bottom: 500 }),
      grid: rect({ left: 0, top: 0, right: 160, bottom: 500 }),
      timeline: rect({ left: 160, top: 0, right: 900, bottom: 400 }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const popup = createPopup(overlay, makeKeymap());

    // Anchored near the timeline pane's right and bottom edges, requesting 'end' (opens to the
    // right) — a 100px-wide popup does not fit before the pane's own right bound at 900, so it flips
    // to 'start'. The flipped box then overshoots the pane's bottom (400) on the cross axis, so it
    // gets clamped there too.
    popup.open({
      anchor: rect({ left: 850, top: 380, right: 890, bottom: 400 }),
      placement: 'end',
      content: { text: 'x' },
    });
    const node = overlay.container.querySelector<HTMLElement>('.fg-popup')!;
    const transform = node.style.transform;
    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform);
    expect(match).not.toBeNull();
    const left = Number(match![1]);
    const top = Number(match![2]);
    // Flipped to 'start': placed to the left of the anchor (anchor.left - width = 850 - 100 = 750).
    expect(left).toBe(750);
    // Clamped to the pane's bottom, not the container's: pane.bottom(400) - height(40) = 360, not
    // the unclamped 380 the container's own bottom (500) would have allowed through.
    expect(top).toBe(360);
  });

  it('Escape closes the popup and calls stopPropagation, so an outer keydown listener never sees it', () => {
    const overlay = fakeAnchor({
      bounds: rect({ right: 1000, bottom: 500 }),
      grid: rect({ right: 160, bottom: 500 }),
      timeline: rect({ left: 160, right: 1000, bottom: 500 }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const keymap = makeKeymap();
    // `GanttShell`'s own production wiring (`gantt-shell.ts`'s `#keymapListener`): a bubble-phase
    // listener on the container, resolving every key event that reaches it against this Gantt's
    // keymap. Bubble, not capture — the popup's own `registerHandler('Escape', ...)` (its
    // `stopPropagation` call included) is exercised the same way it runs for real, and
    // `stopPropagation` stops the event before an outer bubble listener on `document` ever sees it.
    const keymapListener = (event: KeyboardEvent): void => {
      keymap.resolve(event);
    };
    overlay.container.addEventListener('keydown', keymapListener);
    const popup = createPopup(overlay, keymap);
    popup.open({ anchor: rect({ left: 300, top: 100, right: 340, bottom: 120 }), content: { text: 'x' } });

    const outerListener = vi.fn();
    document.addEventListener('keydown', outerListener);

    overlay.container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(popup.isOpen).toBe(false);
    expect(outerListener).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outerListener);
    overlay.container.removeEventListener('keydown', keymapListener);
  });

  it('Escape typed inside the popup content own input still closes it (issue #137 F1 regression)', () => {
    // The editable-target gate (issue #137 F7) exists to protect a *page-level* editable from a
    // stray keybinding, not to protect a popup's own input from the popup's own close key — so this
    // registration must opt in with `captureInEditable: true`. Modeled on the same bubble-phase
    // container wiring as the test above: the input sits inside the popup, which is mounted inside
    // `overlay.container`, the stand-in for `GanttShell`'s `#container`.
    const overlay = fakeAnchor({
      bounds: rect({ right: 1000, bottom: 500 }),
      grid: rect({ right: 160, bottom: 500 }),
      timeline: rect({ left: 160, right: 1000, bottom: 500 }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const keymap = makeKeymap();
    const keymapListener = (event: KeyboardEvent): void => {
      keymap.resolve(event);
    };
    overlay.container.addEventListener('keydown', keymapListener);
    const popup = createPopup(overlay, keymap);
    popup.open({ anchor: rect({ left: 300, top: 100, right: 340, bottom: 120 }), content: { text: 'x' } });

    const input = document.createElement('input');
    overlay.container.querySelector('.fg-popup')!.append(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(popup.isOpen).toBe(false);
    overlay.container.removeEventListener('keydown', keymapListener);
  });

  it('an outside pointerdown closes the popup; one inside the anchor does not', () => {
    const overlay = fakeAnchor({
      bounds: rect({ right: 1000, bottom: 500 }),
      grid: rect({ right: 160, bottom: 500 }),
      timeline: rect({ left: 160, right: 1000, bottom: 500 }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const popup = createPopup(overlay, makeKeymap());
    const anchor = document.createElement('button');
    document.body.append(anchor);
    popup.open({ anchor, content: { text: 'x' } });

    anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popup.isOpen).toBe(true);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popup.isOpen).toBe(false);
  });

  it("a scroll inside the anchor's own pane closes the popup", () => {
    const overlay = fakeAnchor({
      bounds: rect({ right: 1000, bottom: 500 }),
      grid: rect({ right: 160, bottom: 500 }),
      timeline: rect({ left: 160, right: 1000, bottom: 500 }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const popup = createPopup(overlay, makeKeymap());
    // Anchored inside the timeline pane (left: 160..1000).
    popup.open({ anchor: rect({ left: 300, top: 100, right: 340, bottom: 120 }), content: { text: 'x' } });

    // The scroll's own target sits inside the same (timeline) pane — happy-dom does no layout, so
    // its rect is stubbed directly, the same way `withFixedPopupSize` stubs `offsetWidth`.
    const timelineScroller = document.createElement('div');
    document.body.append(timelineScroller);
    Object.defineProperty(timelineScroller, 'getBoundingClientRect', {
      value: () => rect({ left: 160, top: 0, right: 1000, bottom: 500 }),
    });
    timelineScroller.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(popup.isOpen).toBe(false);
  });

  it('a scroll in an unrelated pane does not close the popup', () => {
    const overlay = fakeAnchor({
      bounds: rect({ right: 1000, bottom: 500 }),
      grid: rect({ right: 160, bottom: 500 }),
      timeline: rect({ left: 160, right: 1000, bottom: 500 }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const popup = createPopup(overlay, makeKeymap());
    // Anchored inside the timeline pane (left: 160..1000).
    popup.open({ anchor: rect({ left: 300, top: 100, right: 340, bottom: 120 }), content: { text: 'x' } });

    // The scroll's own target sits in the grid pane instead — geometrically unrelated to the
    // anchor's own (timeline) pane, so the popup stays open.
    const gridScroller = document.createElement('div');
    document.body.append(gridScroller);
    Object.defineProperty(gridScroller, 'getBoundingClientRect', {
      value: () => rect({ left: 0, top: 0, right: 160, bottom: 500 }),
    });
    gridScroller.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(popup.isOpen).toBe(true);
  });

  it('focus: "trap" cycles Tab inside and restores focus on close; focus: "none" never moves it', () => {
    const overlay = fakeAnchor({
      bounds: rect({ right: 1000, bottom: 500 }),
      grid: rect({ right: 160, bottom: 500 }),
      timeline: rect({ left: 160, right: 1000, bottom: 500 }),
    });
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.append(outside);
    outside.focus();

    // focus: 'none' (the default) never moves focus (the tooltip's own policy).
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const keymap = makeKeymap();
    const tooltip = createPopup(overlay, keymap);
    tooltip.open({
      anchor: rect({ left: 300, top: 100, right: 340, bottom: 120 }),
      content: { text: 'hover text' },
    });
    expect(document.activeElement).toBe(outside);
    tooltip.close();

    // focus: 'trap' moves focus into the popup's first focusable node and restores it on close.
    const menu = createPopup(overlay, keymap);
    menu.open({
      anchor: rect({ left: 300, top: 100, right: 340, bottom: 120 }),
      focus: 'trap',
      content: { tag: 'button', attrs: { type: 'button' }, text: 'item' },
    });
    expect(document.activeElement).not.toBe(outside);
    expect(document.activeElement?.tagName).toBe('BUTTON');
    menu.close();
    expect(document.activeElement).toBe(outside);
  });

  it('a container resize repositions an open popup against the fresh rects (issue #137 F9)', () => {
    let timelineRight = 1000;
    const overlay = fakeAnchor({
      bounds: rect({ right: 1000, bottom: 500 }),
      grid: rect({ right: 160, bottom: 500 }),
      timeline: rect({ left: 160, right: 1000, bottom: 500 }),
    });
    // Read live so a resize can change what the overlay reports without a new fakeAnchor().
    Object.defineProperty(overlay, 'paneBounds', {
      get: () => ({
        grid: rect({ right: 160, bottom: 500 }),
        timeline: rect({ left: 160, right: timelineRight, bottom: 500 }),
      }),
    });
    withFixedPopupSize(overlay, { width: 100, height: 40 });
    const popup = createPopup(overlay, makeKeymap());
    // 'bottom' fits its (vertical) placement axis either way; the pane shrink instead moves the
    // cross-axis clamp — the popup's left edge is pinned at the pane's own right bound minus its
    // width, so a narrower pane pushes it further left. The anchor (850..890) stays inside the
    // timeline pane both before and after the shrink (right: 1000 → 900), so `paneRectFor` keeps
    // resolving the same pane — only the clamp moves.
    popup.open({
      anchor: rect({ left: 850, top: 200, right: 890, bottom: 220 }),
      placement: 'bottom',
      content: { text: 'x' },
    });
    const node = overlay.container.querySelector<HTMLElement>('.fg-popup')!;
    const before = node.style.transform;

    timelineRight = 900;
    for (const listener of overlay.resizeListeners) listener();

    expect(node.style.transform).not.toBe(before);
  });
});
