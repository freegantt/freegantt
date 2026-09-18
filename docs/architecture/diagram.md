# FreeGantt module map

<style>
  .fg-architecture-doc {
    --bg: #f1eee3;
    --bg-raised: #e9e5d6;
    --ink: #211f19;
    --muted: #67604d;
    --border: #c9c1a9;
    --border-strong: #a89f88;
    --accent: #b8541f;
    --accent-ink: #ffffff;
    --core: #276a63;
    --core-bg: rgba(39, 106, 99, 0.06);
    --dom-bg: rgba(184, 84, 31, 0.05);
    --stub-bg: repeating-linear-gradient(
      135deg,
      transparent,
      transparent 7px,
      rgba(114, 107, 89, 0.09) 7px,
      rgba(114, 107, 89, 0.09) 8px
    );
    --stub-fill: #e4e0d2;
    --forbid: #8a3b3b;
  }

  html[data-theme='dark'] .fg-architecture-doc {
    --bg: #14171a;
    --bg-raised: #1c2023;
    --ink: #e9e4d6;
    --muted: #9a927c;
    --border: #363b3a;
    --border-strong: #4b514e;
    --accent: #e2874a;
    --accent-ink: #1a1006;
    --core: #5fb0a5;
    --core-bg: rgba(95, 176, 165, 0.08);
    --dom-bg: rgba(226, 135, 74, 0.07);
    --stub-bg: repeating-linear-gradient(
      135deg,
      transparent,
      transparent 7px,
      rgba(154, 146, 124, 0.09) 7px,
      rgba(154, 146, 124, 0.09) 8px
    );
    --stub-fill: #1e2124;
    --forbid: #c67a7a;
  }

  .fg-architecture-doc figure {
    margin: 0 0 1.5rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-raised);
    padding: 1.25rem 1.25rem 1rem;
    overflow-x: auto;
  }

  .fg-architecture-doc figure svg {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
  }

  .fg-architecture-doc figcaption {
    font-size: 0.84rem;
    color: var(--muted);
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--border);
    line-height: 1.6;
  }

  .fg-architecture-doc figcaption code {
    font-family: 'IBM Plex Mono', monospace;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.05em 0.35em;
    font-size: 0.88em;
    color: var(--ink);
  }

  .fg-architecture-doc .box-name {
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
  }
  .fg-architecture-doc .box-sub {
    font-family: 'IBM Plex Sans', sans-serif;
  }

  .fg-architecture-doc .legend {
    margin-top: 1.75rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.9rem 1.5rem;
    font-size: 0.83rem;
    color: var(--muted);
  }

  .fg-architecture-doc .legend-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .fg-architecture-doc .swatch {
    flex: none;
    width: 26px;
    height: 14px;
    border-radius: 3px;
    border: 1.5px solid var(--border-strong);
  }
  .fg-architecture-doc .swatch.solid-core {
    background: var(--core-bg);
    border-color: var(--core);
  }
  .fg-architecture-doc .swatch.solid-dom {
    background: var(--dom-bg);
    border-color: var(--accent);
  }
  .fg-architecture-doc .swatch.stub {
    background: var(--stub-bg);
    background-color: var(--bg-raised);
    border-style: dashed;
  }

  .fg-architecture-doc .line-sample {
    flex: none;
    width: 26px;
    height: 0;
    border-top: 2px solid var(--ink);
  }
  .fg-architecture-doc .line-sample.dashed {
    border-top-style: dashed;
    border-color: var(--muted);
  }
  .fg-architecture-doc .line-sample.forbid {
    border-top-style: dashed;
    border-color: var(--forbid);
  }

  /* Edge labels may cross box borders; the halo erases the border behind the glyphs. */
  .fg-architecture-doc .lbl {
    paint-order: stroke;
    stroke: var(--bg-raised);
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  @media (prefers-reduced-motion: no-preference) {
    .fg-architecture-doc figure {
      animation: fg-diagram-rise 0.5s ease-out;
    }
  }
  @keyframes fg-diagram-rise {
    from {
      transform: translateY(6px);
    }
    to {
      transform: translateY(0);
    }
  }
</style>

*Architecture snapshot — slice S5, updated 2026-09-06.*

The dependency graph as it actually stands in `src/` right now: solid boxes are built and
wired together by real imports; the one hatched box is the remaining stub
(`scheduling/index.ts`, reserved for S7). The vertical split is the one boundary the linter
enforces — `model/`, `time/`, `data/`, and `layout/` stay DOM-free; only the right-hand column
may touch `document` or `window`. `scheduling/` is DOM-free too, but sits outside the core
zone on purpose: it is the first-party default scheduling plugin's engine, not a mandatory
core layer (ADR 0002) — a Gantt with no scheduling plugin installed never loads it. At S5,
`extensions/` is built: plugin runtime, commands, keymap, popup, and the three shipped
built-ins. `scheduling/` is the only stub left.

<div class="fg-architecture-doc">
<figure>
<svg
viewBox="0 0 1240 960"
role="img"
aria-label="Layered dependency diagram of the FreeGantt src tree at slice S5: model, time, data and layout form the mandatory DOM-free core on the left; below them, outside the core zone, sits scheduling — still a stub for S7. The right column holds the DOM-touching render, view, interaction and extensions modules, all surfaced through a single api module on top. extensions/ is built in S5. Data and scheduling meet only through data/'s generic extension hook; a direct link between scheduling and interaction is marked forbidden."
>
<defs>
<marker
id="arrow"
viewBox="0 0 10 10"
refX="8"
refY="5"
markerWidth="7"
markerHeight="7"
orient="auto-start-reverse"
>
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
<marker
id="arrow-muted"
viewBox="0 0 10 10"
refX="8"
refY="5"
markerWidth="6"
markerHeight="6"
orient="auto-start-reverse"
>
<path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
</marker>
</defs>
<!-- api/ : public surface -->
<rect
x="460"
y="18"
width="320"
height="66"
rx="8"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.75"
/>
<text x="620" y="44" text-anchor="middle" class="box-name" font-size="17" fill="var(--ink)">api/</text>
<text x="620" y="63" text-anchor="middle" class="box-sub" font-size="11.5" fill="var(--muted)">
Gantt, Dataset, plugins · 1,833 lines · the only public export surface, alongside model/ types
</text>
<!-- boundary zones -->
<rect
x="40"
y="118"
width="560"
height="580"
rx="10"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.25"
stroke-dasharray="3 4"
/>
<text x="60" y="142" class="box-name" font-size="11.5" fill="var(--core)" letter-spacing="0.06em">
DOM-FREE CORE — mandatory, also runs headless in Node
</text>
<!-- first-party plugin zone: scheduling is deliberately NOT inside the core zone (ADR 0002) -->
<rect
x="40"
y="726"
width="560"
height="114"
rx="10"
fill="none"
stroke="var(--muted)"
stroke-width="1.25"
stroke-dasharray="3 4"
/>
<text x="60" y="750" class="box-name" font-size="11.5" fill="var(--muted)" letter-spacing="0.06em">
FIRST-PARTY DEFAULT PLUGIN — DOM-free, not mandatory core (D4 · ADR 0002)
</text>
<rect
x="660"
y="118"
width="540"
height="630"
rx="10"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.25"
stroke-dasharray="3 4"
/>
<text x="680" y="142" class="box-name" font-size="11.5" fill="var(--accent)" letter-spacing="0.06em">
BROWSER — document / window allowed
</text>
<!-- divider -->
<line
x1="628"
y1="118"
x2="628"
y2="748"
stroke="var(--border-strong)"
stroke-width="1.25"
stroke-dasharray="1 5"
/>
<text
x="628"
y="430"
text-anchor="middle"
class="box-sub"
font-size="10.5"
fill="var(--muted)"
transform="rotate(90 628 430)"
letter-spacing="0.08em"
>
DOM BOUNDARY
</text>
<!-- model/ -->
<rect
x="80"
y="168"
width="230"
height="96"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="195" y="194" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
model/
</text>
<text x="195" y="212" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
Entry, Field, ChangeSet, ids
</text>
<text x="195" y="227" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
1,771 lines · 14 files · types + brand helpers, 0 deps
</text>
<text x="195" y="242" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
errors, geometry, document schema
</text>
<!-- time/ -->
<rect
x="350"
y="168"
width="210"
height="76"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="455" y="196" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
time/
</text>
<text x="455" y="215" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
instant, zone, scale, ZonedTime
</text>
<text x="455" y="230" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
1,084 lines · 9 files · only new Date() here
</text>
<!-- layout/ -->
<rect
x="80"
y="310"
width="480"
height="100"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="320" y="336" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
layout/
</text>
<text x="320" y="354" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
frame.ts, bars/, rows/, viewport/
</text>
<text x="320" y="370" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
3,568 lines · 29 files · computeFrame(), row/item pipeline
</text>
<text x="320" y="386" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
TimeScaleModel, ScrollAxis, gesture-draft, FrameLayout
</text>
<!-- data/ — BUILT, solid box -->
<rect
x="80"
y="480"
width="250"
height="96"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="205" y="506" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
data/
</text>
<text x="205" y="524" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
DatasetState, EntryStore, transaction
</text>
<text x="205" y="540" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
4,207 lines · 28 files · extension hook → changeset
</text>
<text x="205" y="556" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
History, fields, rollup · imports time + model
</text>
<!-- scheduling/ stub — outside the core zone: plugin engine, not a core layer -->
<rect
x="350"
y="762"
width="210"
height="64"
rx="7"
fill="var(--stub-fill)"
stroke="var(--border-strong)"
stroke-width="1.5"
stroke-dasharray="5 4"
/>
<text x="455" y="788" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--muted)">
scheduling/
</text>
<text x="455" y="806" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
5 lines · stub — S7, ADR 0002
</text>
<!-- render/ -->
<rect
x="700"
y="168"
width="220"
height="76"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="810" y="196" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
render/
</text>
<text x="810" y="215" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
backend, syncKeyed, decorations, ElementDescription
</text>
<text x="810" y="230" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
2,056 lines · 11 files · syncKeyed reconciler, date-line
</text>
<!-- view/ -->
<rect
x="700"
y="310"
width="460"
height="100"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="930" y="336" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
view/
</text>
<text x="930" y="354" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
GanttShell, PluginRuntime ports, GesturePipeline
</text>
<text x="930" y="370" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
6,583 lines · 31 files · capability, commands, plugin seams
</text>
<text x="930" y="386" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
TreeCollapse, grid-columns, keyboard/wheel nav, splitter
</text>
<!-- interaction/ — BUILT, solid box -->
<rect
x="700"
y="480"
width="220"
height="76"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="810" y="506" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
interaction/
</text>
<text x="810" y="524" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
entry-gestures, column-gestures
</text>
<text x="810" y="540" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
798 lines · 5 files · drives EntryGestureContext
</text>
<!-- extensions/ — BUILT in S5 -->
<rect
x="960"
y="480"
width="200"
height="76"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="1060" y="506" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
extensions/
</text>
<text x="1060" y="525" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
PluginRuntime, popup, built-ins
</text>
<text x="1060" y="540" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--muted)">
2,458 lines · 13 files · dogfoods api/
</text>
<!-- harness note -->
<rect
x="700"
y="640"
width="460"
height="70"
rx="7"
fill="none"
stroke="var(--muted)"
stroke-width="1"
stroke-dasharray="2 4"
/>
<text x="930" y="667" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--muted)">
harness/main.ts
</text>
<text x="930" y="685" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
first consumer, sits outside src/ — reviewed every commit regardless
</text>
<!-- arrows: within DOM-free core -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow)" color="var(--ink)">
<!-- model -> time -->
<path d="M310,206 H350" />
<!-- model -> layout -->
<path d="M150,264 V310" />
<!-- time -> layout -->
<path d="M455,244 V310" />
<!-- time -> data -->
<path d="M400,244 V480" />
<!-- model -> data -->
<path d="M230,264 V480" />
</g>
<!-- arrows: within DOM column -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow)" color="var(--ink)">
<!-- render -> view -->
<path d="M810,244 V310" />
</g>
<!-- arrows crossing the boundary: layout -> view, render -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow)" color="var(--ink)">
<path d="M560,340 L700,206" />
<path d="M560,355 H700" />
</g>
<!-- data -> view (view imports data) -->
<path
d="M330,520 H700"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
color="var(--ink)"
/>
<text x="515" y="512" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
DatasetState, dataset
</text>
<!-- interaction -> view, data, model -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow)" color="var(--ink)">
<!-- interaction -> view (upward) -->
<path d="M810,480 V412" />
</g>
<path
d="M700,518 H332"
stroke="var(--ink)"
stroke-width="1.25"
fill="none"
marker-end="url(#arrow)"
stroke-dasharray="1 4"
color="var(--ink)"
/>
<text x="516" y="542" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
view + data + model (type-only)
</text>
<!-- model -> view (long hop, type-only) -->
<path
d="M310,188 C 470,110 560,150 700,326"
stroke="var(--ink)"
stroke-width="1.25"
fill="none"
marker-end="url(#arrow)"
stroke-dasharray="1 4"
color="var(--ink)"
/>
<text x="470" y="118" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
Entry type
</text>
<!-- view -> extensions (shell constructs PluginRuntime) -->
<path
d="M1060,410 V480"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
color="var(--ink)"
/>
<!-- api arrows: view -> api, model -> api, data -> api, layout -> api, time -> api, interaction -> api -->
<path
d="M840,310 C 760,190 700,110 660,70"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
color="var(--ink)"
/>
<path
d="M230,168 C 260,120 340,90 460,66"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
color="var(--ink)"
/>
<path
d="M330,578 C 330,50 400,30 460,42"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
color="var(--ink)"
/>
<path
d="M560,348 L660,70"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
color="var(--ink)"
/>
<path
d="M455,168 C 455,110 455,80 460,70"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
color="var(--ink)"
/>
<path
d="M810,480 C 810,200 680,100 660,70"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow)"
stroke-dasharray="1 4"
color="var(--ink)"
/>
<text x="720" y="180" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">
view + data + layout + time + interaction + extensions
</text>
<!-- data <-> scheduling : the designed seam — generic extension hook, no static import -->
<path
d="M205,578 V710 H455 V760"
stroke="var(--muted)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow-muted)"
marker-start="url(#arrow-muted)"
stroke-dasharray="4 3"
/>
<text x="330" y="650" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
extension hook — generic seam (D4)
</text>
<!-- forbidden link -->
<path
d="M562,796 H650 V518 H698"
stroke="var(--forbid)"
stroke-width="1.5"
fill="none"
stroke-dasharray="5 4"
/>
<circle cx="674" cy="518" r="9" fill="var(--bg-raised)" stroke="var(--forbid)" stroke-width="1.5" />
<text
x="674"
y="522"
text-anchor="middle"
font-size="11"
fill="var(--forbid)"
font-family="IBM Plex Mono, monospace"
>
×
</text>
<text x="674" y="540" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--forbid)">
never — meet only through data/
</text>
</svg>
<figcaption>
Boxes trace what <code>src/</code> contains at S5; arrows trace real <code>import</code> statements —
except the muted <code>data/ ⇄ scheduling/</code> bridge, which is the designed extension-hook seam (ADR 0002):
no static import in either direction. <code>model/</code> has zero dependencies and feeds nearly
everything; <code>time/</code> and <code>layout/</code> stay DOM-free so they run the same in Node as in
a browser; <code>render/</code> and <code>view/</code> are the DOM-touching modules.
<code>data/</code>, <code>interaction/</code> and <code>extensions/</code> are fully built —
<code>extensions/</code> may import only <code>api/</code> and <code>model/</code>.
<code>scheduling/</code> remains a stub for S7.
<code>api/</code> imports <code>interaction/</code> for constructor injection of gesture attachments
and <code>extensions/</code> for the plugin runtime and shipped built-ins.
</figcaption>
</figure>
<div class="legend">
<div class="legend-item"><span class="swatch solid-core"></span> DOM-free module, built</div>
<div class="legend-item"><span class="swatch solid-dom"></span> DOM-touching module, built</div>
<div class="legend-item"><span class="swatch stub"></span> stub — reserved for S7</div>
<div class="legend-item"><span class="line-sample"></span> live import (solid arrow)</div>
<div class="legend-item"><span class="line-sample dashed"></span> designed bridge, not yet wired</div>
<div class="legend-item">
<span class="line-sample forbid"></span> forbidden coupling, enforced by lint
</div>
</div>

