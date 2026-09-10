# Evidence behind ADR 0011

**The named products are deliberate, and they stay.** `CLAUDE.md` bars vendor Gantt product names from specs, docs and code, and it carries one exception for an ADR and its working folder (ruled 2026-09-09). A decision record has to be checkable, and *"a comparable Gantt does X"* cannot be checked or weighed for how far it generalizes. Do not anonymize these back to *a comparable Gantt*.

**When these decisions land in `plans/00`–`04`, the names do not travel with them.** A spec states the decision, never the survey behind it.

## Two doors read one value

Every comparable library publishes the record door beside the by-key door. The record door returns storage; the by-key door resolves getters and aggregates.

| Product | Record door | By-key door |
|---|---|---|
| AG Grid | `node.data` | `getCellValue` |
| TanStack Table | `row.original` | `row.getValue` |
| Bryntum | a generated accessor | `record.get` |

This is the pair ADR 0011 keeps as `entry.props.x` and `fieldValue(id, key)`.

## A shared bag with two writers gets split eventually

**FullCalendar's Vaadin binding, version 3.0.1.** It shipped `extendedProps` as the consumer's bag, and the library underneath then started writing into it. The consumer's half was renamed to `customProperties`, *"because due to a change of the internal client side library, extendedProps became used by the client itself, so to prevent conflicts of properties, custom properties are now stored separately."*

The split is a breaking rename for everyone using it. **Excalidraw sits in the same position now** — its docs publish `customData` as the integrator's, and Excalidraw itself writes there.

This is the report behind ADR 0011's invariant: **the library writes into `props` only at a key the consumer declared with `rollUp`.** It also carries decision 9 — a plugin is a second writer, and something has to separate the two.

## FullCalendar failed twice at the write door

The closest analogue on the page: a scheduling UI with a fixed set of reserved event keys and a consumer's own values beside them.

**First failure — no namespace at all.** Before v4 a consumer's custom field sat bare on the event, and FullCalendar later added an option with the same name. `extendedProps` was introduced in `4.0.0-alpha.2` to fix it. **That is ADR 0011's stated hazard, realised in a shipped product** — a consumer key that a later release promotes to a library key — and the fix was the namespace ADR 0011 keeps.

