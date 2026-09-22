# FreeGantt — Boundaries, Types, and Test Rig

The guards that aren't lint rules: the layer graph, the type-system settings that make whole bug classes unrepresentable, the sealed package surface, and the Vitest project split that proves the purity claims by construction.

---

## 1. `dependency-cruiser` — the layer map as executable config

The layer map is a diagram with 16 arrows. The config transcribes it **literally and by name**, so a reviewer can verify it line by line.

### 1.1 Approach: allowlist, not denylist

A denylist ("scheduling must not import render") only forbids the violations we thought of. We instead declare, per layer, the complete set of layers it may reach, and forbid everything else:

```js
// .dependency-cruiser.cjs  (excerpt — shape, not the full file)
const ALLOWED = {
  model:       [],
  time:        ['model'],
  data:        ['model', 'scheduling', 'time'],
  scheduling:  ['model', 'time'],
  layout:      ['model', 'time'],
  render:      ['model', 'time', 'layout'],
  view:        ['model', 'time', 'layout', 'data', 'render'],
  interaction: ['model', 'time', 'data', 'view'],
  extensions:  ['model', 'time', 'data', 'view', 'interaction'],
  api:         ['model', 'time', 'data', 'view', 'interaction', 'extensions'],
};
```

From that one object the config generates:

| Rule | Severity | What it catches |
|---|---|---|
| `layer-<x>-may-only-reach` (one per layer) | error | Any arrow absent from the layer map |
| `no-circular` | error | Cycles between or within layers |
| `no-orphans` | warn | Dead modules (excluding `model/`, type-only files) |
| `not-to-dev-dep` | error | A runtime import of a devDependency |
| `only-data-imports-reactive-dep` | error | `alien-signals` reached from anywhere but `src/data/reactivity.ts` |
| `no-deprecated-core` | error | Node builtins in `src/` (the library must run in a browser) |
| `pure-may-not-reach-dom-layers` | error | Pure layers may not reach rendering or interaction layers |
| `harness-public-api-only` | error | `harness/`, `e2e/` or `fixtures/` reaching an internal under `src/` by a relative path |

The `pure-may-not-reach-dom-layers` rule states the boundary between pure and visual layers in the diagram's own vocabulary for a clear error message.

`harness-public-api-only` is the one rule in this file scoped outside `src/`: it treats `harness/`, `e2e/` and `fixtures/` as the library's first consumers, so a workaround inside them meets the same sealed `exports` map a real published package meets, and cannot silently reach an internal (CLAUDE.md's stop rule). **What it actually enforces is narrower than "never a relative path."** dependency-cruiser matches *resolved* paths, and the `freegantt` alias (`vite.config.ts`) resolves to `src/api/index.ts` — the same file a hand-written `'../src/api/index.js'` resolves to. So `pathNot: '^src/api/index\.ts$'`, the clause that lets the alias through, lets that hand-written path through with it; the rule catches a relative reach *past* the index, not a relative path *naming* the index. Closing that second case is `eslint.config.js`'s `no-restricted-imports`/`no-restricted-syntax` block, scoped to the same three folders — it reads the specifier text an author wrote, which is the thing a resolved-path tool cannot see. The two guards are belt and braces; `pnpm boundaries` scans all four folders for the first, `pnpm lint` for the second, and `scripts/guard-red-test.mjs` proves both actually block a violation.

### 1.2 Deep-import discipline

Modules import through their layer's `index.ts` barrel only (`layout/index.ts`, not `layout/rows/sort.ts`); enforced by a `forbidden` rule on cross-layer paths with more than one segment. Intra-layer imports go direct — barrels inside a layer create cycles.

### 1.3 The red test

A CI step that proves the guard is armed:

```
scripts/guard-red-test.mjs
  1. write src/scheduling/__redtest__.ts containing: import '../render/dom/index.js'
  2. run depcruise --config .dependency-cruiser.cjs src   → must exit non-zero
  3. run eslint on that file                              → must exit non-zero (B11 mirror)
  4. delete the file; fail the job if either exited zero
```

This is generalized to all guards in `04-hooks-and-ci.md`; the layer boundary keeps its own dedicated step for early detection.

---

## 2. `tsconfig.json` — bug classes made unrepresentable

The following TypeScript configuration flags enforce key guarantees:

| Setting | Why, for this codebase |
|---|---|
| `strict: true` | baseline |
| `noUncheckedIndexedAccess` | `entriesById[id]` is `Entry \| undefined`. The normalized stores are index-lookup-heavy; this is the flag that stops the "it was there a frame ago" class |
| `exactOptionalPropertyTypes` | a changeset's `from: undefined` (field was absent) and an absent `from` key are different facts. Without this flag they collapse |
| `verbatimModuleSyntax` | type imports never emit runtime imports — load-bearing for `model/` being types-only and for tree-shaking |
| `isolatedModules` | keeps every file independently transpilable (Vite/esbuild parity) |
| `noPropertyAccessFromIndexSignature` | `props.team` on an unknown-shaped `TProps` must be deliberate |
| `skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule` | ordinary hygiene; no invariant rides on them |

**Not set, although this page once claimed them:** `noImplicitOverride`,
`noFallthroughCasesInSwitch` and `erasableSyntaxOnly` are absent from `tsconfig.json`, and
Nothing in `src/` depends on them today. Turning them on
is a reasonable small change; claiming them while they are off is not.

