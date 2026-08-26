// view/ — the base stylesheet (plans/s1.10-theming-and-a11y/README.md D-S1.10-6, D-S1.10-8, D-S1.10-9).
// `ensureBaseStyles` is the only place the library writes a stylesheet. Idempotent per document via a
// `<style data-freegantt-styles>` marker: the DOCUMENT holds the state, not a module variable, so two
// Gantt instances in one document share one injected sheet without this being I2's kind of module-level
// singleton (I2 governs shared *mutable state* — configuration, subscriptions, caches that would let two
// instances see each other's changes; an idempotent one-time DOM write guarded by a marker attribute is
// not that — the second Gantt's call is a no-op precisely because the marker makes it safe to call twice,
// and no state is shared, exchanged, or capable of drifting between instances).
//
// Structural rules absorb every inline write pane-layout.ts/render/dom used to make (D-S1.10-6) — the
// new `freegantt/no-inline-style-outside-geometry` lint rule leaves `transform`/`width`/`height` as the
// only properties still legitimately written inline. Colour token defaults are D-S1.10-9's: pulled from
// an existing, non-shipping palette this team maintains elsewhere — only the values cross over, per
// CLAUDE.md's "vendor Gantt product names never appear in specs, docs, or code".

const MARKER_ATTR = 'data-freegantt-styles';

const BASE_STYLESHEET = `
:root {
  --fg-pane-bg: #FAFAF7;
  --fg-splitter-color: #E6E2D9;
  --fg-header-bg: #F4F2EC;
  --fg-header-band-bg: #FFFFFF;
  --fg-header-text: #1A1815;
  --fg-header-subtext: #9A958B;
  --fg-header-divider-color: #E6E2D9;
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: rgba(26, 24, 21, 0.028);
  --fg-row-label-color: #1A1815;
  --fg-bar-fill: oklch(0.55 0.13 245);
  --fg-bar-label-color: #FFFFFF;
  --fg-warn: #D97706;
}
[data-fg-theme='dark'] {
  --fg-pane-bg: #15161A;
  --fg-splitter-color: #2B2F36;
  --fg-header-bg: #22252B;
  --fg-header-band-bg: #1B1D22;
  --fg-header-text: #ECEAE3;
  --fg-header-subtext: #6E6A62;
  --fg-header-divider-color: #2B2F36;
  --fg-row-odd-bg: rgba(255, 255, 255, 0.032);
  --fg-row-label-color: #ECEAE3;
  --fg-bar-fill: oklch(0.72 0.13 245);
  --fg-bar-label-color: #ECEAE3;
  --fg-warn: #FBBF24;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-fg-theme]) {
    --fg-pane-bg: #15161A;
    --fg-splitter-color: #2B2F36;
    --fg-header-bg: #22252B;
    --fg-header-band-bg: #1B1D22;
    --fg-header-text: #ECEAE3;
    --fg-header-subtext: #6E6A62;
    --fg-header-divider-color: #2B2F36;
    --fg-row-odd-bg: rgba(255, 255, 255, 0.032);
    --fg-row-label-color: #ECEAE3;
    --fg-bar-fill: oklch(0.72 0.13 245);
    --fg-bar-label-color: #ECEAE3;
    --fg-warn: #FBBF24;
  }
}

.fg-host { display: flex; overflow: hidden; }
.fg-grid-pane { display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; background: var(--fg-pane-bg); }
.fg-grid-spacer { flex-shrink: 0; }
.fg-rows-clip { position: relative; flex: 1 1 auto; overflow: hidden; }
.fg-rows { position: relative; height: 100%; }
.fg-splitter { flex-shrink: 0; cursor: col-resize; background: var(--fg-splitter-color); }
.fg-timeline-pane { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; background: var(--fg-pane-bg); }
.fg-header { background: var(--fg-header-bg); position: relative; }
.fg-band { background: var(--fg-header-band-bg); color: var(--fg-header-text); border-bottom: 1px solid var(--fg-header-divider-color); position: relative; }
.fg-tick { color: var(--fg-header-subtext); position: absolute; }
.fg-row { background: var(--fg-row-even-bg); position: absolute; width: 100%; }
.fg-row:nth-child(odd) { background: var(--fg-row-odd-bg); }
.fg-row-label { color: var(--fg-row-label-color); }
.fg-bars { position: relative; }
.fg-bar { background: var(--fg-bar-fill); color: var(--fg-bar-label-color); border-radius: var(--fg-bar-radius, 3px); position: absolute; }
.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--fg-warn); }
.fg-content-sizer { position: absolute; top: 0; left: 0; width: 1px; height: 1px; visibility: hidden; }
`.trim();

/** Injects the library's base stylesheet into `doc` exactly once. Safe to call from every Gantt
 * instance mounted in that document — the second and later calls are a no-op. */
export function ensureBaseStyles(doc: Document): void {
  if (doc.head.querySelector(`style[${MARKER_ATTR}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(MARKER_ATTR, '');
  style.textContent = BASE_STYLESHEET;
  doc.head.append(style);
}
