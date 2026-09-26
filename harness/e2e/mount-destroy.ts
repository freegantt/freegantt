// The first consumer's own shape (#403, brief §5): a Livewire single-page app mounts a linked pair
// on every visit and destroys it on the way out, with no full page load in between. Nothing else in
// the gallery calls `destroy()`, so nothing else shows what it leaves behind.
//
// `e2e/mount-destroy.spec.ts` drives this page and counts nodes and listeners in a real browser —
// the half of S6's teardown check a fake DOM cannot answer, because happy-dom has no detached-node accounting.

import { Gantt, Dataset, ScrollAxis, TimeScaleModel } from 'freegantt';
import { sampleEntryInputs } from '../../fixtures/sample-dataset.js';

const panes = document.querySelector<HTMLDivElement>('#panes')!;
const cycleCount = document.querySelector<HTMLOutputElement>('[data-testid="cycle-count"]')!;

// What the pair shares, built once and never rebuilt. This is the point of the page: a shared
// object outlives every Gantt bound to it, so it is where a leftover binding would pile up.
//
// x only, with y left private — the first consumer's own shape (#405). Their two panes hold
// different row sets, so a shared vertical scroll would align rows that mean nothing to each other.
const scale = new TimeScaleModel({ fit: 'preset' });
const scroll = { x: new ScrollAxis() };

const dataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });

let pair: readonly Gantt[] = [];
let mountedPairs = 0;

function mountPair(): void {
  if (pair.length > 0) return;
  pair = ['top', 'bottom'].map((name) => {
    const container = document.createElement('div');
    container.className = 'fg-gantt';
    container.id = `pane-${name}`;
    panes.append(container);
    return new Gantt({ container, dataset, scale, scroll, a11yLabel: `${name} Gantt` });
  });
  mountedPairs++;
  cycleCount.textContent = `${mountedPairs} pairs mounted so far`;
}

function destroyPair(): void {
  for (const gantt of pair) gantt.destroy();
  pair = [];
  // The containers are the page's own nodes, not the library's: a consumer owns the element it
  // hands over, and `destroy()` empties it rather than removing it.
  panes.replaceChildren();
}

document.querySelector('[data-testid="mount-pair"]')!.addEventListener('click', () => mountPair());
document.querySelector('[data-testid="destroy-pair"]')!.addEventListener('click', () => destroyPair());
document.querySelector('[data-testid="cycle-pairs"]')!.addEventListener('click', () => {
  // Clears whatever is on screen first, so the run below is 25 whole mount/destroy pairs and the
  // counter beside the button says exactly how many mounts have happened.
  destroyPair();
  for (let i = 0; i < 25; i++) {
    mountPair();
    destroyPair();
  }
});

mountPair();
