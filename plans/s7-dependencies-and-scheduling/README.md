# S7 — Dependencies and scheduling: connector seam and slice plan

**Status:** decided. The owner ruled on 2026-11-02. See "Rulings" below.
**Closes:** #136 (connector seam), the S7 re-split that `plans/03-slices.md` asks for, #135 (helper, last slice).
**Input:** the consumer handoff of 2026-11-02 (items B, C, D). The owner waived the S6 → S7 gate for this work.
**Rule for this plan:** every hook serves any consumer. No consumer concept enters the design.

## Rulings

The owner ruled on 2026-11-02. Each row points at the section that holds the detail.

| # | Ruling | Where |
|---|---|---|
| 1, 1a | Option 3. The plugin states the two ends. `layout/` routes, culls and clips. The drawn line is a **Connector**. | §3, ADR "A plugin states a connector's two ends, and core routes it" |
| 2–5, 9, 11, 13–16, 18 | Accepted as proposed, with the new words. | §5 |
| 6, 7 | Option A. Core owns the connect gesture. The payload names two ends, never a dependency type. | §4 S7.3, ADR "Core owns the connect gesture, and a plugin owns its meaning" |
| 8a | The plugin owns connector selection. The event is `beforeDependencyRemove`, a plugin event. | §4 S7.4 |
| 10a | Drop `connectors.endpoints` only after S7.1 confirms one Entry draws one Bar on a segmented row. | §5 |
| 12 | The scheduling plugin owns `workingCalendar()`. Core and `time/` do not change. No ADR. | §4 S7.5 |
| 12a | The calendar is optional everywhere. | §4 S7.5 |
| 12b | One entry point. Exports go through `api/index.ts`. | §4 S7.5 |
| 17 | Decide in S7.11. | §5 |

## Words

- **Connector:** the line core draws between two bars. `ConnectorInput` is what a plugin returns.
- **Dependency:** the stored rule (`FS`, `SS`, `FF`, `SF`, lag). `entryDependencies()` owns it.
- **Working calendar:** `workingCalendar()` returns a `WorkingCalendar`. The scheduling plugin owns it.
- **Connect gesture:** the drag or key sequence that joins two ends.

## 1. What this plan finds

