# Plugin lifecycle

What `installPlugin` does, when a plugin's own half may call a `register*`, and what
`uninstallPlugin` tears down. One plugin has two halves — `view` and `data` — and §4 is where the
`data` half differs.

*Derived from `api/plugin.ts`, `api/plugin-context.ts`, `api/dataset-plugin.ts`,
`extensions/plugin-runtime.ts`, `extensions/install-dataset-plugins.ts`.*

## Two halves, one install site

A `view` half sees panes, the overlay and gestures. A `data` half sees only what the Dataset
holds, so it stays DOM-free and runs wherever a `Dataset` runs — the same core-vs-view split every
other layer keeps. One `definePlugin` object may fill both. The install site is where the state
lives: a plugin with a `data` half installs on the `Dataset`, and every Gantt bound to that
Dataset then runs its `view` half once, each with its own context.

| Question | `view` half | `data` half |
| --- | --- | --- |
| Installed through | `DatasetOptions.plugins`, or — chrome-only — `GanttOptions.plugins`, `gantt.installPlugin`, `gantt.plugins =` | `DatasetOptions.plugins` — read-only after construction |
| When it runs | Once, after the Gantt mounts | Once, while the Dataset constructs |
| Can it be added or removed later? | A chrome-only plugin, yes — `installPlugin`/`uninstallPlugin`, live, no remount | No — a Field a plugin declares must exist before the first Rollup, so a different plugin set means a new `Dataset` |
| What it registers into | Renderers, decorations, item producers, kind defaults, grid columns, commands, keybindings (§3 table) | Fields, field types, aggregators, the mutation extension hook, its own store |
| Runtime that installs it | `PluginRuntime<TContext>` | `installDatasetPlugins()` |

Setup order for either half resolves from `requires` alone — `[a, b]` and `[b, a]` install
identically, and one list covers both halves (§4 walks the resolution).

Both halves share the same three-part shape underneath, which is why the rest of this page reads
almost the same for either one: a plugin names an `id`; each half runs exactly once and may return
a `Disposer`; every `register*` it calls is legal only while that one call is on the stack. What
differs is what triggers install and whether it can be undone.

## Install, setup, dispose — one `view` half

`gantt.installPlugin(plugin)` forwards into `PluginRuntime.install`, which builds one fresh
context, calls `view()` once, then closes that plugin's own registration gate the moment `view()`
returns. Nothing the plugin registered survives past its own `uninstallPlugin` call —
`PluginRuntime` disposes it for the plugin, whether or not the plugin returned a `Disposer` of its
own.

