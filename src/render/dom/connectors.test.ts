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
    attachment.sync([], 500, 200, 100);
    expect(layer.querySelectorAll('[data-connector-id]')).toHaveLength(0);
    expect(layer.querySelector('svg')).not.toBeNull();
  });

  it('stamps the id, the flag tokens, the class and the path', () => {
    const { layer, attachment } = mount();
    attachment.sync([related], 500, 200, 100);
    const node = layer.querySelector('path[data-connector-id="related:ab"]');
    expect(node?.getAttribute('data-flag')).toBe('inactive cycle');
    expect(node?.getAttribute('class')).toBe('fg-connector related');
    expect(node?.getAttribute('d')).toBe('M10 16L20 16L20 48');
  });

  it('names a labelled connector for a screen reader and hides an unlabelled one', () => {
    const { layer, attachment } = mount();
    attachment.sync([related, { ...related, id: 'plain', label: '' }], 500, 200, 100);
    const named = layer.querySelector('[data-connector-id="related:ab"]');
    const plain = layer.querySelector('[data-connector-id="plain"]');
    expect(named?.getAttribute('role')).toBe('img');
    expect(named?.getAttribute('aria-label')).toBe('A relates to B');
    expect(plain?.getAttribute('aria-hidden')).toBe('true');
    expect(plain?.hasAttribute('aria-label')).toBe(false);
  });

  it('removes the path of a connector the next frame drops', () => {
    const { layer, attachment } = mount();
    attachment.sync([related], 500, 200, 100);
    attachment.sync([], 500, 200, 100);
    expect(layer.querySelectorAll('[data-connector-id]')).toHaveLength(0);
  });

  it('sizes the svg to the content', () => {
    const { layer, attachment } = mount();
    attachment.sync([], 500, 200, 300);
    const svg = layer.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('500');
    expect(svg?.getAttribute('height')).toBe('300');
  });
});
