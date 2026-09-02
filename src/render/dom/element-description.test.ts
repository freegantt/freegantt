import { describe, expect, it } from 'vitest';
import { buildElement } from './element-description.js';

describe('buildElement', () => {
  it('applies tag, class, style, attrs and text', () => {
    const node = buildElement({
      tag: 'span',
      class: { foo: true, bar: false },
      style: { color: 'red' },
      attrs: { 'data-x': '1' },
      text: 'hello',
    });
    expect(node.tagName).toBe('SPAN');
    expect(node.classList.contains('foo')).toBe(true);
    expect(node.classList.contains('bar')).toBe(false);
    expect(node.style.color).toBe('red');
    expect(node.getAttribute('data-x')).toBe('1');
    expect(node.textContent).toBe('hello');
  });

  it('defaults to a div', () => {
    expect(buildElement({}).tagName).toBe('DIV');
  });

  // I13: text is the only text channel, and it is set as textContent, never parsed as markup.
  it('a text value containing markup stays text', () => {
    const node = buildElement({ text: '<script>alert(1)</script>' });
    expect(node.textContent).toBe('<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
  });

  it('html sets markup and skips children', () => {
    const node = buildElement({
      html: '<b>bold</b>',
      children: [{ text: 'never appended' }],
    });
    expect(node.innerHTML).toBe('<b>bold</b>');
    expect(node.textContent).toBe('bold');
  });

  it('recurses into children', () => {
    const node = buildElement({
      children: [
        { tag: 'em', text: 'a' },
        { tag: 'span', text: 'b' },
      ],
    });
    expect(node.children).toHaveLength(2);
    expect(node.children[0]?.tagName).toBe('EM');
    expect(node.children[1]?.tagName).toBe('SPAN');
    expect(node.textContent).toBe('ab');
  });
});