**Two type-level guards worth calling out as design, not config:**

- **The `Instant` brand** is what makes `no-instant-arithmetic` possible at all. It is a type-only construct with zero runtime cost, and it is the reason `time/` can be the sole owner of zone-aware date math.
- **The `TxToken`** makes "mutation outside a transaction" a *type* error, not just a lint error. Same trick: a non-exported branded type minted by exactly one function.

`typecheck` runs `tsc --noEmit` over `src/`, `harness/`, `test/`, `fixtures/`, `e2e/` and `playwright.config.ts` — the whole `include` list. Tests are not excused from strictness, because a test that compiles under looser rules proves less than it claims.

---

## 3. The sealed public surface

### 3.1 `exports` map

Only `.` resolves for imports:

```jsonc
{
  "exports": { ".": { "types": "./dist/api/index.d.ts", "import": "./dist/api/index.js" } },
  "sideEffects": ["src/view/styles.ts"],
  "type": "module"
}
```

`sideEffects` is a one-file allowlist, not `false`: `view/styles.ts`
injects the base stylesheet on import, so a bundler that drops it as dead code ships an unstyled
Gantt. Everything else in the package is side-effect free, which is what keeps tree-shaking real.

### 3.2 Tests that keep it sealed

| Check | Mechanism |
|---|---|
| Internals unreachable | `test:node` resolution test: `import('freegantt/data')`, `freegantt/dist/data/index.js`, `freegantt/src/*` — each must reject. Run against a `pnpm pack`ed tarball installed into a temp dir, not against the source tree (only the packed artifact tells the truth) |
| Public surface unchanged without notice | `api-extractor` report (`etc/freegantt.api.md`) committed; CI regenerates and fails on diff. The diff **is** the semver conversation (I11) |
| Nothing unimplemented in the surface | `no-not-implemented` lint (B8) + a smoke test constructing `Dataset`/`Gantt` and invoking every zero-arg public method |
| Runtime deps stay at two | Package-shape test: `dependencies` deep-equals `{ 'alien-signals': <range>, 'temporal-polyfill': <range> }`; `peerDependencies`/`optionalDependencies` absent; `bundledDependencies` absent. The test does not exist yet — `01-invariant-guard-matrix.md`'s own row says so; `no-external-runtime-import` is what holds the line today |
| Tree-shakeability | `size-limit` entry importing only `Dataset` must not pull in `interaction/` or `extensions/` |

---

## 4. Vitest projects — purity by construction

**The pure layers are tested in an environment where the DOM does not exist.** This is a critical test-rig decision.

```js
// vitest.config.ts (shape)
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'pure', environment: 'node',
                include: ['src/{model,time,data,scheduling,layout}/**/*.test.ts', 'test/pure/**/*.test.ts'],
                setupFiles: ['test/setup/assert-no-dom.ts'] } },
      { test: { name: 'dom', environment: 'happy-dom',
                include: ['src/{render,view,interaction,extensions,api}/**/*.test.ts', 'test/dom/**/*.test.ts'] } },
    ],
  },
});
```

`assert-no-dom.ts` does one thing: define `document`/`window`/`navigator` as getters that throw with a message citing D4. In plain Node they'd be `undefined` and a violation would surface as a confusing `TypeError`; this way the failure names the rule.

**Consequence worth stating plainly:** a pure module that acquires a DOM dependency fails its own unit tests immediately, before lint, before CI, before review. That is the earliest possible layer, and it costs one setup file.

### 4.1 Standing tests that live outside any one slice

These are guard tests, not feature tests; they belong to the guardrail system:

| Test | Invariant |
|---|---|
| `test/guards/two-gantt-isolation.test.ts` | I2 |
| `test/guards/bar-identity.test.ts` | I8 |
| `test/guards/package-shape.test.ts` | one runtime dep, exports sealed |
| `test/guards/null-backend-in-node.test.ts` | pure pipeline runs headless |
| `test/guards/schedule-purity.property.ts` | I4 |
| `test/guards/undo-roundtrip.property.ts` | I7 |
| `test/guards/chain-5000.test.ts` | I3 |
| `test/guards/row-geometry-parity.test.ts` | I9 |
| `test/guards/event-pair-bijection.test.ts` | event naming rules |
| `test/guards/live-reconfigure.test.ts` | every config key live |
| `test/guards/hot-path-no-frame.test.ts` | I5 |
| `test/guards/capability-single-resolution.test.ts` | I14 |

Keeping them in `test/guards/` rather than beside their modules is deliberate: they are the executable form of the invariant list, and a reviewer should be able to read that directory as the complete set.

---

## 5. Fixtures as guards

Two fixtures carry enforcement weight beyond being test data:

- **`fixtures/chain-5000.ts`** — a 5,000-link dependency chain. Its only job is to blow the stack if propagation ever becomes recursive (I3). It is generated by a function, committed as a generator not as data.
- **`fixtures/golden/*.json`** — scheduling request/result pairs. A policy change that alters a golden result is *allowed*, but it must show up as a reviewed diff to the committed expectation — the engine may never change behavior invisibly (principle 6, diagnostics over silent fixes).

Golden files are regenerated with `pnpm test:golden --update`, which is deliberately not run in CI.
