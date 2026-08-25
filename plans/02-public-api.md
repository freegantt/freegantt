# FreeGantt — Public API Design

The API is a product surface, designed once and defended. Everything here is what a consumer sees; everything else in the codebase is internal and free to change.

**Public entry points:** `Dataset`, `Gantt`, the event vocabulary, the plugin contract, the JSON schema, and the model types. Nothing else.

---

## 1. Principles

1. **One config object, everything live.** No builder-vs-mount split, no "must be set before mount" options. If an option can't change at runtime, it's a constructor argument or it doesn't exist.
2. **Data and view are separate objects.** A `Dataset` (headless, Node-safe) holds data and scheduling; a `Gantt` binds a dataset to a DOM host. Many views of one dataset is the normal case, not a trick.
3. **Every mutating interaction has a cancelable `before*` event.** Hosts can veto a drop, substitute their own editor, validate a link — before commit, not after.
4. **Honest surface.** Nothing in the published types throws "not implemented" (invariant I11). Declared events fire; declared methods work.
5. **Predictable naming.** One vocabulary, one bus, greppable pairs (`beforeEntryMove` / `entryMove`). No synonyms, no two names for one concept.
6. **Typed extensibility.** `meta` generics flow end-to-end: `new Dataset<{ team: string }>` makes `entry.meta.team` typed in renderers, events, and queries.

---

## 2. Shape

```ts
import { Dataset, Gantt } from 'freegantt';

// ── Data: headless, works in Node ───────────────────────────────
const dataset = new Dataset<{ team: string }>({
  timeZone: 'America/Chicago',            // explicit; 'local' is opt-in
  dateOnlyEnd: 'inclusive',               // default; see §2.1
  hierarchy: { autoGroup: true },         // first child promotes parent to kind 'group'; promote only
  entries: [
    { id: 'p1', name: 'Sitework', kind: 'group' },     // span derives from children (default policy)
    { id: 't1', parentId: 'p1', name: 'Groundwork', start: '2026-09-01', end: '2026-09-11' },
    { id: 't2', parentId: 'p1', name: 'Framing',    start: '2026-09-12', end: '2026-09-30',
      meta: { team: 'A' } },
  ],
  dependencies: [
    { id: 'd1', fromId: 't1', toId: 't2', type: 'FS', lag: { value: 0, unit: 'd' } },
  ],
});

// ── View: binds dataset to DOM ──────────────────────────────────
const gantt = new Gantt({
  host: '#gantt',                         // element or selector
  dataset,

  rows: { source: 'entries', tree: true },
  preset: 'weekAndMonth',                 // or a full ViewPreset object
  range: 'fitDataset',                    // or a TimeSpan

  columns: [
    { type: 'name', flex: 1, editable: true },
    { type: 'start' },
    { type: 'duration' },
    { id: 'team', header: 'Team', value: t => t.meta.team },
  ],

  interactions: {
    move: true,
    resize: t => t.kind !== 'group',      // boolean or per-entry predicate — see §4.1
    linkCreate: true,
  },

  features: {
    links: { allowCreate: true },
    tooltips: true,
    contextMenu: { items: ({ entry, defaults }) => [...defaults, myItem(entry)] },
  },
});
```

### Programmatic mutation — always transactional

```ts
dataset.transaction(() => {
  dataset.entries.update('t2', { name: 'Framing — north wing' });
  dataset.dependencies.add({ id: 'd2', fromId: 't2', toId: 't3', type: 'FS', lag: days(2) });
});
// one scheduling pass, one changeset, one undo step, one render

dataset.undo();  dataset.redo();
dataset.canUndo; dataset.canRedo;
```

Single mutations outside an explicit transaction are auto-wrapped in one — convenience without a second code path.

`autoGroup` is data behavior, so it lives on `Dataset` (not `Gantt`): the promotion runs inside the same transaction as the edit that caused it — one changeset, one undo step. It only promotes; turning a group back into an entry is always an explicit edit (`01` §2.5).

### Reconfiguration is just assignment

```ts
gantt.preset = 'dayAndWeek';
gantt.rows = { source: 'group', groupBy: t => t.meta.team };
gantt.columns = [...gantt.columns, extraColumn];
gantt.gridWidth = 220;                  // S1.8 — same cancelable commit sequence a splitter drag runs
```

Every config key is a live property. Setting one triggers exactly the invalidation it needs (a preset change rebuilds the axis; a row-source change re-resolves rows) — never a full remount.


### 2.1 What a host writes, and what the library stores

