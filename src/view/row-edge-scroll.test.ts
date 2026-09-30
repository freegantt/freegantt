import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollAxis, bindScrollAxis } from '../layout/viewport/scroll-axis.js';
import {
  EDGE_ZONE_PX,
  MAX_EDGE_SCROLL_PX_PER_SECOND,
  createRowEdgeScroll,
  edgeScrollSpeed,
} from './row-edge-scroll.js';

const ROWS_HEIGHT = 400;

describe('edgeScrollSpeed', () => {
  it('is zero between the two edge zones', () => {
    expect(edgeScrollSpeed(EDGE_ZONE_PX, ROWS_HEIGHT)).toBe(0);
    expect(edgeScrollSpeed(ROWS_HEIGHT / 2, ROWS_HEIGHT)).toBe(0);
    expect(edgeScrollSpeed(ROWS_HEIGHT - EDGE_ZONE_PX, ROWS_HEIGHT)).toBe(0);
  });

  it('scrolls up near the top and down near the bottom', () => {
    expect(edgeScrollSpeed(EDGE_ZONE_PX / 2, ROWS_HEIGHT)).toBeLessThan(0);
    expect(edgeScrollSpeed(ROWS_HEIGHT - EDGE_ZONE_PX / 2, ROWS_HEIGHT)).toBeGreaterThan(0);
  });

  it('grows as the pointer nears the edge', () => {
    const shallow = edgeScrollSpeed(ROWS_HEIGHT - 30, ROWS_HEIGHT);
    const deep = edgeScrollSpeed(ROWS_HEIGHT - 10, ROWS_HEIGHT);
    expect(deep).toBeGreaterThan(shallow);
  });

  it('holds the cap at the edge and past it', () => {
    expect(edgeScrollSpeed(ROWS_HEIGHT, ROWS_HEIGHT)).toBe(MAX_EDGE_SCROLL_PX_PER_SECOND);
    expect(edgeScrollSpeed(ROWS_HEIGHT + 500, ROWS_HEIGHT)).toBe(MAX_EDGE_SCROLL_PX_PER_SECOND);
    expect(edgeScrollSpeed(-500, ROWS_HEIGHT)).toBe(-MAX_EDGE_SCROLL_PX_PER_SECOND);
  });

  it('shrinks the zones so they never overlap in a short viewport', () => {
    expect(edgeScrollSpeed(10, 20)).toBe(0);
    expect(edgeScrollSpeed(15, 20)).toBeGreaterThan(0);
    expect(edgeScrollSpeed(0, 0)).toBe(0);
  });
});

describe('createRowEdgeScroll', () => {
  let frames: (() => void)[];
  let nowMs: number;
  let scrollY: ScrollAxis;
  let scrolled: ReturnType<typeof vi.fn>;

  function runFrame(elapsedMs = 16): void {
    nowMs += elapsedMs;
    const due = frames;
    frames = [];
    for (const frame of due) frame();
  }

  function edgeScroll() {
    return createRowEdgeScroll({
      scrollY,
      rowsTop: () => 100,
      rowsHeight: () => ROWS_HEIGHT,
      now: () => nowMs,
    });
  }

  beforeEach(() => {
    frames = [];
    nowMs = 1000;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
    scrollY = new ScrollAxis();
    bindScrollAxis(scrollY, { content: 2000, pane: ROWS_HEIGHT }, () => {});
    scrolled = vi.fn();
  });

  const NEAR_BOTTOM = 100 + ROWS_HEIGHT - 5;
  const NEAR_TOP = 100 + 5;

  it('starts no frame while the pointer is outside both zones', () => {
    edgeScroll().follow(300, scrolled);
    expect(frames).toHaveLength(0);
  });

  it('scrolls down each frame while the pointer rests in the bottom zone, with no further move', () => {
    edgeScroll().follow(NEAR_BOTTOM, scrolled);
    runFrame();
    const afterOne = scrollY.state.position;
    expect(afterOne).toBeGreaterThan(0);
    expect(scrolled).toHaveBeenCalledTimes(1);

    runFrame();
    expect(scrollY.state.position).toBeGreaterThan(afterOne);
    expect(scrolled).toHaveBeenCalledTimes(2);
  });

  it('scrolls up in the top zone', () => {
    scrollY.panTo(500);
    edgeScroll().follow(NEAR_TOP, scrolled);
    runFrame();
    expect(scrollY.state.position).toBeLessThan(500);
  });

  it('scrolls faster the nearer the pointer is to the edge', () => {
    const shallow = new ScrollAxis();
    bindScrollAxis(shallow, { content: 2000, pane: ROWS_HEIGHT }, () => {});
    createRowEdgeScroll({
      scrollY: shallow,
      rowsTop: () => 100,
      rowsHeight: () => ROWS_HEIGHT,
      now: () => nowMs,
    }).follow(100 + ROWS_HEIGHT - 10, scrolled);
    runFrame();
    const shallowStep = shallow.state.position;

    scrollY.panTo(0);
    frames = [];
    edgeScroll().follow(100 + ROWS_HEIGHT - 35, scrolled);
    runFrame();
    expect(shallowStep).toBeGreaterThan(scrollY.state.position);
  });

  it('caps one step at 50 ms so a slow frame cannot jump the rows', () => {
    edgeScroll().follow(100 + ROWS_HEIGHT, scrolled);
    runFrame(5000);
    expect(scrollY.state.position).toBeCloseTo((MAX_EDGE_SCROLL_PX_PER_SECOND * 50) / 1000);
  });

  it('stops when the pointer leaves the zone', () => {
    const scroll = edgeScroll();
    scroll.follow(NEAR_BOTTOM, scrolled);
    scroll.follow(300, scrolled);
    runFrame();
    expect(scrollY.state.position).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it('stops at the content end, and restarts when the pointer moves', () => {
    scrollY.panTo(1600); // the maximum: 2000 - 400
    const scroll = edgeScroll();
    scroll.follow(NEAR_BOTTOM, scrolled);
    runFrame();
    expect(scrolled).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);

    scrollY.panTo(1000);
    scroll.follow(NEAR_BOTTOM + 1, scrolled);
    runFrame();
    expect(scrollY.state.position).toBeGreaterThan(1000);
  });

  it('stop() ends the scroll and forgets the callback', () => {
    const scroll = edgeScroll();
    scroll.follow(NEAR_BOTTOM, scrolled);
    scroll.stop();
    runFrame();
    expect(scrollY.state.position).toBe(0);
    expect(scrolled).not.toHaveBeenCalled();
    scroll.stop();
  });

  it('keeps one frame pending, however often the pointer moves', () => {
    const scroll = edgeScroll();
    scroll.follow(NEAR_BOTTOM, scrolled);
    scroll.follow(NEAR_BOTTOM + 1, scrolled);
    scroll.follow(NEAR_BOTTOM + 2, scrolled);
    expect(frames).toHaveLength(1);
  });

  it('reuses one frame callback for every step', () => {
    edgeScroll().follow(NEAR_BOTTOM, scrolled);
    const first = frames[0];
    runFrame();
    expect(frames[0]).toBe(first);
  });
});
