# S1.11 — Close the gate

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.11 · **Issue:** #1 · **Closes:** #33 (as a recorded deferral), #41, #64 · **Baseline:** `main` @ `33594ed` (S1.10 merged, PR #73)
**Governed by:** [S1 API conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) — names, geometry types, typed errors, `batch()`.
**Supersedes:** the [S1.11 issue comment](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400111651) and `plans/temp_todo_for_s1-close.md` §7, wherever they disagree. §2 records every decision and which finding it closes.

This directory is the settled spec for S1.11, in the same form as [`plans/s1.10-theming-and-a11y/README.md`](../s1.10-theming-and-a11y/README.md).

S1.11 adds no rendering behaviour. It makes the S1 → S2 gate a **command instead of an opinion**, and it closes the vocabulary debt S1 accumulated. Two of its findings are load-bearing enough to state before anything else:

1. **The gate design published in the issue comment does not work.** `vitest -t` and `playwright -g` take *regexes*. Measured on this repo at `33594ed`: `-t "[S1-A2]"` runs **62 of 83** dom tests, because `[S1-A2]` is a character class. Escaped to `-t "\[S1-A2\]"` it runs 1 — but for an id that does not exist yet it runs **0 tests and still exits 0**. A gate built as written would report every check ✔ on a repo where none of the five acceptance tests exist. §2 D-S1.11-1.
2. **`docs/01-invariant-guard-matrix.md` overstates what is enforced.** Thirteen `freegantt/*` rules named in `docs/01`/`docs/02` have no file in `eslint/rules/`, and seven of those rows carry status `AUTO` — "enforced today". `test/guards/matrix-coverage.test.ts` (#43) checks the *CI job* column and never looks at the *Mechanism* column, so nothing catches it. §2 D-S1.11-11.

---

## 0. Scope calls — confirmed

The S1.11 comment and `temp_todo` §7 were written before S1.8, S1.9 and S1.10 shipped. Six of their lines name things that no longer exist, or ask for work that has since landed.

| # | Question | Answer |
|---|---|---|
| **Q1** | **`scroll.xOnly()` in the four-line D9 demo** — `temp_todo` C2 already flags it as cut at S1.5. | **Confirmed cut, and the demo already exists.** `harness/scroll-sync.ts` has shipped since S1.5 and is four statements sharing one `ScrollModel` on both axes — exactly `plans/02` §5. S1.11 writes no new D9 page; it changes one argument on the existing one and puts `[S1-A4]` on an e2e test against it. §2 D-S1.11-4. |
| **Q2** | **`seededEntries(...): Entry[]`** — the comment's signature. Does it match the fixture vocabulary S0 shipped? | **No — it collides.** `fixtures/` already distinguishes `sampleEntryInputs: EntryInput[]` (what the harness passes) from `sampleEntries: readonly Entry[]` (what pure tests read). A generator named like the second but consumed like the first breaks the pairing. It becomes `seededEntryInputs(...): EntryInput[]`. §2 D-S1.11-2. |
| **Q3** | **`SeededEntryOptions.timeZone`** — the comment carries one. What does a zone mean on a value that stores no zone? | **Nothing — it is dropped.** Entries carry no zone; a `Dataset` does. The generator emits UTC-midnight-aligned instants, which is what `fixtures/sample-project.ts` already does with `Date.UTC`, and the caller passes its own `timeZone` to `Dataset`. The alternative — re-exporting `addDays`/`startOf` from `api/` so the fixture can step dates in an arbitrary zone — is a public-surface widening with no caller in S1. §2 D-S1.11-2. |
| **Q4** | **Phase 5 of `temp_todo` §7 (e2e must actually run).** Still open? | **Closed already.** `.githooks/pre-push` runs `pnpm test:e2e` after `pnpm verify`, documented in `docs/04` §3.1. Confirmed at baseline. S1.11 only confirms the gate's e2e checks pass through that path. CI triggers stay `workflow_dispatch:`-only — a deliberate, recorded decision, not an omission. §2 D-S1.11-12. |
| **Q5** | **Does `[S1-A1]` need a new harness page, or can it use an existing one?** Not asked in the comment. | **A new page.** `index.html` renders the 50-entry fixture and its e2e tests assert against that count; `zoom.html` exposes `window.__gantt` for imperative driving. Neither can host 5,000 entries without breaking its own tests. `harness/large-dataset.html` is new, at `zoom: 'preset'` so the content is wider than the pane — the only configuration that exercises the horizontal window. §2 D-S1.11-5. |
| **Q6** | **What remains of #41 (harness owns pane CSS)?** S1.8 closed the `overflow: auto` half. | **The `.fg-*` half, and it splits in two.** Three harness pages hand-write `.fg-tick { top: 0 }` and `.fg-row { left: 0 }` — compensating for a library omission, so that half is fixed in `src/`. The typography (`font-size`, `padding`, `line-height`, ellipsis) is level-1 and stays harness-owned. `.fg-header { height: 20px }` restates `--fg-header-height`'s own default and is deleted. §2 D-S1.11-8. |

Not a question, and settled outside this document: **#64's naming verdict** (`host` → `container` for the element, `host` → `consumer` for the consuming application) and its placement **inside S1.11**. Both were decided by the repository owner after the naming test in §2 D-S1.11-6.

---

## 1. User stories

Acceptance for each story is the checkbox under it — the only copy of this checklist.

- **U1.** (reviewer) I want to know whether S1 is finished. I run `pnpm gate` and read five lines, each naming an acceptance box from `plans/03-slices.md` and each backed by a test that actually ran.
  - [x] `node scripts/slice-gate.mjs` prints an `S1 → S2` gate with six checks and `human: []`, and exits non-zero if any check fails (`test/guards/slice-gate.test.ts`).
- **U2.** (reviewer) I delete the body of `[S1-A2]`'s test and re-run the gate. It goes red. A gate that stays green when its subject is removed is worse than no gate.
  - [x] Every id-addressed check fails when the id is absent from the source, and fails when the tagged test fails (`test/guards/slice-gate.test.ts`, both directions).
- **U3.** I open a 5,000-entry Gantt and scroll it. The DOM holds a bounded number of rows the whole time, not 5,000.
  - [x] `[S1-A1]` — `e2e/large-dataset.spec.ts`: node count bounded by window + overscan, and the id set moves after a scroll.
- **U4.** I give two Gantt instances the same `ScrollModel` and the same `TimeScaleModel`. Scrolling one moves the other, on both axes, with no code between them.
  - [x] `[S1-A4]` — `e2e/scroll-sync.spec.ts`: a scroll on one instance moves the other in x **and** y.
- **U5.** (maintainer) I read `docs/01-invariant-guard-matrix.md` to learn what is enforced today. Every rule it names as `AUTO` exists.
  - [x] `test/guards/matrix-coverage.test.ts` asserts every `freegantt/*` rule on an `AUTO`/`AUTO-PARTIAL` row is registered in `eslint/rules/index.cjs`; `PLANNED (Sn)` rows are exempt.
- **U6.** (maintainer) I search the codebase for `host`. Every hit means one thing.
  - [x] `host` appears nowhere in `src/`, `harness/`, `fixtures/`, `e2e/`, `plans/`, `docs/`, `CONTEXT.md` or `README.md` except as historical record in `docs/adr/**` (`test/guards/retired-words.test.ts`).
- **U7.** (maintainer) I search for `Project`. Same answer — ADR 0004 retired it, and the tree agrees.
  - [x] `fixtures/sample-project.ts` is `fixtures/sample-dataset.ts`; the same guard covers `Project` outside `docs/adr/**`.

---

## 2. Decisions

Each states the alternative it beat and, where one exists, the finding it closes.

### D-S1.11-1 — Acceptance ids are escaped patterns, and the gate proves the id exists before it runs anything

The S1.11 comment's gate calls `pnpm vitest run --project dom -t "[S1-A2]"`. Both runners treat the pattern as a **regex**, so `[S1-A2]` is a character class matching any one of `S`, `1`, `-`, `A`, `2`. Measured at `33594ed`:

| Command | Tests run | Exit |
|---|---|---|
| `vitest run --project dom -t "[S1-A2]"` | **62 passed**, 21 skipped | 0 |
| `vitest run --project dom -t "\[S1-A2\]"` | 1 passed, 82 skipped | 0 |
| `vitest run --project dom -t "\[S1-A4\]"` *(id does not exist)* | **0 passed**, 83 skipped | **0** |
| `playwright test -g "\[S1-A4\]"` *(id does not exist)* | 0 | **1** (`Error: No tests found`) |

Two independent failure modes, and the gate as designed hits both. Unescaped, the check labelled "grid/timeline row tops pixel-identical (I9)" is in fact running most of the dom suite and would stay green if `[S1-A2]` were deleted. Escaped, an id that was never written passes silently, because vitest treats a filtered-to-nothing run as success while Playwright does not.

**Every pattern is escaped, and every check is two steps:**

1. **Assert the id exists in a test title.** A fixed-string search (`grep -rlF "[S1-A2]" src e2e`) over the source. No match is a hard fail with a message naming the missing id.
2. **Run the escaped pattern** in each runner the id is declared to live in.

Rejected: relying on `--passWithNoTests=false`. It governs whether *test files* were found, not whether the name filter matched anything — the 0-passed/exit-0 row above is with the default config. Rejected: parsing `--reporter=json` to count executions. It is heavier, and it fails for a reason the reader must decode from JSON rather than from a sentence.

Rejected: letting the gate discover each id's runner from the file path the grep found. It removes a real signal — a test that migrated to the wrong runner (an acceptance box that quietly stopped being an e2e test, which is the exact downgrade the comment's own revision had to correct for A1) would be silently accepted. The runner list stays declarative.