Ids and dates are loose on the way in and strict everywhere behind the boundary. `Dataset` reads an `EntryInput` into an `Entry` once, at construction: ids are plain strings that gain the `EntryId` brand here, and dates are any `InstantInput` — an ISO string, a `Date`, epoch milliseconds, or an already-branded `Instant`. A host never has to call `entryId()` or `instant()`. An `Entry` is itself a valid `EntryInput`, so a host holding branded values passes them through unchanged.

A string with an explicit `Z` or numeric offset is absolute. Every other string is a Plain time and resolves through the dataset's `timeZone`, so one entry list renders identically for every viewer. A value naming no instant — including a date the calendar does not have, such as `'2026-02-31'` — throws `InvalidInstantError`; it never slides to a nearby date.

`dateOnlyEnd` names how a *date-only* `end` is read against half-open `[start, end)` storage. `'inclusive'` (the default) reads `end: '2026-09-08'` as "through the 8th" and stores the start of the 9th; `'exclusive'` reads it literally. It applies to nothing else: an `end` carrying a time of day, a `Date`, epoch milliseconds, or an `Instant` is a boundary already, and `start` is never adjusted.

The reading itself lives in `time/` (`toInstant`, `toEndInstant`) — resolving a Plain time needs the zone and the DST fold/gap policy, and advancing a date-only end by one day is zone-aware arithmetic, which I10 confines to that layer. `api/` maps fields and does no date math of its own.

---

## 3. Events — one bus, one vocabulary

| Cancelable (pre-commit) | Notification (post-commit) |
|---|---|
| `beforeEntryMove` | `entryMove` |
| `beforeEntryResize` | `entryResize` |
| `beforeEntryEdit` | `entryEdit` |
| `beforeLinkCreate` | `linkCreate` |
| `beforeSelectionChange` | `selectionChange` |
| `beforeGridWidthChange` | `gridWidthChange` |
| — | `change` (every committed `ChangeSet`) |
| — | `scheduleDiagnostics` (engine findings) |

`beforeGridWidthChange`/`gridWidthChange` (S1.8) carry `{ from, to }` in px. Fired by both a Splitter drag's commit and a direct `gantt.gridWidth = px` assignment — one commit sequence, one place it lives (`GanttShell`). A veto restores the width the drag started from, so a rejected drag leaves nothing behind.

```ts
gantt.on('beforeEntryMove', ({ entry, start, end }) => {
  if (start < mobilization) { toast('Too early'); return false; }   // veto
});

gantt.on('beforeEntryEdit', async ({ entry }) => {
  await myDialog.open(entry);   // bring-your-own editor
  return false;                // suppress built-in
});

dataset.on('change', ({ changeSet }) => save(changeSet));           // persistence hook (D7)
```

Rules:

- Cancelable handlers may return `false` or `Promise<false>`; an async veto suspends the gesture with a visible pending state — it never commits optimistically.
- Pointer/gesture events fire on the `Gantt` (view concern); data events fire on the `Dataset` (data concern). Every event name exists exactly once.
- Payloads are typed, stable, and carry entities plus context — no "re-read everything" events.

---

## 4. Customization ladder

Documented in this order; each level solves what the previous can't, and consumers stop at the shallowest level that works.

| Level | Mechanism | Example |
|---|---|---|
| 1 | **CSS custom properties** | `--fg-bar-radius: 3px; --fg-row-height: 32px;` |
| 2 | **State classes / parts** | `.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--warn) }` |
| 3 | **Renderer callbacks** | `barRenderer`, `cellRenderer`, `headerRenderer`, `tooltipRenderer` — return plain element-description objects |
| 4 | **Events + feature config** | veto a drop, custom context-menu items, replace the editor |
| 5 | **Plugins** | full `GanttPlugin` (see `01` §10): decorations, columns, controllers, commands |

Every level-1 property the library reads as a length goes through one reader (`render/dom/pixel-property.ts`): computed value → px → validated → library default. What counts as authored is stated per property rather than re-implemented per call site — `--fg-row-height` rejects zero (a zero-height row is not a row), `--fg-grid-pane-width` keeps it (a host turning the grid pane off authored that). Re-read cadence stays the caller's and is stated at each call site: the grid pane's width is read once at construction (renamed from `--fg-row-label-width`, S1.8 — the gutter is a pane width now, not a backend reservation), row height again on every pane measurement, neither per render. Two more tokens joined at S1.8: `--fg-splitter-width` (fallback `4`) and `--fg-header-height` (fallback `20`) — the grid pane's own header spacer needs the same height the timeline pane's header band uses, or every label sits one header-height above its bar.

Renderers return **plain serializable element descriptions** (tag/class/style/text/children), applied by the engine's reconciler — never live DOM nodes (nodes are recycled by virtualization) and never framework components in core (D5). Text by default; HTML by explicit opt-in only.

