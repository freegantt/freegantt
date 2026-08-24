# FreeGantt

Framework-free TypeScript Gantt library, library-first. The spec is `plans/00`–`04` — read the relevant doc before changing anything it governs; locked decisions D1–D12 are in `plans/00-overview.md` and are not revisited casually. Work lands in vertical slices S0–S7 (`plans/03-slices.md`), in order, each ending with something visible in `harness/`. Follow Unlce Bob's (Robert C. Martin) clean code, and use well defined TypeScript types wherever possible and strong module boundries. Design for a clean easy to use API internally and externally.

## Hard rules

**Layers** (`plans/01` §1 — enforced by dependency-cruiser):
- `model/`, `time/`, `data/`, `layout/` are the mandatory DOM-free core: plain data + functions, no `document`/`window`/browser globals. (They ship to and run in the browser like everything else — but because they never touch the DOM they also run in plain Node, which is how they're unit-tested and how the future worker seam stays possible.) Only `render/`, `view/`, `interaction/`, `extensions/` may touch the DOM.
- `scheduling/` is DOM-free the same way, but it is **not** one of the mandatory core layers — it's where the first-party default scheduling plugin's pure engine lives (D3/D4, ADR 0002). `data/` has no static dependency on it: mutations resolve through a generic resolve hook (identity function when no plugin is installed, or the installed plugin's `schedule()`). A Gantt with no scheduling plugin never loads `scheduling/`.
- `scheduling/` and `render/view/interaction` never import each other — they meet only through `data/`'s resolve hook. Never put scheduling imports in render or view code.
- Only `api/` and `model/` types are public. Internals stay unreachable (sealed `exports` map).
- `model/` is types only: zero runtime beyond id/brand helpers, zero dependencies. `Dependency`/`DependencyType`/`DependencyId` and the per-task pin flag are scheduling-plugin-owned data, not `model/` (ADR 0002).

**Time** (`plans/01` §5):
- Storage is half-open `[start, end)`; display is inclusive via one formatting helper — no inline `end - 1` arithmetic.
- All zone-aware date arithmetic goes through `time/` in the project's IANA zone. (A *plain* time is a wall-clock reading with no zone attached — Temporal's term, and ours; see `CONTEXT.md`.)
- `time/` is the *only* place allowed to use `new Date()`/`Date.now()`, magic time constants (`86400000` etc.), or arithmetic on `Instant`. Everywhere else in `src/` these are forbidden — I10 lints this, scoped to `src/**`.

**Data** (`plans/01` §6):
- Every mutation goes through a transaction → the resolve hook (once) → one changeset (`{from, to}` per field). No exceptions, gestures included (one transaction per gesture, at commit). The resolve hook is the identity function when no scheduling plugin is installed, so this is not conditioned on scheduling being present — the shape holds either way.
- Undo records user edits + engine cascades atomically (when a scheduling plugin is installed and contributes cascades).
- No module-level singletons anywhere; two Gantt instances on one page must be fully independent.

**Scheduling** (`plans/01` §7 — first-party default plugin, not mandatory core, see ADR 0002):
- Occupies the resolve hook (D4) exclusively when installed; when nothing is installed, none of this runs.
- `schedule()` is pure and deterministic; never mutates input; policy never overwrites a user-proposed field.
- Propagation is a worklist loop — no recursion, ever (5,000-link chain fixture guards this).
- Conflicts become diagnostics; the engine never silently rewrites what the user asked for.

**Rendering / view** (`plans/01` §8):
- Authored vs. derived: tasks/dependencies are persisted; rows/items/geometry are recomputed and never persisted.
- Hot path (hover/selection/drag preview) = class toggles + transforms only; zero allocation, never rebuilds a frame.
- All time→pixel via the bound `TimeScale`; all scroll via the bound `ScrollModel`. No exceptions.
- Renderer output is text by default; raw HTML is explicit opt-in only.
- Reconciler scope is hard-bounded: attr/class/style/text + keyed children. Needing lifecycle hooks means the design is wrong — stop and discuss.

**Task kinds** (`plans/01` §2.5):
- `Task.kind` is authored, never derived from having children. Behavior per kind goes through the seams (policy, item emitter, renderer registry, capability resolver) — no `if (kind === ...)` chains outside them.
- Capabilities gate gestures *and* affordances from one resolution (I14).

**Dependencies** (`plans/04` §1):
- Two runtime deps, each confined to one façade file: `alien-signals` (the `data/` reactivity façade) and `temporal-polyfill` (`time/zone.ts`, `/fns/*` entry points only — see `docs/adr/0001`). No other file may import either.
- Adding a third runtime dep needs a `plans/04` §1 table entry justifying it and a façade to confine it. Rejected candidates and reasons are in `plans/04` §1.1 — check there before proposing one.

**API** (`plans/02`):
- Nothing in the public surface throws "not implemented". Every mutating interaction gets a cancelable `before*` event. Every config key is live-reconfigurable. Naming: greppable pairs (`beforeTaskMove`/`taskMove`), one name per concept. Names must be specific enough to disambiguate at a glance (Uncle Bob's naming rules) — a generic word covering more than one concept in the codebase is a bug, not a style nit. Cautionary example (#7): "chart" meant both the public `Gantt` instance and an internal `view/` class; nothing said which, and it stalled a real review (#4). Fix was to retire "chart" entirely — the public concept is `Gantt`, the internal shell is `GanttShell` — not to pick a synonym and hope it reads clearly from context.
- Vendor Gantt product names never appear in specs, docs, or code.
- `harness/` is the library's first consumer, and sits outside the `src/**` lint scope by design — consumer code, not library code. That is not an exemption to spend: review `harness/main.ts` on every commit, changed or not, because code there that breaks a library rule or re-derives what the library already computes is an API gap even when no lint fires. Record it against the current slice and close it in `src/` — tidying the harness only hides the evidence. A clean `harness/main.ts` is the expected steady state, not a sign there is nothing to review: the last two gaps it exposed were `rowHeight: 32` restating `api/gantt.ts`'s default, and a hand-built `TimeScaleModel` standing in for `range: 'fitProject'`.

## Workflow

- TS strict (with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), pnpm, Vite, Vitest (pure tests run in Node with no DOM env), fast-check for property tests.
- The invariants table (`plans/01` §11, I1–I14) is the review checklist; every invariant maps to a CI job.
- Slice gates (`plans/00` §4) must pass before the next slice starts.