*Derived from `api/gantt.ts`, `view/gantt-shell.ts`, `extensions/plugin-runtime.ts`,
`view/plugin-ports.ts`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 660"
role="img"
aria-labelledby="pl-seq-title pl-seq-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="pl-seq-title">One plugin's install, setup and dispose</title>
<desc id="pl-seq-desc">
Sequence diagram: a page calls gantt.installPlugin, which reaches GanttShell then
PluginRuntime, which builds a context, calls the plugin's setup, closes its registration
gate, and later disposes it on uninstallPlugin.
</desc>
<defs>
<marker
id="pa1"
viewBox="0 0 10 10"
refX="9"
refY="5"
markerWidth="7"
markerHeight="7"
orient="auto-start-reverse"
>
<path d="M0,1 L9,5 L0,9 z" fill="currentColor" />
</marker>
</defs>
<!-- lifeline heads -->
<g>
<rect class="bx api" x="10" y="14" width="126" height="36" />
<text class="t" x="73" y="30" text-anchor="middle">harness page</text>
<text class="s" x="73" y="43" text-anchor="middle">harness/plugins.ts</text>
<rect class="bx api" x="160" y="14" width="128" height="36" />
<text class="t" x="224" y="30" text-anchor="middle">Gantt</text>
<text class="s" x="224" y="43" text-anchor="middle">api/gantt.ts</text>
<rect class="bx dom" x="312" y="14" width="146" height="36" />
<text class="t" x="385" y="30" text-anchor="middle">GanttShell</text>
<text class="s" x="385" y="43" text-anchor="middle">view/gantt-shell.ts</text>
<rect class="bx dom" x="482" y="14" width="180" height="36" />
<text class="t" x="572" y="30" text-anchor="middle">PluginRuntime</text>
<text class="s" x="572" y="43" text-anchor="middle">extensions/plugin-runtime.ts</text>
<rect class="bx pure" x="686" y="14" width="140" height="36" />
<text class="t" x="756" y="30" text-anchor="middle">RegistrationGate</text>
<text class="s" x="756" y="43" text-anchor="middle">one per plugin</text>
<rect class="bx api" x="850" y="14" width="100" height="36" />
<text class="t" x="900" y="30" text-anchor="middle">the plugin</text>
<text class="s" x="900" y="43" text-anchor="middle">setup(ctx)</text>
</g>
<!-- lifelines -->
<g class="life">
<line x1="73" y1="52" x2="73" y2="640" />
<line x1="224" y1="52" x2="224" y2="640" />
<line x1="385" y1="52" x2="385" y2="640" />
<line x1="572" y1="52" x2="572" y2="640" />
<line x1="756" y1="52" x2="756" y2="640" />
<line x1="900" y1="52" x2="900" y2="640" />
</g>
<!-- 1 -->
<g class="num"><circle cx="8" cy="84" r="8" /><text x="8" y="87" text-anchor="middle">1</text></g>
<line class="edge" x1="73" y1="84" x2="218" y2="84" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="146" y="78" text-anchor="middle">gantt.installPlugin(plugin)</text>
<!-- 2 -->
<g class="num"><circle cx="8" cy="116" r="8" /><text x="8" y="119" text-anchor="middle">2</text></g>
<line class="edge" x1="224" y1="116" x2="379" y2="116" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="302" y="110" text-anchor="middle">#shell.installPlugin(plugin)</text>
<!-- 3 -->
<g class="num"><circle cx="8" cy="148" r="8" /><text x="8" y="151" text-anchor="middle">3</text></g>
<line class="edge" x1="385" y1="148" x2="566" y2="148" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="475" y="142" text-anchor="middle">install([...plugins, plugin])</text>
<!-- 4 self -->
<g class="num"><circle cx="8" cy="184" r="8" /><text x="8" y="187" text-anchor="middle">4</text></g>
<path class="edge" d="M572,178 h44 v14 h-38" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="624" y="182">assertNoDuplicateIds; partition #installed by id</text>
<text class="s" x="624" y="196">→ kept vs removed; this plugin's id is new → toAdd</text>
<!-- 5 -->
<g class="num"><circle cx="8" cy="228" r="8" /><text x="8" y="231" text-anchor="middle">5</text></g>
<line class="edge" x1="572" y1="228" x2="750" y2="228" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="661" y="222" text-anchor="middle">new RegistrationGate(plugin.id)</text>
<text class="s" x="661" y="242" text-anchor="middle">#buildContext(plugin.id) also builds ctx + disposables</text>
<!-- 6 -->
<g class="num"><circle cx="8" cy="272" r="8" /><text x="8" y="275" text-anchor="middle">6</text></g>
<line class="edge" x1="572" y1="272" x2="894" y2="272" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="733" y="266" text-anchor="middle">plugin.setup(ctx)</text>
<!-- 7 self on plugin -->
<g class="num"><circle cx="8" cy="308" r="8" /><text x="8" y="311" text-anchor="middle">7</text></g>
<path class="edge" d="M900,302 h44 v14 h-38" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="470" y="306" text-anchor="middle">
ctx.view.registerRenderer(…), ctx.view.registerDecoration(…), ctx.commands.register(…) — any
register*, any number of times
</text>
<path class="edge soft" d="M756,308 H900" style="color: var(--line)" />
<text class="xs" x="828" y="322" text-anchor="middle">each call reads gate.assertOpen() first</text>
<!-- 8 return -->
<g class="num"><circle cx="8" cy="352" r="8" /><text x="8" y="355" text-anchor="middle">8</text></g>
<line class="edge ret" x1="894" y1="352" x2="578" y2="352" marker-end="url(#pa1)" style="color: var(--smell-line)" />
<text class="warnink" x="733" y="346" text-anchor="middle">returns a Disposer, or nothing (review P4)</text>
<!-- 9 -->
<g class="num"><circle cx="8" cy="388" r="8" /><text x="8" y="391" text-anchor="middle">9</text></g>
<line class="edge" x1="572" y1="388" x2="750" y2="388" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="661" y="382" text-anchor="middle">gate.close()</text>
<text class="s" x="661" y="402" text-anchor="middle">a register* reached after this throws RegistrationClosedError</text>
<!-- 10 self -->
<g class="num"><circle cx="8" cy="432" r="8" /><text x="8" y="435" text-anchor="middle">10</text></g>
<rect class="bx" x="482" y="416" width="400" height="34" />
<text class="t" x="494" y="430">#installed = [...kept, ...justInstalled]</text>
<text class="s" x="494" y="443">the plugin is live — its registrations paint on the next frame</text>
<!-- divider -->
<line x1="16" y1="480" x2="944" y2="480" stroke="var(--line)" stroke-dasharray="2 5" />
<text class="xs" x="16" y="474">— later, on the same Gantt —</text>
<!-- 11 -->
<g class="num"><circle cx="8" cy="512" r="8" /><text x="8" y="515" text-anchor="middle">11</text></g>
<line class="edge" x1="73" y1="512" x2="218" y2="512" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="146" y="506" text-anchor="middle">gantt.uninstallPlugin(plugin.id)</text>
<!-- 12 -->
<g class="num"><circle cx="8" cy="548" r="8" /><text x="8" y="551" text-anchor="middle">12</text></g>
<line class="edge" x1="385" y1="548" x2="566" y2="548" marker-end="url(#pa1)" style="color: var(--sub)" />
<text x="475" y="542" text-anchor="middle">install(plugins.filter(id ≠ this one))</text>
<!-- 13 self -->
<g class="num"><circle cx="8" cy="596" r="8" /><text x="8" y="599" text-anchor="middle">13</text></g>
<rect class="bx warn" x="482" y="580" width="380" height="52" />
<text class="t" x="494" y="596">this plugin's id is now missing from next → removed</text>
<text class="s" x="494" y="610">dispose(): disposables.disposeAll() — every register*'s own</text>
<text class="s" x="494" y="624">removal, in reverse — then ownDispose?.() from step 8</text>
</svg>
</div>
<figcaption>
Diagram 1 — one plugin, start to finish. Amber = the returned <code>Disposer</code> and the
teardown it feeds. The gate (column 5) is open for exactly one call: step 6. Every
<code>register*</code> reached after step 9 — including from a stray closure the plugin kept —
throws <code>RegistrationClosedError</code> instead of silently registering.
</figcaption>
</figure>
</div>

