# FreeGantt — Invariant → Guard Matrix

The single table a reviewer (human or agent) checks against. Every rule from `plans/01` §11 and every hard rule in `CLAUDE.md` appears exactly once, with the mechanism that proves it and the CI job that runs it.

**Status vocabulary**

| Status | Meaning |
|---|---|
| `AUTO` | A machine check fails the build on violation. No judgment involved. |
| `AUTO-PARTIAL` | A machine check covers the common/mechanical violations; a named residue needs review. The residue is spelled out. |
| `REVIEW-ONLY` | No honest mechanical check exists. The reason is stated. Reviewers own it. |
| `PLANNED (Sn)` | The guard is designed here but lands with slice *n*, because its subject doesn't exist yet. |

---

## 1. The numbered invariants (`plans/01` §11)

| # | Invariant | Mechanism | CI job | Status |
|---|---|---|---|---|
| I1 | Layer imports match `01` §1 exactly | `dependency-cruiser` graph (`03` §1) — one `forbidden` rule per absent arrow; `no-restricted-imports` mirror for editor speed | `boundaries`, `lint` | `AUTO` |
| I2 | No module-level singletons; two Gantt instances coexist | `freegantt/no-module-level-state` (`02` §3.6) + two-Gantt isolation test mounting into two hosts and asserting cross-independence of scroll, selection, and data revision | `lint`, `test:dom` | `AUTO` |
| I3 | `scheduling/` contains no recursive propagation | `freegantt/no-recursion-in-scheduling` (`02` §3.8) — self-call + intra-package call-graph cycle detection; 5,000-link chain fixture; dev-mode depth assert | `lint`, `test:node` | `AUTO` |
| I4 | `schedule()` never mutates input; policy never moves a proposed field | fast-check property: deep-freeze the request, assert no throw + structural equality of a pre-call clone; second property asserts `patch` never contains a field present in `proposed` for that entry; dev-mode assert in `schedule()` itself | `test:node` | `AUTO` |
| I5 | Hot path allocates nothing, never rebuilds a frame | *Proxies:* (a) `applyState` never calls `computeFrame` — assertion via a spy in the hot-path test; (b) `freegantt/no-allocation-in-hot-path` bans object/array/`new`/`.map`/`.filter`/template literals inside functions in files marked `/** @hot-path */`; (c) perf test measures `performance.measureUserAgentSpecificMemory`-free proxy: N=10k `applyState` calls under a fixed heap-growth ceiling. **Residue:** V8 can allocate where source shows none | `test:dom`, `perf` (non-blocking pre-S6) | `AUTO-PARTIAL` |
| I6 | One transaction per gesture, at commit | Interaction test per controller: drive a synthetic pointer sequence, count `change` events (must be exactly 1) and assert its `origin: 'user'` and that no `change` fired before `pointerup` | `test:dom` | `PLANNED (S4)` |
| I7 | Undo reverts user + engine effects atomically | fast-check: random mutation sequences over a fixture, undo-all, assert `toJSON()` byte-identical to the start; a second property runs the same with dependencies present so engine cascades participate | `test:node` | `PLANNED (S2/S3)` |
| I8 | `Item.id` deterministic across layout passes | Layout test: run `computeFrame` twice over identical input plus once after an unrelated mutation; assert id sets and per-item ids stable; snapshot the frame | `test:node` | `AUTO` (S0) |
| I9 | Grid and timeline share one row geometry | Pixel-equality test (`[S1-A2]`, `view/gantt-shell.test.ts`): both panes position from the same `frame.rows`/`frame.bars` at a fractional row height, read live from the DOM, asserted equal; plus `freegantt/no-flow-layout-rows` (`02` §3.10) banning height *measurement* in pane code. **Residue:** the rule does not catch an assignment to `style.height` not sourced from `frame.rows[i].height` — same shape as I12's own residue, mitigated the same way (the layer graph makes a laundered value useless) | `test:dom`, `lint` | `AUTO-PARTIAL` |
| I10 | No time math outside `time/`; no magic time constants | Three rules: `no-magic-time-constants`, `no-date-outside-time`, `no-instant-arithmetic` (type-aware) — `02` §3.1–3.3 | `lint` | `AUTO` |
| I11 | Public `.d.ts` contains nothing unimplemented | `api-extractor` report committed to the repo; CI fails on diff. Plus `freegantt/no-not-implemented` banning `throw new Error(/not implemented/i)` repo-wide, and a test that instantiates the public surface and calls every zero-arg method | `api-report`, `lint`, `test:dom` | `AUTO-PARTIAL` (S2+ for gating) |
| I12 | All pixels-from-time via `TimeScale`; all scroll via `ScrollModel` | Scroll half is `AUTO`: `freegantt/no-scroll-outside-scroll-model` (`02` §3.4). Time→pixel half is `AUTO-PARTIAL`: `freegantt/no-time-to-pixel-math` flags arithmetic mixing an `Instant`/`Duration`-typed value with an identifier matching `/px|width|left|x$/i` outside `time/`. **Residue:** a conversion laundered through untyped locals. Mitigated by the `TimeScale`-only import path in the layer graph | `lint` | `AUTO-PARTIAL` |
| I13 | Renderer output text-safe by default | `freegantt/no-inner-html` (`02` §3.9) allowlisting exactly one file; reconciler unit test feeding `<img onerror>` strings through the default path and asserting `textContent` semantics + an opt-in test asserting the flag path does insert markup | `lint`, `test:dom` | `AUTO` |
| I14 | Gesture arming and affordances from one capability resolution | Test: for each kind × each capability, assert the DOM affordance presence and the controller's `canArm` result come from the same resolver call (spy asserts a single resolver invocation feeds both); table-driven over the shipped kinds + one host-defined kind | `test:dom` | `PLANNED (S4)` |

