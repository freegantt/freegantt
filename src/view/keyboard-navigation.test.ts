import { describe, expect, it } from 'vitest';
import { attachKeyboardNavigation } from './keyboard-navigation.js';
import type { KeyboardNavigationContext } from './keyboard-navigation.js';

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

function makeCtx(overrides: Partial<KeyboardNavigationContext> = {}): {
  ctx: KeyboardNavigationContext;
  pans: [number, number][];
  tos: { x?: number; y?: number }[];
} {
  const pans: [number, number][] = [];
  const tos: { x?: number; y?: number }[] = [];
  const ctx: KeyboardNavigationContext = {
    keyboardPanEnabled: () => true,
    hasSelection: () => false,
    panBy: (dx, dy) => {
      pans.push([dx, dy]);
    },
    panTo: (to) => {
      tos.push(to);
    },
    arrowStepX: () => 24,
    arrowStepY: () => 32,
    pageStepY: () => 100,
    scrollMaxX: () => 800,
    ...overrides,
  };
  return { ctx, pans, tos };
}

function key(props: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...props });
}

describe('attachKeyboardNavigation (S3.7, D-S3-13 / D-S3-14)', () => {
  it('PageDown/PageUp pan vertically by one pane height', () => {
    const container = el();
    const { ctx, pans } = makeCtx();
    attachKeyboardNavigation(container, ctx);

    const down = key({ key: 'PageDown' });
    container.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(pans).toEqual([[0, 100]]);

    container.dispatchEvent(key({ key: 'PageUp' }));
    expect(pans).toEqual([
      [0, 100],
      [0, -100],
    ]);
    container.remove();
  });

  it('Home pans to x = 0; End pans to scroll max x', () => {
    const container = el();
    const { ctx, tos } = makeCtx();
    attachKeyboardNavigation(container, ctx);

    container.dispatchEvent(key({ key: 'Home' }));
    container.dispatchEvent(key({ key: 'End' }));

    expect(tos).toEqual([{ x: 0 }, { x: 800 }]);
    container.remove();
  });

  it('unmodified arrows pan when nothing is selected', () => {
    const container = el();
    const { ctx, pans } = makeCtx();
    attachKeyboardNavigation(container, ctx);

    container.dispatchEvent(key({ key: 'ArrowRight' }));
    container.dispatchEvent(key({ key: 'ArrowLeft' }));
    container.dispatchEvent(key({ key: 'ArrowDown' }));
    container.dispatchEvent(key({ key: 'ArrowUp' }));

    expect(pans).toEqual([
      [24, 0],
      [-24, 0],
      [0, 32],
      [0, -32],
    ]);
    container.remove();
  });

  it('arrows are a no-op while something is selected (editing owns them)', () => {
    const container = el();
    const { ctx, pans } = makeCtx({ hasSelection: () => true });
    attachKeyboardNavigation(container, ctx);

    const event = key({ key: 'ArrowRight' });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(pans).toEqual([]);
    container.remove();
  });

  it('Page/Home/End still pan while something is selected', () => {
    const container = el();
    const { ctx, pans, tos } = makeCtx({ hasSelection: () => true });
    attachKeyboardNavigation(container, ctx);

    container.dispatchEvent(key({ key: 'PageDown' }));
    container.dispatchEvent(key({ key: 'Home' }));

    expect(pans).toEqual([[0, 100]]);
    expect(tos).toEqual([{ x: 0 }]);
    container.remove();
  });

  it('keyboardPanEnabled false writes nothing and does not preventDefault', () => {
    const container = el();
    const { ctx, pans, tos } = makeCtx({ keyboardPanEnabled: () => false });
    attachKeyboardNavigation(container, ctx);

    const event = key({ key: 'PageDown' });
    container.dispatchEvent(event);
    container.dispatchEvent(key({ key: 'Home' }));
    container.dispatchEvent(key({ key: 'ArrowRight' }));

    expect(event.defaultPrevented).toBe(false);
    expect(pans).toEqual([]);
    expect(tos).toEqual([]);
    container.remove();
  });

  it('detach() stops further pans', () => {
    const container = el();
    const { ctx, pans } = makeCtx();
    const attachment = attachKeyboardNavigation(container, ctx);
    attachment.detach();

    container.dispatchEvent(key({ key: 'PageDown' }));
    expect(pans).toEqual([]);
    container.remove();
  });
});
