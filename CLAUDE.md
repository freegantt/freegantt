# FreeGantt

> ## Stop rule — the harness never patches the library
>
> You reach for a workaround, a defense, a fallback, or a re-derivation in `harness/`, because `src/` does not give you what you need. **Stop there. Report the gap to the user. Ask if core closes it first.** Wait for the answer.
>
> Harness code that compensates for the library is an **API gap**, and no lint catches it. The workaround hides the evidence, and the bad API ships. This rule outranks "finish the task": a blocked harness feature costs one turn, a hidden API gap costs a release.
>
> `harness/` is the library's first consumer, and sits outside the `src/**` lint scope by design — consumer code, not library code. That is not an exemption to spend: review `harness/main.ts` on every commit, changed or not, because code there that breaks a library rule or re-derives what the library already computes is an API gap even when no lint fires. Record it against the current slice and close it in `src/` — tidying the harness only hides the evidence. A clean `harness/main.ts` is the expected steady state, not a sign there is nothing to review: the last three gaps it exposed were `rowHeight: 32` restating `api/gantt.ts`'s default, a hand-built `TimeScaleModel` standing in for `range: 'fitDataset'`, and a `--fg-grid-pane-width` hand-tuned to one column set, standing in for `gridWidth: 'fitColumns'` (#157).

Framework-free TypeScript Gantt library, library-first. The spec is `plans/00`–`04` — read the relevant doc before changing anything it governs; locked decisions D1–D12 are in `plans/00-overview.md` and are not revisited casually. Work lands in vertical slices S0–S7 (`plans/03-slices.md`), in order, each ending with something visible in `harness/`. S3–S6 land with the identity extender. The first-party scheduling plugin, `schedule()`, `Dependency`, lag, and cycle diagnostics are **S7**. Extra field writes on commit and during drag come from `data/`'s `EditExtender`. `interaction/` never imports `scheduling/`.

This project has never shipped to a user: the public API can change freely, and should whenever change makes it better or the code more resilient. Write as a senior TypeScript developer with experience shipping products like AG Grid, DHTMLX Gantt, and Bryntum, who trades development speed for a clean surface, not one racing to ship. Follow Uncle Bob's (Robert C. Martin) clean code, use well-defined TypeScript types wherever possible, and keep strong module boundaries. Design for a clean, easy-to-use API internally and externally — readability and maintainability beat quick code every time.

## Hard rules

talk in ASD-STE100 Simplified Technical English:

One meaning per word: Every approved word has only one definition to stop confusion.
Active voice: Writers use active sentences instead of passive ones (for example, "The mechanic removes the panel" instead of "The panel should be removed").
Simple tenses: Use simple past, simple present, and simple future tenses.
Short sentences: Keep sentences to 20 words for instructions and 25 words for descriptions.
One instruction per sentence: Each step gets its own sentence or bullet point.

Functions should do one thing and do it well and should be clear on what they do from the name.

Name functions and classes in friendly easy to understand for humans and agents names. Stick to the domain model, if you're trained on Uncle Bob's (Robert C. Martin's) clean code follow his guidelines for naming things. Code should be self-documenting and easy to understand. Write the call site down and read it in english to verify it makes sense before deciding on a name. Not the signature — the invocation, with real arguments. Example of bad naming (#54, since renamed): a measurement wiring named after "size" alone — say its call aloud: "attach size to container." That makes no sense; the glossary term is pane size, so the name became `attachPaneSize`. See the naming skill when you need to come up with name.

Comment a seam with the question it answers, not the mechanism it uses. A reader of four registrations must see one story, not four API calls. `harness/plugins/buffer-kind.ts` and `risk-kind.ts` set the pattern. They ask what shape it draws, how it looks, what you can do to it, and what actions it offers. Each question sits above the one call that answers it. Use this shape wherever a module fills more than one seam (2026-09-04 branch review, S3).

**Vocabulary** (`CONTEXT.md` is the glossary; ADR 0003):
- The authored record is an `Entry` — `EntryId`, `EntryKind`, `entryId()`, `Dataset.entries`, `beforeEntryMove`/`entryMove`, default kind `'span'`. `Entry` in the ledger sense: a dated line whose meaning the consumer supplies.
- **A Field is what a value _is_; a Grid column is where a Gantt _shows_ it.** Fields are declared on the `Dataset` (`fields`) — core's own are declarations of the same shape, so a consumer field and a core field take one code path; grid columns live on the `Gantt` (`gridColumns`) and carry presentation only (ADR 0005, `plans/01` §2.6). A **Field key** names a field and is the changeset's `field` — one name, which is why `EntryField` is retired. The **Rollup** is the pass, an **Aggregator** is the function it runs, and an Aggregator is always referenced by a registered name — never passed inline, because a name serializes into a document and a function does not. `meta` is the consumer's namespace in the document; declaring a key makes it addressable, and undeclared keys stay opaque.
- Core names what the data *is* (dated, kinded, spanning); the consumer owns what it is *for*. A shift roster, units sold per week, and machine uptime are as much the intended use as a project plan, so scheduling vocabulary — dependency, predecessor, lag, deadline, "the schedule" — stays inside the scheduling plugin (`plans/01` §7) and its own docs.

**Layers** (`plans/01` §1 — enforced by dependency-cruiser):
- `model/`, `time/`, `data/`, `layout/` are the mandatory DOM-free core: plain data + functions, no `document`/`window`/browser globals. (They ship to and run in the browser like everything else — but because they never touch the DOM they also run in plain Node, which is how they're unit-tested and how the future worker seam stays possible.) Only `render/`, `view/`, `interaction/`, `extensions/` may touch the DOM.
- `scheduling/` is DOM-free the same way, but it is **not** one of the mandatory core layers — it's where the first-party default scheduling plugin's pure engine lives (D3/D4, ADR 0002). `data/` has no static dependency on it: mutations resolve through a generic extension hook (identity function when no plugin is installed, or the installed plugin's `schedule()`). A Gantt with no scheduling plugin never loads `scheduling/`.
- `scheduling/` and `render/view/interaction` never import each other — they meet only through `data/`'s extension hook. Never put scheduling imports in render or view code.
- Only `api/` and `model/` types are public. Internals stay unreachable (sealed `exports` map).
- `model/` is types only: zero runtime beyond id/brand helpers and the `FreeGanttError` base, zero dependencies. `Dependency`/`DependencyType`/`DependencyId` and the per-entry pin flag are scheduling-plugin-owned data, not `model/` (ADR 0002).

**Time** (`plans/01` §5):
- Storage is half-open `[start, end)`; display is inclusive via one formatting helper — no inline `end - 1` arithmetic.
- All zone-aware date arithmetic goes through `time/` in the dataset's IANA zone. (A *plain* time is a wall-clock reading with no zone attached — Temporal's term, and ours; see `CONTEXT.md`.)
- `time/` is the *only* place allowed to use `new Date()`/`Date.now()`, magic time constants (`86400000` etc.), or arithmetic on `Instant`. Everywhere else in `src/` these are forbidden — I10 lints this, scoped to `src/**`.

**Data** (`plans/01` §6):
- Every mutation goes through a transaction → the extension hook (once) → one changeset (`{from, to}` per field). No exceptions, gestures included (one transaction per gesture, at commit). The extension hook is the identity function when no scheduling plugin is installed, so this is not conditioned on scheduling being present — the shape holds either way.
- Undo records user edits + engine cascades atomically (when a scheduling plugin is installed and contributes cascades).
- No module-level singletons anywhere; two Gantt instances on one page must be fully independent.

**Scheduling** (`plans/01` §7 — first-party default plugin, not mandatory core, see ADR 0002; **slice S7**):
- The extension hook (D4) has one occupant at a time, and this plugin is one candidate occupant with no special claim on it (D-S5-23). Installing composes: a plugin wraps the current occupant, so a second plugin adds to the first's writes. When nothing is installed, none of this runs.
- `schedule()` is pure and deterministic; never mutates input; policy never overwrites a user-proposed field.
- Propagation is a worklist loop — no recursion, ever (5,000-link chain fixture guards this).
- Conflicts become diagnostics; the engine never silently rewrites what the user asked for.

**Rendering / view** (`plans/01` §8):
- Authored vs. derived: entries are persisted; plugin-owned stores persist with their plugin; rows/items/geometry are recomputed and never persisted. A **field's source** decides which side a rolled-up parent value falls on (ADR 0005): an `entry`- or `meta`-sourced field has a stored home, so its aggregate is stored, undoable and serialized — this is what `start`/`end` already do; a `compute`-sourced field has no home, so its aggregate is computed on read and never reaches the document.
- Hot path (hover/selection/drag preview) = class toggles + transforms only; zero allocation, never rebuilds a frame.
- All time→pixel via the bound `TimeScale`; all scroll via the bound `ScrollModel`. No exceptions.
- Renderer output is text by default; raw HTML is explicit opt-in only.
- Reconciler scope is hard-bounded: attr/class/style/text + keyed children. Needing lifecycle hooks means the design is wrong — stop and discuss.

**Entry kinds** (`plans/01` §2.5):
- `Entry.kind` is authored, never derived from having children. Behavior per kind goes through the seams (policy, item producer, renderer registry, capability resolver) — no `if (kind === ...)` chains outside them.
- Capabilities gate gestures *and* affordances from one resolution (I14).

**Dependencies** (`plans/04` §1):
- Two runtime deps, each confined to one façade file: `alien-signals` (the `data/` reactivity façade) and `temporal-polyfill` (`time/zone.ts`, `/fns/*` entry points only — see `docs/adr/0001`). No other file may import either.
- Adding a third runtime dep needs a `plans/04` §1 table entry justifying it and a façade to confine it. Rejected candidates and reasons are in `plans/04` §1.1 — check there before proposing one.

**API** (`plans/02`):
- Nothing in the public surface throws "not implemented". Every mutating interaction gets a cancelable `before*` event. Every config key is live-reconfigurable. Naming: greppable pairs (`beforeEntryMove`/`entryMove`), one name per concept. Names must be specific enough to disambiguate at a glance (Uncle Bob's naming rules) — a generic word covering more than one concept in the codebase is a bug, not a style nit. Cautionary example (#7): "chart" meant both the public `Gantt` instance and an internal `view/` class; nothing said which, and it stalled a real review (#4). Fix was to retire "chart" entirely — the public concept is `Gantt`, the internal shell is `GanttShell` — not to pick a synonym and hope it reads clearly from context.
- **Call site first.** Publish the invocation an app author writes (`dataset.entries.update(id, { start })`, `gantt.preset = 'weekAndMonth'`). Name the *job*, not the pipeline. `*Request` / `*Adjustment` / `*Intent` / `*Patch` / `identity*` / `bind()` name a pipeline step, so they stay off the **app-author** surface — never a constructor option, a config key, or an event payload. The plugin-author surface (see the next bullet) may publish one when the name *is* the job an author reads: an `EditExtender` receives an `EditRequest`, so that type is public and keeps its name (#251). A one-field wrapper (`{ patch }`, `{ position }`) is the inner type, not a new name.
- **Two callers, two surfaces.** App authors never meet a hook, a binding handle, or an expert knob (`overscan`, `pxPerMs`, a raw extender) to get the default behaviour. Plugin and shared-axis authors get a second, smaller surface. Core fills `from`, post-edit state, descendant walks, and zone math.
- **One write shape, one knob.** Extra field writes (cascade, rollup) use `EntryEdit` — the same object `update()` takes. `{ from, to }` lives on the `ChangeSet` only. One config tree per job (link-create is not on both `interactions` and `features`). Illegal combinations are unrepresentable (shared `scale` vs `preset`/`range`/`zoom` on the same `Gantt`). Input is loose (`string` ids, `InstantInput` dates) on every way in, including `get`; stored types after ingest are complete (`kind` present). Common case is a shorthand; the long form is expert.
- Vendor Gantt product names never appear in specs, docs, or code.

## Workflow

- TS strict (with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), pnpm, Vite, Vitest (pure tests run in Node with no DOM env), fast-check for property tests. Dont do lie generics
- The invariants table (`plans/01` §11, I1–I14) is the review checklist; every invariant maps to a CI job.
- Slice gates (`plans/00` §4) must pass before the next slice starts.
- **`pnpm verify:full` is the gate, and its last line is the answer.** `pnpm verify` is CI parity only. It never starts a browser, so `e2e/**` is invisible to it, and e2e has no CI job (`docs/04` §3). `verify:full` runs `verify` and then the browser check, and prints one verdict line: `verify:full PASS — …` or `verify:full FAILED at check N of M: …`. Report that line, never `EXIT: $?` — a run with no verdict line is unproven, not green. Capture it with a redirect: `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. A pipe (`| tail -4`) makes `$?` read `tail`, which prints `EXIT: 0` over a failure. On #142 two agents reported `verify` green over a fully red `e2e/resize.spec.ts`. Both told the truth. The pre-push hook caught it after the review and after the merge (#255, `docs/04` §3.2).
- **A plan or review's account of the code is a claim. Open the file before you act on it.** A verified finding does not verify its proposed fix. On #244 all 18 findings were real, but one report described the code wrongly, and the true fix was smaller. Probe behaviour with a throwaway test before any "changes no reader" refactor. Delete the probe. Then pin the behaviour with a real test. Two earlier misses (#230 R1's collapsed-row disagreement, a default nobody opened) cost a silent regression each.
