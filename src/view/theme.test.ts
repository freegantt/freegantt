import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme.js';

function fakeMatchMedia(matches: boolean) {
  return () => ({ matches });
}

describe('resolveTheme (#330)', () => {
  it('answers the OS when nothing up the tree pins a theme', () => {
    const container = document.createElement('div');
    document.body.append(container);

    expect(resolveTheme(container, fakeMatchMedia(false))).toBe('light');
    expect(resolveTheme(container, fakeMatchMedia(true))).toBe('dark');

    container.remove();
  });

  it("answers this container's own pin, and never reads matchMedia when it has one", () => {
    const container = document.createElement('div');
    container.setAttribute('data-fg-theme', 'dark');
    document.body.append(container);

    let matchMediaCalled = false;
    const result = resolveTheme(container, () => {
      matchMediaCalled = true;
      return { matches: true };
    });

    expect(result).toBe('dark');
    expect(matchMediaCalled).toBe(false);

    container.remove();
  });

  it("answers an ancestor's own pin when this container carries none (#271)", () => {
    const ancestor = document.createElement('div');
    ancestor.setAttribute('data-fg-theme', 'light');
    const container = document.createElement('div');
    ancestor.append(container);
    document.body.append(ancestor);

    expect(resolveTheme(container, fakeMatchMedia(true))).toBe('light');

    ancestor.remove();
  });

  it("this container's own pin wins over an ancestor's, closest wins", () => {
    const ancestor = document.createElement('div');
    ancestor.setAttribute('data-fg-theme', 'dark');
    const container = document.createElement('div');
    container.setAttribute('data-fg-theme', 'light');
    ancestor.append(container);
    document.body.append(ancestor);

    expect(resolveTheme(container, fakeMatchMedia(true))).toBe('light');

    ancestor.remove();
  });
});
