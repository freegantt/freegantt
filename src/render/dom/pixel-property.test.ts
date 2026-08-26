import { describe, expect, it } from 'vitest';
import { readPixelProperty } from './pixel-property.js';

function containerWith(property: string, value: string): HTMLElement {
  const container = document.createElement('div');
  container.style.setProperty(property, value);
  document.body.append(container);
  return container;
}

const POSITIVE = { fallback: 32, accepts: 'positive' } as const;
const ZERO_OR_MORE = { fallback: 160, accepts: 'zeroOrMore' } as const;

describe('readPixelProperty', () => {
  it('reads an authored px value off the element', () => {
    expect(readPixelProperty(containerWith('--fg-row-height', '40px'), '--fg-row-height', POSITIVE)).toBe(40);
  });

  it('falls back when the property is unset', () => {
    const container = document.createElement('div');
    expect(readPixelProperty(container, '--fg-row-height', POSITIVE)).toBe(32);
  });

  it('falls back when the value does not parse as a number', () => {
    const container = containerWith('--fg-row-height', 'inherit');
    expect(readPixelProperty(container, '--fg-row-height', POSITIVE)).toBe(32);
  });

  it("a 'positive' property rejects zero — a zero-height row is not a row", () => {
    const container = containerWith('--fg-row-height', '0px');
    expect(readPixelProperty(container, '--fg-row-height', POSITIVE)).toBe(32);
  });

  it("a 'zeroOrMore' property keeps zero — a consumer turning the grid pane off authored that", () => {
    const container = containerWith('--fg-grid-pane-width', '0px');
    expect(readPixelProperty(container, '--fg-grid-pane-width', ZERO_OR_MORE)).toBe(0);
  });

  it('rejects a negative value under either policy', () => {
    expect(readPixelProperty(containerWith('--fg-row-height', '-4px'), '--fg-row-height', POSITIVE)).toBe(32);
    expect(
      readPixelProperty(containerWith('--fg-grid-pane-width', '-4px'), '--fg-grid-pane-width', ZERO_OR_MORE),
    ).toBe(160);
  });
});
