// api/ — `ctx.view.presentRowDetail` through a mounted Gantt: a plugin presents content under one Row,
// the Gantt measures it and pushes the rows below it down. happy-dom does no layout, so a fake
// observer reports sizes and a fake `getBoundingClientRect` reads each wrapper's height from its
// content's `data-height`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dataset } from './dataset.js';
import { Gantt } from './gantt.js';
import { definePlugin } from './define-plugin.js';
import type { Disposer } from '../model/index.js';

type Callback = ConstructorParameters<typeof ResizeObserver>[0];

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets = new Set<Element>();
  readonly #callback: Callback;
  constructor(callback: Callback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
  reportHeight(target: Element, blockSize: number): void {
    const entry = { target, borderBoxSize: [{ blockSize, inlineSize: 0 }] } as unknown as ResizeObserverEntry;
    this.#callback([entry], this);
  }
  reportPaneSize(height: number): void {
    const entry = {
      contentBoxSize: [{ inlineSize: 800, blockSize: height }],
    } as unknown as ResizeObserverEntry;
    this.#callback([entry], this);
  }
}

const detailObservers = (): FakeResizeObserver[] =>
  FakeResizeObserver.instances.filter((observer) =>
    [...observer.targets].some((target) => target.classList.contains('fg-row-detail')),
  );

const realRect = Reflect.get(HTMLElement.prototype, 'getBoundingClientRect');

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    if (!this.classList.contains('fg-row-detail')) return realRect.call(this);
    const height = Number(this.firstElementChild?.getAttribute('data-height') ?? 0);
    return { ...realRect.call(this), height, bottom: height };
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.set(HTMLElement.prototype, 'getBoundingClientRect', realRect);
});

const ROW = 36;
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function panelOf(height: number): HTMLElement {
  const panel = document.createElement('section');
  panel.setAttribute('data-height', String(height));
  return panel;
}

function entries(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `t${index}`,
    name: `Task ${index}`,
    start: '2026-01-02',
    end: '2026-01-04',
  }));
}

