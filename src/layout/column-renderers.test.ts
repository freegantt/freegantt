import { describe, expect, it } from 'vitest';
import type { ColumnRendererContext, ElementDescription } from '../model/index.js';
import { image, meter } from './column-renderers.js';

function cell(fieldValue: unknown, value = ''): ColumnRendererContext {
  return { value, fieldValue };
}

function child(tree: ElementDescription | undefined, key: string): ElementDescription | undefined {
  return tree?.children?.find((node) => node.key === key);
}

function rolesIn(tree: ElementDescription | undefined): string[] {
  const roles: string[] = [];
  function walk(node: ElementDescription | undefined): void {
    if (node === undefined) return;
    const role = node.attrs?.['role'];
    if (role !== undefined) roles.push(role);
    for (const next of node.children ?? []) walk(next);
  }
  walk(tree);
  return roles;
}

describe('meter()', () => {
  it("with fieldValue 35 and value '35%' paints a hidden track, fill 35%, and the text", () => {
    const tree = meter()(cell(35, '35%'));
    const track = child(tree, 'track');
    const fill = child(track, 'fill');
    expect(track?.attrs?.['aria-hidden']).toBe('true');
    expect(child(tree, 'text')?.text).toBe('35%');
    expect(fill?.style?.['width']).toBe('35%');
    expect(rolesIn(tree)).toEqual([]);
  });

  it('fieldValue undefined returns undefined — no track, no stand-in for "not stated"', () => {
    expect(meter()(cell(undefined))).toBeUndefined();
  });

  it("fieldValue 0 paints a track with fill 0% — 'nothing done', not 'not stated'", () => {
    const tree = meter()(cell(0, '0%'));
    const track = child(tree, 'track');
    expect(track).toBeDefined();
    expect(child(track, 'fill')?.style?.['width']).toBe('0%');
    expect(child(tree, 'text')?.text).toBe('0%');
  });

  it("fieldValue 120 clamps fill to 100% and still prints the true '120%'", () => {
    const tree = meter()(cell(120, '120%'));
    expect(child(child(tree, 'track'), 'fill')?.style?.['width']).toBe('100%');
    expect(child(tree, 'text')?.text).toBe('120%');
  });

  it('a negative reading clamps paint to 0 and still prints the formatted value', () => {
    const tree = meter()(cell(-5, '-5%'));
    expect(child(child(tree, 'track'), 'fill')?.style?.['width']).toBe('0%');
    expect(child(tree, 'text')?.text).toBe('-5%');
  });

  it('NaN and a non-number paint nothing', () => {
    expect(meter()(cell(Number.NaN, 'NaN'))).toBeUndefined();
    expect(meter()(cell('35', '35%'))).toBeUndefined();
  });

  it('meter({ text: false }) is a meter role with no text child, never a progressbar', () => {
    const tree = meter({ text: false })(cell(35, '35%'));
    expect(child(tree, 'text')).toBeUndefined();
    expect(tree?.attrs?.['role']).toBe('meter');
    expect(tree?.attrs?.['aria-valuemin']).toBe('0');
    expect(tree?.attrs?.['aria-valuenow']).toBe('35');
    expect(tree?.attrs?.['aria-valuemax']).toBe('100');
    expect(rolesIn(tree)).toEqual(['meter']);
  });

  it('text: false at 120 sets valuenow and valuemax to 120, so AT is not told 100', () => {
    const tree = meter({ text: false })(cell(120, '120%'));
    expect(child(child(tree, 'track'), 'fill')?.style?.['width']).toBe('100%');
    expect(tree?.attrs?.['aria-valuenow']).toBe('120');
    expect(tree?.attrs?.['aria-valuemax']).toBe('120');
  });
});

describe('image()', () => {
  it("image()(cell(url, 'Ada')) uses the formatted value as alt", () => {
    const src = 'https://example.com/ada.png';
    expect(image()(cell(src, 'Ada'))).toEqual({
      tag: 'img',
      class: { 'fg-image-cell': true },
      attrs: { src, alt: 'Ada' },
    });
  });

  it("image({ alt: 'Logo' }) keeps the static alt, not the formatted value", () => {
    const src = 'https://example.com/logo.png';
    expect(image({ alt: 'Logo' })(cell(src, 'Ada'))).toEqual({
      tag: 'img',
      class: { 'fg-image-cell': true },
      attrs: { src, alt: 'Logo' },
    });
  });

  it('a non-string or empty fieldValue paints an empty cell, no img', () => {
    const render = image();
    expect(render(cell(undefined))).toBeUndefined();
    expect(render(cell(35))).toBeUndefined();
    expect(render(cell(''))).toBeUndefined();
  });
});
