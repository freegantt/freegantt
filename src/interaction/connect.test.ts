import { describe, expect, it } from 'vitest';
import { attachConnect } from './connect.js';
import type { ConnectDraft, ConnectGestureContext, EntryHit } from '../view/index.js';
import type { ConnectEnds } from '../view/index.js';
import { EntryStore } from '../data/index.js';
import { barId, entryId, entryIdOfBar } from '../model/index.js';
import type { BarId, Entry, Instant } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
/** The real store builds the `Entry` the controller asks about (ADR 0017). Dates are bare numbers:
 *  `interaction/` may not import `time/` (I1), and this suite reads no date. */
const ENTRIES = new EntryStore(
  [A, B].map((id, siblingIndex) => ({
    id,
    name: id,
    start: 0 as unknown as Instant,
    end: 1 as unknown as Instant,
    props: {},
    siblingIndex,
  })),
  { timeZone: 'UTC' },
);

/** Pointer positions stand for hit targets: x 0 is A's end port, x 10 is B's start port, x 5 is the
 *  body of B, x 20 is nothing. `hitTest` is `render/dom`'s own job, so this suite fakes it. */
const AT = { aEndPort: 0, bStartPort: 10, aStartPort: 2, bBody: 5, nothing: 20 } as const;

function hitAt(x: number): EntryHit | undefined {
  switch (x) {
    case AT.aEndPort:
      return { kind: 'bar', barId: barId(A), port: 'end' };
    case AT.aStartPort:
      return { kind: 'bar', barId: barId(A), port: 'start' };
    case AT.bStartPort:
      return { kind: 'bar', barId: barId(B), port: 'start' };
    case AT.bBody:
      return { kind: 'bar', barId: barId(B) };
    default:
      return undefined;
  }
}

interface Setup {
  pane: HTMLElement;
  container: HTMLElement;
  paints: (ConnectDraft | undefined)[];
  proposals: { ends: ConnectEnds; signal: AbortSignal }[];
  detach: () => void;
}

function setup(
  options: {
    canConnect?: (entry: Entry) => boolean;
    answer?: boolean | Promise<boolean>;
  } = {},
): Setup {
  const container = document.createElement('div');
  const pane = document.createElement('div');
  container.append(pane);
  document.body.append(container);
  pane.setPointerCapture = () => {};
  pane.releasePointerCapture = () => {};
  const paints: (ConnectDraft | undefined)[] = [];
  const proposals: { ends: ConnectEnds; signal: AbortSignal }[] = [];
  const ctx: ConnectGestureContext = {
    hitTest: (at) => hitAt(at.x),
    entryFor: (id: BarId) => ENTRIES.get(entryIdOfBar(id)),
    canConnect: options.canConnect ?? (() => true),
    contentXAtPaneOffset: (offsetX) => offsetX,
    contentYAtClientY: (clientY) => clientY,
    paint: (draft) => paints.push(draft),
    propose: (ends, signal) => {
      proposals.push({ ends, signal });
      return options.answer ?? true;
    },
  };
  const attachment = attachConnect(pane, container, ctx);
  return {
    pane,
    container,
    paints,
    proposals,
    detach: () => {
      attachment.detach();
      container.remove();
    },
  };
}

function pointer(type: string, clientX: number, mods: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { clientX, clientY: 0, pointerId: 1, bubbles: true, ...mods });
}

/** Presses on a port, then moves far enough to arm the drag. */
function pressAndArm(pane: HTMLElement, from: number, to: number): void {
  pane.dispatchEvent(pointer('pointerdown', from));
  pane.dispatchEvent(pointer('pointermove', to));
}