</div>

## Detail — model/

### Model coupling

`model/` is the one module every other layer is allowed to reach into — 1,771 lines, zero
dependencies, no runtime beyond id/brand helpers. At S5 it also exports `PluginId`,
`ErrorReport`, `ElementDescription` and command primitives alongside
`Field`/`ChangeSet`. Every arrow below is a real `import` in `src/` today;
the label on each box is exactly what that layer pulls across the boundary, type-only imports
called out separately from the runtime calls (`entryId()`, `rowId()`, `barId()`) that
actually execute outside `model/`. `render/` never imports `model/` at all — it's included to
show how it still ends up typed in terms of `BarId`/`RowId`, purely through `layout/`'s
re-export.

<div class="fg-architecture-doc">
<figure>
<svg
viewBox="0 0 1240 600"
role="img"
aria-label="Diagram of what crosses the model/ module boundary: model/ exports Entry, the EntryId/RowId/BarId/ChangeSetId brands with helpers, Field, ChangeSet, geometry types and errors. time/ imports Instant/TimeSpan/Duration type-only. layout/ imports Entry and the id types, and calls barId()/rowId() at runtime. api/ re-exports the model types plus entryId/barId. view/ imports only the Entry type through GanttShell's structural DatasetLike interface. data/ imports model types plus entryId()/rowId()/barId() runtime helpers. render/ imports nothing from model/ directly."
>
<defs>
<marker
id="arrow2"
viewBox="0 0 10 10"
refX="8"
refY="5"
markerWidth="7"
markerHeight="7"
orient="auto-start-reverse"
>
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
</defs>
<!-- model/ -->
<rect
x="470"
y="20"
width="300"
height="140"
rx="8"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.75"
/>
<text x="620" y="46" text-anchor="middle" class="box-name" font-size="15" fill="var(--ink)">
model/
</text>
<text x="620" y="64" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Entry, EntryInput, StoredEntry
</text>
<text x="620" y="79" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
EntryId / RowId / BarId brands + entryId(), rowId(), barId()
</text>
<text x="620" y="94" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Field, FieldKey, ChangeSet
</text>
<text x="620" y="109" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
geometry (Point, Size, PixelSpan, Rect)
</text>
<text x="620" y="124" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Instant, TimeSpan, Duration, FreeGanttError hierarchy
</text>
<text x="620" y="148" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
716 lines · 10 files · 0 deps — types + brand helpers only
</text>
<!-- time/ -->
<rect
x="30"
y="220"
width="230"
height="140"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="145" y="246" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
time/
</text>
<text x="145" y="264" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
receives (type-only):
</text>
<text x="145" y="280" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Instant, TimeSpan, Duration
</text>
<text x="145" y="298" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
scale.ts / zone.ts / instant.ts
</text>
<text x="145" y="320" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
format.ts / presets.ts / snap.ts
</text>
<text x="145" y="344" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
940 lines · 8 files
</text>
<!-- layout/ -->
<rect
x="290"
y="220"
width="270"
height="140"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="425" y="246" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
layout/
</text>
<text x="425" y="264" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
receives:
</text>
<text x="425" y="280" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Entry, EntryId/BarId/RowId
</text>
<text x="425" y="296" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--core)">
+ barId(), rowId() — runtime calls
</text>
<text x="425" y="320" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
geometry, Field types
</text>
<text x="425" y="344" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
2,342 lines · 20 files
</text>
<!-- api/ -->
<rect
x="590"
y="220"
width="270"
height="140"
rx="7"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.5"
/>
<text x="725" y="246" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
api/
</text>
<text x="725" y="264" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
re-exports:
</text>
<text x="725" y="280" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Entry, EntryId, RowId, BarId
</text>
<text x="725" y="296" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Field, FieldKey, ChangeSet
</text>
<text x="725" y="312" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--core)">
+ entryId(), barId() functions
</text>
<text x="725" y="344" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
765 lines · the public surface allow-list
</text>
<!-- view/ -->
<rect
x="900"
y="220"
width="270"
height="140"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
/>
<text x="1035" y="246" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
view/
</text>
<text x="1035" y="264" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
receives:
</text>
<text x="1035" y="280" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Entry type only
</text>
<text x="1035" y="298" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
via GanttShell's structural DatasetLike —
</text>
<text x="1035" y="312" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
not an api/ import (view -&gt; api is not allowed)
</text>
<text x="1035" y="344" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
2,440 lines · 20 files
</text>
<!-- render/ -->
<rect
x="290"
y="420"
width="270"
height="140"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
stroke-dasharray="3 4"
/>
<text x="425" y="446" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
render/
</text>
<text x="425" y="464" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
no model/ import
</text>
<text x="425" y="480" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
BarId, RowId arrive only as types,
</text>
<text x="425" y="494" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
re-exported through layout/index.ts
</text>
<text x="425" y="540" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
1,028 lines · 7 files
</text>
<!-- data/ — NEW consumer -->
<rect
x="60"
y="420"
width="200"
height="140"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="160" y="446" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
data/
</text>
<text x="160" y="464" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
receives:
</text>
<text x="160" y="480" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--ink)">
Entry, EntryId/BarId/RowId
</text>
<text x="160" y="496" text-anchor="middle" class="box-sub" font-size="10.5" fill="var(--core)">
+ entryId(), rowId(), barId() — runtime
</text>
<text x="160" y="514" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
Field, FieldKey, ChangeSet
</text>
<text x="160" y="540" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
2,607 lines · 23 files
</text>
<!-- arrows: model -> the six consumers -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow2)" color="var(--ink)">
<path d="M510,160 C 380,195 200,195 145,220" />
<path d="M560,160 C 500,195 440,195 425,220" />
<path d="M680,160 C 720,195 720,195 725,220" />
<path d="M770,160 C 920,195 1010,195 1035,220" />
<path d="M540,160 C 420,200 160,350 160,420" />
</g>
<!-- layout -> render, indirect (re-export only) -->
<path
d="M425,360 V420"
stroke="var(--muted)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow2)"
stroke-dasharray="4 3"
color="var(--muted)"
/>
<text x="460" y="395" class="box-sub" font-size="9" fill="var(--muted)">re-export only</text>
</svg>
<figcaption>
<code>layout/</code> is the only layer that both imports <code>model/</code> and calls its runtime
helpers — everywhere else the crossing is types only. <code>data/</code> also calls
<code>entryId()</code>/<code>rowId()</code>/<code>barId()</code> at runtime for brand helpers. The
<code>api/index.ts</code> re-export list now includes <code>Field</code>, <code>FieldKey</code>,
<code>FieldType</code> and <code>ChangeSet</code> alongside the original types, giving consumers the
full vocabulary to declare fields and react to changesets.
<code>view/</code> never imports <code>api/</code> — <code>GanttShell</code> takes a
structurally-compatible <code>DatasetLike</code> instead, so <code>view -&gt; api</code> stays a
non-edge (#40).
</figcaption>
</figure>
</div>

## Detail — data/ transaction flow

### The transaction pipeline

Every mutation in `data/` flows through one path: the consumer calls
`dataset.transaction()`, which runs the body through a staged entry store, calls the
extension hook once, runs hierarchy promotion and rollup, folds the changeset, and emits
`beforeChange`/`change`. The extension hook is the designed seam where a scheduling plugin
can inject cascade writes; without a plugin installed it is the identity function.

<div class="fg-architecture-doc">
<figure>
<svg
viewBox="0 0 1240 340"
role="img"
aria-label="Flow diagram of the data/ transaction pipeline: consumer calls transaction(), the body runs against the EntryStore staging surface, the EditExtender extension hook is called once, hierarchy promotion and rollup run, the changeset is folded, and beforeChange/change events fire"
>
<defs>
<marker
id="arrow5"
viewBox="0 0 10 10"
refX="8"
refY="5"
markerWidth="7"
markerHeight="7"
orient="auto-start-reverse"
>
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
</defs>
<!-- consumer -->
<rect
x="30"
y="30"
width="160"
height="60"
rx="7"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.5"
/>
<text x="110" y="56" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
dataset.transaction()
</text>
<text x="110" y="74" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
api/dataset.ts → data/
</text>
<!-- runTransaction -->
<rect
x="240"
y="30"
width="170"
height="60"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="325" y="56" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
runTransaction()
</text>
<text x="325" y="74" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
data/transaction.ts
</text>
<!-- body runs on staged store -->
<rect
x="460"
y="30"
width="170"
height="60"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="545" y="56" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
body runs
</text>
<text x="545" y="74" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
add/update/remove on staged store
</text>
<!-- extension hook -->
<rect
x="680"
y="30"
width="180"
height="60"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
stroke-dasharray="5 4"
/>
<text x="770" y="56" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
extension hook
</text>
<text x="770" y="74" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
identityExtender (default)
</text>
<text x="770" y="88" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">
scheduling plugin occupies in S7
</text>
<!-- hierarchy + rollup -->
<rect
x="920"
y="30"
width="180"
height="60"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="1010" y="56" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
promote + rollup
</text>
<text x="1010" y="74" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
hierarchy.ts, rollup.ts
</text>
<!-- fold changeset -->
<rect
x="340"
y="140"
width="200"
height="60"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="440" y="166" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
foldChangeSet()
</text>
<text x="440" y="184" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
data/change-set.ts — diffs staged vs committed
</text>
<!-- ChangeSet -->
<rect
x="620"
y="140"
width="220"
height="60"
rx="7"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.5"
/>
<text x="730" y="166" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
ChangeSet { added, removed, updated }
</text>
<text x="730" y="184" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
one write shape — model/change-set.ts
</text>
<!-- apply to committed -->
<rect
x="900"
y="140"
width="200"
height="60"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="1000" y="166" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
apply to committed
</text>
<text x="1000" y="184" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
EntryStore.applyChangeSet()
</text>
<!-- beforeChange -->
<rect
x="340"
y="250"
width="180"
height="50"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
/>
<text x="430" y="272" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
beforeChange
</text>
<text x="430" y="288" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
cancelable veto
</text>
<!-- change -->
<rect
x="620"
y="250"
width="180"
height="50"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
/>
<text x="710" y="272" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
change
</text>
<text x="710" y="288" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
carries the ChangeSet
</text>
<!-- history subscribes -->
<rect
x="880"
y="250"
width="180"
height="50"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="970" y="272" text-anchor="middle" class="box-name" font-size="13" fill="var(--ink)">
History
</text>
<text x="970" y="288" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
records for undo/redo
</text>
<!-- arrows -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow5)" color="var(--ink)">
<path d="M190,60 H240" />
<path d="M410,60 H460" />
<path d="M630,60 H680" />
<path d="M860,60 H920" />
</g>
<!-- fold down from promote+rollup -->
<path
d="M1010,90 V120 H540 V140"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow5)"
color="var(--ink)"
/>
<path
d="M540,200 V240 H430"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow5)"
color="var(--ink)"
/>
<path
d="M520,275 H620"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow5)"
color="var(--ink)"
/>
<path
d="M800,275 H880"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow5)"
color="var(--ink)"
/>
<!-- apply to committed back up from fold -->
<path
d="M640,170 H900"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow5)"
color="var(--ink)"
/>
</svg>
<figcaption>
The transaction pipeline at S5. The consumer calls <code>dataset.transaction()</code>, which delegates
to <code>runTransaction()</code> in <code>data/transaction.ts</code>. The body runs against a staged
<code>EntryStore</code> overlay so mid-flight reads see consistent state. The
<code>EditExtender</code> hook is called once (identity function by default; a Dataset plugin can wrap
it, and a scheduling plugin occupies this slot in S7). Hierarchy promotion and rollup run next, then
<code>foldChangeSet()</code> diffs the staged edits against committed state to produce one
<code>ChangeSet</code>. The events fire in order: <code>beforeChange</code> (cancelable — the
consumer can veto), then <code>change</code> (carries the changeset). The <code>History</code>
subscribes to <code>change</code> for undo/redo; <code>view/</code>'s
<code>subscribeToDatasetChanges</code> subscribes for re-render.
</figcaption>
</figure>
</div>

