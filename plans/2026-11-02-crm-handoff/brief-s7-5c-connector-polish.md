# Brief S7.5c: lines behind bars, a chart margin, and arrowheads

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-5c-connector-polish`. Port: 5315.

## Why

The owner tested the new routes (ruling D19, "A A A"):

- A long vertical connector crosses many wide bars on top of them. No x can avoid them.
- A backward link into a bar that starts at the first date hooks in at 12 px left of that bar, under the grid pane, so the hook is out of view.
- The owner wants arrowheads, as a consumer option.

Read `research-connector-routing.md` (§2 and §4: frappe, DHTMLX and SVAR draw links below bars; every library draws an arrowhead at the successor end).

## Change

1. **Lines behind bars.** `src/render/dom/connectors.ts:78` mounts the connector layer after the bar layer. Mount it before the bar layer, so bars paint over lines. The selected connector (flag `selected`) and the connect preview still draw above the bars. For example, a second small layer above the bars holds only the selected connector. Pointer hits on a line between bars still work (the line hit area is not covered where no bar is). E2e: a connector under a bar lies below it (`elementFromPoint` on the crossing returns the bar), and a click on the selected line still works. Own commit, CHANGELOG.
2. **Chart margin for `range: 'fitDataset'`.** The fitted range adds a lead before the first bar and a trail after the last bar. The default is wide enough for a stub plus an arrowhead at the current zoom (at least 24 px). A consumer can change or remove it. Read `docs/agents/api.md` and use the naming skill (one option on the range, for example a padding in pixels). Find the fit code in `src/layout/viewport/time-scale-model.ts` and `src/api/gantt.ts`. Check the harness pages and e2e that read the first tick or the first bar x; update only where the margin is the intended change. Own commit, CHANGELOG, API report.
3. **Arrowheads.** New Gantt option `connectorArrow: 'end' | 'none'`, default `'end'`, changes live. `'end'` draws a filled arrowhead at the arrival end of every connector, pointing into the target edge. Size and color come from CSS tokens (`--fg-connector-arrow-size`, and the line color by default). Document the tokens in `docs/10-styling-and-theming.md`. The arrowhead stays inside the 12 px stub, so the route does not change. A selected connector's arrowhead takes the selected color. Pure tests for the option, e2e that the marker shows with `'end'` and is gone with `'none'`. Own commit, CHANGELOG, API report.
4. Harness: the "Dependencies" page shows the arrows. Its toolbar or a small control switches `connectorArrow`, using the public option only.

## Constraints

- Do not change the route rules in `src/layout/connectors/route-connector.ts` except to place the arrowhead.
- Do not touch `src/interaction/connect.ts` or the port styles (just fixed in 5bda678e).
- No harness workaround. If core does not give you what you need, `ask`.