```ts
barRenderer: ({ entry, item }) => ({
  class: { 'my-bar': true, 'my-bar--late': isLate(entry) },
  children: [
    { tag: 'span', class: 'my-bar__label', text: entry.name },
    { tag: 'span', class: 'my-bar__team',  text: entry.meta.team },
  ],
})
```

### 4.1 Per-entry looks and actions

Both questions — *how does this entry look?* and *what can you do to it?* — resolve **per entry**, not per Gantt, and every mechanism sees the whole entry (`kind`, fields, typed `meta`):

**Look.** Every bar element carries `data-kind`, so per-kind styling is level-2 CSS with zero JS (`.fg-bar[data-kind="milestone"] { ... }`). At level 3, `barRenderer` is either one function that branches, or a per-kind map so the common case needs no branching — host-defined kinds slot in by name:

```ts
barRenderer: {
  milestone: ({ entry }) => diamond(entry),
  group:     ({ entry }) => bracket(entry),
  buffer:    ({ entry }) => hatched(entry),   // host-defined kind
  '*':       ({ entry }) => defaultBar(entry),
}
```

**Actions.** The `interactions` config takes a boolean or a per-entry predicate for each gesture (`move`, `resize`, `linkCreate`, `select`, `edit`), layered over per-kind defaults. One resolution both hides the affordance and refuses the gesture — pointer and keyboard alike (I14) — so a non-resizable entry simply has no handles rather than handles that scold. Context-menu items and commands carry a `when(entry)` clause, so a kind (or any predicate) ships its own action set.

**Division of labor:** capabilities answer the *static* question ("groups don't resize"); `before*` events answer the *contextual* one ("not before mobilization"). Use the shallowest one that fits.

---

## 5. Shared axes and scroll (multi-Gantt, D9)

```ts
import { TimeScaleModel, ScrollModel } from 'freegantt';

const scale  = new TimeScaleModel({ preset: 'weekAndMonth' });
const scroll = new ScrollModel();

const mainGantt   = new Gantt({ host: '#top',    dataset, scale, scroll });
const linkedGantt = new Gantt({ host: '#bottom', dataset, scale, scroll });
```

Omit `scale`/`scroll` and the Gantt creates private ones — single-Gantt users never meet the concept. Passing shared instances is the *entire* sync API: no link manager, no event plumbing. Sharing a `scroll` instance links both axes (S1.5, D-S1.5-3) — a shorter chart's own row count clamps the shared position locally, so it pins at its last row while a taller chart keeps going, with zero remembered state. `TimeScaleModel` is a class with no `Source` interface; `ScrollModel` gets no `xOnly()`/`yOnly()` either — partial sharing returns when a caller actually needs "share x, keep y private".

---

## 6. Serialization contract (D7)

```ts
const doc = dataset.toJSON();     // { schema: 1, timeZone, entries, dependencies, ... }
const p2  = Dataset.fromJSON(doc);
```

- The JSON shape is **public API**: documented, versioned by an integer `schema` field, semver-governed. `fromJSON` migrates older schemas forward; it never silently drops fields.
- Instants serialize as ISO-8601 strings (readable, diffable, zone-explicit); brands exist only in TS types and never leak into JSON.
- `meta` round-trips opaquely.
- **Changesets are the incremental counterpart**: `dataset.on('change')` + `dataset.apply(changeSet)` are inverse-ish operations designed so a future sync adapter (or collaborative layer) is an extension, not a core change. `apply` validates and reports rejections rather than throwing mid-way.

---

## 7. Developer experience commitments

- **Dev-mode invariant warnings**: dependency cycle detected (with member ids), unknown preset id, config set on destroyed instance, non-deterministic item identity, renderer returned a live node.
- **Stable test hooks**: `data-testid` on every part so consumers can write E2E tests against the Gantt without brittle selectors.
- **Errors are typed and actionable**: `FreeGanttError` subclasses with codes, never bare strings; validation failures name the entity and field. `HostNotFoundError` (`code: 'host-not-found'`, S1.8) is the first of these a consumer can actually catch — thrown when a string `host` selector matches nothing.
- **Docs site with live, editable examples** grows with the slices (the harness pages are its seed) — budgeted as a deliverable, not an afterthought.
- **Semver honesty**: internal modules are not importable (enforced by the `exports` map), so semver only governs surfaces we actually promise.

## 8. Framework wrappers (later, out of scope for the slices)

The core stays framework-free (D5). Wrappers, when demanded, are thin adapters: props → config assignment, callbacks → event subscriptions, children/slots → renderer callbacks. Nothing in the core may require a wrapper to function, and no wrapper gets private API access — if a wrapper needs a back-door, the public API is missing something; fix the API.
