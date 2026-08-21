# FreeGantt — Public API Design

The API is a product surface, designed once and defended. Everything here is what a consumer sees; everything else in the codebase is internal and free to change.

**Public entry points:** `Project`, `Gantt`, the event vocabulary, the plugin contract, the JSON schema, and the model types. Nothing else.

---

## 1. Principles

1. **One config object, everything live.** No builder-vs-mount split, no "must be set before mount" options. If an option can't change at runtime, it's a constructor argument or it doesn't exist.
2. **Data and view are separate objects.** A `Project` (headless, Node-safe) holds data and scheduling; a `Gantt` binds a project to a DOM host. Many views of one project is the normal case, not a trick.
3. **Every mutating interaction has a cancelable `before*` event.** Hosts can veto a drop, substitute their own editor, validate a link — before commit, not after.
4. **Honest surface.** Nothing in the published types throws "not implemented" (invariant I11). Declared events fire; declared methods work.
5. **Predictable naming.** One vocabulary, one bus, greppable pairs (`beforeTaskMove` / `taskMove`). No synonyms, no two names for one concept.
6. **Typed extensibility.** `meta` generics flow end-to-end: `new Project<{ team: string }>` makes `task.meta.team` typed in renderers, events, and queries.

---

## 2. Shape

```ts
import { Project, Gantt } from 'freegantt';

// ── Data: headless, works in Node ───────────────────────────────
const project = new Project<{ team: string }>({
  timeZone: 'America/Chicago',            // explicit; 'local' is opt-in
  tasks: [
    { id: 'p1', name: 'Sitework', kind: 'group' },     // span derives from children (default policy)
    { id: 't1', parentId: 'p1', name: 'Groundwork', start: instant('2026-09-01'), end: instant('2026-09-12') },
    { id: 't2', parentId: 'p1', name: 'Framing',    start: instant('2026-09-12'), end: instant('2026-10-01'),
      meta: { team: 'A' } },
  ],
  dependencies: [
    { id: 'd1', fromId: 't1', toId: 't2', type: 'FS', lag: { value: 0, unit: 'd' } },
  ],
});

// ── View: binds project to DOM ──────────────────────────────────
const gantt = new Gantt({
  host: '#chart',                         // element or selector
  project,

  rows: { source: 'tasks', tree: true },
  preset: 'weekAndMonth',                 // or a full ViewPreset object
  range: 'fitProject',                    // or a TimeSpan

  columns: [
    { type: 'name', flex: 1, editable: true },
    { type: 'start' },
    { type: 'duration' },
    { id: 'team', header: 'Team', value: t => t.meta.team },
  ],

  interactions: {
    move: true,
    resize: t => t.kind !== 'group',      // boolean or per-task predicate — see §4.1
    linkCreate: true,
  },

  features: {
    links: { allowCreate: true },
    tooltips: true,
    contextMenu: { items: ({ task, defaults }) => [...defaults, myItem(task)] },
  },
});
```

### Programmatic mutation — always transactional

```ts
project.transaction(() => {
  project.tasks.update('t2', { name: 'Framing — north wing' });
  project.dependencies.add({ id: 'd2', fromId: 't2', toId: 't3', type: 'FS', lag: days(2) });
});
// one scheduling pass, one changeset, one undo step, one render

project.undo();  project.redo();
project.canUndo; project.canRedo;
```

Single mutations outside an explicit transaction are auto-wrapped in one — convenience without a second code path.

### Reconfiguration is just assignment

```ts
gantt.preset = 'dayAndWeek';
gantt.rows = { source: 'group', groupBy: t => t.meta.team };
gantt.columns = [...gantt.columns, extraColumn];
```

Every config key is a live property. Setting one triggers exactly the invalidation it needs (a preset change rebuilds the axis; a row-source change re-resolves rows) — never a full remount.

---

## 3. Events — one bus, one vocabulary

| Cancelable (pre-commit) | Notification (post-commit) |
|---|---|
| `beforeTaskMove` | `taskMove` |
| `beforeTaskResize` | `taskResize` |
| `beforeTaskEdit` | `taskEdit` |
| `beforeLinkCreate` | `linkCreate` |
| `beforeSelectionChange` | `selectionChange` |
| — | `change` (every committed `ChangeSet`) |
| — | `scheduleDiagnostics` (engine findings) |

```ts
gantt.on('beforeTaskMove', ({ task, start, end }) => {
  if (start < mobilization) { toast('Too early'); return false; }   // veto
});

gantt.on('beforeTaskEdit', async ({ task }) => {
  await myDialog.open(task);   // bring-your-own editor
  return false;                // suppress built-in
});

project.on('change', ({ changeSet }) => save(changeSet));           // persistence hook (D7)
```

