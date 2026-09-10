This review is a stale. **Superseded by ADR 0011.**

  Verdict

  The diagnosis is directionally correct, but its ownership claim is too broad.

  Core must own the canonical runtime snapshot. Transactions, cascades, rollup, undo, and consistent reads require that snapshot.

  Core does not need to own the consumer’s namespace or original objects.

  The real category error is this:

  │ Core confuses canonical storage with ownership of the consumer’s data model.

  The meta bag is wrong as a runtime interface. A bag remains useful at the document seam.

  The candidate works only if accessors read library-owned immutable snapshots. It fails if accessors read and mutate external consumer objects.

  1. Current diagnosis

  What core must own

  Core must own these items:

  • Entry identity and hierarchy.
  • Normalized time values and segments.
  • The current committed snapshot.
  • Transaction staging.
  • Field declarations and runtime validation.
  • Rollup and cascade results.
  • Changesets and history.
  • Plugin stores.
  • Revision and cache invalidation.

  Core needs current values to produce reliable { from, to } rows. It cannot own edits without knowing their base values.

  What core owns without good reason

  Core need not own these items:

  • The consumer’s property namespace.
  • The original object identity.
  • An Entry.meta storage convention.
  • Undeclared passenger data at runtime.
  • A second generic for the same declared values.
  • Different read shapes for core and consumer fields.

  Entry.meta creates this unnecessary ownership.

  The implementation also writes into an object described as consumer-owned. metaStrategy.write clones and replaces it in source-strategy.ts.

  This can remove a prototype, replace an array, or make a held reference stale. That is not opaque handling.

  Steelman for the bag

  The bag solves real document problems:

  • It protects future schema keys.
  • It preserves unknown consumer data.
  • It separates schema data from passenger data.
  • It gives serialization a JSON-safe namespace.
  • It avoids collisions with future core fields.

  These arguments justify a bag in EntryDocument. They do not justify Entry.meta in the runtime interface.

  The current ADR makes that same serialization argument. It then exposes the wire-format solution as the runtime data model.

  fieldNames versus fields

  Do not copy the accessor-based Gantt’s two-getter model.

  fieldNames means “all stored properties.” fields means “declared properties.” That distinction is valid.

  Two public getters add more vocabulary than value.

  FreeGantt already has the useful half:

  • An entry exposes stored values.
  • dataset.fields exposes declared semantics.
  • fieldValue() resolves one declared value.

  Unknown keys can remain flat on runtime entries. Serialization can place them in a document-owned namespace.

  Where meta should move

  Do not move consumer data into PluginDocument. That namespace belongs to plugins.

  Add a document-only consumer namespace instead:

  interface EntryDocument {
    id: string
    parentId?: string
    kind?: EntryKind
    name: string
    start: string
    end: string
    segments?: readonly SegmentDocument[]
    data?: JsonObject
  }

  At runtime, custom values stay flat. During serialization, core moves non-core properties into data.

  This preserves future schema freedom without imposing a runtime bag.

  2. Competitor findings

  TanStack Table

  TanStack uses one consumer row type:

  │ “Whatever you pass to the data table option will become the TData type.”

  Data guide (https://tanstack.com/table/latest/docs/guide/data)

  It never mutates those rows:

  │ “The data that you pass to the table is never mutated by TanStack Table.”

  Data guide (https://tanstack.com/table/latest/docs/guide/data)

  Columns use a key or function:

  │ “Use an object-key that corresponds to the value you want to extract.”

  Column definitions (https://tanstack.com/table/latest/docs/guide/column-defs)

  This model removes FreeGantt’s generic duplication. It does not replace Field declarations.

  FreeGantt Fields also define editing, parsing, equality, persistence, and rollup. TanStack accessors do not.

  TanStack also depends heavily on stable object identities:

  │ “A new data reference invalidates the core row model.”

  Data guide (https://tanstack.com/table/latest/docs/guide/data)

  That model is too weak for transactional scheduling. Its one-generic design is still worth copying.

  AG Grid

  AG Grid uses three practical modes.

  The default mutates row objects:

  │ “The grid owns the data state and treats the data as mutable.”

  Value setters (https://www.ag-grid.com/javascript-data-grid/value-setters/)

  A field supports nested paths:

  │ “The field supports dot notation.”

  Value getters (https://www.ag-grid.com/javascript-data-grid/value-getters/)

  A valueSetter handles custom writes. readOnlyEdit delegates writes:

  │ “The grid fires cellEditRequest events allowing the application to process the update request.”

  Value setters (https://www.ag-grid.com/javascript-data-grid/value-setters/)

  AG Grid cleanly separates view state from rows:

  │ “The grid state is designed to be serialisable.”

  Grid state (https://www.ag-grid.com/javascript-data-grid/grid-state/)

  FreeGantt should copy the state-versus-data split. It should not copy in-place row mutation.

  AG Grid transactions are row-level, not field-level:

  │ “A transaction object contains the details of what rows should be added, removed and updated.”

  Transactions (https://www.ag-grid.com/javascript-data-grid/data-update-transactions/)

  That cannot replace FreeGantt changesets.

  The accessor-based Gantt

  (Vendor product names are removed per CLAUDE.md. Two real products are compared below, each labelled by its data model.)

  It usually makes a shallow copy:

  │ “By default, a Model stores a shallow copy of its raw json.”

  Model (vendor docs: api/Core/data/Model.md)

  Fields create first-class record properties. Storage mapping defaults to the field name:

  │ “The property in a record’s data object that contains the field’s value. Defaults to the field’s name.”

  DataField (vendor docs: api/Core/data/field/DataField.md)

  This is the closest useful model for FreeGantt.

  It also shows why nested mutable values need special treatment:

  │ “A single interval edit should not have to clone 1500 intervals.”

  Store fields (vendor docs: guide/Core/data/storefields.md)

  Its granular mode records sub-record actions. FreeGantt’s plugin-store rows already provide the correct model for such data.

  That Gantt gets several things wrong:

  • It decorates prototypes with field accessors.
  • It warns consumers about reserved-name collisions.
  • It mixes field and column concerns.
  • It exposes many similar serialization views.
  • Its automatic STM transaction uses a time window.

  FreeGantt should keep explicit gesture transactions and separate Grid columns.

  The global-store Gantt

  It uses the global mutable-store extreme:

  │ “[The Gantt] populates the grid with data properties that correspond to the names of the columns.”

  Columns (vendor docs: desktop__specifying_columns.html)

  It allows flat custom properties, but parses extras as strings:

  │ “Extra data properties will be parsed as strings.”

  Loading (vendor docs: desktop__loading.html)

  It also repeats inclusive-end arithmetic across renderers and editors. FreeGantt’s time helpers are substantially better.

  3. Recommended runtime shape

  Use one generic for consumer field values.

  Keep a runtime Field registry. Do not replace it with TypeScript alone.

  type PlannerFields = {
    cost: number
    owner: string
    finance: {
      approved: boolean
    }
  }
  const dataset = new Dataset<PlannerFields>({
    entries: [{
      id: 'a',
      name: 'Task A',
      start: '2026-01-01',
      end: '2026-01-05',
      cost: 100,
      owner: 'Jo',
    }],
    fields: [
      { key: 'cost', type: 'number', rollUp: 'sum' },
      { key: 'owner', type: 'text' },
      {
        key: 'approved',
        accessor: ['finance', 'approved'],
        type: 'boolean',
      },
    ],
  })
  dataset.entries.get('a')?.cost
  dataset.entries.fieldValue('a', 'cost')
  dataset.entries.update('a', { cost: 500 })

  The runtime stored entry becomes conceptually:

  type Entry<TFields> = CoreEntry & Readonly<Partial<TFields>>

  EntryInput<TFields> and EntryEdit<TFields> accept the same flat consumer keys.

  Core copies input objects. It does not mutate the supplied objects.

  Field union

  Use an exclusive stored-versus-computed union:

  type Field<TEntry, TValue> =
    | {
        key: FieldKey
        accessor?: string | readonly string[]
        get?: never
        rollUp?: AggregatorName
        persist?: boolean
      }
    | {
        key: FieldKey
        get(entry: TEntry, context: FieldContext): TValue | undefined
        accessor?: never
        rollUp?: never
        persist?: false
        editable?: false
      }

  An omitted accessor defaults to the Field key.

  Use a path tuple for nested data. Dot paths make literal dots ambiguous.

  Compile each path into a reader and immutable writer during registration.

  Do not publish an arbitrary setter yet. A setter can change several properties and hide those writes from the changeset.

  4. What the candidate breaks

  The candidate holds after these corrections:

  • “Consumer’s own entry” means the consumer’s shape.
  • It does not mean the original consumer object.
  • Stored accessors receive generated immutable writers.
  • Computed getters are read-only.
  • The document keeps a separate consumer namespace.

  Without those rules, it breaks:

  1. Atomic transactions through side-effecting setters.
  2. Reliable { from, to } capture.
  3. Undo when setters have external effects.
  4. Rollup for getter-only Fields.
  5. Serialization of function-only getters.
  6. Unknown-property preservation.
  7. Cache invalidation after external mutation.
  8. Preview-versus-commit consistency.
  9. Nested object undo after in-place mutation.
  10. Plugin Field isolation.
  11. Field collision detection.
  12. Add-time custom values.
  13. Deterministic document key order.
  14. Replay when a setter’s behavior changes.

  Rollup must require a stored accessor. A computed Field must calculate its own parent result.

  5. Hot path

  An accessor call does not require a cache.

  Compile the accessor once. Each read then performs one function call and a few property reads.

  That is suitable for each frame. It allocates nothing.

  The current code is worse. metaStrategy.read calls metaRecord, which spreads meta before one property read.

  That creates an object per meta Field read. Sorting also repeats that copy.

  Use caches only for computed Fields. Do not cache stored values.

  Competitor behavior supports this:

  • AG Grid calls a pure getter once during a redraw.
  • TanStack memoizes complete row models by reference.
  • The accessor-based Gantt uses property accessors and lazy serialization caches.

  None requires a second runtime value bag.

  6. Serialization

  toJSON() should serialize the canonical library snapshot.

  It should not query arbitrary external objects.

  For each Entry:

  • Write core schema properties at top level.
  • Write stored consumer properties under document data.
  • Omit computed Fields.
  • Write plugin state under plugins.
  • Preserve undeclared consumer properties inside data.

  This makes the document self-contained.

  Walking declared accessors alone is insufficient. It loses undeclared passenger data.

  A stored Field can support persist: false. A computed Field defaults to non-persistent.

  7. Undo and nested values

  Undo should not invoke arbitrary consumer setters.

  Replay should use the same internal immutable path writer used by normal commits.

  One changeset can already hold cascade rows for many entries. That model remains correct.

  Object and array Fields need one firm rule:

  │ A Field value changes only through whole-value replacement.

  Core can retain { from, to } references under that rule.

  In-place nested mutation makes those references unreliable. Freeze values in development or document the immutable rule.

  Use a separate store with granular rows for large nested collections. The accessor-based Gantt’s trackStoreDataFields supports that conclusion.

  Your runtime evidence about a direct cost edit is correct. It emits one cost row. Do not change that path.

  8. Ownership tiers

  Do not publish three modes now.

  Accessor mapping is not an ownership mode. It only selects a location inside the canonical entry.

  The useful future ladder has two modes:

  1. Managed Dataset snapshots.
  2. Fully controlled transaction acceptance.

  The managed mode should remain the default.

  A controlled mode must emit one proposed transaction containing:

  • The direct user edit.
  • Extension writes.
  • Scheduling cascades.
  • Rollup writes.
  • The base dataset revision.

  The consumer must accept and apply that transaction atomically.

  The consumer owns undo in controlled mode. Two undo stacks will diverge.

  Controlled mode must not disable cascades. That would make the same gesture mean different things across ownership modes.

  Existing before* events do not make this free. They only support veto before a core-owned commit.

  Controlled mode also needs:

  • Acceptance or rejection.
  • Revision conflict handling.
  • Rebinding or acknowledgment.
  • Preview consistency.
  • Atomic multi-entry application.
  • One owner for history.

  Defer this mode until a real consumer requires it.

  9. Field declaration properties

  Add now

  These properties are load-bearing:

  • accessor
  • defaultValue
  • nullable
  • persist
  • internal
  • A load/serialize codec
  • Existing equals
  • Existing compare
  • Existing editable
  • Existing rollUp

  Prefer one named codec or Field type over independent conversion functions. Documents cannot carry functions.

  Already represented

  These accessor-based Gantt properties already have FreeGantt equivalents:

  • calculate → computed get
  • calculated → computed union arm
  • readOnly → inverse of editable
  • dataSource → accessor
  • serialize → Field type or named codec
  • column → current Field column defaults

  Defer or reject

  These are not currently load-bearing:

  • alwaysWrite
  • formulaProviders
  • AI descriptions
  • bypassEqualityOnSyncDataset
  • compareItems
  • Async calculated values

  Do not permit async Field getters. They cannot satisfy synchronous layout.

  internal

  internal: true is useful, but it does not fix TypeScript by itself.

  It can block automatic columns and runtime column resolution.

  It cannot stop gridColumns: ['segments'] from type-checking while FieldKey remains open.

  Compile-time exclusion requires a typed Gantt or typed Field tokens. That cost is not justified.

  Keep the runtime FieldNotColumnableError.

  Remove meta from core Fields. Mark parentId and segments internal.

  10. Shipped Field types

  Ship this minimum set:

  • text
  • number
  • integer
  • boolean
  • percent
  • instant
  • date
  • duration

  A type must provide a coherent bundle:

  • Equality.
  • Comparison.
  • Formatting.
  • Parsing.
  • Input type.
  • Default column settings.
  • Optional codec.

  Do not ship money without a currency and locale configuration model.

  Do not ship object, array, or nested-store types as ordinary scalar Fields.

  This decision is conceptually independent from storage. It is not independent in implementation.

  Field types need the final codec and persistence rules. Define those rules before shipping types.

  11. Field type merging

  A shallow spread is wrong.

  A generic recursive deep merge is also wrong. It gives unclear semantics to functions, unions, and arrays.

  State the merge contract per property:

  • Scalar Field properties replace type defaults.
  • Functions replace type defaults.
  • column merges one level by key.
  • accessor replaces as one atomic value.
  • Exclusive width and flex resolve after merging.
  • undefined means absent, not “remove the default.”

  Thus { type:'percent', column:{ header:'Done' } } keeps other percent column defaults.

  12. Extracting state into a plugin

  Do not extract the canonical Entry store into a core plugin.

  Transactions, rollup, history, cascades, and revision tracking are core store operations.

  A plugin wrapper would expose implementation machinery without reducing complexity. That would create a shallow module.

  There is one useful future cut:

  • Keep the transactional store interface inside data/.
  • Add a second adapter only when controlled storage exists.
  • Give render code a stable snapshot interface.
  • Never call an external adapter for each frame cell.

  One current adapter does not justify publishing that seam.

  13. The worst unnamed problem

  The document cannot reliably distinguish authored values from derived values.

  Construction rollup can write cost into a parent’s meta. Serialization then writes it as consumer-owned data.

  reportCorrectedRollUps only checks start and end in src/data/serialization/index.ts.

  A stale consumer rollup value can change silently during import. Without its Field declaration, the same value becomes opaque authored data.

  That means document meaning depends on out-of-band declarations.

  This is worse than awkward typing. It threatens deterministic round-trips and cross-application meaning.

  Stored custom values need explicit authored-versus-derived semantics. At minimum, the document must carry enough declarations to reproduce the derivation.

  14. Sequence

  1. Write the new ownership and document rules first.
  2. Spike the typed Dataset<TFields> shape.
  3. Spike compiled path reads and immutable path writes.
  4. Benchmark accessor reads against direct property reads.
  5. Spike object-valued undo with replacement and mutation.
  6. Decide whether old schema readers still matter before release.
  7. Remove the allocation in current metaStrategy.read.
  8. Generalize rollup-correction detection to all rolling Fields.
  9. Add internal flat custom storage behind the current interface.
  10. Add document data serialization and reading.
  11. Land the breaking public change atomically.

  That atomic change must include:

  • Entry
  • EntryInput
  • EntryEdit
  • Dataset
  • EntryStore
  • Field
  • FieldSource
  • Document types and readers
  • Serialization
  • Error messages
  • Plugin Field storage
  • Harness call sites
  • Public documentation

  Then add shipped Field types and explicit merge semantics.

  Defer controlled storage.

  Human decisions required

  1. Must pre-release schema versions 1–4 remain readable?
  2. Must undeclared custom values remain readable at runtime?
  3. Must undeclared custom values survive toJSON()?
  4. Must consumer values support nested paths?
  5. Are object-valued Fields immutable whole values?
  6. Can plugin Fields write through entries.update()?
  7. Should computed Fields ever participate in rollup?
  8. Is a future controlled Dataset a required first-release feature?

  My recommendation is clear:

  • Delete runtime Entry.meta.
  • Keep a document-only consumer namespace.
  • Use one custom-field generic.
  • Keep flat canonical runtime entries.
  • Copy input objects.
  • Generate immutable path writers.
  • Keep one fieldValue() resolver.
  • Keep changesets unchanged.
  • Defer controlled storage.

  I made no files changes. The shared tree remained unchanged.

  Finished Watch review agents context budgets

  The review completed successfully. The reported shell error came from stopping the finished subagent watcher. No follow-up is needed.
