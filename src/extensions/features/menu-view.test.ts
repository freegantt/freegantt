import { describe, expect, it } from 'vitest';
import { buildMenu, menuItemsIn, menuItemUnder, resolveMenuEntries } from './menu-view.js';
import type { Command } from '../../api/gantt.js';

const demoCommand: Command = { id: 'demo.run', label: 'Run', run: () => {} };

describe('resolveMenuEntries (D-S5-14)', () => {
  it('drops an entry naming a command that is not in available (when: false, same posture as the keybinding path)', () => {
    const resolved = resolveMenuEntries([{ command: 'demo.missing' }], [demoCommand]);
    expect(resolved).toEqual([]);
  });

  it('keeps a separator untouched', () => {
    const resolved = resolveMenuEntries([{ separator: true }], [demoCommand]);
    expect(resolved).toEqual([{ separator: true }]);
  });

  it("falls back to the command's own label when the entry names none", () => {
    const resolved = resolveMenuEntries([{ command: 'demo.run' }], [demoCommand]);
    expect(resolved).toEqual([{ command: 'demo.run', label: 'Run' }]);
  });

  it("an entry's own label overrides the command's", () => {
    const resolved = resolveMenuEntries([{ command: 'demo.run', label: 'Custom' }], [demoCommand]);
    expect(resolved).toEqual([{ command: 'demo.run', label: 'Custom' }]);
  });
});

describe('buildMenu (empty menu)', () => {
  it('renders a menu node with no children for an empty entry list', () => {
    const description = buildMenu([]);
    expect(description.children).toEqual([]);
  });
});

describe('menuItemUnder / menuItemsIn (miss cases)', () => {
  // `buildMenu` returns an `ElementDescription`, the description of a node, not a mounted one
  // (`render/dom` owns that step). These tests build the two classes `menu-view.ts` itself reads
  // back — `.fg-menu-item` and `.fg-menu-separator` — by hand, the same shape `buildMenu` would
  // paint for one item and one separator.
  function mountMenu(): HTMLElement {
    const container = document.createElement('div');
    document.body.append(container);
    const item = document.createElement('button');
    item.className = 'fg-menu-item';
    const separator = document.createElement('div');
    separator.className = 'fg-menu-separator';
    const menu = document.createElement('div');
    menu.className = 'fg-menu';
    menu.append(item, separator);
    container.append(menu);
    return container;
  }

  it('menuItemUnder answers undefined for a click on the separator, not an item', () => {
    const container = mountMenu();
    const separator = container.querySelector<HTMLElement>('.fg-menu-separator')!;
    expect(menuItemUnder(separator)).toBeUndefined();
    container.remove();
  });

  it('menuItemUnder answers undefined for a non-Element target', () => {
    expect(menuItemUnder(null)).toBeUndefined();
  });

  it('menuItemsIn answers an empty list for a node outside every menu', () => {
    const outside = document.createElement('div');
    document.body.append(outside);
    expect(menuItemsIn(outside)).toEqual([]);
    outside.remove();
  });
});
