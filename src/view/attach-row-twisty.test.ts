import { describe, expect, it, vi } from 'vitest';
import { attachRowTwisty } from './attach-row-twisty.js';

function gridWithTwistyRow(rowId: string): { pane: HTMLElement; twisty: HTMLButtonElement } {
  const pane = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'fg-row';
  row.dataset['rowId'] = rowId;
  const twisty = document.createElement('button');
  twisty.type = 'button';
  twisty.className = 'fg-row-twisty';
  row.append(twisty);
  pane.append(row);
  return { pane, twisty };
}

describe('attachRowTwisty', () => {
  it('calls toggleCollapse with the row id when the twisty is clicked', () => {
    const { pane, twisty } = gridWithTwistyRow('parent');
    const toggleCollapse = vi.fn();
    attachRowTwisty(pane, { toggleCollapse });

    twisty.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toggleCollapse).toHaveBeenCalledWith('parent');
  });

  it('ignores clicks outside a twisty', () => {
    const { pane } = gridWithTwistyRow('parent');
    const toggleCollapse = vi.fn();
    attachRowTwisty(pane, { toggleCollapse });

    pane.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toggleCollapse).not.toHaveBeenCalled();
  });

  it('detach() removes the listener', () => {
    const { pane, twisty } = gridWithTwistyRow('parent');
    const toggleCollapse = vi.fn();
    const attachment = attachRowTwisty(pane, { toggleCollapse });

    attachment.detach();
    twisty.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toggleCollapse).not.toHaveBeenCalled();
  });
});