Rules:

- Cancelable handlers may return `false` or `Promise<false>`; an async veto suspends the gesture with a visible pending state — it never commits optimistically.
- Pointer/gesture events fire on the `Gantt` (view concern); data events fire on the `Project` (data concern). Every event name exists exactly once.
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

Renderers return **plain serializable element descriptions** (tag/class/style/text/children), applied by the engine's reconciler — never live DOM nodes (nodes are recycled by virtualization) and never framework components in core (D5). Text by default; HTML by explicit opt-in only.

```ts
barRenderer: ({ task, item }) => ({
  class: { 'my-bar': true, 'my-bar--late': isLate(task) },
  children: [
    { tag: 'span', class: 'my-bar__label', text: task.name },
    { tag: 'span', class: 'my-bar__team',  text: task.meta.team },
  ],
})
```

### 4.1 Per-task looks and actions

Both questions — *how does this task look?* and *what can you do to it?* — resolve **per task**, not per chart, and every mechanism sees the whole task (`kind`, fields, typed `meta`):

**Look.** Every bar element carries `data-kind`, so per-kind styling is level-2 CSS with zero JS (`.fg-bar[data-kind="milestone"] { ... }`). At level 3, `barRenderer` is either one function that branches, or a per-kind map so the common case needs no branching — host-defined kinds slot in by name:

```ts
barRenderer: {
  milestone: ({ task }) => diamond(task),
  group:     ({ task }) => bracket(task),
  buffer:    ({ task }) => hatched(task),   // host-defined kind
  '*':       ({ task }) => defaultBar(task),
}
```

**Actions.** The `interactions` config takes a boolean or a per-task predicate for each gesture (`move`, `resize`, `linkCreate`, `select`, `edit`), layered over per-kind defaults. One resolution both hides the affordance and refuses the gesture — pointer and keyboard alike (I14) — so a non-resizable task simply has no handles rather than handles that scold. Context-menu items and commands carry a `when(task)` clause, so a kind (or any predicate) ships its own action set.

**Division of labor:** capabilities answer the *static* question ("groups don't resize"); `before*` events answer the *contextual* one ("not before mobilization"). Use the shallowest one that fits.

---

## 5. Shared axes and scroll (multi-chart, D9)

```ts
import { TimeScaleModel, ScrollModel } from 'freegantt';

const scale  = new TimeScaleModel({ preset: 'weekAndMonth' });
const scroll = new ScrollModel();

const tasksChart = new Gantt({ host: '#top',    project, scale, scroll });
const otherChart = new Gantt({ host: '#bottom', project, scale, scroll: scroll.xOnly() });
```

Omit `scale`/`scroll` and the chart creates private ones — single-chart users never meet the concept. Passing shared instances is the *entire* sync API: no link manager, no event plumbing. `scroll.xOnly()` / `.yOnly()` derive partial bindings for mixed layouts.

---

## 6. Serialization contract (D7)

```ts
const doc = project.toJSON();     // { schema: 1, timeZone, tasks, dependencies, ... }
const p2  = Project.fromJSON(doc);
```

- The JSON shape is **public API**: documented, versioned by an integer `schema` field, semver-governed. `fromJSON` migrates older schemas forward; it never silently drops fields.
- Instants serialize as ISO-8601 strings (readable, diffable, zone-explicit); brands exist only in TS types and never leak into JSON.
- `meta` round-trips opaquely.
- **Changesets are the incremental counterpart**: `project.on('change')` + `project.apply(changeSet)` are inverse-ish operations designed so a future sync adapter (or collaborative layer) is an extension, not a core change. `apply` validates and reports rejections rather than throwing mid-way.

---

## 7. Developer experience commitments

- **Dev-mode invariant warnings**: dependency cycle detected (with member ids), unknown preset id, config set on destroyed instance, non-deterministic item identity, renderer returned a live node.
- **Stable test hooks**: `data-testid` on every part so consumers can write E2E tests against the chart without brittle selectors.
- **Errors are typed and actionable**: `FreeGanttError` subclasses with codes, never bare strings; validation failures name the entity and field.
- **Docs site with live, editable examples** grows with the slices (the harness pages are its seed) — budgeted as a deliverable, not an afterthought.
- **Semver honesty**: internal modules are not importable (enforced by the `exports` map), so semver only governs surfaces we actually promise.

## 8. Framework wrappers (later, out of scope for the slices)

The core stays framework-free (D5). Wrappers, when demanded, are thin adapters: props → config assignment, callbacks → event subscriptions, children/slots → renderer callbacks. Nothing in the core may require a wrapper to function, and no wrapper gets private API access — if a wrapper needs a back-door, the public API is missing something; fix the API.