describe('Connect controller', () => {
  it('writes and paints nothing on pointer down', () => {
    const { pane, paints, proposals, detach } = setup();

    pane.dispatchEvent(pointer('pointerdown', AT.aEndPort));

    expect(paints).toEqual([undefined]);
    expect(proposals).toEqual([]);
    detach();
  });

  it('arms only after the pointer clears the drag threshold', () => {
    const { pane, paints, detach } = setup();

    pane.dispatchEvent(pointer('pointerdown', AT.aEndPort));
    pane.dispatchEvent(pointer('pointermove', AT.aEndPort + 1)); // 1px: under the threshold
    expect(paints).toEqual([undefined]);

    pane.dispatchEvent(pointer('pointermove', AT.bStartPort));
    expect(paints.at(-1)).toMatchObject({ fromBarId: barId(A), fromEdge: 'end', targetEdge: 'start' });
    detach();
  });

  it('proposes the two ends on a drop over another Entry’s port', () => {
    const { pane, proposals, detach } = setup();

    pressAndArm(pane, AT.aEndPort, AT.bStartPort);
    pane.dispatchEvent(pointer('pointerup', AT.bStartPort));

    expect(proposals.map((p) => p.ends)).toEqual([
      { from: { entryId: A, edge: 'end' }, to: { entryId: B, edge: 'start' } },
    ]);
    detach();
  });

  it('parks the preview line after a drop', () => {
    const { pane, paints, detach } = setup();

    pressAndArm(pane, AT.aEndPort, AT.bStartPort);
    pane.dispatchEvent(pointer('pointerup', AT.bStartPort));

    expect(paints.at(-1)).toBeUndefined();
    detach();
  });

  it('a drop on the same Entry’s own edge proposes nothing', () => {
    const { pane, proposals, paints, detach } = setup();

    pressAndArm(pane, AT.aEndPort, AT.aStartPort);
    expect(paints.at(-1)?.targetEdge).toBeUndefined();
    pane.dispatchEvent(pointer('pointerup', AT.aStartPort));

    expect(proposals).toEqual([]);
    expect(paints.at(-1)).toBeUndefined();
    detach();
  });

  it('a drop on a bar body, or on no bar, proposes nothing', () => {
    const { pane, proposals, detach } = setup();

    pressAndArm(pane, AT.aEndPort, AT.bBody);
    pane.dispatchEvent(pointer('pointerup', AT.bBody));
    pressAndArm(pane, AT.aEndPort, AT.nothing);
    pane.dispatchEvent(pointer('pointerup', AT.nothing));

    expect(proposals).toEqual([]);
    detach();
  });

  it('Escape cancels a live drag, proposes nothing, and is not seen by later listeners', () => {
    const { pane, container, paints, proposals, detach } = setup();
    let laterSawEscape = false;
    container.addEventListener('keydown', () => {
      laterSawEscape = true;
    });

    pressAndArm(pane, AT.aEndPort, AT.bStartPort);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pane.dispatchEvent(pointer('pointerup', AT.bStartPort));

    expect(proposals).toEqual([]);
    expect(paints.at(-1)).toBeUndefined();
    expect(laterSawEscape).toBe(false);
    detach();
  });

  it('Escape with no drag and no hold passes through', () => {
    const { container, detach } = setup();
    let laterSawEscape = false;
    container.addEventListener('keydown', () => {
      laterSawEscape = true;
    });

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(laterSawEscape).toBe(true);
    detach();
  });

  it('a port of an Entry that cannot connect starts no drag', () => {
    const { pane, paints, proposals, detach } = setup({ canConnect: () => false });
    let barSawPointer = false;
    pane.addEventListener('pointerdown', () => {
      barSawPointer = true;
    });

    pressAndArm(pane, AT.aEndPort, AT.bStartPort);
    pane.dispatchEvent(pointer('pointerup', AT.bStartPort));

    expect(paints).toEqual([]);
    expect(proposals).toEqual([]);
    expect(barSawPointer).toBe(true);
    detach();
  });

  it('a press away from every port starts no drag and leaves the pointer to the bar gestures', () => {
    const { pane, paints, detach } = setup();
    let barSawPointer = false;
    pane.addEventListener('pointerdown', () => {
      barSawPointer = true;
    });

    pressAndArm(pane, AT.bBody, AT.nothing);

    expect(paints).toEqual([]);
    expect(barSawPointer).toBe(true);
    detach();
  });

  it('a right-click on a port starts no drag', () => {
    const { pane, paints, detach } = setup();

    pane.dispatchEvent(pointer('pointerdown', AT.aEndPort, { button: 2 }));

    expect(paints).toEqual([]);
    detach();
  });

  it('keeps the pointer from the bar gestures, a plain click on a port included', () => {
    const { pane, detach } = setup();
    const seen: string[] = [];
    for (const type of ['pointerdown', 'pointerup']) {
      pane.addEventListener(type, () => seen.push(type));
    }

    pane.dispatchEvent(pointer('pointerdown', AT.aEndPort));
    pane.dispatchEvent(pointer('pointerup', AT.aEndPort));

    expect(seen).toEqual([]);
    detach();
  });

  it('paints the drop as pending while an async veto holds it, then parks the line', async () => {
    let settle: (allowed: boolean) => void = () => {};
    const { pane, paints, detach } = setup({
      answer: new Promise<boolean>((resolve) => {
        settle = resolve;
      }),
    });

    pressAndArm(pane, AT.aEndPort, AT.bStartPort);
    pane.dispatchEvent(pointer('pointerup', AT.bStartPort));
    expect(paints.at(-1)).toMatchObject({ pending: true });

    settle(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(paints.at(-1)).toBeUndefined();
    detach();
  });

  it('Escape during the hold aborts it', () => {
    const { pane, container, paints, proposals, detach } = setup({ answer: new Promise<boolean>(() => {}) });

    pressAndArm(pane, AT.aEndPort, AT.bStartPort);
    pane.dispatchEvent(pointer('pointerup', AT.bStartPort));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(proposals[0]?.signal.aborted).toBe(true);
    expect(paints.at(-1)).toBeUndefined();
    detach();
  });

  it('detach removes every listener', () => {
    const { pane, paints, detach } = setup();
    detach();

    pane.dispatchEvent(pointer('pointerdown', AT.aEndPort));

    expect(paints.filter((paint) => paint !== undefined)).toEqual([]);
  });
});