The `--project` flag is also dropped: `pnpm vitest run -t "\[S1-A3\]"` runs the whole workspace, so an id may live in `pure` or `dom` and move between them without the gate needing an edit.

### D-S1.11-2 — `seededEntryInputs`, returning `EntryInput[]`, with no `timeZone` option

Call site first, per CLAUDE.md:

```ts
new Dataset({ entries: seededEntryInputs({ count: 5000 }), timeZone: 'UTC' });
```

"a dataset whose entries are five thousand seeded entry inputs, in UTC" — true, and it reads the same as `sampleEntryInputs` beside it. `seededEntries` fails check 4 of the naming test: `sampleEntries` already names the *resolved* `readonly Entry[]`, so the same suffix on a function returning inputs makes one word mean two shapes.

`seed` is the load-bearing word and stays: a caller must know before using it in a snapshot or a perf spike that the same seed is the same 5,000 entries forever. A seeded LCG, never `Math.random`; a fixed default start instant, never `now()` — a fixture that drifts with the clock is not a fixture.

`timeZone` is dropped (Q3). Dates are UTC-midnight aligned through `Date.UTC`, which is what `fixtures/sample-project.ts` already does and which needs no library import at all. The alternative — re-exporting `addDays`/`startOf` from `api/index.ts` so the fixture could step dates in any zone — is recorded in §9 with the caller that brings it back, because it is a real gap: a consumer *authoring* dates today has `instant()` and nothing else. Nothing in S1 needs it, so S1 does not widen the surface to get it.

