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

// S5.4, D-S5-10: the diffing sibling `buildElement` above flags in its own file header — patches an
// existing node in place for repaint-without-remount (I8: `barRenderer`/`cellRenderer` reassignment
// repaints, never rebuilds, the node it patches). Stays inside the same bounded scope: attrs/class/
// style/text + keyed children, nothing more. Keyed by a `data-fg-key` attribute stamped once per
// child at creation, so children stay identifiable across calls with no external node/key cache to
// keep in sync (the one `syncKeyed` (sync-keyed.ts) needs for typed frame items has no use here —
// `ElementDescription` trees are plain data, not identified `TItem`s with their own `key()`).
const KEY_ATTR = 'data-fg-key';

/** What was applied last, per node — the diff base for the next call. A `WeakMap` needs no explicit
 *  cleanup: an entry disappears with the node once nothing else references either.
 *  I2-ok: keyed by DOM node identity; an entry cannot outlive its own node or reach another Gantt. */
const lastApplied = new WeakMap<Element, ElementDescription>();

function applyClassDiff(
  node: HTMLElement,
  prev: ElementDescription['class'],
  next: ElementDescription['class'],
): void {
  if (prev) {
    for (const name of Object.keys(prev)) {
      if (!next || !(name in next)) node.classList.remove(name);
    }
  }
  if (next) {
    for (const [name, on] of Object.entries(next)) {
      node.classList.toggle(name, on);
    }
  }
}

function applyStyleDiff(
  node: HTMLElement,
  prev: ElementDescription['style'],
  next: ElementDescription['style'],
): void {
  if (prev) {
    for (const prop of Object.keys(prev)) {
      if (!next || !(prop in next)) node.style.removeProperty(prop);
    }
  }
  if (next) {
    for (const [prop, value] of Object.entries(next)) {
      node.style.setProperty(prop, value);
    }
  }
}

function applyAttrsDiff(
  node: HTMLElement,
  prev: ElementDescription['attrs'],
  next: ElementDescription['attrs'],
): void {
  if (prev) {
    for (const name of Object.keys(prev)) {
      if (!next || !(name in next)) node.removeAttribute(name);
    }
  }
  if (next) {
    for (const [name, value] of Object.entries(next)) {
      node.setAttribute(name, value);
    }
  }
}

/** Reconciles `parent`'s children against `children`, keyed by `.key` (default: index) — creates a
 *  fresh node per new key, patches an existing one via `applyElementDescription` (so nesting recurses
 *  for free), reorders in place, and prunes a key no longer present. Tag mismatches on an existing
 *  key rebuild that one child fresh rather than trying to change an element's tag in place. */
function syncChildren(
  parent: HTMLElement,
  children: readonly (ElementDescription & { key?: string })[],
): void {
  // A prior call may have left `parent` in text/html mode (a bare text node, or `innerHTML` markup
  // with no `data-fg-key` on any of it) — strip anything that isn't a keyed element of this
  // function's own making before reconciling, or a stale text node/unkeyed markup node would sit
  // alongside the fresh keyed children instead of being replaced by them.
  const existingByKey = new Map<string, HTMLElement>();
  for (const child of Array.from(parent.childNodes)) {
    const key = child.nodeType === Node.ELEMENT_NODE ? (child as Element).getAttribute(KEY_ATTR) : null;
    if (key !== null) existingByKey.set(key, child as HTMLElement);
    else parent.removeChild(child);
  }

  const seen = new Set<string>();
  let previousNode: HTMLElement | null = null;
  children.forEach((child, index) => {
    const key = child.key ?? String(index);
    seen.add(key);
    const tag = child.tag ?? 'div';
    let node = existingByKey.get(key);
    if (node && node.tagName.toLowerCase() !== tag) {
      node.remove();
      lastApplied.delete(node);
      node = undefined;
    }
    if (!node) {
      node = document.createElement(tag);
      node.setAttribute(KEY_ATTR, key);
    }
    const expectedNext = previousNode ? previousNode.nextSibling : parent.firstChild;
    if (node !== expectedNext) parent.insertBefore(node, expectedNext);
    previousNode = node;
    applyElementDescription(node, child);
  });

  for (const [key, node] of existingByKey) {
    if (!seen.has(key)) {
      node.remove();
      lastApplied.delete(node);
    }
  }
}

/** Patches `node` to match `description`, diffing against what was last applied to it — never
 *  rebuilds `node` itself (I8). `text`/`html`/`children` are one text channel each: `html` skips
 *  `children` (matches `buildElement`'s own opt-in rule, I13); `text` is set as `textContent`,
 *  clearing any children; with neither, `children` (default `[]`) is reconciled, pruning stragglers. */
export function applyElementDescription(node: HTMLElement, description: ElementDescription): void {
  const previous = lastApplied.get(node);
  applyClassDiff(node, previous?.class, description.class);
  applyStyleDiff(node, previous?.style, description.style);
  applyAttrsDiff(node, previous?.attrs, description.attrs);

  if (description.html !== undefined) {
    node.innerHTML = description.html;
  } else if (description.text !== undefined) {
    node.textContent = description.text;
  } else {
    syncChildren(node, description.children ?? []);
  }

  lastApplied.set(node, description);
}
