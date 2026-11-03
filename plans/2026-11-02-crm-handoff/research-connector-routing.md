# Research — connector routing in Gantt libraries

Date: 2026-11-02. Scope: how other Gantt libraries draw dependency lines, and one routing algorithm for `src/layout/connectors/route-connector.ts`.

Source key:
- **[code]**: I read the source. The clone was shallow, at the default branch HEAD on 2026-11-02.
- **[docs]**: vendor documentation or a vendor issue tracker.
- **[derived]**: I worked it out from the code. I did not see it rendered.
- **[unverified]**: from memory or from secondary sources.

## 1. Our router today

`routeConnector(from, to)` works like this:
- It uses an 8 px stub.
- It makes one elbow when the target lies past the stub, in the direction the line leaves. The vertical sits at the source stub.
- In all other cases it makes an S-route. The horizontal run sits on the **source** row's top or bottom boundary.

Two findings:
1. **Backward FS.** The run sits on the source boundary. The vertical then drops at `target.x − 8` through every row between the two bars. The owner's screenshot shows this problem.
2. **SS and FF never get the short route.** `oneElbow` needs `leave === -arrive`. For SS this gives `-1 === 1`, and for FF it gives `1 === -1`. So every SS and FF link takes the 4-bend S-route through the source boundary. Every library below draws a 2-bend "C" shape instead. The tests cover only FS (`connectors.test.ts`), so nothing caught this.

## 2. Gantt libraries

### Summary table

| Library | License (checked) | Where the horizontal run goes on a backward FS | Stub | SS / FF | Lane offsets | Arrowhead |
|---|---|---|---|---|---|---|
| frappe-gantt | MIT (`license.txt`) | Source row boundary | `padding` 18 px; the line leaves the bar **bottom** | Not supported (links have no type) | No | 5 px chevron |
| gantt-task-react | MIT | Source row boundary (half a row from the source centre) | `arrowIndent` 20 | Not supported | No | 5 px triangle |
| DHTMLX Gantt CE v10 | **MIT** (`LICENSE.md`, repo HEAD Sep 2026; older releases were GPL-2.0) | Source row boundary | `2 × link_arrow_size` = 24 px (default config 12) | C shape at min/max x | No | 12 px; only on a horizontal last segment |
| SVAR Gantt (Svelte/React) | MIT (`license.txt`) | **Target row**, in the gap above the target bar | `delta` = 20 | C shape | No | 5×6 triangle |
| jsGanttImproved | BSD-3 (`LICENSE`; `package.json` says ISC, which does not match) | **Target row near boundary** (half a row from the target centre, on the source side) | `vShort` = 4; final hook 8 | C shape | No | CSS arrow |
| OpenProject timeline | GPL-3.0 | **Target row** gap (8 px under the row top when going down, 30 px when going up); the line enters the bar top or bottom | Bar padding | FS only (precedes/follows) | No | CSS |
| Bryntum Gantt | Commercial | Path finder (`RectangularPathFinder`) that avoids other boxes | Margins not documented | Yes | Not documented | `markerDef`, 9×6 viewBox |
| Google Charts Gantt | Proprietary (hosted) | Not documented | — | — | — | `arrow.length` 8, `radius` 15 (curved), `spaceAfter` 4 |
| Syncfusion EJ2 | Commercial | Not documented. The docs cover only `connectorLineWidth` (default 1) and `connectorLineBackground` | — | — | — | — |
| Kendo UI Gantt | Commercial | Not documented | — | — | — | — |

Taiga has no Gantt. I did not research Webix or AnyChart: both are closed source, and their public docs show no routing rules.

### frappe-gantt — `src/arrow.js` [code], MIT
- The line starts at the source bar's **bottom edge**, not at its end. It starts at mid-bar, then moves left in 10 px steps until it clears the target's x.
- Forward case: it drops vertically, then turns at the target centre row into the target start. Corners use `arrow_curve` (5).
- Backward case (`target.x <= source.x + padding`): it drops `padding/2` to the source row boundary, runs left to `target.x − padding`, drops to the target centre, then turns right.
- Every link is drawn as FS. The lines do not avoid bars or spread apart.