### Why the gate closes the instant `setup()` returns

A plugin's registrations have exactly one lifetime: the plugin's own. If `setup()` could keep
registering after it returns — from a timer, a promise, a DOM callback it captured — nothing would
tell `PluginRuntime` to also retract that later registration when the plugin is uninstalled, and a
stray write could land after teardown started. Closing the gate turns that gap into a thrown error
at the call site instead of a silent leak. A plugin that needs to add or remove something after
`setup()` uses the seams built for exactly that: `ctx.view.registerRenderer(...)`'s *returned*
`Disposer` retracts a registration early, and `ctx.interaction.registerKeyHandler` is ungated on
purpose, because a popup opens and closes its own handler for as long as the plugin runs — not
once at install.

#### The registration gate, as a timeline

The same three phases, drawn the way this library draws everything else — as bars against a time
axis. `register*` is legal only in the first bar.

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 900 170"
role="img"
aria-labelledby="pl-gate-title pl-gate-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="pl-gate-title">The registration gate over one plugin's lifetime</title>
<desc id="pl-gate-desc">
Three bars on a shared timeline: setup() running with the gate open, installed and live
with the gate closed, and disposed.
</desc>
<line x1="140" y1="20" x2="140" y2="150" class="life" />
<line x1="420" y1="20" x2="420" y2="150" class="life" />
<line x1="700" y1="20" x2="700" y2="150" class="life" />
<text class="xs" x="140" y="14" text-anchor="middle">install()</text>
<text class="xs" x="420" y="14" text-anchor="middle">setup() returns</text>
<text class="xs" x="700" y="14" text-anchor="middle">uninstallPlugin()</text>
<rect class="bx warn" x="140" y="34" width="280" height="30" />
<text class="t" x="150" y="54">setup(ctx) running — gate OPEN</text>
<rect class="bx pure" x="420" y="34" width="280" height="30" />
<text class="t" x="430" y="54">installed &amp; live — gate CLOSED</text>
<rect class="bx dom" x="140" y="84" width="280" height="30" />
<text class="t" x="150" y="104">register* — legal, files a Disposer</text>
<rect class="bx" x="420" y="84" width="280" height="30" />
<text class="s" x="430" y="104">register* — throws RegistrationClosedError</text>
<rect class="bx hot" x="700" y="34" width="180" height="80" />
<text class="t hotink" x="712" y="54">dispose</text>
<text class="s" x="712" y="70">disposables.disposeAll()</text>
<text class="s" x="712" y="84">then ownDispose?.()</text>
<text class="xs" x="712" y="102">— see Diagram 1, step 13</text>
</svg>
</div>
<figcaption>
Diagram 2 — the gate has exactly one open window per plugin, and it is the same window every
plugin gets: its own <code>setup()</code> call.
</figcaption>
</figure>
</div>

