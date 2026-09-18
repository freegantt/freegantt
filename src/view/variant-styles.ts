// view/ — the second stylesheet a Gantt writes (ADR 0022 §5, Q6): the rules behind an installed
// variant's own class. `styles.ts`'s `ensureBaseStyles` writes the first, once per document, and it
// is not this module's job to repeat that — this one is a `VariantRegistry`'s own answer, restated
// as one `<style>` node.
//
// **One node per Gantt, never one shared and refcounted per document** (I2). No two Gantts share a
// mutable node: each owns its own, so disposing one Gantt removes exactly its own rules and leaves
// every other Gantt's node untouched. That is lifecycle independence, and it is what this shape buys.
//
// It does not buy cascade independence, and cannot: CSS is document-global, the same as the base
// sheet already is. Two Gantts' variant rules land in the same document, in the same `@layer
// freegantt`, so a class one Gantt's variant styles is the same class any Gantt in the document
// paints with — a `diamond()` installed on one Gantt restyles every `.fg-bar-diamond` in the
// document, this Gantt's included (`plans/shipped-variants/README.md` Q6). The cost of one node each
// is duplicated text when two Gantts install one variant — that is bytes, not behaviour, because the
// rules are identical and land in one layer either way. `ensureBaseStyles`'s own document-wide marker
// is a different shape for a different reason: the base sheet holds no variant's own choice, so every
// Gantt in the document is content with the one copy already there.
//
// `layout/`'s `VariantRegistry.installedCss()` answers the text; this module owns writing it,
// because `layout/` stays DOM-free and a CSS string is data until something paints it.

import type { VariantRegistry } from '../layout/index.js';

const VARIANT_STYLES_ATTR = 'data-freegantt-variant-styles';

/** One Gantt's own variant stylesheet. `attachVariantStyles` builds it; `refresh()` rewrites its
 *  text from the registry's current installed set, and `destroy()` removes the node. */
export interface VariantStyles {
  /** Rewrite the node's text from `variants.installedCss()`. Call after any registration change —
   *  construction, `gantt.variants = […]`, a plugin install or a plugin's disposal — the same edges
   *  `PluginRegistrations` already refreshes bars and capabilities on. An empty installed set
   *  leaves the node present but empty, so a later `refresh()` has a stable node to rewrite. */
  refresh(): void;
  /** Removes the node from `doc.head`. Call once, from `GanttShell.destroy()`. */
  destroy(): void;
}

/** Call once, in `GanttShell`'s constructor, right after its `VariantRegistry` exists and right
 *  after `ensureBaseStyles` has already run — a variant's rule must land after the base sheet, or it
 *  cannot cancel `.fg-bar`'s own background and state ring at equal specificity (ADR 0022 §5). The
 *  node starts empty; the constructor's own first `refresh()` call fills it once consumer variants
 *  are installed. */
export function attachVariantStyles(doc: Document, variants: VariantRegistry): VariantStyles {
  const node = doc.createElement('style');
  node.setAttribute(VARIANT_STYLES_ATTR, '');
  doc.head.append(node);
  return {
    refresh() {
      const css = variants.installedCss();
      // One layer, the same one the base sheet wraps itself in — so a variant's rule and the base
      // sheet's own resolve by document order at equal specificity (ADR 0021), and an unlayered
      // consumer rule still beats both.
      node.textContent = css.length === 0 ? '' : `@layer freegantt {\n${css.join('\n')}\n}`;
    },
    destroy() {
      node.remove();
    },
  };
}