### gantt-task-react — `src/components/other/arrow.tsx` [code], MIT
- The path is `h arrowIndent` → `v ±rowHeight/2`, which puts the line on the **source** row boundary.
- If `source.x2 + 2·indent < target.x1`, the vertical continues to the target centre. If not, the line runs `H target.x1 − indent` along the source boundary, then drops.
- It supports RTL. Every link is drawn as FS. I found no link-creation gesture in the source.

### DHTMLX Gantt CE — `src/core/ui/render/link_render.js` [code], MIT since v10
- **Endpoints.** `y` is the row centre. `x` is the bar start or end, picked by link type. RTL swaps the edges.
- **FS:**
  - Stub right `shiftX`.
  - It treats the link as forward when `e_x > x + 2·shiftX`. Then the vertical sits at the stub, and the line runs right.
  - Otherwise the line drops `rowHeight/2` (the **source** row boundary), runs to `e_x − shiftX`, drops the rest, and hooks right. This is the same shape as ours.
- **SS:** stub left. The vertical sits at `min(start) − shiftX`, then the line runs right into the target. This is a C shape.
- **FF:** the vertical sits at `max(end) + shiftX`, then the line hooks left. This is a C shape.
- **SF:** a mirror of FS.
- Rounded corners use `link_radius` (`|| 4`). A value ≤ 1 turns them off. A corner is skipped when a segment is shorter than the radius.
- Each segment is a div with a `link_wrapper_width` (20 px) transparent wrapper. That wrapper is the click hit area.
- The lines do not avoid bars or spread apart.

### SVAR Gantt — `store/src/links.ts` [code], MIT
- `delta = 20` is the stub. The point list is `sx → sx±20 → (x, y) → (x, y) → ex∓20 → ex`.
- **Backward FS** (`ex − 20 <= sx + 18`): `dy = ey − sy − cellHeight/2 + offset`. Here `offset = (cellHeight − 7 − barHeight)/2`.
  - The horizontal run sits at `ey − cellHeight/2 + offset`. That is the gap between the **target** row top and the target bar top.
  - The line drops at the source stub to that y, runs left, then drops into the target centre.
  - This is the owner's route. [derived] The same y applies when the target is above the source.
- **Forward FS:** the vertical sits at the source stub.
- **SS/FF:** a C shape at the outer x.
- **SF:** like FS, with mirrored conditions.
- **Hit area:** a second `polyline.wx-line-hitbox` with `stroke-width: 20`, transparent, `pointer-events: stroke`.
- The lines do not avoid bars or spread apart.

