# FreeGantt — Implementation Plan

Companion to `03-slices.md`: how we actually start. Dependency decisions first (they're architectural — D12 budgets a small, explicitly justified set of runtime dependencies), then repo bootstrap order, tooling configuration, and the CI pipeline that makes the invariants real from commit one.

---

## 1. Runtime dependencies

Two, as budgeted by D12 — each earns its place here in writing:

| Package | Role | Why this one |
|---|---|---|
| `alien-signals` | The reactive primitive behind the `data/` façade (`01` §6) | Smallest (~1–2 KB) and fastest signals implementation available; it is the engine under Vue's reactivity rewrite, so it is battle-hardened despite its size. Its API is deliberately spartan (`signal`/`computed`/`effect`, batching) — that's fine, because **only the façade file ever sees it**. If it ever disappoints, `@preact/signals-core` is the designated drop-in swap; the façade makes that a one-file change, and a CI test mounts two Gantt instances to prove instance isolation regardless of the primitive (I2). |
| `temporal-polyfill` (`/fns/*` entry points only) | Zone-aware date arithmetic behind the `time/` façade (`01` §5) — `time/zone.ts` | Hand-rolled `Intl.DateTimeFormat.formatToParts` + fixed-point iteration (the original approach here) had no documented behavior for DST fold (ambiguous plain time, e.g. 1:30 AM on the fall-back day) or gap (nonexistent plain time, e.g. 2:30 AM on the spring-forward day) — both untested and, on audit, incidentally rather than deliberately resolved. `temporal-polyfill` implements Temporal's explicit disambiguation model (`compatible`/`earlier`/`later`/`reject`), giving fold/gap a documented, tested policy. Pinned `^1.0.4` (not exact) — CI's test suite runs on every dependency bump, so patch/minor updates (including security fixes) land automatically and get caught by the DST fold/gap and multi-zone round-trip tests before merge; ~95% of the package's commits are from one maintainer (arshaw, FullCalendar's author), a real bus-factor risk accepted deliberately, not overlooked. `time/`'s public surface (`instant`, `toPlain`, `fromPlain`, `startOfDay`, `addDays`, `diffDays`) is unchanged; only `zone.ts` imports the package, via its tree-shaken `/fns/*` entry points (`sideEffects` scoped so only the global-polyfill entry is side-effecting), so the swap to native `Temporal` stays a one-file change and the DOM-free layering (`01` §1) is untouched. Note: `temporal-polyfill@1.0.4`'s `ZonedDateTime.diffDays`/diff-by-day-unit path throws (`prepareZonedEpochDiff is not a function`) for every zone, including UTC — `zone.ts`'s `diffDays` routes through `PlainDate.diffDays` instead, which is unaffected; worth re-checking against `zone.test.ts` when the version bumps. |

### 1.1 Considered and rejected (the reasoning is the deliverable)