### D-S1.11-3 — `fixtures/sample-project.ts` is renamed; `Project` and `host` are guarded as retired words

ADR 0004 retired `Project`. `fixtures/sample-project.ts` is the last live carrier in the tree — eight import sites, plus its own header comment ("One realistic sample project"), `harness/index.html`'s body copy, and `e2e/harness.spec.ts`'s test title. The gate cannot honestly report S1 closed while a retired word is a filename.

It becomes `fixtures/sample-dataset.ts`. The new generator is `fixtures/seeded-dataset.ts`, parallel to it — not `fixtures/large-dataset.ts`, which would name both the generator module and `harness/large-dataset.html`, two different things (check 4 again). "Large dataset" names the demo page; "seeded" names the generator.

Both retirements then get a guard rather than a promise: `test/guards/retired-words.test.ts`, in the shape of the existing `scripts/check-vendor-names.mjs`, failing on `Project` or `host` outside `docs/adr/**` (which keep their original wording as historical record, per ADR 0004's own consequences).

### D-S1.11-4 — `[S1-A4]` reuses the shipped D9 page; one argument changes so both axes are provable

`harness/scroll-sync.ts` has shipped since S1.5 and already *is* the demo `plans/03` budgets at five lines:

```ts
const scale  = new TimeScaleModel();
const scroll = new ScrollModel();
new Gantt({ container: '#tall',  dataset: tallDataset,  scale, scroll });
new Gantt({ container: '#short', dataset: shortDataset, scale, scroll });
```

One defect: the shared `TimeScaleModel` takes the default `zoom: 'fitViewport'`, so content width equals pane width, `max.x` is `0`, and **the x half of D9 is unobservable on the page that exists to prove D9**. `new TimeScaleModel({ zoom: 'preset' })` fixes it at a cost of zero statements, so the line budget holds.

`[S1-A4]` then asserts what `plans/00` §4's gate condition actually says — scrolling one instance moves the other in **x and y**. The existing echo (D-S1.5-6) and pin (U3) tests on that page must stay green **unmodified**: they are vertical, and a wider content extent must not disturb them. If either needs an edit, that is a finding against `ScrollModel`, not a test to adjust.

Rejected: a fifth page dedicated to A4. The point of `plans/02` §5 is that sharing *is* the whole API; a page written specially to demonstrate it would prove less than the one a reader already finds.

### D-S1.11-5 — `[S1-A1]` gets its own page, and `pnpm build` learns the harness has more than one

`harness/large-dataset.html` + `harness/large-dataset.ts`, at `zoom: 'preset'` (content wider than the pane, per D-S1.11-4's reasoning) over `seededEntryInputs({ count: 5000 })`.

While writing it: `vite.config.ts` sets `root: 'harness'` and no `build.rollupOptions.input`, so `pnpm build` emits **`index.html` only** — verified in the baseline build output. `scroll-sync.html` and `zoom.html` have never been through a production build, and `large-dataset.html` would be the fourth page that isn't. e2e is unaffected (Playwright's `webServer` runs `pnpm dev`), so this is not a gate defect — but "the harness is the library's first consumer" is a weaker claim when three quarters of that consumer is only ever run unbundled. The four inputs are declared.

**A1 does not check "smoothly."** `plans/03`'s box says it; throughput is D2's measured spike at S7, and a timing assertion in CI is a flaky proxy for it. The box's wording is corrected in `plans/03` to the falsifiable half — the DOM-node bound — with a pointer to S7 for throughput. Ticking a box that says "smoothly" against a test that never measures it is precisely the dishonesty this step exists to remove.

### D-S1.11-6 — `host` is retired in both senses: `container` for the element, `consumer` for the consuming application (#64)

`host` names two concepts, which is #7's "chart" failure verbatim:

1. **the consuming application** — CONTEXT.md: *"a host charting shifts"*, *"what a host writes where the library stores an Entry"*, *"a host overrides any Token"*
2. **the DOM element a Gantt mounts into** — CONTEXT.md: *"one `Gantt` wraps one `host` element"*; `GanttOptions.host`, `resolveHost`, `HostNotFoundError`, `.fg-host`

It is already costing. CONTEXT.md's **Render surface** entry carries an explicit *"Avoid: host (host is the Gantt's own DOM anchor — a different, higher-level concept)"* while `render/backend.ts:19` names that very seam `RenderSurfaces<THost>`. And CONTEXT.md's **a11y label** entry reads *"sets the host's `aria-label`"* — false under sense 1, since an application has no `aria-label`.