### jsGanttImproved — `src/draw_dependencies.ts` [code], BSD-3
- `vRow = rowHeight/2`, with its sign set by direction. The stub `vShort` is 4.
- **FS** "bends" when `x1 + 10 >= x2` and the rows differ. Then the path is: stub → vertical to `y2 − vRow` (the **target** row's near boundary) → left to `x2 − 8` → down → right into the target. This is the owner's route.
- **SS:** the vertical sits at `min − 4` or `x2 − 8`. This is a C shape.
- **FF:** the vertical sits at `max + 8`. This is a C shape.
- **SF:** a mirror of the FS bend.
- Segments are absolutely positioned divs. There is no avoidance.

### OpenProject — `frontend/src/app/features/work-packages/components/wp-table/timeline/global-elements/wp-timeline-relations.directive.ts` [code], GPL-3.0 (describe only)
- Rows are a fixed 40 px.
- The line leaves the source end with a short stub and drops vertically at that x.
- **Forward:** the line turns right at the target row centre.
- **Backward, going down:** the vertical stops at the target row top + 8. The line runs left along that y to a point just inside the target bar's start, then drops 11 px into the bar **top**.
- **Backward, going up:** the run is at the target row + 30, and the line enters the bar **bottom**.
- In short: the run sits in the target row, on the side the line comes from.

### Bryntum Gantt [docs], commercial (describe only)
- **Routing.** An internal `RectangularPathFinder` routes lines around `otherBoxes` (the boxes in the rows between). When it fails, for example when rows have too little vertical clearance, it falls back to "lineDef adjusters". Sources: bryntum/support issue #13789, and issue #14017.
- **Draw order.** In Gantt, `Dependencies#adjustLineDef` swaps start and end, so the path is drawn from the **successor**. The code comment says this makes "more Gantt-friendly arrows". Issue #14017 confirms that Gantt still draws from the successor after the fix. I think this is how their bends end up near the target. [unverified]
- **Configs:**
  - `radius` (arc corners)
  - `clickWidth` (a wider invisible line, for click and touch)
  - `markerDef` (an SVG arrow in a 9×6 box)
  - `drawAroundParents` (experimental, nested events only)
- I found no documented lane offsets.

### Google Charts [docs], proprietary
- Options: `gantt.arrow.radius` 15 (curved corners), `length` 8, `angle` 45, `spaceAfter` 4 (gap before the target), `width` 1.4.
- The routing is not documented.

### Microsoft Project [unverified, from memory]
- An FS line leaves the predecessor end, runs right, and turns down into the **top** of the successor near its start. This is the same idea as OpenProject.

## 3. Generic orthogonal routing

| Project | License | Copy code? | Idea |
|---|---|---|---|
| libavoid / adaptagrams (C++) | LGPL-2.1 (`cola/LICENSE`) | No. Describe only | Builds an orthogonal visibility graph, then runs A* with penalties. `router.h` names `segmentPenalty`, `anglePenalty`, `crossingPenalty`, `shapeBufferDistance`, `idealNudgingDistance`, `nudgeOrthogonalSegmentsConnectedToShapes`. A **nudging** pass then spreads apart segments that share a channel. |
| Wybrow, Marriott, Stuckey, "Orthogonal connector routing", GD 2009, LNCS 5849, pp. 219–231 | Paper | Ideas are free | The algorithm behind libavoid: visibility graph, then shortest path with a bend penalty, then nudging. Follow-up paper: "Seeing Around Corners: Fast Orthogonal Connector Routing" (Diagrams 2014). |
| ELK layered, orthogonal edge router (Java / elkjs) | EPL-2.0 | No | [unverified] Puts the vertical segments between two layers into "routing slots". It orders them to reduce crossings, and spaces them by edge-to-edge spacing. A Gantt row gap works the same way as an ELK channel between layers. |
| mxGraph `mxEdgeStyle.OrthConnector` (JS) | Apache-2.0 | Yes, with notice | A **lookup table** of route shapes (`routePatterns`, `inlineRoutePatterns`), indexed by source side × target side × relative quadrant. The jetty (stub) is `orthBuffer = 10`. This is O(1), and it is the closest match to what we need. |
| schteppe/smart-signal-routing (JS) | BSD-2-Clause | Yes, with notice | A small orthogonal router. Its README says it is unfinished ("fix bugs so that more than two boxes works"). |
| Bukk94/OrthogonalConnectorRouting (C#) | MIT | Yes | A visibility-graph router with obstacle avoidance. |
| JointJS `manhattan` router, BlockSuite connector | MPL-2.0 | No. File-level copyleft | A* on a grid. |
| jose-mdz "Orthogonal Diagram Connector" gist | No license found | No | A grid plus a shortest path between two rects with side and margin. |

A global search (visibility graph + A*) is too much for a Gantt, for three reasons:
- Rows give us free channels: a row boundary never crosses a bar, because bars sit inset from it.
- Only **vertical** segments can cross bars.
- Each row holds about one bar.

So a cheap local check on vertical segments gets most of the benefit. See §5.3.

## 4. Creating a link by drag

| Library | Port / handle | Does a drop on the bar body count? | Line hit area |
|---|---|---|---|
| DHTMLX [code] | A 10 px circle (16 px in the material skin), 8 px outside the bar end, in a `.gantt_link_control` zone 18 px wide (`--dhx-gantt-link-handle-offset` + `-size`). It shows on hover. | **No.** `landing` is true only inside `.gantt_link_control`. The start/end choice comes from the control under the pointer. | 20 px wrapper |
| SVAR [code] | A 16 px circle (8 px dot inside), at `left: -16px` and on the right. Linking is click-then-click (`linkFrom`), not drag. | **No.** It needs the `.wx-link` class. | 20 px stroke |
| Bryntum [docs] | 12 px terminals at the bar edge. `terminalSize`, `terminalOffset`, `terminalSides` (start, top, end, bottom), `terminalShowDelay`, `terminalHideDelay`. | **Yes**, with `allowDropOnEventBar`. The type is then the **default type** of `DependencyModel` (FS), not the nearest edge. | `clickWidth` |
| Kendo [docs] | A dot shows at the task ends on hover. You drag it to a dot on another task. | Dots only (from the reproduction steps in a GitHub issue) | — |
| frappe, gantt-task-react | No link-creation gesture | — | — |
| FreeGantt today | `PORT_WIDTH_PX = 14`, beside each edge (`src/render/dom/connect-affordance.ts`) | — | — |

None of these libraries documents a touch size. External rules:
- WCAG 2.2 SC 2.5.8 asks for a 24×24 CSS px minimum target.
- SC 2.5.5 (AAA) and Apple HIG ask for 44×44.

## 5. Recommendation

### 5.1 Rules

Terms:
- `S`: the stub. I suggest **12 px**. Today it is 8, which leaves no room for an arrowhead plus a gap. DHTMLX and SVAR use 20–24.
- `exitX = source.x ± S`: the stub end, in the direction the line leaves.
- `entryX = target.x ∓ S`: the stub end, on the side the line arrives from. A start edge is reached from the left, and an end edge from the right.
- **Target near boundary:**
  - `target.rowTop` when the target is below the source.
  - `target.rowBottom` when the target is above.
  - The shared `rowBottom` when both bars are on the same row.

| Link | Relative position | Route | Bends |
|---|---|---|---|
| FS | `entryX ≥ exitX` (enough room) | stub → vertical at `exitX` → into the target. This is unchanged. | 2 |
| FS | backward (`entryX < exitX`) | stub → vertical at `exitX` down to the **target near boundary** → run to `entryX` → short hook into the target | 4 |
| SF | mirror of FS (the line leaves left and arrives from the right) | same two cases, mirrored | 2 / 4 |
| SS | any, on different rows | C shape: vertical at `min(exitX, entryX)` → into the target | 2 |
| FF | any, on different rows | C shape: vertical at `max(exitX, entryX)` → into the target | 2 |
| SS / FF / backward FS | same row | loop under the row: run on `rowBottom` | 4 |

Why the target near boundary:
- The owner asked for this route.
- SVAR, jsGanttImproved and OpenProject all do it.
- The long horizontal run then sits next to the bar it points at. The eye finds the arrow without tracing the whole width.

When the rows are next to each other, the target near boundary is the same line as the source boundary. So this change only affects links that span two or more rows. The callers and `clip-path.ts` need no change: both anchors already carry `rowTop` and `rowBottom`.

### 5.2 Pseudo-code (O(1))

```ts
const S = 12;

function routeConnector(from: ConnectorAnchor, to: ConnectorAnchor): Point[] {
  const leave = from.edge === 'end' ? 1 : -1;     // +1 = leaves right
  const arrive = to.edge === 'start' ? -1 : 1;    // side the line arrives from
  const exitX = from.x + leave * S;
  const entryX = to.x + arrive * S;
  const sameRow = from.rowTop === to.rowTop;
  const start = { x: from.x, y: from.y };
  const end = { x: to.x, y: to.y };

  // Same edge type (SS, FF): one vertical at the outer x. It never needs a lane.
  if (leave === arrive && !sameRow) {
    const x = leave < 0 ? Math.min(exitX, entryX) : Math.max(exitX, entryX);
    return tidy([start, { x, y: from.y }, { x, y: to.y }, end]);
  }

  // Opposite edges (FS, SF) with room: one vertical at the source stub.
  const hasRoom = leave === -arrive && leave * (entryX - exitX) >= 0;
  if (hasRoom) {
    return tidy([start, { x: exitX, y: from.y }, { x: exitX, y: to.y }, end]);
  }

  // Backward link, or any same-row loop: run on the target row's near boundary.
  const laneY = sameRow ? to.rowBottom : to.y > from.y ? to.rowTop : to.rowBottom;
  return tidy([
    start,
    { x: exitX, y: from.y },
    { x: exitX, y: laneY },
    { x: entryX, y: laneY },
    { x: entryX, y: to.y },
    end,
  ]);
}
```

`tidy` is the current `withoutRedundantPoints`.

Add tests for these cases:
- FS forward
- FS backward, going down and going up
- FS backward on adjacent rows (the result must match today's route)
- SS and FF, target left and target right
- SF
- each same-row case

### 5.3 Optional step: keep verticals off bars (local, not a graph search)

Only verticals can cross bars. Each vertical has a range of legal x positions:
- FS with room: any x in `[exitX, entryX]`.
- The first vertical of a backward FS: `[exitX, exitX + k·S]`.
- SS: `(−∞, min]`. FF: `[max, ∞)`, capped at k·S.

To pick the x:
1. Take the rows strictly between the source and the target. The router already holds `plan` and the bar boxes.
2. Collect the bar x intervals in those rows. Pad each one by 2 px.
3. Pick the free x nearest the default x, inside the legal range.
4. If no x is free, keep the default x. The line then crosses the bars, as it does today.

The cost is O(rows spanned × bars per row). That is about O(rows spanned), because a Gantt row usually holds one bar. `ConnectorRouter` already caches routes per dataset revision and paint key, so this runs once per change, not once per frame.

This fixes most of the "long vertical from row 0 to row 13" case when a free gap exists. It needs one new router input: bar intervals by row index. That is an API change inside `layout/`. Plan it as its own slice.

### 5.4 Not now

- **Lane offsets.** None of the Gantt libraries I read spreads overlapping lines apart. Only libavoid's nudging and ELK's routing slots do. If we add it later:
  1. Group the horizontal runs by boundary y.
  2. Sort each group by x range.
  3. Offset the overlapping runs by ±2 px.
  The cost is O(n log n) for each routing pass.
- **Entering the bar from the top**, as OpenProject and MS Project do. It reads well, but it breaks our edge-anchor model. It also needs a vertical arrowhead.

### 5.5 Drag creation (suggested)

- Keep the drawn port at about 12 px. Make the hit box at least **24 px** (WCAG 2.5.8). Make it **44 px** under `@media (pointer: coarse)`.
- Accept a drop on the bar body. Pick the **nearest edge** from the pointer x against the bar midpoint. Bryntum picks the default type instead, and DHTMLX and SVAR reject a body drop. The nearest-edge rule is our own choice. Write it down as one.
- Give each line a transparent hit stroke of about 20 px, as DHTMLX and SVAR do.

### 5.6 What we can copy

- **Code we may copy, with the notice kept:** frappe-gantt (MIT), gantt-task-react (MIT), DHTMLX Gantt CE v10+ (MIT; not releases before v10, which are GPL), SVAR Gantt (MIT), mxGraph (Apache-2.0), jsGanttImproved (BSD-3), smart-signal-routing (BSD-2).
- **Describe the behavior only, never copy code:** OpenProject (GPL-3.0), libavoid (LGPL-2.1), ELK (EPL-2.0), JointJS and BlockSuite (MPL-2.0), the unlicensed jose-mdz gist, and Bryntum, Syncfusion, Kendo and Google (commercial).
- The algorithm in §5.2 is short and new. It copies no code. The idea of a target-row lane is in SVAR (MIT) and jsGanttImproved (BSD-3) anyway.

## Sources

- frappe/gantt `src/arrow.js`; MaTeMaTuK/gantt-task-react `src/components/other/arrow.tsx`; DHTMLX/gantt `src/core/ui/render/link_render.js`, `src/core/ui/timeline/links_dnd.js`, `src/core/common/config.ts`, `src/css/task.less`; svar-widgets/gantt `store/src/links.ts`, `svelte/src/components/chart/{Links,Bars}.svelte`; jsGanttImproved/jsgantt-improved `src/draw_dependencies.ts`; opf/openproject (file above).
- Bryntum: https://bryntum.com/products/scheduler/docs-llm/api/Scheduler/feature/Dependencies.md, https://bryntum.com/products/scheduler/docs-llm/api/Scheduler/feature/mixin/DependencyCreation.md, https://github.com/bryntum/support/issues/14017, https://github.com/bryntum/support/issues/13789
- Google: https://developers.google.com/chart/interactive/docs/gallery/ganttchart
- Syncfusion: https://ej2.syncfusion.com/documentation/gantt/taskbar ; Kendo: https://github.com/telerik/kendo-themes/issues/1159
- libavoid: https://www.adaptagrams.org/documentation/libavoid.html, `cola/libavoid/router.h`; mxGraph `javascript/src/js/view/mxEdgeStyle.js`; https://github.com/schteppe/smart-signal-routing ; https://github.com/Bukk94/OrthogonalConnectorRouting
