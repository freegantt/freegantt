// render/dom — turns one ElementDescription into a live DOM subtree (S5.3, D-S5-10). Stays inside
// the reconciler's hard-bounded scope: attrs/class/style/text + keyed children, no lifecycle hook.
// `Popup` (extensions/popup.ts) is this function's first caller — it rebuilds its content fresh on
// every `open()` rather than diffing against a previous frame, so this file ships the one-shot build
// only. S5.4 adds the diffing sibling (`applyElementDescription`, patching an existing node in place)
// for `barRenderer`/`cellRenderer` repaint — this function is that one's building block, unchanged.

import type { ElementDescription } from '../../layout/index.js';

/** Builds a fresh node for one `ElementDescription`, recursing into `children`. `text` is set as
 *  `textContent` (I13 — markup in it stays text); `html` is the explicit, separate opt-in and skips
 *  `children` when both are given, since the two text channels never combine. */
export function buildElement(description: ElementDescription): HTMLElement {
  const node = document.createElement(description.tag ?? 'div');

  if (description.class) {
    for (const [name, on] of Object.entries(description.class)) {
      if (on) node.classList.add(name);
    }
  }
  if (description.style) {
    for (const [prop, value] of Object.entries(description.style)) {
      node.style.setProperty(prop, value);
    }
  }
  if (description.attrs) {
    for (const [name, value] of Object.entries(description.attrs)) {
      node.setAttribute(name, value);
    }
  }
  if (description.html !== undefined) {
    node.innerHTML = description.html;
    return node;
  }
  if (description.text !== undefined) {
    node.textContent = description.text;
  }
  if (description.children) {
    for (const child of description.children) {
      node.append(buildElement(child));
    }
  }
  return node;
}
