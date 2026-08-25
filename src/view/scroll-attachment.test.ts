import { describe, expect, it } from 'vitest';
import { attachScroll } from './scroll-attachment.js';
import { ScrollModel } from '../layout/index.js';

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

describe('attachScroll', () => {
  it('a model-driven position write lands on the element', () => {
    const scroll = new ScrollModel();
    const element = el();
    const attachment = attachScroll(element, scroll, () => {});
    attachment.setContent({ width: 1000, height: 1000 });
    attachment.setPane({ width: 100, height: 100 });

    scroll.panTo({ x: 250, y: 300 });
    expect(element.scrollLeft).toBe(250);
    expect(element.scrollTop).toBe(300);
  });

  it('a native scroll event updates the model', () => {
    const scroll = new ScrollModel();
    const element = el();
    const attachment = attachScroll(element, scroll, () => {});
    attachment.setContent({ width: 1000, height: 1000 });
    attachment.setPane({ width: 100, height: 100 });

    element.scrollLeft = 40;
    element.scrollTop = 60;
    element.dispatchEvent(new Event('scroll'));

    expect(scroll.state.position).toEqual({ x: 40, y: 60 });
  });

  it('onChange runs before the element is written (D-S1.5-7)', () => {
    const scroll = new ScrollModel();
    const element = el();
    let scrollTopDuringRender = -1;
    const attachment = attachScroll(element, scroll, () => {
      scrollTopDuringRender = element.scrollTop;
    });
    attachment.setContent({ width: 1000, height: 1000 });
    attachment.setPane({ width: 100, height: 100 });

    scroll.panTo({ y: 50 });
    // At the moment render() ran, the element had not yet been written.
    expect(scrollTopDuringRender).toBe(0);
    expect(element.scrollTop).toBe(50);
  });

  it('detach() removes the listener and unbinds', () => {
    const scroll = new ScrollModel();
    const element = el();
    const attachment = attachScroll(element, scroll, () => {});
    attachment.setContent({ width: 1000, height: 1000 });
    attachment.setPane({ width: 100, height: 100 });

    attachment.detach();

    scroll.panTo({ x: 999 });
    // Unbound: the shared max no longer includes this binding, so panTo clamps to 0.
    expect(element.scrollLeft).toBe(0);

    element.scrollLeft = 500;
    element.dispatchEvent(new Event('scroll'));
    // Listener removed: the native event no longer reaches the model.
    expect(scroll.state.position.x).toBe(0);
  });
});