| Candidate | Verdict | Why not |
|---|---|---|
| `d3-scale` + `d3-time` | **No** | d3-time does zone-aware date arithmetic in the *environment's local zone* or UTC — it cannot work in an arbitrary dataset-owned IANA zone, which is the entire point of D6. Our `TimeScale` is linear interpolation (trivial, ~30 lines we must own anyway for the D9 seam); the genuinely hard part — zone-aware, DST-correct tick and header generation — is precisely the part d3 doesn't solve. We'd carry the dependency *and* still write the hard code. |
| `luxon` / `date-fns` + `tz` / `dayjs` | **No** | Still no: none of these give the explicit fold/gap disambiguation control `time/zone.ts` needs (see the `temporal-polyfill` row above), and each is a general-purpose date library whose bulk we'd mostly never use — a worse fit than a Temporal-shaped API that also happens to be the smallest option (below). |
| `@js-temporal/polyfill` | **No** | Right shape (it's the reference Temporal polyfill, so semantics are conservative and spec-first), wrong cost: no tree-shaking (single class hierarchy) and ~2.3–2.9x the gzipped size of `temporal-polyfill`'s tree-shaken `/fns/*` build for the same date-arithmetic need. We adopted `temporal-polyfill` instead (see the runtime-dependency table above) — same eventual native-`Temporal` migration path, lighter budget. |
| `lit-html` / `preact` / `solid` | **No** | The reconciler's scope is hard-bounded on purpose (`01` §8.1): attributes/class/style/text + keyed child recycling, driven by changesets that already say what changed. A view library brings a component model — the exact thing the scope boundary exists to keep out (D5). If we ever find ourselves needing lifecycle hooks, the documented answer is "adopt a framework," not "grow the reconciler." |
| `immer` | **No** | Our delta is the explicit `{ from, to }` changeset produced by transactions over normalized stores. Immer's draft/patch model is a different (and costlier) delta contract; adopting it would blur the one contract everything else (undo, sync, animation) consumes. |
| `zod` / `valibot` | **No** | Runtime validation exists at exactly two boundaries: mutation-API input and `fromJSON`. Hand-rolled typed guards keep errors in the `FreeGanttError` vocabulary (`02` §7) and keep the dependency budget tight and justified per-entry, not open-ended. |
| `eventemitter3` / `mitt` | **No** | A typed event bus over our fixed vocabulary (`02` §3) is ~40 lines. Owning it lets `before*` veto semantics (sync + async, suspension) be first-class instead of bolted onto a generic emitter. |

---

## 2. Dev dependencies

Dev-side, cost is measured in maintenance, not bytes — still kept lean. "Slice" = when it must be in place.

| Package | Purpose | Slice |
|---|---|---|
| `typescript` | strict mode per §3.1 | S0 |
| `vite` | dev harness + library build (lib mode) | S0 |
| `vitest` + `happy-dom` | unit/property tests; happy-dom for the few DOM-touching unit tests (faster than jsdom; real-browser truth comes from Playwright later) | S0 |
| `eslint` (flat config) + `typescript-eslint` | lint + the custom invariant rules (§3.3) | S0 |
| `dependency-cruiser` | the layer-boundary graph as executable config (I1) | S0 |
| `vite-plugin-dts` + `@microsoft/api-extractor` | bundled `.d.ts` + API report; the report diff is the I11 type-surface snapshot | **shipped** — build S0, report gating S2.7 (`etc/freegantt.api.md`, `pnpm api-report`) |
| `fast-check` | property tests: undo round-trips (I7), schedule purity (I4), JSON round-trip | **shipped (S2.6)** — `[S2-A1]` in `src/data/history.property.test.ts` |
| `@vitest/coverage-v8` | coverage gate (>90% on `scheduling/`, per S7 acceptance) | S7 |
| `playwright` | E2E on the harness; gesture tests beyond what happy-dom can honestly simulate | S3 |
| `@axe-core/playwright` | a11y checks in CI on harness pages | S5 |
| `size-limit` | bundle + tree-shaking budgets (S5 tree-shake test, S6 budget gate) | S5 |
| `prettier` | formatting; zero style debate in review | S0 |

Package manager: **pnpm**, Node LTS pinned via `engines` + `.nvmrc`. Versions: latest stable at bootstrap, then renovate-style upgrades — this doc records *choices*, not version pins.

---

## 3. Repo bootstrap (the S0 order of operations)

Guardrails land **before** the code they guard — each step is a reviewable commit.

### 3.1 Foundation

1. `pnpm init`; `package.json`: `"name": "freegantt"`, `"type": "module"`, `"sideEffects": false`, and the **sealed `exports` map from day one** — only `.` (api + model types) resolves; internals are unreachable so semver never accidentally covers them (`02` §7).
2. `tsconfig.json`: `strict`, plus the flags that catch real Gantt bugs: `noUncheckedIndexedAccess` (index lookups on stores), `exactOptionalPropertyTypes` (changeset `from`/`to` vs. absent), `verbatimModuleSyntax`, `isolatedModules`, `noPropertyAccessFromIndexSignature`.
3. Directory skeleton per `01` §1.1 — empty modules with header comments stating each module's invariant (the scheduling no-recursion header, the reconciler scope boundary), so the invariants exist in-repo before any implementation.

### 3.2 Boundary enforcement (before any real code)

4. `dependency-cruiser` config transcribing the §1 layer diagram literally: one `forbidden` rule per missing arrow, with the diagram's names. Includes the S0 acceptance "red test": CI job that temporarily adds a violating import and asserts the build fails, proving the gun is loaded.

### 3.3 Custom lint rules (inline local ESLint plugin in flat config)

| Rule | Invariant |
|---|---|
| ban magic time constants (`86400000`, `3600000`, `60000`, …) outside `time/` | I10 |
| ban `Date` construction and `Date.now` outside `time/` | I10 |
| ban `scrollLeft`/`scrollTop`/`scrollTo` outside the `ScrollModel` binding | I12 |
| ban arithmetic on `Instant`-typed values outside `time/` (type-aware rule) | I10 |
| `no-restricted-imports` backstop mirroring dependency-cruiser for editor feedback | I1 |

### 3.4 Test rig

5. Vitest config: `pure` projects run in Node (no DOM env at all — proving D4/pure-layer claims by construction), `dom` project runs happy-dom. The I2 two-Gantt-instances isolation test and the I8 item-identity test are written in this step against stubs, red-first.

### 3.5 First vertical

6. `model/` + `time/` minimal → `layout/computeFrame` minimal → `render/dom` + `render/null` → `api/` minimal → harness page with the 50-entry fixture. Exactly the S0 scope list in `03-slices.md`; acceptance checklist there governs.

---

## 4. CI pipeline (from the first PR)

One workflow, jobs in dependency order — everything here is an S0 deliverable except where marked:

```
typecheck → lint (eslint + custom rules) → boundaries (depcruise) → test (node) → test (dom)
        → build (lib + harness) → api-report diff (S2+) → size-limit (S5+) → e2e + axe (S3+/S5+)
```

Every invariant in `01` §11 must name the CI job that enforces it; an invariant without a job is a TODO, tracked in the table itself.

---

## 5. What we deliberately do not set up yet

- **Monorepo / package splitting** — one package until demand proves otherwise (`01` §1.1).
- **Changesets/release tooling, docs site generator** — S6 scope; the harness pages are the docs seed until then.
- **Playwright component testing, visual regression** — considered at S3 when gestures land; not before there's something to regress.
- **Worker build for `schedule()`** — only if measurement with the S7 plugin installed demands it (D2).
