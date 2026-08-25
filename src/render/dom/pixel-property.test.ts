import { describe, expect, it } from 'vitest';
import { readPixelProperty } from './pixel-property.js';

function hostWith(property: string, value: string): HTMLElement {
  const host = document.createElement('div');
  host.style.setProperty(property, value);
  document.body.append(host);
  return host;
}

const POSITIVE = { fallback: 32, accepts: 'positive' } as const;
const ZERO_OR_MORE = { fallback: 160, accepts: 'zeroOrMore' } as const;

describe('readPixelProperty', () => {
  it('reads an authored px value off the element', () => {
    expect(readPixelProperty(hostWith('--fg-row-height', '40px'), '--fg-row-height', POSITIVE)).toBe(40);
  });

  it('falls back when the property is unset', () => {
    const host = document.createElement('div');
    expect(readPixelProperty(host, '--fg-row-height', POSITIVE)).toBe(32);
  });

  it('falls back when the value does not parse as a number', () => {
    const host = hostWith('--fg-row-height', 'inherit');
    expect(readPixelProperty(host, '--fg-row-height', POSITIVE)).toBe(32);
  });

  it("a 'positive' property rejects zero — a zero-height row is not a row", () => {
    const host = hostWith('--fg-row-height', '0px');
    expect(readPixelProperty(host, '--fg-row-height', POSITIVE)).toBe(32);
  });

  it("a 'zeroOrMore' property keeps zero — a host turning the grid pane off authored that", () => {
    const host = hostWith('--fg-grid-pane-width', '0px');
    expect(readPixelProperty(host, '--fg-grid-pane-width', ZERO_OR_MORE)).toBe(0);
  });

  it('rejects a negative value under either policy', () => {
    expect(readPixelProperty(hostWith('--fg-row-height', '-4px'), '--fg-row-height', POSITIVE)).toBe(32);
    expect(
      readPixelProperty(hostWith('--fg-grid-pane-width', '-4px'), '--fg-grid-pane-width', ZERO_OR_MORE),
    ).toBe(160);
  });
});
