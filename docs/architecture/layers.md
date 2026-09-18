# Layers & import rules

Which directories may import which, and the lint rules that hold the line. The rule itself lives
in [`plans/01`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/01-domain-architecture.md)
§1 — where that document and this page disagree, it is right and this page is stale.

*Derived from `src/**`, `.dependency-cruiser.cjs`, `plans/01-domain-architecture.md` §1.*

## The ten directories

Ten directories under `src/`. Four of them (`model`, `time`, `data`, `layout`) are the mandatory
DOM-free core; `scheduling` is DOM-free too but optional. Only `render`, `view`, `interaction`,
`extensions` may name `document` or `window`.

<div class="fg-architecture-doc">
<div class="layermap">
<div class="tier">
<div class="box api">
<div class="name">harness/</div>
<div class="sub">
main.ts · plugins.ts · editing.ts — the library's first consumer, outside the src lint scope
</div>
</div>
</div>
<div class="arrow-v">↓</div>
<div class="tier">
<div class="box api">
<div class="name">api/</div>
<div class="sub">
<code>Gantt</code> · <code>Dataset</code> · <code>tooltips</code> ·
<code>installPlugin</code> — the only import a consumer makes; sealed
<code>exports</code> map
</div>
</div>
</div>
<div class="arrow-v">↓</div>
<div class="tier">
<div class="box dom">
<div class="name">view/</div>
<div class="sub">
<code>GanttShell</code> · <code>PluginRuntime</code> ports · <code>GesturePipeline</code> ·
capabilities · commands · navigation
</div>
</div>
<div class="box dom">
<div class="name">render/</div>
<div class="sub">
<code>RenderBackend</code> seam · dom backend · null backend · <code>syncKeyed</code> ·
decorations · <code>ElementDescription</code>
</div>
</div>
<div class="box dom">
<div class="name">interaction/</div>
<div class="sub">
<code>attachEntryGestures</code> · <code>attachColumnGestures</code> ·
<code>createPointerGesture</code>
</div>
</div>
<div class="box dom">
<div class="name">extensions/</div>
<div class="sub">
<code>PluginRuntime</code> · commands · keymap · <code>createPopup</code> · tooltips,
context menu, inline editing
</div>
</div>
</div>
<div class="tier-label">touches the DOM</div>
<div class="arrow-v">↓</div>
<div class="tier">
<div class="box pure">
<div class="name">layout/</div>
<div class="sub">
<code>computeFrame</code> · <code>FrameLayout</code> · rows/items ·
<code>TimeScaleModel</code> · <code>ScrollAxis</code>
</div>
</div>
<div class="box pure">
<div class="name">data/</div>
<div class="sub">
<code>DatasetState</code> · <code>EntryStore</code> · <code>PluginStores</code> ·
transactions · fields · rollup
</div>
</div>
<div class="box stub">
<div class="name">scheduling/</div>
<div class="sub">stub — optional plugin (ADR 0002)</div>
</div>
</div>
<div class="arrow-v">↓</div>
<div class="tier">
<div class="box pure">
<div class="name">time/</div>
<div class="sub">
<code>Instant</code> arithmetic · IANA zones · <code>TimeScale</code> · view presets · snap
</div>
</div>
</div>
<div class="arrow-v">↓</div>
<div class="tier">
<div class="box pure">
<div class="name">model/</div>
<div class="sub">
entity types, ids, brands, <code>FreeGanttError</code>, Field, ChangeSet — zero deps,
near-zero runtime
</div>
</div>
</div>
<div class="tier-label">pure — no DOM, unit-tested in plain Node</div>
</div>
</div>

### Who may import whom

`.dependency-cruiser.cjs` transcribes the diagram literally: one `forbid()` rule per layer,
listing its *only* legal targets. Anything not listed fails the build (invariant I1).

| Layer | May import | Note |
| --- | --- | --- |
| `model` | — nothing — | Leaf. Types plus `entryId`/`rowId`/`barId` and `FreeGanttError`. |
| `time` | `model` | Plus the one runtime dep `temporal-polyfill`, confined to `zone.ts`. |
| `layout` | `time`, `model` | Where the shareable viewport models live — the only DOM-free layer both allowed `time/` and reachable from `view/`. |
| `scheduling` | `time`, `model` | Stub. Never imported by `data/` statically — they meet at the extension hook. |
| `data` | `time`, `model` | Fully built. Deliberately no `scheduling` edge: mutations resolve through the generic `EditExtender` hook (identity function when no plugin is installed). |
| `render` | `layout` | Consumes `GeometryFrame` and nothing else from layout. Named leaf `data/dev-mode.ts` is also allowed. Reaches `BarId`/`RowId` through `layout/index.ts`'s re-export, not `model/` directly. |
| `view` | `render`, `layout`, `data`, `model`, `extensions` | `data/` and `model` enter as type and dataset surfaces the shell orchestrates. `extensions/` is the plugin runtime the shell constructs; the Gantt's own event bus is `view/event-bus.ts`. Still no `time` edge — every date/pixel computation a gesture needs is a pure `layout/` function the shell hands back through `EntryGestureContext`. |
| `interaction` | `view`, `data`, `model` | Built. Drives the `EntryGestureContext` and `ColumnGestureContext` seams typed in `view/`; `model` enters as type-only params. Never reaches `time/`, `layout/` or `render/`, and never imports `scheduling/`. |
| `extensions` | `api`, `model` | Dogfood gate: a built-in may import only what a third-party plugin can. Named leaves: `data/dev-mode.ts` and `layout/registration-table.ts`. Never imports `view/` — the shell constructs the runtime; the arrow is `view → extensions`. |
| `api` | `view`, `data`, `model`, `time`, `layout`, `interaction`, `extensions` | `model`, `time` and `layout` are type/primitive re-export edges, not behavioural ones. `interaction` arrives by constructor injection — the shell takes the gesture attachments structurally-typed rather than importing `interaction/` itself. `extensions` is the plugin runtime and the shipped built-ins (`tooltips`, `contextMenu`, `inlineEditing`, `createPopup`). |

:::note The thirteen custom lint rules
`eslint/rules/` holds what dependency-cruiser cannot see, all scoped to `src/**`. Time (I10):
`no-date-outside-time`, `no-magic-time-constants`, `no-instant-arithmetic`. Geometry (I12):
`no-time-to-pixel-math`, `no-scroll-outside-scroll-attachment` (exempt:
`view/scroll-attachment.ts`), `no-flow-layout-rows`, `no-inline-style-outside-geometry`. Shape:
`no-module-level-state`, `model-is-types-only`, `no-store-mutation-outside-transaction`,
`require-invariant-header`, `no-kind-literal`, `no-derived-in-json`. Each rule ships a
violation fixture so the rule itself is proven to bite.
:::
