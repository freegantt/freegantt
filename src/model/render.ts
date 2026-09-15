// model/ — the reconciler's own vocabulary as plain data (S5.3/S5.4, D-S5-10). `ElementDescription`
// is what a plugin hands back instead of a live node: `render/dom/element-description.ts` is the only
// place that turns it into DOM, and it stays inside the reconciler's hard-bounded scope (plans/01
// §8.1) — attrs/class/style/text plus keyed children, no lifecycle hook. S5.3's `Popup.content` is
// this type's first caller; S5.4 widens the same shape to `barRenderer`/`gridCellRenderer` output.

/** Plain data, never a live node (`plans/02` §4) — a virtualized bar or a recycled popup content node
 *  must be able to rebuild from this every time. `text` is the only text channel and is set as
 *  `textContent`, never parsed as markup (I13); `html` is the explicit, separate opt-in for raw
 *  markup and is never combined with `text`. A child with no `key` is keyed by its index. */
export interface ElementDescription {
  /** Default `'div'`. */
  tag?: string;
  class?: Readonly<Record<string, boolean>>;
  style?: Readonly<Record<string, string>>;
  attrs?: Readonly<Record<string, string>>;
  text?: string;
  html?: string;
  children?: readonly (ElementDescription & { key?: string })[];
}