function mount(options: { count?: number; tree?: boolean } = {}) {
  const view: {
    present: (id: string, content: HTMLElement) => Disposer;
    rowBox: (id: string) => { top: number; height: number } | undefined;
  } = {
    present: () => () => {},
    rowBox: () => undefined,
  };
  const layouts: number[] = [];
  const plugin = definePlugin({
    id: 'demo.rowDetail',
    view(ctx) {
      view.present = (id, content) => ctx.view.presentRowDetail(id, content);
      view.rowBox = (id) => ctx.view.rowBox(id);
      ctx.view.onRowLayout(() => layouts.push(1));
    },
  });
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({
    timeZone: 'UTC',
    entries:
      options.tree === true
        ? [
            { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-09' },
            { id: 'k', name: 'Kid', start: '2026-01-02', end: '2026-01-04', parentId: 'p' },
            { id: 'o', name: 'Other', start: '2026-01-05', end: '2026-01-07' },
          ]
        : entries(options.count ?? 4),
  });
  const gantt = new Gantt({
    container,
    dataset,
    plugins: [plugin],
    ...(options.tree === true ? { rowSource: { source: 'entries' as const, tree: true } } : {}),
  });
  return { gantt, dataset, view, layouts, container };
}

const wrapperIn = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector<HTMLElement>(`.fg-row-detail[data-row-id="${id}"]`);

describe('ctx.view.presentRowDetail', () => {
  it('mounts a wrapper in the full-width row layer and pushes the rows below it down', async () => {
    const { view, container } = mount();
    await nextFrame();
    const before = view.rowBox('t2');

    view.present('t1', panelOf(100));
    await nextFrame();

    const wrapper = wrapperIn(container, 't1')!;
    expect(wrapper.parentElement?.classList.contains('fg-full-width-row-layer')).toBe(true);
    expect(wrapper.hidden).toBe(false);
    expect(view.rowBox('t1')).toEqual(view.rowBox('t1'));
    expect(view.rowBox('t2')?.top).toBe((before?.top ?? 0) + 100);
    expect(view.rowBox('t2')?.height).toBe(before?.height);
    expect(wrapper.style.transform).toBe(
      `translateY(${(view.rowBox('t1')?.top ?? 0) + (view.rowBox('t1')?.height ?? 0)}px)`,
    );
  });

  it('keeps the Row own band: the Row above and the Row itself stay where they were', async () => {
    const { view } = mount();
    await nextFrame();
    const above = view.rowBox('t0');
    const own = view.rowBox('t1');
    view.present('t1', panelOf(100));
    await nextFrame();
    expect(view.rowBox('t0')).toEqual(above);
    expect(view.rowBox('t1')).toEqual(own);
  });

  it('answers a rowBox read right after the present, before any frame', () => {
    const { view } = mount();
    const before = view.rowBox('t2');
    view.present('t1', panelOf(64));
    expect(view.rowBox('t2')?.top).toBe((before?.top ?? 0) + 64);
  });

  it('follows the content: a size the observer reports moves the rows in the same call', async () => {
    const { view, layouts, container } = mount();
    await nextFrame();
    view.present('t1', panelOf(100));
    await nextFrame();
    const top = view.rowBox('t2')!.top;
    layouts.length = 0;

    detailObservers()[0]!.reportHeight(wrapperIn(container, 't1')!, 160);

    expect(view.rowBox('t2')?.top).toBe(top + 60);
    expect(layouts).toHaveLength(1);
  });

  it('closes up the rows when the disposer runs, and does so once', async () => {
    const { view, container } = mount();
    await nextFrame();
    const before = view.rowBox('t2');
    const close = view.present('t1', panelOf(100));
    await nextFrame();

    close();
    close();
    await nextFrame();

    expect(wrapperIn(container, 't1')).toBeNull();
    expect(view.rowBox('t2')).toEqual(before);
  });

  it('puts focus on the Row when the detail closes with focus inside it', async () => {
    const { view, container } = mount();
    await nextFrame();
    const panel = panelOf(100);
    const note = document.createElement('textarea');
    panel.append(note);
    const close = view.present('t1', panel);
    await nextFrame();
    note.focus();
    expect(document.activeElement).toBe(note);

    close();

    expect(document.activeElement).toBe(container.querySelector('.fg-row[data-row-id="t1"]'));
  });

  it('moves no focus when the detail closes with focus elsewhere', async () => {
    const { view, container } = mount();
    await nextFrame();
    const close = view.present('t1', panelOf(100));
    await nextFrame();
    const other = container.querySelector<HTMLElement>('.fg-row[data-row-id="t3"]')!;
    other.focus();

    close();

    expect(document.activeElement).toBe(other);
  });

  it('removes every detail when the plugin uninstalls', async () => {
    const { gantt, view, container } = mount();
    await nextFrame();
    view.present('t1', panelOf(100));
    view.present('t2', panelOf(50));
    await nextFrame();
    expect(container.querySelectorAll('.fg-row-detail')).toHaveLength(2);

    gantt.plugins = [];
    await nextFrame();

    expect(container.querySelectorAll('.fg-row-detail')).toHaveLength(0);
    expect(detailObservers()).toHaveLength(0);
  });

  it('replaces the detail of a Row, and the old disposer stays quiet', async () => {
    const { view, container } = mount();
    await nextFrame();
    const before = view.rowBox('t2');
    const first = view.present('t1', panelOf(100));
    view.present('t1', panelOf(40));
    await nextFrame();

    first();
    await nextFrame();

    expect(container.querySelectorAll('.fg-row-detail')).toHaveLength(1);
    expect(view.rowBox('t2')?.top).toBe((before?.top ?? 0) + 40);
  });

  it('keeps a detail of a collapsed Row mounted, hidden and spaceless, and shows it again at its height', async () => {
    const { gantt, view, container } = mount({ tree: true });
    await nextFrame();
    view.present('k', panelOf(100));
    await nextFrame();
    const withDetail = view.rowBox('o')!.top;

    gantt.toggleCollapse('p');
    await nextFrame();
    expect(wrapperIn(container, 'k')!.hidden).toBe(true);
    expect(view.rowBox('o')!.top).toBe(withDetail - ROW - 100);

    gantt.toggleCollapse('p');
    await nextFrame();
    expect(wrapperIn(container, 'k')!.hidden).toBe(false);
    expect(view.rowBox('o')!.top).toBe(withDetail);
  });

  it('keeps a detail for an unknown Row mounted and hidden, taking no space', async () => {
    const { view, container } = mount();
    await nextFrame();
    const before = view.rowBox('t2');
    view.present('nobody', panelOf(100));
    await nextFrame();
    expect(wrapperIn(container, 'nobody')!.hidden).toBe(true);
    expect(view.rowBox('t2')).toEqual(before);
  });

  it('moves the detail with its Row when the rows sort', async () => {
    const { gantt, view, container } = mount();
    await nextFrame();
    view.present('t0', panelOf(100));
    await nextFrame();
    const placed = (): number =>
      Number(/(-?[\d.]+)px/u.exec(wrapperIn(container, 't0')!.style.transform)?.[1]);
    const firstTop = placed();

    gantt.rowSource = {
      source: 'entries',
      tree: false,
      sort: { field: 'name', direction: 'desc' },
    };
    await nextFrame();

    expect(placed()).toBe(firstTop + 3 * view.rowBox('t0')!.height);
  });

  it('counts a Page Down by the pixels in the window, so a tall detail shortens the page', async () => {
    const pageDownFromFirstRow = async (detailHeight: number): Promise<string | undefined> => {
      const { view, container } = mount({ count: 40 });
      FakeResizeObserver.instances[0]!.reportPaneSize(ROW * 10);
      if (detailHeight > 0) view.present('t0', panelOf(detailHeight));
      await nextFrame();
      container.querySelector<HTMLElement>('.fg-row[data-row-id="t0"]')!.focus();
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
      return (document.activeElement as HTMLElement).dataset['rowId'];
    };

    const plainPage = Number((await pageDownFromFirstRow(0))?.slice(1));
    expect(plainPage).toBeGreaterThan(1);
    expect(await pageDownFromFirstRow(ROW * 10)).toBe('t1');
  });
});

describe('a Gantt with no Row detail', () => {
  it('creates no observer for details, however many frames paint', async () => {
    const { gantt, view } = mount();
    await nextFrame();
    const created = FakeResizeObserver.instances.length;
    gantt.panToDate('2026-01-06');
    await nextFrame();
    view.rowBox('t2');
    await nextFrame();
    expect(FakeResizeObserver.instances).toHaveLength(created);
    expect(detailObservers()).toHaveLength(0);
  });

  it('creates one observer for the first detail and none for the next', async () => {
    const { view } = mount();
    await nextFrame();
    const created = FakeResizeObserver.instances.length;
    view.present('t0', panelOf(40));
    view.present('t1', panelOf(40));
    await nextFrame();
    expect(FakeResizeObserver.instances).toHaveLength(created + 1);
  });
});
