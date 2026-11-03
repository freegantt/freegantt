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
| D3b | Successor default | Research: Project, P6 and Syncify all pull. Default is push and pull. "Push only" is a consumer option. |
| D4 | User date breaks a link | Scheduled Entry: the user's date becomes a "start no earlier than" floor and the link still wins. Manually scheduled Entry: the date stays and a diagnostic marks the broken link. Consumer option: "the user's date always wins". |
| D2 | ADR 0041 | Accepted with no keyboard connect in core. A keyboard user adds a Dependency in the consumer's Entry edit form, through the `entryDependencies()` host API. |
| D7 | Engine type names | Accepted. Each new term gets a glossary entry in `CONTEXT.md`. |
| D7a | "Pinned" retires | The word is **Manually scheduled** (Microsoft Project's Task Mode word). Code: `manuallyScheduled: boolean`. `ScheduleRequest.pinned`, `BlockReason 'pinned'` and `ScheduleRuleKind 'pinned'` become `manuallyScheduled`. The glossary lists "pinned" under _Avoid_, because the grid already has pinned columns. P6 and Syncify have no manual mode; their "Mandatory Start/Finish" is a Constraint, not this flag. |
| D9 | `ConnectorEnd.entryId` | Stays `EntryId`. `EntryId | string` collapses to `string` and drops the brand. A plugin that reads plain strings from a file calls `entryId()` once at the read. No code change. |
| D10 | rowSpan `text` | Kept. The follow-up worker shows it on the "Planned vs actual" harness page (for example "+4d"). |
| D11 | Bundle growth | Coordinator default 11A while the owner is away (2026-11-02): accept the growth with a row in `bundle-size-exceptions.md`. No lazy loading. The owner can reverse it. |
| C1 | Removal cascade gap (S7.2) | Coordinator: core adds a generic seam that lets a plugin stage writes to its own store for a removal, in the same transaction and changeset. Other store writes inside the extension hook still throw. |
| C2 | `replaceAll` undo | Coordinator: README decision 5 stands (owner-accepted): `replaceAll` writes like `entries.syncAll`, with no undo step. `add`/`remove` are undoable. |
| C3 | `replaceAll` door (S7.2) | Coordinator: core adds `PluginStore.syncAll(rows)`, mirroring `entries.syncAll`: one 'sync' ChangeSet, no undo step, all-or-nothing. C1's seam shipped as `ctx.edits.cleanRowsOnRemoval(cleaner)`. |
| D11, C1, C3 | Owner confirmation | The owner confirmed 11A, C1 and C3 (2026-11-02). |
| C4 | Connector refresh (S7.3) | Coordinator, from accepted ADR 0040: no `refreshConnectors()` door. A plugin keeps connector state in its plugin store. The harness "Related to" plugin moves its pairs there. S7.3 default for the owner to check: a locked Entry still allows 'connect' unless `capabilities.connect` says no. |
| F1-a | Engine defaults (F1) | An edited Entry never pulls earlier: its new date is its floor. A floor on an Entry with no incoming Dependency does not move it; S7.9 decides how a violated constraint reports. |
| C5 | Manually scheduled storage | Coordinator: `scheduling()` declares a boolean Field `manuallyScheduled`, because a grid toggle column binds to a Field (ruling D6). This replaces README decision 14 for that flag only. Constraints stay in the plugin store. |
| C6 | Constraint write (S7.7) | Coordinator: `cleanRowsOnRemoval` widens into one seam that stages a plugin's own store rows for any edit, in the same ChangeSet. One door, renamed to fit. |
| D12 | I4 and ruling D4 | Owner 1B (2026-11-02): an extension may replace a Field the user proposed only when its result marks that Field as an override. The dev check still throws on an unmarked overwrite. Needs a plans/01 §11 I4 amendment and an ADR. |
| D13 | Connect a locked Entry | Owner: keep. A locked Entry allows 'connect' unless `capabilities.connect` says no. |
| D14 | S7.3b names | Owner: `connectByDrag` and the id form `<from>:<type>:<to>` are fine. |
| D15 | Connect drop target | Owner: the port is too small and connecting is hard. Snap: a drop anywhere on a bar connects to its nearer edge. The port hit area grows. |
| D16 | Redraw door | Owner A: `ctx.view.refreshConnectors()` for screen-only provider state. ADR 0040 amended. |
| D17 | A new Dependency reschedules | Owner A: the extension hook also runs for a transaction that writes only a plugin store, so `scheduling()` moves the successor in the same ChangeSet. One undo removes the link and the move. |
| D18 | Connector routing | Owner "A + avoid": target-row gap route, SS/FF fix, 12 px stub, and verticals that avoid bars, capped at 200 spanned rows by default, consumer can change. |
| D19 | Connector polish | Owner "A A" (third A taken from the owner's own arrow request): lines behind bars with the selected line on top; `fitDataset` adds a margin; `connectorArrow` option, default `end`. |
