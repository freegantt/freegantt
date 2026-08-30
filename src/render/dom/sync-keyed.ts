// render/dom — one keyed-reconciler shape shared by header ticks, rows and bars (#48). Stays inside
// the reconciler's hard-bounded scope (plans/01 §8.1): attr/class/style/text + keyed children only,
// no lifecycle hooks.

/** Shallow, flat-record equality over both directions: a key-count check catches a field that
 * dropped out of `b` (e.g. a conditional `tint`) even though every key still in both sides matches
 * (§9-C — a one-direction scan compared equal on that drop and left the node unpatched). */
function shallowEqual<TGeom extends Record<string, unknown>>(a: TGeom, b: TGeom): boolean {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
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

/** One keyed layer: the node/geom cache pair `syncKeyed` needs, held together instead of as two
 * parallel `Map`s a caller must keep in sync by hand (§9-D). */
export class KeyedLayer<TItem, TKey, TGeom extends Record<string, unknown>> {
  #nodes = new Map<TKey, HTMLElement>();
  #geoms = new Map<TKey, TGeom>();

  sync(container: HTMLElement, items: readonly TItem[], spec: SyncKeyedSpec<TItem, TKey, TGeom>): void {
    syncKeyed(container, items, this.#nodes, this.#geoms, spec);
  }

  node(key: TKey): HTMLElement | undefined {
    return this.#nodes.get(key);
  }

  clear(): void {
    this.#nodes.clear();
    this.#geoms.clear();
  }
}

/** One `KeyedLayer` per parent key — the "keyed list inside a keyed list" shape a band's ticks and a
 * row's cells both need. Collapses the hand-rolled `Map<ParentKey, Map<...>>` pair plus its own
 * prune loop (`syncHeader`'s tick cache, `syncCellsForEachRow`'s cell cache, §9-D) into one type. */
export class NestedKeyedLayers<TParentKey, TItem, TKey, TGeom extends Record<string, unknown>> {
  #layers = new Map<TParentKey, KeyedLayer<TItem, TKey, TGeom>>();

  layerFor(parentKey: TParentKey): KeyedLayer<TItem, TKey, TGeom> {
    let layer = this.#layers.get(parentKey);
    if (!layer) {
      layer = new KeyedLayer<TItem, TKey, TGeom>();
      this.#layers.set(parentKey, layer);
    }
    return layer;
  }

  /** Drops every child layer whose parent key is no longer live — same job as the hand-rolled
   * "delete keys past `bands.length`" / "delete row ids not in `liveRowIds`" loops it replaces. */
  prune(liveParentKeys: ReadonlySet<TParentKey>): void {
    for (const key of this.#layers.keys()) {
      if (!liveParentKeys.has(key)) this.#layers.delete(key);
    }
  }

  clear(): void {
    this.#layers.clear();
  }
}