The naming test, on the element sense:

| Check | `host` (as-is) | `container` |
|---|---|---|
| 1. glossary term | fails — no entry exists, in either sense | fails equally — the entry is written as part of this step |
| 2. call site reads true | `new Gantt({ host: '#gantt' })` — true | `new Gantt({ container: '#gantt' })` — true |
| 3. search test | **fails** — 301 hits in `src/`, two senses mixed | passes — 3 hits repo-wide at baseline, all prose |
| 4. one meaning per word | **fails** — two concepts | passes |
| 5. category word last | n/a | n/a |

Both `container`/`consumer` and the inverse (`host` for the element, `consumer` for the application — the Shadow DOM `:host` precedent) pass all five checks; they differ only in cost and in which precedent they honour. **The repository owner chose to retire `host` entirely**, so neither sense keeps a word anyone has to remember a legacy meaning for.

Consequences, element sense → `container`:

- `GanttOptions.host` → `.container`; `GanttShellOptions.host` → `.container`
- `resolveHost()` → `resolveContainer()`; private `#host` → `#container`
- `HostNotFoundError` (code `'host-not-found'`) → `ContainerNotFoundError` (code `'container-not-found'`), re-exported from `api/index.ts` under the new name
- `.fg-host` → `.fg-container`. This **reopens** D-S1.10-1's "closed and un-renamed" Part vocabulary, deliberately and for one entry: a level-2 class carrying a retired word is worse than a level-2 class that moved once, pre-1.0, with no released consumers.
- `RenderSurfaces<THost>` / `RenderBackend<THost>` → **`<TSurface>`**, not `<TContainer>`. The grid and timeline elements are Render surfaces, not containers — this is the rename that finally makes CONTEXT.md's own Avoid-line true in code.

Consequences, application sense → `consumer` (prose and comments only, no code identifiers): CONTEXT.md (~30 sites), CLAUDE.md, `plans/00`–`04`, `README.md`, and the doc comments in `src/`. CLAUDE.md needs **both** senses fixed — its naming example *"attach size to host"* is the element sense, while *"the host owns what it is for"* is the application sense, two paragraphs apart.

`consumer` is not a new coinage: CLAUDE.md already uses it (*"`harness/` is the library's first consumer"*, *"a consumer wanting an explicit viewport"*).

**The rename lands first, as its own commit and its own PR, green on `pnpm verify` and `pnpm test:e2e` before any gate work starts.** It is a ~301-site mechanical edit across `src/`, tests, `harness/`, `e2e/` and the specs; the gate work is a handful of new files whose whole purpose is to be read carefully. Reviewing them in one diff means the gate — the artifact the S1 → S2 decision rests on — gets read at the attention left over after a rename. Worse, the rename touches `api/gantt.ts` and `render/backend.ts`, so a mistake in it surfaces as a *test* failure, and a reviewer looking at a red gate PR cannot tell which half is at fault.

Splitting also gives the rename the one property it needs: `pnpm verify` green **before** and **after**, with no behaviour change in between. That is a claim a reviewer can check in one command, and it stops being checkable the moment new tests land in the same commit.

Concretely: **PR 1 — S1.11a, the rename**, §8's first block, nothing else. **PR 2 — S1.11b, the gate**, everything after it. `.slice` bumps in a third commit (D-S1.11-10). Both PRs carry the S1.11 label and close together; this is one step in two reviewable pieces, not a new step in `plans/03`.

### D-S1.11-7 — #33 is deferred to S2 with the reason recorded; it is not fixed here

`GanttShell` captures `entries` by reference, so nothing re-renders when the entry list changes. Fixing it means change signalling between `Dataset` and the shell, which **is** S2's data core — `plans/03` S1 lists mutation under "Explicitly out", and #33's own body says *"This is S2 work … so the absence of reactivity is on plan."*

What S1.11 owes it is the record, so it does not cross the gate as an oversight: a line in `plans/03` §S2's scope stating that S2 **replaces** `GanttShellOptions.entries` rather than adding a `setEntries()` beside it. That second path is #1's R4 — the shape a second reactivity mechanism is born in — and the cheapest moment to forbid it is before S2 starts.

Rejected: fixing it here to leave S1 with nothing open. It would put an ad-hoc invalidation path in `view/` two weeks before `data/` provides the real one, which is the exact mud R4 names.

### D-S1.11-8 — The harness's remaining `.fg-*` CSS splits: structural is a library bug, typographic is level 1 (#41)

`harness/index.html`, `scroll-sync.html` and `zoom.html` each hand-write:

