# S7 — Dependencies and scheduling: link seam and slice plan

**Status:** proposal. The owner has not ruled on the decisions in §5.
**Closes when ruled:** #136 (link seam), the S7 re-split that `plans/03-slices.md` asks for, #135 (helper, last slice).
**Input:** the consumer handoff of 2026-11-02 (items B, C, D). The owner waived the S6 → S7 gate for this work.
**Rule for this plan:** every hook serves any consumer. No consumer concept enters the design.

## 1. What this plan finds

1. `dataset.pluginStore(id)` already ships on the public `Dataset` (`src/api/dataset.ts`). #136 rejected that door. ADR 0016 then added it for save and restore. A Gantt-side plugin can read any plugin store today.
2. The `Dependency` store cannot hold rows keyed by a link id. A plugin store row belongs to one Entry (#555, comment on #136). `store.set` throws for an id with no Entry. See decision 4.
3. #136 rejected a closure-shared handle. The reason was "one Dataset backs two Gantts". ADR 0019 changed the install model. The `data` half installs once on the Dataset. The `view` half runs once per Gantt. A closure now works inside one plugin. It still cannot serve a second plugin. `scheduling()` must read the dependency rows, so the cross-plugin door stays needed.
4. `GestureCapability` has no link key. `PluginContextParts` has no controller registration. The link-create gesture therefore needs a core controller. See decision 6.
5. `BarFlags.cycle` has a type. I found no plugin door that sets it. S7 needs one. See gap 11 in §6.

## 2. The open question

A Gantt-side plugin paints links. The rows that say which links exist live in a Dataset-side plugin store.

- `layout/` may import `time/` and `model/` only. It must never name a plugin type.
- The same seam must carry "related to" arrows from a plugin that has no dependencies.
- `scheduling()` must add the `cycle` flag to links that `entryDependencies()` owns.
- A link may cross the window edge. One end may sit in a culled row or a collapsed group.

## 3. Seam options

All four options register on the `view` half. They differ in what the plugin returns and in how it reads the rows.

### Option 1 — The plugin returns finished paths (the #136 text, existing read door)

```ts
view(ctx) {
  ctx.view.registerLinkEmitter(({ barsForEntry }) =>
    routeAll(ctx.dataset.pluginStore<DependencyRow>('freegantt.entryDependencies')?.all, barsForEntry),
  );
}
```

- **Layers:** `layout/link-emitter.ts` imports `model/` only. The plugin routes paths itself. `barsForEntry` becomes public plugin API.
- **No plugin types in `layout/`:** the emitter returns `FrameLink`. `FrameLink.id` stays a plain string.
- **"Related to" plugin:** it registers an emitter and writes its own routing code.
- **Cost:** every plugin re-implements orthogonal routing. Every plugin must handle culled endpoints.

### Option 2 — Same as option 1, with a new `ctx.store.read` door

```ts
ctx.view.registerLinkEmitter(({ barsForEntry }) =>
  routeAll(ctx.store.read<DependencyRow>('freegantt.entryDependencies')?.all, barsForEntry),
);
```

- **Layers:** the same as option 1, plus a new member on `PluginContext`.
- **"Related to" plugin:** the same as option 1.
- **Cost:** two doors for one read. `ctx.dataset.pluginStore(id)` and `ctx.store.read(id)` answer the same question. This breaks "one domain per word". #136 chose this option before `pluginStore` shipped.

### Option 3 — The plugin returns link specs, `layout/` routes them (recommended)

```ts
view(ctx) {
  ctx.view.registerLinkSource(() =>
    [...(ctx.dataset.pluginStore<DependencyRow>('freegantt.entryDependencies')?.all ?? [])].flatMap(
      ([successorId, row]) =>
        row.predecessors.map((p) => ({
          id: p.id,
          from: p.fromId, fromEdge: 'end',
          to: successorId, toEdge: 'start',
          flags: {},
          label: `${nameOf(p.fromId)} → ${nameOf(successorId)}`,
        })),
    ),
  );
}
```

```ts
// layout/link-source.ts — imports model/ only
export interface LinkSpec {
  id: string;
  from: EntryId; fromEdge: 'start' | 'end';
  to: EntryId;   toEdge: 'start' | 'end';
  flags: LinkFlags;
  class?: string;
  label?: string;
}
export type LinkSource = () => readonly LinkSpec[];
```

- **Layers:** `layout/` gains `link-source.ts` and `links/route.ts`. Both import `model/` and the existing bar types. `LayoutInput.linkSources` mirrors `decorationProviders`. `view/plugin-registrations.ts` holds the list, as it does for decorations. `view/plugin-ports.ts` adds `view.registerLinkSource`. `api/` re-exports `LinkSpec`.
- **No plugin types in `layout/`:** a spec names Entries and edges. It carries no pixels and no `Dependency` type. The source closes over `ctx.dataset`, as a decoration provider does.
- **Culling:** `layout/` finds both end bars for any Entry, culled or not. It routes the link. It then clips the path to the window. The plugin never sees the window.
- **Cost control:** the specs depend on `datasetRevision` only. `layout/` memoizes them by that revision. It memoizes routed paths by revision, scale and row set. A scroll only filters paths against the window.
- **"Related to" plugin:**

```ts
ctx.view.registerLinkSource(() =>
  related().map((r) => ({ id: `related:${r.id}`, from: r.aId, fromEdge: 'end', to: r.bId, toEdge: 'start', flags: {}, class: 'related' })),
);
```

- **Limit:** a plugin cannot draw its own path shape. Routing options live in `layout/`. Option 1 is the exit if the owner wants custom paths. The spec can later accept an optional explicit path.

### Option 4 — The `data` half contributes links to the Dataset

```ts
data(ctx) {
  ctx.links.provide(() => linksFrom(store));   // new member on DatasetPluginContext
}
```

- **Layers:** `data/` gains a link registry. `model/` gains `LinkSpec`. `layout/` reads `LayoutInput.links`.
- **No plugin types in `layout/`:** the same as option 3.
- **"Related to" plugin:** it needs a `data` half. A chrome-only plugin cannot contribute.
- **Cost:** `data/` learns a rendering concept. Core must keep the registry current on every Dataset, even with no Gantt bound.

### Recommendation: option 3

1. Plugins state *which Entries connect*. They do not state pixels. This removes `barsForEntry` and the culling duty from the public API.
2. One router serves every plugin. A second link kind costs a few lines.
3. It uses the read door that exists. It adds no `ctx.store.read`.
4. A chrome-only plugin can add links. Option 4 forbids that.
5. The plan keeps S7.1 small and visible without any dependency code.

### Cross-cutting rules for option 3

- **Same id from two sources:** the first source in registration order owns the spec. A later source with the same id adds its `true` flags and changes nothing else. `scheduling()` then emits `{ id, flags: { cycle: true } }` and never restates anchors or labels. See decision 3.
- **Registration order:** `requires` sets setup order (ADR 0019, D-S5-31). The order is the same for any `plugins` array order.
- **A hidden end:** if an Entry sits in a collapsed group, the link attaches to its nearest visible ancestor. See decision 9.
- **A source that holds state outside the Dataset:** `layout/` does not see that state change. The plugin keeps its rows in a plugin store, or the host assigns the plugin list again. `timeShading()` documents the same limit.
- **Frame shape:** `FrameLink` gains `label?: string` and `class?: string`. `computeFrame` fills `GeometryFrame.links`, which is `[]` today. `LinkFlags` keeps `inactive` and `cycle`.

## 4. S7 slices

The gate is `plans/00` §4. Each slice ends with a harness page.
A slice that fails its "not installed" row does not pass.

| Slice | Plugin | Depends on |
|---|---|---|
| S7.1 Link seam | core | none |
| S7.2 Dependency store | `entryDependencies()` | S7.1 |
| S7.3 Link-create gesture | core + `entryDependencies()` | S7.2 |
| S7.4 Link select, delete, label | `entryDependencies()` | S7.2, S7.3 |
| S7.5 Work calendar | core (`time/`) + `timeShading()` | none |
| S7.6 Propagation engine | `scheduling/` (pure) | none |
| S7.7 Scheduling plugin | `scheduling()` | S7.2, S7.6 |
| S7.8 Calendar in propagation | `scheduling()` | S7.5, S7.7 |
| S7.9 Constraints | `scheduling()` | S7.7, S7.8 |
| S7.10 Float and critical path | `scheduling()` | S7.8 |
| S7.11 Close | all | S7.10 |

S7.5 and S7.6 can start at once. They do not touch links.

### S7.1 Link seam (handoff B)

- Add `registerLinkSource`, `LinkSpec`, `LayoutInput.linkSources` and `layout/links/route.ts`.
- Route orthogonal paths from bar edges. Attach to the nearest visible ancestor for a hidden end.
- Find both end bars for any Entry. Clip each path to the window.
- Memoize specs by `datasetRevision` and paths by revision, scale and row set.
- Render `GeometryFrame.links` as SVG with `data-link-id` and `data-flag` tokens. Compute flag tokens in `computeFrame` (the hot-path note in `03`).
- **Harness:** a "related to" page. A small harness plugin draws arrows from its own store. No dependency code exists. Scroll so one end leaves the window. The link stays drawn.
- **Not installed:** no source, so `links` is `[]` and the SVG layer is empty.
- **Tests:** a unit test for routing and clipping. A property test: a link whose ends are off-screen still appears when its path crosses the window. A 5,000-link frame budget is measured here.

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
- Install a removal extender. Removing an Entry removes the links where it is the predecessor, in the same changeset.
- Register a link source that turns rows into specs.
- **Harness:** a link fixture. A "Replace links" button swaps the whole set. Scroll, zoom and collapsed groups survive the swap.
- **Not installed:** no store, no arrows, no ports.
- **Tests:** removal cascade with undo. Replace with an unknown Entry id throws and writes nothing. The plugin stays usable with no `scheduling()`.

### S7.3 Link-create gesture (handoff C)

- Add a core `LinkCreate` controller in `interaction/`. It exists only when a plugin registers a link-create handler (decision 6).
- Add `'link'` to `GestureCapability`. One resolution gates the port affordance and the gesture (I14).
- Add `beforeLinkCreate` and `linkCreate`. `beforeLinkCreate` joins the async-veto names in `view/event-bus.ts`. The payload names two Entries and two edges (decision 7).
- `entryDependencies()` registers the handler. It maps edge pairs to `FS`, `SS`, `FF` or `SF` and writes the row.
- Add keyboard link-create: pick a source, move to a target, confirm.
- **Harness:** drag from a port. A veto handler that waits 600 ms shows the async hold. A read-only Entry shows no port.
- **Not installed:** no handler, so no ports and no event.

### S7.4 Link select, delete, label (handoff C)

- The plugin owns link selection (decision 8). `render/` stamps `data-link-id`. The plugin listens through `onDomEvent` and sets a `selected` flag.
- Keyboard: arrows move the link selection, `Delete` removes the link. Add `beforeLinkRemove` and `linkRemove`.
- A link label comes from the Field the plugin option `labelField` names (default `name`). The plugin builds `from → to` text. It is the accessible name always. It is drawn only when `showLabels` is on (decision 11).
- **Harness:** select a link by click and by key. Delete it. The link label reads in the accessibility tree.
- **Tests:** an axe check on the harness page.

### S7.5 Work calendar (handoff D, input)

- Add `WorkCalendar` in `time/` (decision 12). Input is data only: the weekday set and the holiday dates. There is no shipped holiday list.

```ts
const calendar = workCalendar({ workdays: [1, 2, 3, 4, 5], holidays: ['2026-12-25', '2026-12-28'] });
timeShading([{ covers: offTime(calendar), class: 'off' }]);
```

- `offTime(calendar)` returns a `TimeCover`. It lives in `extensions/features/time-shading-covers.ts` beside `notCovered`.
- The calendar answers three questions: `isWorkday(day, time)`, `addWorkdays(instant, count, time)`, `workdaysBetween(a, b, time)`. All use the Dataset zone.
- The calendar is immutable. A new calendar is a new object.
- **Why a `TimeCover` alone is not enough:** it answers `coveredSpans(window, time)`. Scheduling needs point queries and workday arithmetic. Adding 5,000 workdays by scanning windows costs too much. The shared object keeps one source of truth. `offTime` and `addWorkdays` cannot disagree because both read the same two lists.
- **Why a `CoverPredicate` is not enough:** it answers "is this step covered". It has no addition. It also forces `every: 'day'`.
- **Harness:** the weekend page shades weekends and two holidays from one calendar object.
- **Tests:** property test: `isWorkday` agrees with `offTime` over random windows, zones and DST days.

### S7.6 Propagation engine (handoff D, pure core)

- Add `scheduling/schedule()`. It is pure, deterministic and uses a worklist loop. It never recurses.
- Apply lag per type. Report a cycle with its member Entry ids. Never move a pinned Entry; report instead.
- Add `SchedulingPolicy` and `defaultPolicy` (`01` §7). Dev-assert that a proposed field never changes (I4).
- Time is 24 hours a day in this slice. The calendar comes in S7.8.
- **Harness:** none can show it alone, so the gate is the golden fixtures: all four types, lag mixes, pinned conflicts, cycles, a 5,000-link chain. The slice adds a read-only "engine result" panel to the S7.2 harness page.
- **Tests:** coverage above 90%. `scheduling/` imports `time/` and `model/` only.

### S7.7 Scheduling plugin (handoff D)

- Add `scheduling()`. `requires: ['freegantt.entryDependencies']`. It never changes the reverse.
- Occupy the edit hook with `ctx.edits.setExtender`. Build `schedule()` input from `proposed` and the dependency rows. Merge the writes with `mergeEntryEdits`.
- Pins live in the plugin store, one row per Entry (decision 14).
- Raise `scheduleDiagnostics`. Register a link source that flags cycle members.
- **Harness:** drag a predecessor and watch successor ghosts. Cancel discards them. A cycle fixture lists the members.
- **Not installed:** links draw, nothing moves.
- **Tests:** undo of a cascading edit restores every Entry (I7).

### S7.8 Calendar in propagation

- `scheduling({ calendar })` takes the same `WorkCalendar` that `timeShading()` takes. Durations and lags count in workdays.
- Add `calendars` and `calendarField`. The consumer names a Field key. Its value names an entry in `calendars` (decision 13).
- **Harness:** drag over a holiday. The successor skips it. The shaded band and the skip match.

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
- Measure 5,000 links drawn (the S6 spike left this to S7). Add a spatial index only if the numbers demand it.
- Drop the "API can change freely" framing in `CLAUDE.md` as the final step (`03`).
- Update `plans/01` §4 (stale link text), `docs/06-plugin-authoring.md`, `CONTEXT.md` (Link, Link source, Work calendar).

## 5. Owner decisions

Each row names options, my pick and whether an ADR is needed. I write no ADR.

| # | Decision | Options | Pick | ADR |
|---|---|---|---|---|
| 1 | Link seam shape | Options 1 to 4 in §3 | Option 3: plugin returns specs, `layout/` routes | Yes. A new `layout/` input and plugin context member. |
| 2 | How a Gantt-side plugin reads a plugin store | (a) existing `ctx.dataset.pluginStore(id)`. (b) new `ctx.store.read(id)`. | (a). Retire the `ctx.store.read` text in #136 and `plans/01` §4. | Covered by 1 |
| 3 | Two sources name one link id | (a) later source replaces the spec. (b) first spec stays, later `true` flags merge in. | (b). `scheduling()` emits flags only. | Covered by 1 |
| 4 | Dependency store shape | (a) one row per successor, a list of predecessors. (b) one row per predecessor. (c) core lets a plugin store key by a free string. | (a). Entry removal then cascades for free. The removal extender handles the predecessor side. (c) reverses #555. | No. Plan edit in `03` and `s5.10`. |
| 5 | How a host seeds and replaces links | (a) methods on the plugin object (`replaceAll`, `add`, `remove`). (b) a `Dataset` method. (c) constructor option only. | (a). It is the supported pattern (`api/plugin.ts`, #178) and ADR 0016. `replaceAll` writes like `entries.syncAll`: no undo step. `add` and `remove` are ordinary undoable writes. | No. It follows ADR 0035. |
| 6 | Who owns the link-create gesture and ports | (a) core controller with a plugin handler, new `'link'` capability. (b) fully in the plugin. | (a). No controller seam exists for plugins. Capabilities are core (I14). A "related to" plugin reuses the gesture. | Yes. Core gains a gesture noun. |
| 7 | `beforeLinkCreate` payload and home | (a) core `GanttEventMap`, payload names two Entries and two edges. (b) payload carries `FS`, `SS`, `FF`, `SF`. | (a). Core must not know dependency types. The plugin maps edges to a type. | No. Update `plans/02` §3. |
| 8 | Link selection and delete | (a) plugin-owned selection, `selected` flag, `beforeLinkRemove` event. (b) core `Selection` holds links. | (a). The Selection holds Entries (ADR 0025). | No |
| 9 | A link end in a collapsed group or filtered row | (a) attach to the nearest visible ancestor. (b) hide the link. (c) a config key. | (a), no key now. Add a key when a consumer asks. | No |
| 10 | The `links.endpoints` key in `03` | (a) keep. (b) drop. | (b), if an Entry draws one Bar (ADR 0026, 0027). I did not check bar production for a segmented Entry. Owner or S7.1 confirms. | No |
| 11 | Link label | (a) plugin builds text from a `labelField`. Accessible name always. Drawn text opt-in. (b) always drawn. | (a). Core draws nothing by default. | No |
| 12 | Calendar shape | (a) one immutable `WorkCalendar` in `time/`, with `offTime()` for shading and workday math for scheduling. (b) scheduling reads a `TimeCover` list. (c) `timeShading()` takes a predicate. | (a). See S7.5 for why (b) and (c) fail. | Yes. A new public time type shared by two plugins. |
| 13 | Per-entry calendar | (a) a consumer Field holds a calendar name, looked up in `calendars`. (b) the plugin stores a calendar per Entry. | (a). Plain data. The consumer owns the Field. | No |
| 14 | Pins and constraints storage | (a) one plugin store row per Entry: `{ pinned?, constraint? }`. (b) two stores. (c) Fields on the Entry. | (a). A row fits the one-Entry rule. ADR 0002 keeps pins off `Entry`. | No |
| 15 | Float and critical output | (a) Fields `float` and `critical`, styled by variant rules. (b) new core `BarFlags` keys. | (a). It adds no core change. `BAR_FLAG_KEYS` stays closed. | No |
| 16 | Lag unit | (a) a `Duration` value and unit. With a calendar, `day` counts workdays. (b) milliseconds. | (a). The handoff asks for workday counts. | No |
| 17 | The opt-in helper (#135) | (a) `firstPartyPlugins()`. (b) `allFirstPartyPlugins()`. (c) none. | Decide in S7.11. Lean (a). It returns the same factories the caller could type by hand. | No |
| 18 | Slice order | (a) the order in §4. (b) calendar and engine first, links later. | (a). The seam is generic and unblocks the most. S7.5 and S7.6 can run in parallel. | No |

## 6. Gaps in the S7 text of `plans/03-slices.md`

The coordinator edits `03` after the owner rules. I did not touch it.

1. **One scope list.** The text says it still reads as one plugin. Its acceptance has no "not installed" rows for either plugin.
2. **Stale seam line.** `layout/` says "design open at #136". §3 here answers it.
3. **Stale store claim.** Line 78 says the `Dependency` store "needs no core change". #555 changed that. See decision 4.
4. **Stale endpoint rule.** "Links attach to the earliest item" and `links.endpoints` use pre-segment words. See decision 10.
5. **No calendar, no constraints.** `01` §7 defers both to "later policies". The handoff wants them in S7.
6. **No link select, delete or label.** The a11y line says "Link-create keyboard lands S7". The scope has no keyboard item and no `beforeLinkRemove`.
7. **No host API.** The text never says how a host seeds or replaces the `Dependency` store.
8. **Only one link event.** `beforeLinkCreate` and `linkCreate` exist. A removal or a host replace has none.
9. **No capability key.** Link ports use the capability resolver, but `GestureCapability` has no `'link'`.
10. **No link perf row.** The acceptance measures a 5,000-link chain in `schedule()`. It never measures drawing 5,000 links. The S6 spike left that to S7.
11. **Bar flags have no plugin door.** "Bars flagged via `data-flag`" needs a way for a plugin to set `BarFlags.cycle`. I found none in `src/view/plugin-ports.ts`. S7.7 needs one, or it flags links only.
12. **The "API changes freely" step.** The text drops that framing in S7. Now S7 spans eleven slices. Drop it in S7.11 only.

## 7. Not in this plan

- Handoff items A (row span decoration) and E (data swap keeps the view). Other workers own them. S7.2 only needs E to stay true.
- Export (the "After S7" seam).
- Any ADR text. Decisions 1, 6 and 12 need one after the owner rules.