## Detail — api/

### Public API surface

What a consumer can actually import from `freegantt` today, and the construction path that
runs the first time `new Gantt(...)` is called. The sealed `exports` map makes everything
left of the dashed line below unreachable — `view/`, `layout/` and `render/` are
implementation, not surface, even though this diagram draws them to show what actually
executes.

<div class="fg-architecture-doc">
<figure>
<svg
viewBox="0 0 1240 560"
role="img"
aria-label="Diagram of api/index.ts's public export surface split into four groups — Gantt with properties, Dataset with CRUD and events, model/ re-exports, and time/ plus layout/ re-exports — and below it the construction call chain: new Gantt constructs a GanttShell, which mounts the backend and binds to the viewport, the FrameScheduler flushes after construction completes, computeFrame() produces a GeometryFrame, and the DOM render backend syncs it"
>
<defs>
<marker
id="arrow3"
viewBox="0 0 10 10"
refX="8"
refY="5"
markerWidth="7"
markerHeight="7"
orient="auto-start-reverse"
>
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
</defs>
<!-- public zone -->
<rect
x="30"
y="20"
width="1180"
height="190"
rx="10"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.25"
stroke-dasharray="3 4"
/>
<text x="50" y="44" class="box-name" font-size="11.5" fill="var(--core)" letter-spacing="0.06em">
PUBLIC — api/index.ts, sealed exports map
</text>
<!-- Gantt -->
<rect
x="60"
y="60"
width="250"
height="130"
rx="7"
fill="var(--bg)"
stroke="var(--core)"
stroke-width="1.5"
/>
<text x="185" y="82" text-anchor="middle" class="box-name" font-size="13.5" fill="var(--ink)">
Gantt
</text>
<text x="185" y="100" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
preset · range · fit · gridColumns
</text>
<text x="185" y="114" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
rowSource · collapsed · collapsedIds
</text>
<text x="185" y="128" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
selection · selectedEntries
</text>
<text x="185" y="142" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
interactions · plugins · commands
</text>
<text x="185" y="158" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
theme · locale · todayLine · destroy()
</text>
<text x="185" y="176" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
api/gantt.ts
</text>
<!-- Dataset -->
<rect
x="330"
y="60"
width="260"
height="130"
rx="7"
fill="var(--bg)"
stroke="var(--core)"
stroke-width="1.5"
/>
<text x="460" y="82" text-anchor="middle" class="box-name" font-size="13.5" fill="var(--ink)">
Dataset
</text>
<text x="460" y="100" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
entries.add / .update / .remove / .all
</text>
<text x="460" y="114" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
entry.read / .children / .hasChildren
</text>
<text x="460" y="128" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
transaction · on/off · undo/redo
</text>
<text x="460" y="142" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
field · fields · fieldTypes
</text>
<text x="460" y="158" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
replay
</text>
<text x="460" y="176" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
api/dataset.ts
</text>
<!-- model re-exports -->
<rect
x="610"
y="60"
width="250"
height="130"
rx="7"
fill="var(--bg)"
stroke="var(--core)"
stroke-width="1.5"
/>
<text x="735" y="82" text-anchor="middle" class="box-name" font-size="13.5" fill="var(--ink)">
model/ re-exports
</text>
<text x="735" y="100" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
entryId(), barId()
</text>
<text x="735" y="114" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
Entry, EntryId, RowId, BarId
</text>
<text x="735" y="128" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
Field, FieldKey, ChangeSet
</text>
<text x="735" y="142" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
Instant, TimeSpan, Duration
</text>
<text x="735" y="176" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
the route to build Entry[] and declare fields
</text>
<!-- time/layout re-exports -->
<rect
x="880"
y="60"
width="300"
height="130"
rx="7"
fill="var(--bg)"
stroke="var(--core)"
stroke-width="1.5"
/>
<text x="1030" y="82" text-anchor="middle" class="box-name" font-size="13.5" fill="var(--ink)">
time/ + layout/ re-exports
</text>
<text x="1030" y="100" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
presets · instant() · now() · addMs · ZonedTime
</text>
<text x="1030" y="114" text-anchor="middle" class="box-sub" font-size="10" fill="var(--muted)">
instant(), ViewPreset
</text>
<text x="1030" y="132" text-anchor="middle" class="box-sub" font-size="10" fill="var(--ink)">
TimeScaleModel, ScrollAxis — D9 shared-axis objects
</text>
<text x="1030" y="176" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
layout/ re-exports widened by issue #91 §9-I
</text>
<!-- boundary -->
<line
x1="30"
y1="240"
x2="1210"
y2="240"
stroke="var(--border-strong)"
stroke-width="1.25"
stroke-dasharray="1 5"
/>
<text x="1210" y="234" text-anchor="end" class="box-sub" font-size="10" fill="var(--muted)">
INTERNAL — unreachable by import, drawn only to show what runs ↓
</text>
<!-- call chain -->
<rect
x="60"
y="270"
width="200"
height="90"
rx="7"
fill="var(--bg-raised)"
stroke="var(--border-strong)"
stroke-width="1.5"
/>
<text x="160" y="298" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">
new Gantt(options)
</text>
<text x="160" y="316" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
api/gantt.ts
</text>
<text x="160" y="332" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
constructs a GanttShell
</text>
<rect
x="310"
y="270"
width="200"
height="90"
rx="7"
fill="var(--bg-raised)"
stroke="var(--border-strong)"
stroke-width="1.5"
/>
<text x="410" y="298" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">
GanttShell
</text>
<text x="410" y="316" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
view/gantt-shell.ts
</text>
<text x="410" y="332" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
mounts, binds viewport, wires gestures
</text>
<rect
x="560"
y="270"
width="200"
height="90"
rx="7"
fill="var(--bg-raised)"
stroke="var(--border-strong)"
stroke-width="1.5"
/>
<text x="660" y="298" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">
FrameScheduler.flush()
</text>
<text x="660" y="316" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
view/frame-scheduler.ts
</text>
<text x="660" y="332" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
first render after construction
</text>
<rect
x="810"
y="270"
width="200"
height="90"
rx="7"
fill="var(--bg-raised)"
stroke="var(--border-strong)"
stroke-width="1.5"
/>
<text x="910" y="298" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">
computeFrame()
</text>
<text x="910" y="316" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
layout/frame.ts
</text>
<text x="910" y="332" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
rows, bars, header ticks
</text>
<rect
x="810"
y="400"
width="200"
height="90"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
/>
<text x="910" y="428" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">
backend.sync(frame)
</text>
<text x="910" y="446" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
render/dom/index.ts
</text>
<text x="910" y="462" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
syncKeyed() per layer (#48)
</text>
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow3)" color="var(--ink)">
<path d="M260,315 H310" />
<path d="M510,315 H560" />
<path d="M760,315 H810" />
<path d="M910,360 V400" />
</g>
<text x="660" y="380" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">
same call chain re-runs on every TimeScaleModel onChange — resize, zoom, or a second bound Gantt
</text>
</svg>
<figcaption>
Four export groups, one allow-list philosophy: <code>api/index.ts</code> re-exports exactly the types
a consumer needs to call the classes above it and nothing else — <code>TimeScaleOptions</code> stays
internal because it carries <em>resolved</em> geometry, not a caller's state (#5). At S5 the
<code>Gantt</code> class exposes plugins, commands, and the live-reconfigurable properties (preset,
range, gridColumns, rowSource, collapsed, selection, …) and <code>Dataset</code> exposes entries CRUD,
transactions, events, fields, Dataset plugins, and undo/redo. The call chain underneath never appears in the public
surface; a consumer only ever sees it as bars moving on screen. The first render happens after
construction completes via <code>FrameScheduler.flush()</code>, not via bind-notify.
</figcaption>
</figure>
</div>

