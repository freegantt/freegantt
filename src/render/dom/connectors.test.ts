import { describe, expect, it } from 'vitest';
import { attachConnectors } from './connectors.js';
import type { FrameConnector } from '../../layout/index.js';

function mount() {
  const layer = document.createElement('div');
  const bars = document.createElement('div');
  layer.append(bars);
  document.body.append(layer);
  return { layer, attachment: attachConnectors(layer, bars) };
}

const related: FrameConnector = {
  id: 'related:ab',
  path: [
    { cmd: 'M', x: 10, y: 16 },
    { cmd: 'L', x: 20, y: 16 },
    { cmd: 'L', x: 20, y: 48 },
  ],
  flags: { inactive: true, cycle: true },
  flagTokens: 'inactive cycle',
  class: 'related',
  label: 'A relates to B',
};

describe('connector paint', () => {
  it('draws no path when no connector exists', () => {
    const { layer, attachment } = mount();
    attachment.sync([], 'none', 500, 200, 100);
    expect(layer.querySelectorAll('[data-connector-id]')).toHaveLength(0);
    expect(layer.querySelector('svg')).not.toBeNull();
  });

  it('stamps the id, the flag tokens, the class and the path', () => {
    const { layer, attachment } = mount();
    attachment.sync([related], 'none', 500, 200, 100);
    const node = layer.querySelector('path[data-connector-id="related:ab"]');
    expect(node?.getAttribute('data-flag')).toBe('inactive cycle');
    expect(node?.getAttribute('class')).toBe('fg-connector related');
    expect(node?.getAttribute('d')).toBe('M10 16L20 16L20 48');
  });

  it('names a labelled connector for a screen reader and hides an unlabelled one', () => {
    const { layer, attachment } = mount();
    attachment.sync([related, { ...related, id: 'plain', label: '' }], 'none', 500, 200, 100);
    const named = layer.querySelector('[data-connector-id="related:ab"]');
    const plain = layer.querySelector('[data-connector-id="plain"]');
    expect(named?.getAttribute('role')).toBe('img');
    expect(named?.getAttribute('aria-label')).toBe('A relates to B');
    expect(plain?.getAttribute('aria-hidden')).toBe('true');
    expect(plain?.hasAttribute('aria-label')).toBe(false);
  });

  it('mounts the line layer before the bar layer and the upper layer after it', () => {
    const { layer, attachment } = mount();
    attachment.sync([related], 'none', 500, 200, 100);
    const children = Array.from(layer.children).map((child) => child.className);
    expect(children).toEqual(['fg-connectors', '', 'fg-connectors fg-connectors-over']);
  });

  it('repeats only a selected connector above the bars, without a pointer target', () => {
    const { layer, attachment } = mount();
    const selected: FrameConnector = { ...related, flags: { selected: true }, flagTokens: 'selected' };
    attachment.sync([selected, { ...related, id: 'other' }], 'none', 500, 200, 100);
    const copies = layer.querySelectorAll('.fg-connectors-over path');
    expect(copies).toHaveLength(1);
    expect(copies[0]?.getAttribute('data-flag')).toBe('selected');
    expect(copies[0]?.hasAttribute('data-connector-id')).toBe(false);
    attachment.sync([related], 'none', 500, 200, 100);
    expect(layer.querySelectorAll('.fg-connectors-over path')).toHaveLength(0);
  });

  it('draws an arrowhead at the arrival end only while the arrow is end', () => {
    const { layer, attachment } = mount();
    attachment.sync([related], 'end', 500, 200, 100);
    const line = layer.querySelector('path[data-connector-id="related:ab"]');
    const reference = line?.getAttribute('marker-end') ?? '';
    expect(reference).toMatch(/^url\(#fg-connector-arrow-\d+\)$/);
    expect(layer.querySelector(`marker${reference.slice(4, -1)}`)).not.toBeNull();

    attachment.sync([related], 'none', 500, 200, 100);
    expect(line?.hasAttribute('marker-end')).toBe(false);
  });

  it('gives each mounted layer its own arrowhead id', () => {
    const first = mount();
    const second = mount();
    first.attachment.sync([related], 'end', 500, 200, 100);
    second.attachment.sync([related], 'end', 500, 200, 100);
    const idOf = (layer: HTMLElement) => layer.querySelector('marker')?.getAttribute('id');
    expect(idOf(first.layer)).not.toBe(idOf(second.layer));
  });

  it('removes the path of a connector the next frame drops', () => {
    const { layer, attachment } = mount();
    attachment.sync([related], 'none', 500, 200, 100);
    attachment.sync([], 'none', 500, 200, 100);
    expect(layer.querySelectorAll('[data-connector-id]')).toHaveLength(0);
  });

  it('sizes the svg to the content', () => {
    const { layer, attachment } = mount();
    attachment.sync([], 'none', 500, 200, 300);
    const svg = layer.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('500');
    expect(svg?.getAttribute('height')).toBe('300');
  });

  describe('label text', () => {
    it('draws the label as aria-hidden text at the anchor when the frame carries one', () => {
      const { layer, attachment } = mount();
      attachment.sync([{ ...related, labelAnchor: { x: 15, y: 30 } }], 'none', 500, 200, 100);
      const text = layer.querySelector('text.fg-connector-text');
      expect(text?.textContent).toBe('A relates to B');
      expect(text?.getAttribute('x')).toBe('15');
      expect(text?.getAttribute('y')).toBe('30');
      expect(text?.getAttribute('aria-hidden')).toBe('true');
    });

    it('draws no text node when the frame carries no anchor, and drops the text a later frame omits', () => {
      const { layer, attachment } = mount();
      attachment.sync([related], 'none', 500, 200, 100);
      expect(layer.querySelectorAll('text')).toHaveLength(0);
      attachment.sync([{ ...related, labelAnchor: { x: 15, y: 30 } }], 'none', 500, 200, 100);
      expect(layer.querySelectorAll('text')).toHaveLength(1);
      attachment.sync([related], 'none', 500, 200, 100);
      expect(layer.querySelectorAll('text')).toHaveLength(0);
    });
  });

  describe('focus', () => {
    const second: FrameConnector = { ...related, id: 'second', flags: {}, flagTokens: '' };
    const tabIndexOf = (layer: HTMLElement, id: string): string | null =>
      layer.querySelector(`[data-connector-id="${id}"]`)?.getAttribute('tabindex') ?? null;

    it('makes the first labelled connector the one tab stop when none is selected', () => {
      const { layer, attachment } = mount();
      const plain = { ...related, id: 'plain', label: '', flags: {}, flagTokens: '' };
      attachment.sync([plain, second, { ...second, id: 'third' }], 'none', 500, 200, 100);
      expect(tabIndexOf(layer, 'plain')).toBeNull();
      expect(tabIndexOf(layer, 'second')).toBe('0');
      expect(tabIndexOf(layer, 'third')).toBe('-1');
    });

    it('moves the tab stop to the selected connector and marks it current', () => {
      const { layer, attachment } = mount();
      const selected = { ...second, id: 'third', flags: { selected: true }, flagTokens: 'selected' };
      attachment.sync([second, selected], 'none', 500, 200, 100);
      expect(tabIndexOf(layer, 'second')).toBe('-1');
      expect(tabIndexOf(layer, 'third')).toBe('0');
      expect(layer.querySelector('[data-connector-id="third"]')?.getAttribute('aria-current')).toBe('true');
      expect(layer.querySelector('[data-connector-id="second"]')?.hasAttribute('aria-current')).toBe(false);
    });
  });
});
