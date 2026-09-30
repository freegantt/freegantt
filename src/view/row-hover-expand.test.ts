import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowId } from '../model/index.js';
import type { RowId } from '../model/index.js';
import { HOVER_EXPAND_DELAY_MS, createRowHoverExpand } from './row-hover-expand.js';

const PARENT = rowId('parent');
const OTHER = rowId('other');
const LEAF = rowId('leaf');

describe('createRowHoverExpand', () => {
  let expanded: RowId[];
  let onExpanded: ReturnType<typeof vi.fn>;

  function hoverExpand() {
    return createRowHoverExpand({
      isCollapsedParent: (id) => id === PARENT || id === OTHER,
      expand: (id) => expanded.push(id),
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    expanded = [];
    onExpanded = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expands a collapsed parent after the delay and then tells the drag', () => {
    const hover = hoverExpand();
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(HOVER_EXPAND_DELAY_MS - 1);
    expect(expanded).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(expanded).toEqual([PARENT]);
    expect(onExpanded).toHaveBeenCalledTimes(1);
  });

  it('waits about 700 ms', () => {
    expect(HOVER_EXPAND_DELAY_MS).toBe(700);
  });

  it('does not restart while the pointer stays on the same target', () => {
    const hover = hoverExpand();
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(500);
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(200);
    expect(expanded).toEqual([PARENT]);
  });

  it('restarts when the target changes to another collapsed parent', () => {
    const hover = hoverExpand();
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(500);
    hover.holdOver(OTHER, onExpanded);
    vi.advanceTimersByTime(500);
    expect(expanded).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(expanded).toEqual([OTHER]);
  });

  it('cancels when the pointer leaves the into zone, and restarts on return', () => {
    const hover = hoverExpand();
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(500);
    hover.holdOver(undefined, onExpanded);
    vi.advanceTimersByTime(1000);
    expect(expanded).toEqual([]);
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(HOVER_EXPAND_DELAY_MS);
    expect(expanded).toEqual([PARENT]);
  });

  it('starts no delay on a row that is not a collapsed parent', () => {
    const hover = hoverExpand();
    hover.holdOver(LEAF, onExpanded);
    vi.advanceTimersByTime(5000);
    expect(expanded).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expands a target once, not again while the pointer stays on it', () => {
    const hover = hoverExpand();
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(HOVER_EXPAND_DELAY_MS);
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(5000);
    expect(expanded).toEqual([PARENT]);
  });

  it('stops without expanding, and is safe to stop twice', () => {
    const hover = hoverExpand();
    hover.holdOver(PARENT, onExpanded);
    hover.stop();
    hover.stop();
    vi.advanceTimersByTime(5000);
    expect(expanded).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts a fresh delay for the same row after a stop', () => {
    const hover = hoverExpand();
    hover.holdOver(PARENT, onExpanded);
    hover.stop();
    hover.holdOver(PARENT, onExpanded);
    vi.advanceTimersByTime(HOVER_EXPAND_DELAY_MS);
    expect(expanded).toEqual([PARENT]);
  });
});