## Detail — implemented modules

### How the built modules talk

The same graph as above, minus the remaining stub — `scheduling/` does not appear. Every
arrow label below is a real symbol in `src/` today. `api/` builds both `Dataset` (from
`data/`) and `Gantt` (from `view/`). `view/GanttShell` binds to the dataset (receiving
`DatasetState`), builds the `GesturePipeline` with capability resolution, and wires
`interaction/` through constructor injection — the shell never imports `interaction/`
directly. Two loops carry all the traffic: the bind-time notification loop (`TimeScaleModel`
calls back into `GanttShell.render()` on every resolved-scale change), and the per-render
pipeline (`render()` → `computeFrame()` → `backend.sync()`). Solid arrows are direct calls;
dashed arrows are callbacks or value/type flow.

<div class="fg-architecture-doc">
<figure>
<svg
viewBox="0 0 1240 720"
role="img"
aria-label="Call graph of the implemented FreeGantt modules at S5. api/ builds Dataset (data/) and Gantt (view/). GanttShell constructs the Viewport, FrameLayout, RenderBackend, EventBus, GesturePipeline, PluginRuntime, TreeCollapse, and every attachment. GanttShell binds to the TimeScaleModel via scale.bind, reads scale and preset, and the model calls onChange which is this.render(). interaction/ drives the EntryGestureContext seam. Per render, computeFrame in layout/frame.ts receives LayoutInput and produces GeometryFrame. The GeometryFrame goes to backend.sync which runs syncKeyed once per layer. model/ is a zero-dependency strip of types plus brand-id helpers."
>
<defs>
<marker
id="arrow4"
viewBox="0 0 10 10"
refX="8"
refY="5"
markerWidth="7"
markerHeight="7"
orient="auto-start-reverse"
>
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
<marker
id="arrow-muted4"
viewBox="0 0 10 10"
refX="8"
refY="5"
markerWidth="6"
markerHeight="6"
orient="auto-start-reverse"
>
<path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
</marker>
</defs>
<!-- api/ -->
<rect
x="25"
y="52"
width="200"
height="150"
rx="7"
fill="var(--core-bg)"
stroke="var(--core)"
stroke-width="1.75"
/>
<text x="125" y="78" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
api/
</text>
<text x="125" y="100" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
Gantt · Dataset
</text>
<text x="125" y="118" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
new Gantt({container, dataset, scale?})
</text>
<text x="125" y="136" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
gantt.destroy()
</text>
<text x="125" y="158" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
one private GanttShell each (I2)
</text>
<text x="125" y="174" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
765 lines · 3 files
</text>
<!-- view/ -->
<rect
x="285"
y="52"
width="250"
height="320"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
/>
<text x="410" y="78" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
view/ — GanttShell
</text>
<text x="410" y="100" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
constructor: backend.mount(container)
</text>
<text x="410" y="116" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
→ scale.bind(...) — its onChange fires
</text>
<text x="410" y="132" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
the first render (#22)
</text>
<text x="410" y="156" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
render(): frame = computeFrame(...)
</text>
<text x="410" y="172" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
backend.sync(frame)
</text>
<text x="410" y="194" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
destroy(): handle.unbind();
</text>
<text x="410" y="210" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
backend.destroy(); container cleared
</text>
<text x="410" y="234" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
caches one RowHeightIndex (#47)
</text>
<text x="410" y="250" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
FrameScheduler coalesces rAF
</text>
<text x="410" y="272" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
build Gestures + Capabilities
</text>
<text x="410" y="288" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
TreeCollapse · keyboard/wheel nav
</text>
<text x="410" y="308" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
2,440 lines · 20 files
</text>
<!-- data/ -->
<rect
x="595"
y="52"
width="250"
height="150"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="720" y="78" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
data/ — DatasetState
</text>
<text x="720" y="98" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
transaction() → staged edits
</text>
<text x="720" y="114" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
extension hook → changeset → events
</text>
<text x="720" y="134" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
EntryStore, FieldRegistry, History
</text>
<text x="720" y="150" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
fields (field · fields.all)
</text>
<text x="720" y="174" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
imports time/ + model/ only
</text>
<text x="720" y="190" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
2,607 lines · 23 files
</text>
<!-- interaction/ -->
<rect
x="595"
y="232"
width="250"
height="100"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
/>
<text x="720" y="256" text-anchor="middle" class="box-name" font-size="14.5" fill="var(--ink)">
interaction/
</text>
<text x="720" y="276" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
attachEntryGestures()
</text>
<text x="720" y="292" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
attachKeyboardEditing()
</text>
<text x="720" y="308" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
drives EntryGestureContext seam
</text>
<!-- TimeScaleModel -->
<rect
x="905"
y="52"
width="310"
height="170"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="1060" y="76" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
TimeScaleModel
</text>
<text x="1060" y="92" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
layout/viewport/time-scale-model.ts
</text>
<text x="1060" y="114" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
bind(binding, onChange) → handle
</text>
<text x="1060" y="130" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
handle.setPaneWidth(w) · unbind()
</text>
<text x="1060" y="152" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
get scale — memoized createTimeScale()
</text>
<text x="1060" y="168" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
get preset
</text>
<text x="1060" y="194" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
one shared instance = x-synced Gantts (D9)
</text>
<!-- time/ -->
<rect
x="905"
y="242"
width="310"
height="90"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="1060" y="266" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
time/
</text>
<text x="1060" y="286" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
createTimeScale(), hourPreset … yearPreset
</text>
<text x="1060" y="302" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
only new Date()/Date.now() in src/ (I10)
</text>
<text x="1060" y="318" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
940 lines · 8 files · temporal-polyfill façade
</text>
<!-- render/ -->
<rect
x="905"
y="372"
width="310"
height="160"
rx="7"
fill="var(--dom-bg)"
stroke="var(--accent)"
stroke-width="1.5"
/>
<text x="1060" y="396" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
render/
</text>
<text x="1060" y="412" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
RenderBackend contract — backend.ts
</text>
<text x="1060" y="432" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
mount(container) · sync(frame) · destroy()
</text>
<text x="1060" y="448" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
rowLabelWidth · date-line · row-twisty
</text>
<text x="1060" y="468" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
sync() = syncKeyed() × {ticks, rows, bars}
</text>
<text x="1060" y="484" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
null/ twin: same contract, headless
</text>
<text x="1060" y="508" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
1,028 lines · 7 files
</text>
<!-- computeFrame -->
<rect
x="905"
y="562"
width="310"
height="120"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="1060" y="586" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
computeFrame()
</text>
<text x="1060" y="602" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
layout/frame.ts + bars/ + rows/
</text>
<text x="1060" y="622" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
resolveRows → produceItems → cull
</text>
<text x="1060" y="638" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
header ticks, date-lines, columns
</text>
<text x="1060" y="662" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
heights: shell-cached RowHeightIndex (#47)
</text>
<!-- model/ strip -->
<rect
x="25"
y="620"
width="840"
height="85"
rx="7"
fill="var(--bg)"
stroke="var(--ink)"
stroke-width="1.5"
/>
<text x="445" y="646" text-anchor="middle" class="box-name" font-size="14" fill="var(--ink)">
model/
</text>
<text x="445" y="668" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
Entry · EntryId / RowId / BarId · Field · ChangeSet · geometry · errors
</text>
<text x="445" y="686" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
entryId() · rowId() · barId() — zero deps: types + brand-id helpers only
</text>
<!-- 1. api -> view : construct / destroy -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow4)" color="var(--ink)">
<path d="M225,132 H283" />
</g>
<text x="254" y="120" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
new GanttShell({container,
</text>
<text x="254" y="133" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
dataset, scale?, attachEntryGestures})
</text>
<text x="254" y="152" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
shell.destroy()
</text>
<!-- 2. api -> data : construct Dataset -->
<path
d="M150,52 C 150,30 400,20 595,80"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow4)"
color="var(--ink)"
/>
<text x="400" y="46" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
new Dataset({entries, timeZone, editExtender?})
</text>
<!-- 3. view -> TSM : bind + reads -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow4)" color="var(--ink)">
<path d="M535,122 H903" />
</g>
<text x="720" y="110" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--ink)">
scale.bind(binding, onChange)
</text>
<text x="720" y="140" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
reads .scale · .preset
</text>
<!-- 4. TSM -> view : the notification loop -->
<path
d="M903,177 H537"
stroke="var(--muted)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow-muted4)"
stroke-dasharray="4 3"
/>
<text x="720" y="167" text-anchor="middle" class="box-sub lbl" font-size="10" fill="var(--muted)">
onChange() → this.render()
</text>
<!-- 5. TSM -> time : lazy resolution -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow4)" color="var(--ink)">
<path d="M1060,222 V240" />
</g>
<text x="1072" y="236" text-anchor="start" class="box-sub lbl" font-size="10" fill="var(--ink)">
on first get scale → createTimeScale(o) — memoized
</text>
<!-- 6. view -> render : backend lifecycle -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow4)" color="var(--ink)">
<path d="M535,240 V420 H903" />
</g>
<text x="736" y="350" text-anchor="start" class="box-sub lbl" font-size="10" fill="var(--ink)">
createDomBackend() · mount(container)
</text>
<text x="736" y="364" text-anchor="start" class="box-sub lbl" font-size="10" fill="var(--ink)">
rowLabelWidth · sync(frame) · destroy()
</text>
<!-- 7. view -> frame : the per-render pipeline -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow4)" color="var(--ink)">
<path d="M535,282 V590 H903" />
</g>
<text x="736" y="440" text-anchor="start" class="box-sub lbl" font-size="10" fill="var(--ink)">
computeFrame(LayoutInput) → GeometryFrame
</text>
<!-- 8. frame -> time : scale methods -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow4)" color="var(--ink)">
<path d="M1060,560 V336" />
</g>
<!-- 9. frame -> model : the only runtime brand-helper calls outside model/ -->
<g stroke="var(--ink)" stroke-width="1.5" fill="none" marker-end="url(#arrow4)" color="var(--ink)">
<path d="M980,684 V700 H865 V660 H865" />
</g>
<text x="875" y="700" text-anchor="start" class="box-sub lbl" font-size="10" fill="var(--ink)">
barId() · rowId()
</text>
<!-- 10. view -> model : type-only -->
<path
d="M310,374 V620"
stroke="var(--muted)"
stroke-width="1.25"
fill="none"
marker-end="url(#arrow-muted4)"
stroke-dasharray="4 3"
/>
<text x="322" y="470" text-anchor="start" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
Entry (type-only) via DatasetLike
</text>
<!-- 11. view -> interaction : constructs and wires -->
<path
d="M535,340 H593"
stroke="var(--muted)"
stroke-width="1.25"
fill="none"
marker-end="url(#arrow-muted4)"
stroke-dasharray="4 3"
/>
<text x="564" y="340" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
inject via constructor
</text>
<!-- 12. interaction -> view : drives the seam -->
<path
d="M595,280 H537"
stroke="var(--ink)"
stroke-width="1.5"
fill="none"
marker-end="url(#arrow4)"
color="var(--ink)"
/>
<text x="566" y="270" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--ink)">
EntryGestureContext
</text>
<!-- 13. data -> events : change fires -->
<path
d="M720,202 V220"
stroke="var(--muted)"
stroke-width="1.25"
fill="none"
marker-end="url(#arrow-muted4)"
stroke-dasharray="4 3"
/>
<text x="736" y="218" text-anchor="start" class="box-sub lbl" font-size="9.5" fill="var(--muted)">
change → re-render
</text>
</svg>
<figcaption>
Reading order is construction (api → view + data), bind (view → TimeScaleModel), resolve
(TimeScaleModel → time/), then the per-render pipeline (view → computeFrame → backend.sync). The
dashed return edge from TimeScaleModel is the whole reactivity story — there is no event bus and no
observer list beyond the bindings map: a second <code>Gantt</code> sharing one
<code>TimeScaleModel</code> is x-synced because its <code>onChange</code> is simply also in the map.
<code>interaction/</code> drives the <code>EntryGestureContext</code> seam — injected by
<code>api/gantt.ts</code>, never imported by <code>view/</code> directly.
<code>data/</code>'s <code>change</code> event bridges into <code>view/</code> via
<code>subscribeToDatasetChanges</code> for re-render.
<code>destroy()</code> unwinds in reverse:
<code>handle.unbind()</code> then <code>backend.destroy()</code>. Everything left of
<code>view/</code> is DOM-free — the same <code>computeFrame</code>/<code>createTimeScale</code> calls
run identically in Node, which is what the null backend's tests rely on.
</figcaption>
</figure>
</div>