**Second failure, and it is still open.** The namespace fixed *reading*. The *write* door stayed open: a non-standard key at the top level is still accepted and relocated into `extendedProps` during parsing. [Issue #7636](https://github.com/fullcalendar/fullcalendar/issues/7636), filed March 2024, labelled *Discussing*, no maintainer reply:

> the type-checking can not detect typos for existing props

> properties in extendedProps can be overridden by those props (or maybe the vice versa) which causes unexpected result

The reproduction is `tilte:` for `title:` — accepted in silence as a custom property, and the event renders with no title. The issue asks FullCalendar to **disallow** custom keys at the top level and require the explicit hash. Its own snippet misspells `extendedProps` as `extendedProp`, which demonstrates the defect it reports.

**Read the lesson precisely: what broke FullCalendar is an _open_ top level, not flatness.** A key it does not recognise is taken as a consumer value rather than refused, so no spelling of a reserved key can ever be checked. ADR 0011 already closes that door — `update('t1', { strat: … })` throws `UnknownFieldError`, which is what FullCalendar is being asked for eight years later. Decision 11 carries the rest.

## Nobody nests at the write door

| Product | The write |
|---|---|
| Bryntum | `record.set({ startDate, cost })` |
| DHTMLX Gantt | mutate the task, then `updateTask(id)` |
| AG Grid | spread flat — `{ ...rowNode.data, price }` |

Every one keeps consumer values beside core ones in a single flat write. This is the cost decision 11 weighs.

## Platforms that own part of a key space

The precedent behind decision 12. Three platforms split the space three ways, and two of them leave the first-party author unprefixed.

- **HTML / DOM.** Core attributes are bare. Consumer attributes are prefixed `data-*`, which exists so that *"authors can define any attribute they want as long as they prefix it with `data-` to avoid clashes with future versions of HTML."* That is precisely the hazard ADR 0011 names when it deletes the core-key override.
- **Kubernetes.** `kubernetes.io/` is reserved. A user's own labels stay **bare** — *"if the prefix is omitted, the label key is presumed to be private to the user."* Automation and third-party components **must** carry a reverse-DNS prefix.
- **OpenAPI.** Core keys are bare. Extensions carry `x-`. One shared `x-` space was not enough: vendors collided inside it — `x-internal` is in de facto use by several — and the OpenAPI Initiative added a **namespace registry** so extensions read `x-{namespace}-`. That is this library's plugin-versus-plugin collision, already solved twice in the field.
- **SQL and CSS** solved the same forward-compatibility problem with a **reserved word list** instead of a prefix. Both answers work, which is why decision 12's recommendation keeps consumer keys bare and publishes a closed core list.

## Promotion without demotion is not shipped anywhere

The evidence behind ADR 0011 overruling `plans/01` §2.5's promote-only clause.

| Product | What it does |
|---|---|
| Microsoft Project | derives summary status from outline structure, so outdenting the last child ends it — *"any task with subtasks has no timing or cost information of its own"* |
| Bryntum | derives `isLeaf` from `children` |
| DHTMLX Gantt | `auto_types` converts a task to a project when it gains children, **and converts it back when they go** |

Microsoft Project and Bryntum store no parent-ness at all, which is why neither owes a demotion rule. That was decision 8's third answer and decision 20's question. Both closed with 26: look and derivation follow children; there is no kind to write.

## Escape hatches for a derived cell

**Named 2026-09-10.** All three bullets read *"a comparable X"* until then, against this file's own opening rule. The 0013 spike review caught it, and the bundle claim in the second bullet is load-bearing for *pin is not derive-off*.

- **AG Grid ships `groupRowEditable`** on a column, with `groupRowValueSetter` carrying the distribution — the edited group value is shared among the group's children, recursing through the hierarchy, and `avg` adjusts children so their average equals the edited value. Setting distribution to `false` makes the cell not editable even under `groupRowEditable: true`. That is the *edit the parent, distribute down* option ADR 0011 rejects as a default. A distribution rule is a per-Field policy with no defensible default, and AG Grid's own `precision` caveat shows why: distributing across three children re-aggregates to a different `avg` than the one typed.
- **AG Grid has no `setColumnEditable`.** [`editable`](https://www.ag-grid.com/javascript-data-grid/cell-editing/) lives on the column definition (boolean or a per-row callback). After init you change that property on the same object and [assign the list again](https://www.ag-grid.com/javascript-data-grid/column-updating-definitions/) (`setGridOption('columnDefs', defs)`). That is Q16: `dataset.fields.override({ key: 'start', editable: false })` — re-apply the declaration, do not invent a second setter. Per-row stays `interactions.edit`, which is their callback. Default `editable` there is `false`; ours is `'anywhere'` (grill). They can add columns; we do not.
- **Bryntum Gantt disables a summary task's date fields unless the parent carries `manuallyScheduled: true`.** A parent that is not manually scheduled has its dates recalculated from its children; one that is keeps its own. The nearest FreeGantt shape is the per-entry pin flag, which ADR 0002 made scheduling-plugin data for S7. **That the Rollup opt-out is that same flag is an assumption, not a finding.** Bryntum ties its escape hatch to *scheduling*; our Rollup is core `data/`. Decision 21 owns the question.
- **Bryntum carries the question on the record**, as three separate task fields — `manuallyScheduled`, `rollup`, and `inactive` (an inactive task adds no attributes to its parent). It ships nothing like `rollUpKinds`. That is decision 6's surviving half, parked beside decision 20. **The earlier form of this bullet claimed _two_ products and named neither. Only one is sourced. Do not cite a second until somebody links it.**

## Where we part from JSON Merge Patch

[RFC 7396](https://www.rfc-editor.org/rfc/rfc7396.html) merges recursively and spells removal as `null`. **Both choices are forced by its medium and neither binds us.**

A merge patch **is a JSON document**, sent over HTTP as `application/merge-patch+json`, and JSON has no absent value. So a removal has to overload one of the seven values it does have, and the RFC states the resulting limit as a scope condition rather than a virtue: merge patch suits documents that *"do not make use of explicit null values,"* and *"is not appropriate for all JSON syntaxes."*

Our patch is a TypeScript object passed to a function call. JavaScript already carries an absent value, and `Partial<T>` already means it. So **`undefined` removes, and `null` stays an ordinary value a consumer may store.**

On depth the RFC reasons the way we do and stops one level lower: it replaces an array whole, because *"it is not possible to patch part of a target that is not an object."* **We draw the same line at the Field key, because that is the smallest thing our changeset can name.**

## The atomic-bag pattern

tldraw's `meta` and Excalidraw's `customData` are undeclared, untyped and **replaced whole** — one identity, one change event, one undo step. That is this library at HEAD, and it is decision 1's first pattern.

tldraw is also the source of the module-augmentation route in decision 9: it ships that pattern for custom shape props. And it is the one inversion `props` costs us — in tldraw, `props` is the library's own validated schema and `meta` is the consumer's free-form bag.

## Sources

- AG Grid — [Value Getters](https://www.ag-grid.com/javascript-data-grid/value-getters/), [Transaction Updates](https://www.ag-grid.com/javascript-data-grid/data-update-transactions/), [TypeScript Generics](https://www.ag-grid.com/javascript-data-grid/typescript-generics/), [Row Grouping — Editing Groups](https://www.ag-grid.com/javascript-data-grid/grouping-edit/), [Aggregation — Configure Columns](https://www.ag-grid.com/javascript-data-grid/aggregation-columns/)
- TanStack Table — [Column Defs](https://tanstack.com/table/latest/docs/guide/column-defs)
- Bryntum — [data fields and data source](https://forum.bryntum.com/viewtopic.php?t=23351), [manually scheduled summaries](https://forum.bryntum.com/viewtopic.php?p=81164), [`TaskModel.manuallyScheduled`](https://bryntum.com/products/gantt/docs/api/Gantt/model/TaskModel#field-manuallyScheduled), [`GanttTasksScheduling`](https://bryntum.com/products/gantt/docs/engine/classes/_docs_src_gantt_tasks_scheduling_.gantttasksscheduling.html)
- DHTMLX Gantt — [Task Types](https://docs.dhtmlx.com/gantt/desktop__task_types.html)
- Microsoft Project — [summary task rollup](https://support.microsoft.com/en-us/project/rollup-task-field)
- FullCalendar — [Event Object](https://fullcalendar.io/docs/event-object), [issue #7636, *disallow non-standard event properties as `extendedProps`*](https://github.com/fullcalendar/fullcalendar/issues/7636), [the Vaadin binding's `extendedProps` → `customProperties` rename](https://vaadin.com/directory/component/full-calendar-flow)
- tldraw — [Shapes: `props` against `meta`](https://tldraw.dev/docs/shapes)
- Excalidraw — [`customData`](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props)
- WHATWG — [custom data attributes](https://html.spec.whatwg.org/multipage/dom.html)
- Kubernetes — [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/), [Well-Known Labels, Annotations and Taints](https://www.kubernetes.io/docs/reference/labels-annotations-taints/)
- OpenAPI — [Namespace Registry](https://spec.openapis.org/registry/namespace/), [Specification Extensions](https://swagger.io/docs/specification/v3_0/openapi-extensions/)
- [RFC 7396 — JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7396.html)
- CodeMirror — [Reference Manual](https://codemirror.net/docs/ref/)
- ProseMirror — [`plugin.ts`](https://github.com/ProseMirror/prosemirror-state/blob/master/src/plugin.ts)
- Zod — [Defining schemas](https://zod.dev/api)
