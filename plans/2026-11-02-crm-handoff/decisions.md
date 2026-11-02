# Owner decisions on the S7 design (PR #667)

Numbers follow `plans/s7-dependencies-and-scheduling/README.md` §5.

| # | Decision | Ruling (2026-11-02) |
|---|---|---|
| 1 | Seam shape | Option 3: the plugin states the two ends, `layout/` routes, culls and clips. ADR needed. |
| 1a | Names | The drawn line is a **Connector**. The plugin's value is a `ConnectorInput` (pairs with `DecorationInput`). `registerConnector`, `FrameConnector`, `GeometryFrame.connectors`, `ConnectorFlags`. Each end is `{ entryId, edge }`. "Link" and "LinkSpec" retire. A **Dependency** stays the data word. |
| 6, 7 | Connect gesture | Option A: core `Connect` controller in `interaction/`, a `'connect'` capability, `beforeConnect` (async veto) and `connect` events. Active only when a plugin registers a connect handler (`ctx.view.onConnect`). The payload names two `{ entryId, edge }` ends, never FS/SS/FF/SF; the plugin maps edges to a type. Keyboard connect lives in core. ADR needed. |
| 12 | Calendar | Option B: the scheduling plugin owns `workingCalendar()` / `WorkingCalendar` (the glossary's reserved term), exported from the scheduling entry point as a pure function. `calendar.offTime()` returns a `TimeCover`-shaped object that `timeShading()` already accepts. Core and `time/` do not change. The calendar answers `isWorkday`, `addWorkdays`, `workdaysBetween`. No ADR (fits ADR 0002). |
| 12a | Calendar is optional | Core never needs a calendar. `scheduling()` works with no calendar and then counts calendar days (24-hour days). `calendar` and `calendars`/`calendarField` are optional options. A Gantt with no scheduling plugin has no calendar concept at all. |
| 12b | Entry point | The package has one entry point (`"."`). `workingCalendar` and other scheduling exports go through `api/index.ts`, like `timeShading()`. Do not add a subpath export; that is a separate decision. |
| 12c | Layer edge | Follows from 12b (coordinator, 2026-11-02): `api/` may import `scheduling/`. `scheduling/` still imports `time/` and `model/` only. `sideEffects` lists only `styles.ts`, so unused scheduling exports tree-shake away. |
| 2–5, 8–11, 13–18 | Non-ADR picks | Accepted as B proposed in PR #667 §5, with the new words: connector for the line, Dependency for the data. |
| 8a | Remove event | The plugin owns connector selection. Delete removes the Dependency. The event is `beforeDependencyRemove` / `dependencyRemove`, a plugin event, not a core event. |
| 10a | `links.endpoints` | Drop it only after the S7.1 implementer confirms one Entry draws one Bar on segmented rows too. |
| — | Worker E question | Option A: `load()` stays the new-baseline door (#496). `syncAll()` drops collapse ids for removed rows. |
| — | Worker G points | Open gate rows print as open and do not fail the exit code. The A5 id sits in the pack-audit script output. (Coordinator default; the owner has not objected.) |

## Wave-2 follow-up rulings (2026-11-02)

| # | Decision | Ruling |
|---|---|---|
| D1 | ADR 0040 | Accepted. The ADR now uses the code's names: `ConnectorProvider`, `connectorProviders`, `layout/connector-input.ts`. |
| D3 | Successor moves earlier | The consumer selects it with a `scheduling()` option. The default is the common behavior of Project and P6 (research confirms which). |
| D3a | Other behaviors | Each researched behavior is a consumer option. The common path is the default. |
| D5 | Lag units | Days only for now. A month or year lag gives a diagnostic. |
| D6 | Manually scheduled | A per-Entry "manually scheduled" field that the consumer can show as a column toggle. The engine treats it as a pin. A policy that overwrites a proposed field stays a dev-mode error. |
| D8 | Holidays | The calendar is data that the consumer developer sets. No end-user holiday entry. Holidays accept `InstantInput`, like `dates()`. |
