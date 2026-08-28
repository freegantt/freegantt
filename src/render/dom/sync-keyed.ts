// render/dom — one keyed-reconciler shape shared by header ticks, rows and bars (#48). Stays inside
// the reconciler's hard-bounded scope (plans/01 §8.1): attr/class/style/text + keyed children only,
// no lifecycle hooks.

/** Shallow, flat-record equality — every `TGeom` synced through `syncKeyed` is a `Pick<...>` of
 * primitive fields, so comparing own-enumerable-key-by-key is exact, not an approximation. */
function shallowEqual<TGeom extends Record<string, unknown>>(a: TGeom, b: TGeom): boolean {
  for (const key in a) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export interface SyncKeyedSpec<TItem, TKey, TGeom extends Record<string, unknown>> {
  key(item: TItem, index: number): TKey;
  /** Called once per key, the first time it's seen; DOM attrs fixed for the node's lifetime (e.g. a
   * bar's `dataset.itemId`) belong here, not in `patch`. */
  create(item: TItem, key: TKey): HTMLElement;
  toGeom(item: TItem): TGeom;
  /** Called only when `toGeom(item)` differs from the cached geometry — attr/class/style/text only. */
  patch(node: HTMLElement, geom: TGeom): void;
}

/** Look up-or-create a node per key, patch it only when its geometry actually changed, then prune
 * nodes whose key is no longer present. `nodes`/`geoms` are the caller's persistent per-layer caches
 * — they must survive across calls for the reconciliation to do anything (a fresh Map every call
 * would patch and never prune). */
export function syncKeyed<TItem, TKey, TGeom extends Record<string, unknown>>(
  layer: HTMLElement,
  items: readonly TItem[],
  nodes: Map<TKey, HTMLElement>,
  geoms: Map<TKey, TGeom>,
  spec: SyncKeyedSpec<TItem, TKey, TGeom>,
): void {
  const seen = new Set<TKey>();
  let previousNode: HTMLElement | null = null;
  items.forEach((item, index) => {
    const key = spec.key(item, index);
    seen.add(key);
    let node = nodes.get(key);
    if (!node) {
      node = spec.create(item, key);
      nodes.set(key, node);
    }
    // Keyed geometry (transform/top) places a node correctly on screen even out of DOM order, but
    // DOM order still drives tab order, screen readers and `:nth-child` striping — so a node an undo
    // brings back (or any other reorder) must land at its item's DOM position, not just get appended
    // (#undo-restores-append-only).
    const expectedNext = previousNode ? previousNode.nextSibling : layer.firstChild;
    if (node !== expectedNext) layer.insertBefore(node, expectedNext);
    previousNode = node;

    const geom = spec.toGeom(item);
    const prev = geoms.get(key);
    if (!prev || !shallowEqual(prev, geom)) {
      spec.patch(node, geom);
      geoms.set(key, geom);
    }
  });
  for (const [key, node] of nodes) {
    if (!seen.has(key)) {
      node.remove();
      nodes.delete(key);
      geoms.delete(key);
    }
  }
}