---

## 2. `CLAUDE.md` hard rules not covered by a numbered invariant

| Rule (source) | Mechanism | CI job | Status |
|---|---|---|---|
| Pure layers are DOM-free (`01` §1) | `no-restricted-globals` (document, window, navigator, location, HTMLElement, …) scoped to `src/{model,time,data,scheduling,layout}`; `no-restricted-types` for DOM lib types; **plus** the `test:node` project running with no DOM env at all — a pure module touching the DOM fails by construction | `lint`, `test:node` | `AUTO` |
| `scheduling/` ↮ `render`/`view`/`interaction` (D4) | dependency-cruiser rules in both directions | `boundaries` | `AUTO` |
| Only `api/` + `model/` types public (`01` §1) | Sealed `exports` map + a resolution test that asserts `import('freegantt/data')` and friends **reject** against the built package | `build`, `test:node` | `AUTO` |
| `model/` is types only, zero deps | dependency-cruiser: `model/` may import nothing; `freegantt/model-is-types-only` — bans value declarations in `src/model/**` except the id/brand helper allowlist | `boundaries`, `lint` | `AUTO` |
| Storage half-open; no inline `end - 1` | Covered by `no-instant-arithmetic` (any arithmetic on an `Instant`-typed value outside `time/` is banned, which subsumes `end - 1`); one `formatEndInclusive` helper is the only sanctioned path | `lint` | `AUTO` |
| Every mutation through a transaction (`01` §6) | `freegantt/no-store-mutation-outside-transaction` (`02` §3.7) + store mutators requiring a transaction token parameter that only `data/transaction.ts` can mint (types do half the work) | `lint`, `typecheck` | `PLANNED (S2)` |
| One transaction per gesture at commit | = I6 | `test:dom` | `PLANNED (S4)` |
| Renderer scope bounded (no lifecycle hooks) | `freegantt/reconciler-scope` — bans identifiers matching `/mount|unmount|willUpdate|didUpdate|lifecycle|component/i` inside `src/render/dom/reconciler*.ts`; module-header invariant comment required by `freegantt/require-invariant-header` | `lint` | `AUTO-PARTIAL` |
| `Entry.kind` never derived; no `if (kind === …)` outside seams | `freegantt/no-kind-conditional` (`02` §3.5) with a four-file seam allowlist | `lint` | `AUTO` |
| Exactly one runtime dependency | `freegantt/no-external-runtime-import` (only `src/data/reactivity.ts` may import `alien-signals`) + a package-shape test asserting `dependencies` deep-equals `{ 'alien-signals': <range> }` and `peerDependencies` is absent | `lint`, `test:node` | `AUTO` |
| Greppable event pairs; every `before*` has a partner | Type-level: events are one exported union; a test derives `Before<T>`/notification pairings from the union and asserts bijection over the pair list, plus asserts each declared name is emitted somewhere in `src/` (grep over emit sites) | `test:node` | `PLANNED (S2)` |
| Every config key live-reconfigurable | Table-driven test: for each key in the config type, assign a second valid value post-mount and assert no remount (mount spy) and an observable effect | `test:dom` | `PLANNED (S1)` |
| Vendor Gantt product names absent | `scripts/check-vendor-names.mjs` — case-insensitive wordlist grep over `src/`, `docs/`, `plans/`, `harness/`, commit messages of the PR range | `vendor-names` | `AUTO` |
| No `new Date()` / `Date.now()` | `no-date-outside-time` | `lint` | `AUTO` |
| Determinism of `schedule()` | `no-date-outside-time` + repo-wide `Math.random` ban + a property test asserting two runs over the same request give identical results, and that key insertion order doesn't change output (shuffled input arrays) | `lint`, `test:node` | `AUTO` |
| No persisting derived data | dependency-cruiser: `data/serialization` may not import `layout/`; `freegantt/no-derived-in-json` bans `Row`/`Item`/`GeometryFrame` type references in `src/data/serialization/**` | `boundaries`, `lint` | `AUTO` |
| One `sync(frame)` per animation frame | `freegantt/raf-single-owner` — `requestAnimationFrame` allowed in exactly one file; test asserts N mutations in one tick produce one `sync` | `lint`, `test:dom` | `PLANNED (S2)` |
| Slice gates (`plans/00` §4) pass before next slice | `scripts/slice-gate.mjs <n>` runs the acceptance-linked jobs for slice *n* and prints a checklist; a `gate` CI job runs it for the slice named in `.slice` | `gate` | `AUTO-PARTIAL` (the "harness shows X" items stay human) |

---

## 3. Honest gaps

Three things in this table are not fully mechanical, listed so they're consciously owned rather than assumed:

1. **I5 allocation-freedom** — source-level allocation is lintable; engine-level allocation is not observable from a test without flaky heap probes. The proxies (no `computeFrame` call, no source-level allocation, heap-growth ceiling) catch every *design* regression; a micro-regression inside V8 will not be caught, and that is acceptable.
2. **I12 time→pixel** — a determined author can launder a conversion through `const a: number = someInstant; a * scale`. The layer graph makes the *result* useless (nothing but `TimeScale` legitimately owns the px-per-ms factor), so the residue is small and review-visible.
3. **"Harness shows something a human can poke"** — every slice's visible acceptance item (`plans/03`) is a human check by definition until Playwright lands at S4; from S4 the harness pages get smoke tests, which converts most of these to `AUTO`.