1. `dataset.pluginStore(id)` already ships on the public `Dataset` (`src/api/dataset.ts`). #136 rejected that door. ADR 0016 then added it for save and restore. A Gantt-side plugin can read any plugin store today.
2. The `Dependency` store cannot hold rows keyed by a connector id. A plugin store row belongs to one Entry (#555, comment on #136). `store.set` throws for an id with no Entry. See decision 4.
3. #136 rejected a closure-shared handle. The reason was "one Dataset backs two Gantts". ADR 0019 changed the install model. The `data` half installs once on the Dataset. The `view` half runs once per Gantt. A closure now works inside one plugin. It still cannot serve a second plugin. `scheduling()` must read the dependency rows, so the cross-plugin door stays needed.
4. `GestureCapability` has no connect key. `PluginContextParts` has no controller registration. The connect gesture therefore needs a core controller. See decision 6.
5. `BarFlags.cycle` has a type. I found no plugin door that sets it. S7 needs one. See gap 11 in §6.

## 2. The open question

A Gantt-side plugin paints connectors. The rows that say which connectors exist live in a Dataset-side plugin store.

- `layout/` may import `time/` and `model/` only. It must never name a plugin type.
- The same seam must carry "related to" arrows from a plugin that has no dependencies.
- `scheduling()` must add the `cycle` flag to connectors that `entryDependencies()` owns.
- A connector may cross the window edge. One end may sit in a culled row or a collapsed group.

## 3. Seam options

All four options register on the `view` half. They differ in what the plugin returns and in how it reads the rows.
The owner chose option 3. Options 1, 2 and 4 are the rejected alternatives.

### Option 1 — The plugin returns finished paths (rejected)

```ts
view(ctx) {
  ctx.view.registerConnectorEmitter(({ barsForEntry }) =>
    routeAll(ctx.dataset.pluginStore<DependencyRow>('freegantt.entryDependencies')?.all, barsForEntry),
  );
}
```

- **Layers:** `layout/connector-emitter.ts` imports `model/` only. The plugin routes paths itself. `barsForEntry` becomes public plugin API.
- **No plugin types in `layout/`:** the emitter returns `FrameConnector`. `FrameConnector.id` stays a plain string.
- **"Related to" plugin:** it registers an emitter and writes its own routing code.
- **Cost:** every plugin re-implements orthogonal routing. Every plugin must handle culled endpoints.

### Option 2 — Same as option 1, with a new `ctx.store.read` door (rejected)

```ts
ctx.view.registerConnectorEmitter(({ barsForEntry }) =>
  routeAll(ctx.store.read<DependencyRow>('freegantt.entryDependencies')?.all, barsForEntry),
);
```

- **Layers:** the same as option 1, plus a new member on `PluginContext`.
- **"Related to" plugin:** the same as option 1.
- **Cost:** two doors for one read. `ctx.dataset.pluginStore(id)` and `ctx.store.read(id)` answer the same question. This breaks "one domain per word". #136 chose this option before `pluginStore` shipped.

### Option 3 — The plugin returns connector inputs, `layout/` routes them (chosen)

```ts
view(ctx) {
  ctx.view.registerConnector(() =>
    [...(ctx.dataset.pluginStore<DependencyRow>('freegantt.entryDependencies')?.all ?? [])].flatMap(
      ([successorId, row]) =>
        row.predecessors.map((p) => ({
          id: p.id,
          from: { entryId: p.fromId, edge: 'end' },
          to: { entryId: successorId, edge: 'start' },
          flags: {},
          label: `${nameOf(p.fromId)} → ${nameOf(successorId)}`,
        })),
    ),
  );
}
```

```ts
// layout/connector-input.ts — imports model/ only
export interface ConnectorEnd { entryId: EntryId; edge: 'start' | 'end' }
export interface ConnectorInput {
  id: string;
  from: ConnectorEnd;
  to: ConnectorEnd;
  flags: ConnectorFlags;
  class?: string;
  label?: string;
}
export type ConnectorProvider = () => readonly ConnectorInput[];
```

- **Layers:** `layout/` gains `connector-input.ts` and the `connectors/` folder. Both import `model/` and the existing bar types. `LayoutInput.connectorProviders` mirrors `decorationProviders`. `view/plugin-registrations.ts` holds the list, as it does for decorations. `view/plugin-ports.ts` adds `view.registerConnector`. `api/` re-exports `ConnectorInput`.
- **No plugin types in `layout/`:** an input names Entries and edges. It carries no pixels and no `Dependency` type. The source closes over `ctx.dataset`, as a decoration provider does.
- **Culling:** `layout/` finds both end bars for any Entry, culled or not. It routes the connector. It then clips the path to the window. The plugin never sees the window.
- **Cost control:** the inputs depend on `datasetRevision` only. `layout/` memoizes them by that revision. It memoizes routed paths by revision, scale and row set. A scroll only filters paths against the window.
- **"Related to" plugin:**

```ts
ctx.view.registerConnector(() =>
  related().map((r) => ({
    id: `related:${r.id}`,
    from: { entryId: r.aId, edge: 'end' },
    to: { entryId: r.bId, edge: 'start' },
    flags: {},
    class: 'related',
  })),
);
```

- **Limit:** a plugin cannot draw its own path shape. Routing options live in `layout/`. Option 1 is the exit if the owner wants custom paths. The input can later accept an optional explicit path.

### Option 4 — The `data` half contributes connectors to the Dataset (rejected)

```ts
data(ctx) {
  ctx.connectors.provide(() => connectorsFrom(store));   // new member on DatasetPluginContext
}
```

- **Layers:** `data/` gains a connector registry. `model/` gains `ConnectorInput`. `layout/` reads `LayoutInput.connectors`.
- **No plugin types in `layout/`:** the same as option 3.
- **"Related to" plugin:** it needs a `data` half. A chrome-only plugin cannot contribute.
- **Cost:** `data/` learns a rendering concept. Core must keep the registry current on every Dataset, even with no Gantt bound.

### Why option 3

1. Plugins state *which Entries connect*. They do not state pixels. This removes `barsForEntry` and the culling duty from the public API.
2. One router serves every plugin. A second connector kind costs a few lines.
3. It uses the read door that exists. It adds no `ctx.store.read`.
4. A chrome-only plugin can add connectors. Option 4 forbids that.
5. The plan keeps S7.1 small and visible without any dependency code.

### Cross-cutting rules for option 3

- **Same id from two sources:** the first source in registration order owns the input. A later source with the same id adds its `true` flags and changes nothing else. `scheduling()` then emits `{ id, flags: { cycle: true } }` and never restates ends or labels. See decision 3.
- **Registration order:** `requires` sets setup order (ADR 0019). The order is the same for any `plugins` array order.
- **A hidden end:** if an Entry sits in a collapsed group, the connector attaches to its nearest visible ancestor. See decision 9.
- **A source that holds state outside the Dataset:** `layout/` does not see that state change. The plugin keeps its rows in a plugin store, or the host assigns the plugin list again. `timeShading()` documents the same limit.
- **Frame shape:** `FrameConnector` gains `label?: string` and `class?: string`. `computeFrame` fills `GeometryFrame.connectors`, which is `[]` today. `ConnectorFlags` keeps `inactive` and `cycle`.

## 4. S7 slices

The gate is `plans/00` §4. Each slice ends with a harness page.
A slice that fails its "not installed" row does not pass.

| Slice | Plugin | Depends on |
|---|---|---|
| S7.1 Connector seam | core | none |
| S7.2 Dependency store | `entryDependencies()` | S7.1 |
| S7.3 Connect gesture | core + `entryDependencies()` | S7.2 |
| S7.4 Connector select, delete, label | `entryDependencies()` | S7.2, S7.3 |
| S7.5 Working calendar | `scheduling/` (pure) + `timeShading()` | none |
| S7.6 Propagation engine | `scheduling/` (pure) | none |
| S7.7 Scheduling plugin | `scheduling()` | S7.2, S7.6 |
| S7.8 Calendar in propagation | `scheduling()` | S7.5, S7.7 |
| S7.9 Constraints | `scheduling()` | S7.7, S7.8 |
| S7.10 Float and critical path | `scheduling()` | S7.8 |
| S7.11 Close | all | S7.10 |

S7.5 and S7.6 can start at once. They do not touch connectors.

### S7.1 Connector seam (handoff B)

- Add `registerConnector`, `ConnectorInput`, `LayoutInput.connectorProviders` and the `layout/connectors/` folder.
- Route orthogonal paths from bar edges. Attach to the nearest visible ancestor for a hidden end.
- Find both end bars for any Entry. Clip each path to the window.
- Memoize inputs by `datasetRevision` and paths by revision, scale and row set.
- Render `GeometryFrame.connectors` as SVG with `data-connector-id` and `data-flag` tokens. Compute flag tokens in `computeFrame` (the hot-path note in `03`).
- Confirm that one Entry draws one Bar on a segmented row. Then drop `connectors.endpoints` (decision 10a).
- **Harness:** a "related to" page. A small harness plugin draws arrows from its own store. No dependency code exists. Scroll so one end leaves the window. The connector stays drawn.
- **Not installed:** no source, so `connectors` is `[]` and the SVG layer is empty.
- **Tests:** a unit test for routing and clipping. A property test: a connector whose ends are off-screen still appears when its path crosses the window.
- **Performance:** draw 5,000 connectors in one frame. Record the frame time. Add a spatial index only if the numbers demand it.

### S7.2 Dependency store (handoff C, first half)

- Add `entryDependencies()`. It reserves a store. Each row holds the predecessors of one Entry (decision 4).
- The plugin object publishes the host API (decision 5):

```ts
const dependencies = entryDependencies();
const dataset = new Dataset({ entries, plugins: [dependencies] });
dependencies.replaceAll([{ id: 'd1', fromId: 'a', toId: 'b', type: 'FS', lag: { value: -1, unit: 'day' } }]);
dependencies.add({ id: 'd2', fromId: 'b', toId: 'c', type: 'SS', lag: { value: 0, unit: 'day' } });
dependencies.remove('d2');
```

- Store `{ id, fromId, toId, type: 'FS' | 'SS' | 'FF' | 'SF', lag }`. Negative lag is legal.
- Install a removal extender. Removing an Entry removes the Dependencies where it is the predecessor, in the same changeset.
- Register a connector source that turns rows into connector inputs.
- **Harness:** a dependency fixture. A "Replace dependencies" button swaps the whole set. Scroll, zoom and collapsed groups survive the swap.
- **Not installed:** no store, no arrows, no ports.
- **Tests:** removal cascade with undo. Replace with an unknown Entry id throws and writes nothing. The plugin stays usable with no `scheduling()`.

### S7.3 Connect gesture (handoff C)

- Add a core `Connect` controller in `interaction/`. It exists only when a plugin registers a connect handler with `ctx.view.onConnect` (decision 6).
- Add `'connect'` to `GestureCapability`. One resolution gates the connector port and the gesture (I14).
- Add `beforeConnect` and `connect`. `beforeConnect` joins the async-veto names in `view/event-bus.ts`.
- The payload names two `{ entryId, edge }` ends. It never names `FS`, `SS`, `FF` or `SF` (decision 7).
- `entryDependencies()` registers the handler. It maps the edge pair to `FS`, `SS`, `FF` or `SF` and writes the row.
- No keyboard connect in core. A keyboard user adds a Dependency in the Entry edit form, through the `entryDependencies()` host API.
- **Harness:** drag from a connector port. A veto handler that waits 600 ms shows the async hold. A read-only Entry shows no port.
- **Not installed:** no handler, so no ports and no event.

### S7.4 Connector select, delete, label (handoff C)

- The plugin owns connector selection (decision 8). `render/` stamps `data-connector-id`. The plugin listens through `onDomEvent` and sets a `selected` flag.
- Keyboard: arrows move the connector selection. `Delete` removes the Dependency.
- Add `beforeDependencyRemove` and `dependencyRemove`. They are plugin events, not core events (decision 8a).
- A connector label comes from the Field the plugin option `labelField` names (default `name`). The plugin builds `from → to` text. It is the accessible name always. It is drawn only when `showLabels` is on (decision 11).
- **Harness:** select a connector by click and by key. Delete it. The label reads in the accessibility tree.
- **Tests:** an axe check on the harness page.

### S7.5 Working calendar (handoff D, input)

- Add `workingCalendar()` in the scheduling plugin's domain, not in `time/` (decision 12). Core and `time/` do not change.
- Input is data only: the weekday set and the holiday dates. There is no shipped holiday list.

```ts
const calendar = workingCalendar({ workdays: [1, 2, 3, 4, 5], holidays: ['2026-12-25', '2026-12-28'] });
timeShading([{ covers: calendar.offTime(), class: 'off' }]);
```

- `calendar.offTime()` returns a `TimeCover`-shaped object. `timeShading()` already accepts it.
- The calendar answers three questions: `isWorkday(day, time)`, `addWorkdays(instant, count, time)`, `workdaysBetween(a, b, time)`. All use the Dataset zone.
- The calendar is immutable. A new calendar is a new object.
- The calendar is optional everywhere (decision 12a). Core never needs one. `scheduling()` works with no calendar and then counts calendar days of 24 hours. A Gantt with no scheduling plugin has no calendar concept.
- `workingCalendar` goes out through `api/index.ts`, like `timeShading()`. The package keeps one entry point. A subpath export is a separate decision (decision 12b).
- **Why a `TimeCover` alone is not enough:** it answers `coveredSpans(window, time)`. Scheduling needs point queries and workday arithmetic. Adding 5,000 workdays by scanning windows costs too much. The shared object keeps one source of truth. `offTime()` and `addWorkdays` cannot disagree because both read the same two lists.
- **Why a `CoverPredicate` is not enough:** it answers "is this step covered". It has no addition. It also forces `every: 'day'`.
- **Harness:** the weekend page shades weekends and two holidays from one calendar object.
- **Not installed:** with no calendar, `timeShading()` shades what its own covers state. Nothing else changes.
- **Tests:** property test: `isWorkday` agrees with `offTime()` over random windows, zones and DST days.

### S7.6 Propagation engine (handoff D, pure core)

- Add `scheduling/schedule()`. It is pure, deterministic and uses a worklist loop. It never recurses.
- Apply lag per type. Report a cycle with its member Entry ids. Never move a pinned Entry; report instead.
- Add `SchedulingPolicy` and `defaultPolicy` (`01` §7). Dev-assert that a proposed field never changes (I4).
- Time is 24 hours a day in this slice. The calendar comes in S7.8.
- **Harness:** none can show it alone, so the gate is the golden fixtures: all four types, lag mixes, pinned conflicts, cycles, a 5,000-dependency chain. The slice adds a read-only "engine result" panel to the S7.2 harness page.
- **Tests:** coverage above 90%. `scheduling/` imports `time/` and `model/` only.

### S7.7 Scheduling plugin (handoff D)

- Add `scheduling()`. `requires: ['freegantt.entryDependencies']`. It never changes the reverse.
- Occupy the edit hook with `ctx.edits.setExtender`. Build `schedule()` input from `proposed` and the dependency rows. Merge the writes with `mergeEntryEdits`.
- Pins live in the plugin store, one row per Entry (decision 14).
- Raise `scheduleDiagnostics`. Register a connector source that flags cycle members.
- **Harness:** drag a predecessor and watch successor ghosts. Cancel discards them. A cycle fixture lists the members.
- **Not installed:** connectors draw, nothing moves.
- **Tests:** undo of a cascading edit restores every Entry (I7).

### S7.8 Calendar in propagation

- `scheduling({ calendar })` takes the same `WorkingCalendar` that `timeShading()` takes. Durations and lags count in workdays.
- Add `calendars` and `calendarField`. Both are optional. The consumer names a Field key. Its value names an entry in `calendars` (decision 13).
- **Harness:** drag over a holiday. The successor skips it. The shaded band and the skip match.
- **Not installed:** with no calendar, durations and lags count 24-hour days.

### S7.9 Constraints

- The plugin stores one constraint per Entry: start no earlier than, finish no later than, must start on.
- Constraints sit in the pin row (decision 14). The plugin object offers `setConstraint(entryId, constraint)`.
- Precedence: pinned over constraint over dependency (`01` §7 policy list).
- **Harness:** a constraint fixture. A violated constraint shows a diagnostic and moves nothing.

### S7.10 Float and critical path (phase 2)

- `scheduling()` declares `float` and `critical` as Fields (decision 15). Core paints nothing.
- The plugin object offers `drivingPath(entry)`. It returns the Entry ids in order.
- A consumer styles `critical` through an existing `EntryVariant` rule (ADR 0018).
- **Harness:** a page where a variant rule styles critical bars, and a button logs `drivingPath`.

### S7.11 Close

- Add the opt-in helper from #135 (decision 17).
- Drop the "API can change freely" framing in `CLAUDE.md` as the final step (`03`).
- Update `docs/06-plugin-authoring.md` and `CONTEXT.md` if the slices left them stale.

## 5. Owner decisions

Each row names options, the pick and whether an ADR is needed. The "Ruling" column holds the owner's answer. "As picked" means the owner accepted the pick with the new words.

| # | Decision | Options | Pick | ADR | Ruling |
|---|---|---|---|---|---|
| 1 | Connector seam shape | Options 1 to 4 in §3 | Option 3: plugin returns connector inputs, `layout/` routes | Yes. A new `layout/` input and plugin context member. | Option 3. ADR needed. |
| 1a | Names | — | `Connector`, `ConnectorInput`, `registerConnector`, `FrameConnector`, `GeometryFrame.connectors`, `ConnectorFlags`, ends as `{ entryId, edge }` | Covered by 1 | Ruled. "Link" and "LinkSpec" retire. |
| 2 | How a Gantt-side plugin reads a plugin store | (a) existing `ctx.dataset.pluginStore(id)`. (b) new `ctx.store.read(id)`. | (a). Retire the `ctx.store.read` text in #136 and `plans/01` §4. | Covered by 1 | As picked |
| 3 | Two sources name one connector id | (a) later source replaces the input. (b) first input stays, later `true` flags merge in. | (b). `scheduling()` emits flags only. | Covered by 1 | As picked |
| 4 | Dependency store shape | (a) one row per successor, a list of predecessors. (b) one row per predecessor. (c) core lets a plugin store key by a free string. | (a). Entry removal then cascades for free. The removal extender handles the predecessor side. (c) reverses #555. | No. Plan edit in `03` and `s5.10`. | As picked |
| 5 | How a host seeds and replaces Dependencies | (a) methods on the plugin object (`replaceAll`, `add`, `remove`). (b) a `Dataset` method. (c) constructor option only. | (a). It is the supported pattern (`api/plugin.ts`, #178) and ADR 0016. `replaceAll` writes like `entries.syncAll`: no undo step. `add` and `remove` are ordinary undoable writes. | No. It follows ADR 0035. | As picked |
| 6 | Who owns the connect gesture and ports | (a) core controller with a plugin handler, new `'connect'` capability. (b) fully in the plugin. | (a). No controller seam exists for plugins. Capabilities are core (I14). A "related to" plugin reuses the gesture. | Yes. Core gains a gesture noun. | Option A. ADR needed. |
| 7 | `beforeConnect` payload and home | (a) core `GanttEventMap`, payload names two ends. (b) payload carries `FS`, `SS`, `FF`, `SF`. | (a). Core must not know dependency types. The plugin maps edges to a type. | Covered by 6. Update `plans/02` §3. | Ruled with 6. |
| 8 | Connector selection and delete | (a) plugin-owned selection, `selected` flag, remove event. (b) core `Selection` holds connectors. | (a). The Selection holds Entries (ADR 0025). | No | As picked |
| 8a | Remove event | — | `beforeDependencyRemove` and `dependencyRemove`, plugin events. | No | Ruled. Delete removes the Dependency. |
| 9 | A connector end in a collapsed group or filtered row | (a) attach to the nearest visible ancestor. (b) hide the connector. (c) a config key. | (a), no key now. Add a key when a consumer asks. | No | As picked |
| 10 | The `connectors.endpoints` key in `03` | (a) keep. (b) drop. | (b), if an Entry draws one Bar (ADR 0026, 0027). | No | Drop it only after S7.1 confirms (10a). |
| 11 | Connector label | (a) plugin builds text from a `labelField`. Accessible name always. Drawn text opt-in. (b) always drawn. | (a). Core draws nothing by default. | No | As picked |
| 12 | Calendar shape | (a) one immutable `WorkingCalendar` in `time/`. (b) scheduling reads a `TimeCover` list. (c) `timeShading()` takes a predicate. (d) the scheduling plugin owns `workingCalendar()`. | The owner chose (d) over (a). See S7.5. | No. It fits ADR 0002. | Option B: the plugin owns the calendar. Core and `time/` do not change. |
| 12a | Calendar is optional | — | `calendar`, `calendars` and `calendarField` are optional. No calendar means 24-hour days. | No | Ruled. |
| 12b | Entry point | — | One entry point. Exports go through `api/index.ts`. | No | Ruled. No subpath export. |
| 13 | Per-entry calendar | (a) a consumer Field holds a calendar name, looked up in `calendars`. (b) the plugin stores a calendar per Entry. | (a). Plain data. The consumer owns the Field. | No | As picked |
| 14 | Pins and constraints storage | (a) one plugin store row per Entry: `{ pinned?, constraint? }`. (b) two stores. (c) Fields on the Entry. | (a). A row fits the one-Entry rule. ADR 0002 keeps pins off `Entry`. | No | As picked |
| 15 | Float and critical output | (a) Fields `float` and `critical`, styled by variant rules. (b) new core `BarFlags` keys. | (a). It adds no core change. `BAR_FLAG_KEYS` stays closed. | No | As picked |
| 16 | Lag unit | (a) a `Duration` value and unit. With a calendar, `day` counts workdays. (b) milliseconds. | (a). The handoff asks for workday counts. | No | As picked |
| 17 | The opt-in helper (#135) | (a) `firstPartyPlugins()`. (b) `allFirstPartyPlugins()`. (c) none. | Decide in S7.11. Lean (a). | No | As picked |
| 18 | Slice order | (a) the order in §4. (b) calendar and engine first, connectors later. | (a). The seam is generic and unblocks the most. S7.5 and S7.6 can run in parallel. | No | As picked |

## 6. Gaps in the S7 text of `plans/03-slices.md`

The rulings close these gaps. `plans/03-slices.md` § S7 now carries the fixes.

1. **One scope list.** The text still read as one plugin. Its acceptance had no "not installed" rows for either plugin.
2. **Stale seam line.** `layout/` said "design open at #136". §3 here answers it.
3. **Stale store claim.** A line said the `Dependency` store "needs no core change". #555 changed that. See decision 4.
4. **Stale endpoint rule.** "Links attach to the earliest item" and `links.endpoints` used pre-segment words. See decision 10a.
5. **No calendar, no constraints.** `01` §7 defers both to "later policies". The handoff wants them in S7.
6. **No connector select, delete or label.** The a11y line said "Link-create keyboard lands S7". The scope had no keyboard item and no remove event.
7. **No host API.** The text never said how a host seeds or replaces the `Dependency` store.
8. **Only one gesture event.** A removal or a host replace had none.
9. **No capability key.** Connector ports use the capability resolver, but `GestureCapability` had no `'connect'`.
10. **No connector perf row.** The acceptance measured a 5,000-dependency chain in `schedule()`. It never measured drawing 5,000 connectors.
11. **Bar flags have no plugin door.** "Bars flagged via `data-flag`" needs a way for a plugin to set `BarFlags.cycle`. I found none in `src/view/plugin-ports.ts`. S7.7 needs one, or it flags connectors only.
12. **The "API changes freely" step.** The text drops that framing in S7. S7 now spans eleven slices. Drop it in S7.11 only.

## 7. Not in this plan

- Handoff items A (row span decoration) and E (data swap keeps the view). Other workers own them. S7.2 only needs E to stay true.
- Export (the "After S7" seam).
- The ADR text. Two ADRs hold the seam and gesture rulings. Both are Proposed until the owner accepts them.
