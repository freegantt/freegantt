# Brief S7.5b: better connector routes, and verticals that avoid bars

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-5b-connector-routing`. Port: 5314.

## Why

The owner showed a backward finish-to-start line that runs along the source row's gap and drops past the target. The owner wants the route along the target row's gap (ruling D18, "A + avoid"). Read `research-connector-routing.md` §5 first: it holds the rules and pseudo-code. Write new code. Copy code only from the MIT/BSD sources the research names, with their notice.

## Change

1. **Failing tests first** in `src/layout/connectors/connectors.test.ts`: backward FS on rows 3 rows apart runs along the target row's near gap; SS draws one vertical at the leftmost stub (2 bends); FF one vertical at the rightmost stub; a same-row link loops along the row's bottom gap; adjacent-row routes stay as today. Add a fast-check property: every route is orthogonal, starts at the source anchor and ends at the target anchor.
2. **Router rules** in `src/layout/connectors/route-connector.ts`: the stub becomes 12 px; rules 2–5 of research §5. Own commit, `CHANGELOG.md` line.
3. **Avoid bars (research §5.3):** only vertical segments cross bars. For each vertical, pick the free x nearest its default x, inside its allowed range, that crosses no bar in the rows it spans. Keep a bar index by row (sorted x intervals) so each row check is a binary search. If no free x exists, keep the default x.
4. **Cost limit (no library documents one, so we set our own):** routing runs for every connector on each data change, not on scroll. Avoidance costs one check per row a vertical spans. Cap it: a vertical that spans more than `maxAvoidRows` rows (default 200) keeps its default x. Expose a Gantt option for connector routing, with the common path as default: avoid on, cap 200; the consumer can turn avoidance off or change the cap. Read `docs/agents/api.md` and use the naming skill for the option name. Own commit, CHANGELOG, API report.
5. **Performance test:** add a bench or a timed pure test that routes 10 000 Entries with 10 000 links, with avoid on, and stays inside the existing layout budget in `plans/` (find it; if none applies, report the measured time in `worker_done`). Also check that an unchanged Dataset does not reroute on scroll.
6. **Harness:** the "Dependencies" page shows a backward link and an SS/FF pair; e2e checks the backward route's horizontal run sits on the target row's gap.

## Constraints

- S7.4b may touch `connector-router.ts` for `refreshConnectors()`. Keep your changes there small; merge `origin/Pawel-IT/Sscheduling-Work` before you push and keep both sides.
- Do not touch `src/interaction/connect.ts`, `src/render/dom/connect-affordance.ts` (S7.3c), `src/data/` or `src/extensions/features/scheduling*` (S7.7b).
- `clip-path.ts` and the frame path stay as they are unless a test proves they must change.
- No harness workaround. If core does not give you what you need, `ask`.