## Diffing by id — what `install()` does with a whole list

`gantt.plugins = [...]` and `gantt.installPlugin(one)` both end at `PluginRuntime.install(next)`.
It never disposes and rebuilds everything: it diffs `next` against what is already installed, by
`id`, and only the difference moves. A plugin present in both lists — even a fresh object for that
`id` — is left exactly as it was; `PluginRuntime` reports that as a dropped reconfigure rather than
silently ignoring it.

*Derived from `extensions/plugin-runtime.ts` `install()`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 900 500"
role="img"
aria-labelledby="pl-diff-title pl-diff-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="pl-diff-title">install()'s diff, setup and rollback</title>
<desc id="pl-diff-desc">
Flow diagram: partition the current and next plugin lists by id into kept, removed and
toAdd; set up toAdd in order, rolling back on a throw; then dispose removed; then commit.
</desc>
<defs>
<marker id="pa2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,1 L9,5 L0,9 z" fill="currentColor" />
</marker>
</defs>
<rect class="bx api" x="20" y="16" width="256" height="40" />
<text class="t" x="32" y="34">install(next)</text>
<text class="s" x="32" y="48">#installed ← current list</text>
<line class="edge" x1="120" y1="56" x2="120" y2="76" marker-end="url(#pa2)" style="color: var(--sub)" />
<rect class="bx pure" x="20" y="82" width="256" height="46" />
<text class="t" x="32" y="100">partition #installed by id</text>
<text class="s" x="32" y="114">nextIds.has(id) ? kept : removed</text>
<line class="edge" x1="120" y1="128" x2="120" y2="148" marker-end="url(#pa2)" style="color: var(--sub)" />
<rect class="bx" x="20" y="154" width="256" height="40" />
<text class="t" x="32" y="172">#reportDroppedReconfigures</text>
<text class="s" x="32" y="186">next vs kept, same id different object</text>
<line class="edge" x1="120" y1="194" x2="120" y2="214" marker-end="url(#pa2)" style="color: var(--sub)" />
<rect class="bx pure" x="20" y="220" width="256" height="40" />
<text class="t" x="32" y="238">toAdd = next − kept, by id</text>
<line class="edge" x1="276" y1="240" x2="312" y2="240" marker-end="url(#pa2)" style="color: var(--sub)" />
<rect class="bx dom" x="318" y="140" width="254" height="200" />
<text class="t" x="330" y="160">try: for each plugin in toAdd</text>
<text class="s" x="330" y="178">1. #buildContext(id) → ctx, gate</text>
<text class="s" x="330" y="194">2. plugin.setup(ctx) → ownDispose?</text>
<text class="s" x="330" y="210">3. gate.close()</text>
<text class="s" x="330" y="226">4. justInstalled.push({plugin, dispose})</text>
<text class="xs" x="330" y="250">setup order = toAdd's own array order —</text>
<text class="xs" x="330" y="264">the order the caller's next list names them</text>
<line class="edge" x1="572" y1="200" x2="604" y2="200" marker-end="url(#pa2)" style="color: var(--sub)" />
<rect class="bx hot" x="610" y="150" width="250" height="90" />
<text class="t hotink" x="622" y="170">catch (cause)</text>
<text class="s" x="622" y="188">unwind justInstalled, reverse:</text>
<text class="s" x="622" y="202">#disposeOne(each)</text>
<text class="s" x="622" y="220">throw PluginSetupError(failedId, cause)</text>
<text class="xs" x="622" y="234">#installed untouched — old set stands</text>
<line class="edge" x1="572" y1="300" x2="604" y2="300" marker-end="url(#pa2)" style="color: var(--sub)" />
<rect class="bx pure" x="610" y="270" width="250" height="90" />
<text class="t" x="622" y="290">no throw</text>
<text class="s" x="622" y="306">removed disposed, reverse:</text>
<text class="s" x="622" y="320">#disposeOne(each)</text>
<text class="xs" x="622" y="338">after toAdd's own setup — a plugin</text>
<text class="xs" x="622" y="350">swapping in sees the old one still live</text>
<line class="edge" x1="710" y1="360" x2="710" y2="386" marker-end="url(#pa2)" style="color: var(--sub)" />
<rect class="bx" x="610" y="392" width="250" height="46" />
<text class="t" x="622" y="404">commit</text>
<text class="s" x="622" y="418">#installed = [...kept, ...justInstalled]</text>
<text class="xs" x="20" y="420">
<tspan x="20" dy="0">Rollback only ever touches THIS</tspan>
<tspan x="20" dy="14">call's own toAdd. kept and removed</tspan>
<tspan x="20" dy="14">are never disposed on a throw — a</tspan>
<tspan x="20" dy="14">half-applied plugin list never reaches</tspan>
<tspan x="20" dy="14">a caller (issue #137 F4, C1).</tspan>
</text>
</svg>
</div>
<figcaption>
Diagram 3 — <code>toAdd</code> is set up before any <code>removed</code> plugin is disposed, so a
plugin swapping in for another sees the outgoing one's resources still live during its own
<code>setup()</code>. A <code>setup()</code> throw unwinds only what this call just installed,
in reverse, then rethrows — the previous installed set, dropped plugins included, is untouched.
</figcaption>
</figure>
</div>

### The five seams a Gantt plugin registers into

`ctx.view`/`ctx.layout` carry five distinct registration points, one module
(`view/plugin-registrations.ts`), each with the one thing that has to run again after a
registration changes. A sixth capability — `ctx.view.registerGridColumn` — shares the shape but
keeps its own refresh in `ColumnChrome`, not here.

| Seam | Call | Who wins when two plugins claim it | What re-runs |
| --- | --- | --- | --- |
| renderer | `ctx.view.registerRenderer(point, fn)` | One slot per point (`cell`/`header`/`tooltip`); `bar` holds one slot *per kind*, so two plugins defining different kinds both install | Next frame repaints (`requestFrame`) |
| decoration | `ctx.view.registerDecoration(layer, fn)` | Every registration paints — the only seam where more than one wins at once | Held provider list drops; next frame repaints |
| variant | `ctx.variants.add(variant)` | Newest registration for that `name` wins (ADR 0018) | Per-row Item cache invalidates, capabilities re-resolve, next frame repaints |
| grid column | `ctx.view.registerGridColumn(column)` | A duplicate `field` the consumer's own `gridColumns` already names is dropped — config beats a plugin | Column chrome rebinds; a stale field's baked-in copy is stripped first |

Every one of these returns a `Disposer` that removes exactly its own registration, and every one
is also filed in the plugin's own `ctx.disposables`, so a plugin that never keeps the return value
still tears down cleanly on `uninstallPlugin`.

## A Dataset plugin installs once

`installDatasetPlugins` runs while the `Dataset` constructs, never again. There is no diff to
compute, because `Dataset.plugins` is read-only — a plugin may declare a Field, and a Field must
exist before the first Rollup, so a different plugin set is a different Dataset. What it does
compute is *order*: `requires` resolves into a setup sequence through a depth-first visit, the same
shape a topological sort always takes.

*Derived from `extensions/install-dataset-plugins.ts`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller">
<svg
class="d"
viewBox="0 0 960 340"
role="img"
aria-labelledby="pl-order-title pl-order-desc"
preserveAspectRatio="xMidYMid meet"
>
<title id="pl-order-title">Resolving Dataset plugin setup order from requires</title>
<desc id="pl-order-desc">
Two Dataset plugins where one requires the other, resolved into one setup order, then
installed top to bottom with the same try/rollback shape as PluginRuntime.
</desc>
<defs>
<marker id="pa3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,1 L9,5 L0,9 z" fill="currentColor" />
</marker>
</defs>
<rect class="bx dom" x="20" y="20" width="150" height="40" />
<text class="t" x="32" y="38">plugins: [b, a]</text>
<text class="s" x="32" y="52">b.requires = ['a']</text>
<line class="edge" x1="170" y1="40" x2="206" y2="40" marker-end="url(#pa3)" style="color: var(--sub)" />
<rect class="bx pure" x="212" y="20" width="360" height="72" />
<text class="t" x="224" y="38">resolveSetupOrder — DFS, visit(plugin)</text>
<text class="s" x="224" y="54">visit(b) → requires a → visit(a) first</text>
<text class="s" x="224" y="68">a settles, then b settles</text>
<text class="xs" x="224" y="84">a cycle in requires throws PluginRequirementCycleError</text>
<line class="edge" x1="572" y1="56" x2="608" y2="56" marker-end="url(#pa3)" style="color: var(--sub)" />
<rect class="bx" x="614" y="36" width="170" height="40" />
<text class="t" x="626" y="56">ordered: [a, b]</text>
<text class="s" x="626" y="70">array order ≠ input order</text>
<line class="edge" x1="689" y1="76" x2="689" y2="112" marker-end="url(#pa3)" style="color: var(--sub)" />
<rect class="bx dom" x="212" y="118" width="360" height="132" />
<text class="t" x="224" y="138">for plugin of ordered: try</text>
<text class="s" x="224" y="156">1. buildContext(id) → ctx, gate</text>
<text class="s" x="224" y="172">2. plugin.setup(ctx) → ownDispose?</text>
<text class="s" x="224" y="188">3. gate.close()</text>
<text class="s" x="224" y="204">4. installed.push({id, dispose})</text>
<text class="xs" x="224" y="222">a's fields exist before b's setup runs</text>
<text class="xs" x="224" y="234">— b may declare an Aggregator over a</text>
<text class="xs" x="224" y="246">Field a itself declared</text>
<line class="edge" x1="572" y1="184" x2="608" y2="184" marker-end="url(#pa3)" style="color: var(--sub)" />
<rect class="bx hot" x="614" y="118" width="240" height="90" />
<text class="t hotink" x="626" y="138">setup throws</text>
<text class="s" x="626" y="154">unwind installed, reverse</text>
<text class="s" x="626" y="168">throw PluginSetupError</text>
<text class="xs" x="626" y="184">the Dataset constructor throws, too</text>
<text class="xs" x="626" y="196">— no half-built Dataset reaches a caller</text>
<line class="edge" x1="724" y1="208" x2="724" y2="224" marker-end="url(#pa3)" style="color: var(--sub)" />
<rect class="bx pure" x="614" y="230" width="240" height="46" />
<text class="t" x="626" y="248">no throw</text>
<text class="s" x="626" y="262">returns one Disposer for the whole set</text>
<line class="edge" x1="724" y1="276" x2="724" y2="296" marker-end="url(#pa3)" style="color: var(--sub)" />
<text class="xs" x="614" y="312">Dataset.destroy() calls it once — every plugin disposes,</text>
<text class="xs" x="614" y="326">in reverse setup order</text>
</svg>
</div>
<figcaption>
Diagram 4 — <code>requires</code> decides order, not array position. A required id nobody
installs throws <code>MissingPluginError</code>; a cycle throws
<code>PluginRequirementCycleError</code> naming every plugin in it. The same reverse-order
unwind-on-throw and reverse-order dispose that <code>PluginRuntime</code> uses (§3) reappear
here — one shape, two runtimes.
</figcaption>
</figure>
</div>

:::note Why setup order matters more for a `data` half
A `data` half can declare a Field and wrap the mutation extension hook (`setExtender`) — a second
plugin's wrapper receives the first's output, so which one ran first changes what the composed
hook does. A `view` half registers into slots that resolve by *newest wins*, not by wrapping. Both
halves read one `requires` list, so a Gantt sorts the Dataset's plugins together with its own
chrome.
:::