```css
.fg-tick { top: 0; … }
.fg-row  { left: 0; … }
.fg-header { height: 20px; }
```

`view/styles.ts` gives `.fg-tick`, `.fg-row` and `.fg-bar` `position: absolute` with **no `top`/`left`**, so they fall back to static position. That happens to compute to `0` today; it is not guaranteed, and three consumer pages independently compensating for the same omission is the harness rule firing exactly as designed. **Fixed in `src/`**: the base stylesheet sets the origin for every absolutely-positioned Part it ships.

`.fg-header { height: 20px }` restates `--fg-header-height`'s own default and is deleted outright — the same class of defect as the `rowHeight: 32` CLAUDE.md cites.

The typography (`font-size`, `padding`, `line-height`, `white-space`, `text-overflow`) **stays harness-owned**. That is what level 1 is for, and a library shipping a font size would be overreaching into the host's type scale. Recorded here so a later reader does not mistake it for residue.

Closes the remaining half of #41; S1.8 closed the `overflow: auto` half.

### D-S1.11-9 — The gate's labels name the `plans/00` §4 condition, not just the box

`plans/00` §4's S1 → S2 condition has two clauses — *"grid and timeline provably share row geometry (single source, pixel-identical)"* and *"viewport/scale objects are external and injectable"*. Those are `[S1-A2]` and `[S1-A4]` respectively; the other three boxes are S1 scope that the gate condition does not name.

The two checks that discharge the gate condition say so in their labels. Otherwise the gate reports five boxes and a reader still has to derive, by hand, whether the *gate* is met — which is the thing this step exists to stop.

### D-S1.11-10 — `human: []`, and the script reports without advancing

Every S1 box is machine-checkable, including D9, so no box may be left to a person. S0's gate leaves *"harness renders fixture bars"* to a human because nothing could check it then; `e2e/` and Playwright exist now, so a `human:` entry would be the thing that quietly isn't checked.

`.slice` is bumped to `S2` in a **separate reviewed commit**. The script reports; it does not advance. This is already the script's own doc comment and is restated as the closing step so it is not quietly folded into the gate PR.

### D-S1.11-11 — `matrix-coverage.test.ts` grows to the Mechanism column, and seven overstated rows are corrected

