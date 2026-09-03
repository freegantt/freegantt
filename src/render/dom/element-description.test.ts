import { describe, expect, it } from 'vitest';
import { applyElementDescription, buildElement } from './element-description.js';

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

describe('applyElementDescription', () => {
  it('applies class, style, attrs and text onto an existing node, without rebuilding it', () => {
    const node = document.createElement('div');
    applyElementDescription(node, {
      class: { foo: true },
      style: { color: 'red' },
      attrs: { 'data-x': '1' },
      text: 'hello',
    });
    expect(node.classList.contains('foo')).toBe(true);
    expect(node.style.color).toBe('red');
    expect(node.getAttribute('data-x')).toBe('1');
    expect(node.textContent).toBe('hello');

    applyElementDescription(node, {
      class: { foo: false, bar: true },
      style: { color: 'blue' },
      text: 'world',
    });
    expect(node.classList.contains('foo')).toBe(false);
    expect(node.classList.contains('bar')).toBe(true);
    expect(node.style.color).toBe('blue');
    // A key present in one call but absent from the next is removed, not left stale.
    expect(node.getAttribute('data-x')).toBeNull();
    expect(node.textContent).toBe('world');
  });

  // I13: text is the only text channel, and it is set as textContent, never parsed as markup.
  it('a text value containing markup stays text', () => {
    const node = document.createElement('div');
    applyElementDescription(node, { text: '<script>alert(1)</script>' });
    expect(node.textContent).toBe('<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
  });

  it('html sets markup and skips children', () => {
    const node = document.createElement('div');
    applyElementDescription(node, { html: '<b>bold</b>', children: [{ text: 'never appended' }] });
    expect(node.innerHTML).toBe('<b>bold</b>');
  });

  it('keyed children patch in place and prune', () => {
    const node = document.createElement('div');
    applyElementDescription(node, {
      children: [
        { key: 'a', tag: 'span', text: '1' },
        { key: 'b', tag: 'span', text: '2' },
      ],
    });
    const first = node.children[0];
    const second = node.children[1];
    expect(node.children).toHaveLength(2);

    // Reordered, one dropped, one added: existing keys patch and move, 'b' is pruned.
    applyElementDescription(node, {
      children: [
        { key: 'c', tag: 'span', text: '3' },
        { key: 'a', tag: 'span', text: '1-updated' },
      ],
    });
    expect(node.children).toHaveLength(2);
    expect(node.children[1]).toBe(first); // key 'a' patched in place, not recreated
    expect(node.children[1]?.textContent).toBe('1-updated');
    expect(Array.from(node.children)).not.toContain(second); // key 'b' pruned
  });

  it('reassigning a renderer repaints an existing node without remounting it (I8)', () => {
    const node = document.createElement('div');
    applyElementDescription(node, { text: 'first' });
    const before = node;
    applyElementDescription(node, { text: 'second' });
    expect(node).toBe(before);
    expect(node.textContent).toBe('second');
  });
});