`test/guards/matrix-coverage.test.ts` (#43) parses `docs/01`'s I1–I14 table and asserts each row names a **CI job** that exists. It never reads the **Mechanism** cell, where the `freegantt/*` rule names live. Measured at baseline, thirteen named rules have no file in `eslint/rules/`:

```
model-is-types-only              no-inner-html                  no-recursion-in-scheduling
no-allocation-in-hot-path        no-kind-conditional            no-store-mutation-outside-transaction
no-derived-in-json               no-module-level-state          raf-single-owner
no-external-runtime-import       no-not-implemented             reconciler-scope
                                                                require-invariant-header
```

Seven sit on rows whose status is `AUTO` — a claim of enforcement today. One row is wrong twice: *"Exactly one runtime dependency"*, asserting `dependencies` deep-equals `{ 'alien-signals': … }`, while CLAUDE.md and `plans/04` §1 both say **two** (`alien-signals` and `temporal-polyfill`).

The guard extends by one `it.each` block over **both** tables (§1's I1–I14 and §2's un-numbered hard rules): every `freegantt/*` rule on an `AUTO`/`AUTO-PARTIAL` row must be registered in `eslint/rules/index.cjs`; `PLANNED (Sn)` rows are exempt, which is what makes the correction below the fix rather than a relaxation.

Then each overstated row is corrected to the status its shipped half actually supports, naming the slice that lands the missing half. Where a row has a real test half and a missing lint half (I2's two-Gantt isolation test, for instance), `AUTO-PARTIAL` with the planned half named is the honest cell — not `PLANNED`, which would understate it.

This is the same defect as finding 1, one level up: a document a reviewer trusts to know what is enforced, asserting coverage that does not exist. `docs/04` §4's own rule governs it — *"a guard with no failing fixture is presumed broken"* — and a guard with no *file* is worse.

### D-S1.11-12 — CI stays `workflow_dispatch:`-only, and the gate says so

`[S1-A1]` and `[S1-A4]` are Playwright tests; `pnpm test:e2e` runs in `.githooks/pre-push` and has no CI job. Every trigger in `.github/workflows/ci.yml` is commented out, so nothing runs on the server at all.

Turning the triggers on changes what every push costs and is the repository owner's call. **It was made: they stay off.** S1.11 therefore records in `docs/04` §3.1 that the S1 gate is provable locally and *not* on the server, so a reader can tell "off on purpose" from "forgotten". When the triggers come back on, e2e gets its own job (`pnpm exec playwright install --with-deps chromium`, then `pnpm test:e2e`) and the hook line stays as the local half.

---

## 3. API

### 3.1 `fixtures/seeded-dataset.ts` — new file

```ts
export interface SeededEntryOptions {
  /** How many entries. */
  count: number;
  /** First entry's start, as a bare UTC calendar date. Default `'2026-01-01'` — a fixed date,
   *  never `now()`: a fixture that drifts with the clock is not a fixture. */
  startDate?: string;
  /** Default 1. Seeded LCG, never `Math.random`: the same seed is the same entries forever. */
  seed?: number;
}

/** Deterministic entry inputs for the 5,000-entry acceptance page and the S7 perf spike.
 *  Dates are UTC-midnight aligned; the caller supplies the zone to `new Dataset(...)`. */
export function seededEntryInputs(options: SeededEntryOptions): EntryInput[];
```

### 3.2 `scripts/slice-gate.mjs` — one gate added, one helper

```js
S1: {
  name: 'S1 → S2',
  checks: [
    tagged('S1-A1', ['e2e'],    '5,000-entry fixture: only windowed rows exist in the DOM'),
    tagged('S1-A2', ['vitest'], 'grid/timeline row tops pixel-identical under fractional zoom (I9) — gate condition 1'),
    tagged('S1-A3', ['vitest', 'e2e'], 'preset switch + anchored zoom are live, no remount'),
    tagged('S1-A4', ['e2e'],    'two Gantt instances share one ScrollModel, x and y (D9) — gate condition 2'),
    tagged('S1-A5', ['vitest'], 'axis correct across a DST transition in the dataset zone'),
    { label: 'I9/I12 guards red-tested (no-flow-layout-rows, scroll rule, no-time-to-pixel-math)',
      run: () => run('node scripts/guard-red-test.mjs') },
  ],
  human: [],
}
```

`tagged(id, runners, label)` builds a check that (1) fails if `grep -rlF "[<id>]" src e2e` finds nothing, then (2) runs each named runner with the **escaped** pattern — `pnpm vitest run -t "\[<id>\]"` and `pnpm test:e2e -g "\[<id>\]"`. `pnpm test:e2e`, never `pnpm playwright test`: the script already exists and carries the config, and shelling past it is how the gate and CI drift apart.

`[S1-A3]` names both runners because both halves of its box are real: "no remount" is `api/gantt.test.ts`'s DOM-identity assertion, "anchor preserved" is `e2e/zoom.spec.ts`'s.

### 3.3 `test/guards/matrix-coverage.test.ts` — extended (D-S1.11-11)

Parses `freegantt/*` names out of the Mechanism cell of both tables, and asserts each is registered in `eslint/rules/index.cjs` unless its row's status is `PLANNED (Sn)`. Keeps the existing parser self-check pattern — a count assertion, so a doc rewrite cannot make it vacuously pass.

### 3.4 `test/guards/slice-gate.test.ts` — new file

The gate is now the artifact the S1 → S2 decision rests on, so it gets the same treatment every other guard gets (`docs/04` §4). Drives `tagged()` against a temporary fixture directory: an id present and passing → check passes; id absent from source → check fails; id present but its test failing → check fails. U2's "delete the test, gate goes red" is this file.

### 3.5 The `container` / `consumer` rename (D-S1.11-6)

No new API shape — a rename across `src/api/gantt.ts`, `src/view/gantt-shell.ts`, `src/view/pane-layout.ts`, `src/view/styles.ts`, `src/render/backend.ts`, `src/render/dom/index.ts`, `src/model/errors.ts`, `src/api/index.ts`, every `*.test.ts` touching the option, all four harness pages, `README.md`, `plans/02` §1, and `CONTEXT.md`.

---

## 4. Public surface

Net change to `api/index.ts`:

| Before | After | Why |
|---|---|---|
| `GanttOptions.host` | `GanttOptions.container` | D-S1.11-6 |
| `HostNotFoundError` / `'host-not-found'` | `ContainerNotFoundError` / `'container-not-found'` | D-S1.11-6 |

Nothing is added. S1.11 ships no new public capability — that is the charter, and a new export here would be the signal that something in this step belongs in a different one.

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Automatic answer |
|---|---|
| Someone writes a gate check by hand with a bare `-t "[S1-A6]"` pattern | `tagged()` is the only way a check is constructed, and it escapes. A hand-written `run()` line in the S1 gate is a review finding. |
| An acceptance test is renamed and loses its id | Step 1 of `tagged()` — the fixed-string source search — fails with the missing id named. |
| An acceptance test moves from `dom` to `pure` | Nothing breaks: the vitest runner has no `--project` flag (D-S1.11-1). Moving it from vitest to e2e *does* break, on purpose. |
| A future rule is documented in `docs/01` before it is written | `PLANNED (Sn)` in the status cell is the sanctioned way to say so, and the extended guard exempts exactly that. Claiming `AUTO` fails. |
| Someone re-adds `host` in a doc comment out of habit | `test/guards/retired-words.test.ts` fails, the same way `check-vendor-names.mjs` already works. |
| `.slice` gets bumped in the gate PR | The gate script never writes `.slice`; the bump is its own commit (D-S1.11-10), and the PR that contains both is a review finding. |
| The 5,000-entry page makes `pnpm test:e2e` slow enough that someone reaches for `--no-verify` | One page, one spec file, `zoom: 'preset'` so no fit computation over 5,000 entries per resize. If it measurably slows the suite, that is a finding against windowing, not a reason to trim the fixture. |

---

## 6. Tests

- **`e2e/large-dataset.spec.ts`** — `[S1-A1]`: mount `harness/large-dataset.html`, count `[data-testid="fg-row"]` nodes, assert bounded by window + overscan; scroll; assert the count stays bounded **and** the `data-row-id` set moved (a bound alone passes if nothing renders).
- **`e2e/scroll-sync.spec.ts` (extended)** — `[S1-A4]`: scroll `#tall` in x and y, assert `#short` moved on both axes. The two existing tests on this page stay green **unmodified** (D-S1.11-4).
- **`e2e/zoom.spec.ts` (extended)** — the existing anchored-zoom test gains `[S1-A3]` in its title; no behaviour change.
- **`src/layout/viewport/viewport.test.ts` (extended)** — gains `[S1-A3]` on the one-notification-per-zoom test. S1.9 §6 specified this id and it did not land; at baseline `[S1-A3]` exists only in `api/gantt.test.ts`.
- **`src/layout/frame.test.ts` (extended)** — supporting unit test for A1: `computeFrame` over `seededEntryInputs({ count: 5000 })` emits only windowed rows while `contentHeight` stays the full extent. Not the acceptance proof (the box says "in the DOM"), and labelled as supporting so it is not mistaken for one.
- **`test/guards/slice-gate.test.ts`** — new (§3.4), both directions.
- **`test/guards/matrix-coverage.test.ts` (extended)** — §3.3.
- **`test/guards/retired-words.test.ts`** — new: `Project` and `host` absent outside `docs/adr/**`.
- **`fixtures/seeded-dataset.test.ts`** — same seed twice is deep-equal; different seeds differ; `count` is honoured; no `Math.random` and no `now()` reachable from it.

`[S1-A2]` and `[S1-A5]` need no test work — they shipped tagged at S1.8 and S1.9. S1.11 only asserts them.

---

## 7. Spec edits implied — landed **with** this step

- `plans/03-slices.md` §S1 — the five acceptance boxes get their ids and are ticked; A1's wording drops "smoothly" for the DOM-node bound, with a pointer to S7 for throughput (D-S1.11-5).
- `plans/03-slices.md` §S2 — one line: S2 **replaces** `GanttShellOptions.entries`, never adds a `setEntries()` beside it (D-S1.11-7, #33, R4).
- `plans/02-public-api.md` §1/§5 — `host` → `container` in every example; the D9 example gains `zoom: 'preset'` to match the page that proves it.
- `plans/00-overview.md` §4 — the S1 → S2 row cites the two checks that discharge it (D-S1.11-9).
- `docs/01-invariant-guard-matrix.md` — I9 and I12 move to enforced, naming `[S1-A2]` and the shipped rules; I12's row stops calling the scroll rule `no-raw-scroll` when the file is `no-scroll-outside-scroll-model`; the seven overstated rows are corrected and the dependency-count row is fixed to two (D-S1.11-11).
- `docs/02-lint-rules.md` — B4's `no-raw-scroll` reconciled to the shipped name; `no-flow-layout-rows` §3.10 scope corrected to what shipped.
- `docs/04-hooks-and-ci.md` §3.1 — CI stays dispatch-only *by decision*; the S1 gate is provable locally and not on the server (D-S1.11-12). §4 gains the two new guards.
- `CONTEXT.md` — new entries **Container**, **Consumer**, **Acceptance id**; **Render surface**'s Avoid line rewritten now that `THost` is gone; `host` retired the way `Task` and `Project` are; every application-sense `host` → `consumer`.
- `CLAUDE.md` — both senses (D-S1.11-6), including the naming example's *"attach size to host"*.
- `README.md` — `host` → `container` in examples.
- `plans/temp_todo_for_s1-close.md` — deleted (its §7 is this document).
- `plans/need-fixing/architecture-review-pr10-notify-primitive-2026-08-23.html` — moved to `plans/fixed/`, or what remains open in it is listed.

---

## 8. TODO

Two PRs, in this order (D-S1.11-6). Vocabulary first — it touches every file the later phases edit, doing it last means rewriting them twice, and a rename reviewed beside a gate is a rename nobody read.

### PR 1 — S1.11a · the rename (D-S1.11-3, D-S1.11-6)

Nothing in this PR changes behaviour. `pnpm verify` and `pnpm test:e2e` are green at its parent commit and green at its head, and every existing test passes **unmodified except for the renamed identifiers** — that symmetry is the review. One test file is added: `retired-words.test.ts`, which asserts the rename itself and is what stops it regressing the week after it lands. No other test is added, removed, or has its assertions changed; if one needs to be, the rename changed behaviour and that is the finding.

- [x] `host` → `container` across `src/`, tests, `harness/`, `e2e/`, `README.md`, `plans/02`; `HostNotFoundError` → `ContainerNotFoundError`; `.fg-host` → `.fg-container`; `RenderSurfaces<THost>` → `<TSurface>`
- [x] `host` (application sense) → `consumer` in `CONTEXT.md`, `CLAUDE.md`, `plans/00`–`04` and doc comments
- [x] `fixtures/sample-project.ts` → `fixtures/sample-dataset.ts` and its eight import sites
- [x] `test/guards/retired-words.test.ts`; `CONTEXT.md` entries for **Container** and **Consumer**
- [x] `pnpm verify` green on the rename alone, before anything else lands (`pnpm test:e2e` green too, 11/11)

### PR 2 — S1.11b · the gate

Everything below lands on top of a merged, green S1.11a.

#### Fixtures and pages
- [x] `fixtures/seeded-dataset.ts` + `fixtures/seeded-dataset.test.ts` (§3.1)
- [x] `harness/large-dataset.html` + `.ts` at `zoom: 'preset'`
- [x] `harness/scroll-sync.ts` — `new TimeScaleModel({ zoom: 'preset' })` (D-S1.11-4)
- [x] `vite.config.ts` — declare all four harness inputs (D-S1.11-5)

#### Acceptance ids
- [x] `[S1-A1]` — `e2e/large-dataset.spec.ts`
- [x] `[S1-A4]` — `e2e/scroll-sync.spec.ts`, both axes
- [x] `[S1-A3]` — added to `viewport.test.ts` and `e2e/zoom.spec.ts` (S1.9 specified the first and it did not land)
- [x] Supporting windowed-frame unit test over 5,000 entries (`layout/frame.test.ts`)

#### The gate
- [x] `tagged()` helper + the `S1` entry in `scripts/slice-gate.mjs`, `human: []` (§3.2)
- [x] `test/guards/slice-gate.test.ts` — both directions (§3.4)
- [x] `test/guards/matrix-coverage.test.ts` — Mechanism column, both tables (§3.3)

#### Harness review (CLAUDE.md's standing rule)
- [x] Base stylesheet sets the origin for every absolutely-positioned Part (D-S1.11-8); delete `top`/`left`/`.fg-header { height }` from all harness pages; keep typography
- [x] Re-read all four `harness/*.ts` against the rule — clean, no gap found (each mounts via public API only, no restated defaults, no hand-built stand-ins for library computation)

#### Ledger
- [x] The §7 spec edits, landed with this step
- [x] `docs/01` — ten overstated rows corrected (seven `AUTO`, three `AUTO-PARTIAL`; D-S1.11-11's own count was of the `AUTO` subset), dependency count fixed to two, I9/I12 already enforced (no change needed — already named `[S1-A2]`/the shipped rule names)
- [x] #33 deferred to S2 with the reason in `plans/03` §S2; #41 and #64 closed
- [x] `plans/temp_todo_for_s1-close.md` deleted; `plans/need-fixing/` triaged (the one file in it moved to `plans/fixed/` — its findings are all resolved by the S1.7–S1.9 `Viewport`/`bind(binding, onChange)` refactor)
- [x] `pnpm verify` green; `pnpm test:e2e` green (13/13); `pnpm gate` prints `S1 → S2` with six ✔
- [ ] `.slice` → `S2` in a **separate** reviewed commit (D-S1.11-10)

---

## 9. Deferred, with the caller that brings it back

| Deferred | Returns at | Needs |
|---|---|---|
| #33 — change signalling between `Dataset` and `GanttShell` | S2 | the data core's changeset events; S1 has no mutation API to signal about (D-S1.11-7) |
| Throughput measurement for the large-dataset page ("smoothly") | **S6 — corrected 2026-09-15** | D2's measured perf spike and a reference-hardware budget; a timing assertion in CI is a flaky proxy (D-S1.11-5). **This cell read S7 until 2026-09-15.** `plans/03` §S6 R1 and D2 both put the budgets in S6, and the S6 plan carries the measurement as #95. D-S1.11-5's reason is unchanged — it rules out a CI timing assertion, not the slice. |
| `addDays`/`startOf` (or an equivalent) re-exported from `api/` | when a consumer must **author** zone-aware dates | today a consumer authoring dates has `instant()` and nothing else; the seeded fixture sidesteps it with UTC alignment, so S1 has no caller (D-S1.11-2) |
| Writing the thirteen missing `freegantt/*` rules | each rule's own slice, as `docs/01` will then say | S1.11 corrects the *claims*; writing an S3 scheduling rule before `scheduling/` has code would be a guard with nothing to guard (D-S1.11-11) |
| An e2e job in CI | when the `push`/`pull_request` triggers come back on | the repository owner's call on what every push costs; the pre-push hook is the local half either way (D-S1.11-12) |
| `xOnly()` / `yOnly()` on `ScrollModel` | **never — withdrawn 2026-09-15** | nothing. Cut at S1.5 (D-S1.5-3) and confirmed cut here; both cuts were right and stay in the record. A filtered view over the model is not what returns. |
| Per-axis scroll sharing — x, y, both or neither | **now — a consumer needs "share x, keep y private" as of 2026-09-15 (#405)** | the build. **D-S6-1** makes one scroll axis the shared unit, so the four combinations are the caller's and the library ships no modes. Shared y alone comes free and stays unadvertised. See `plans/s6-scale-and-sync/README.md` §5.3. |
