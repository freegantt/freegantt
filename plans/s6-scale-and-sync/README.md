# S6 — Scale validation, hardening, linked Gantt instances

**Slice:** S6 (`plans/03` §S6) · **Position:** after S5, before S7 · **Status:** in flight. `.slice` reads `S6`. **All five acceptance rows are unticked.** Three have a consumer waiting on them: R5 (#400), R4 (#403), R3 (#405). #406 is not one of them — it is this project's own correction of a 5k/10k mismatch, and the brief says the 10k throughput item matters less to the consumer than the leak check beside it (brief §5, §8).
**Form:** the tracker form S4 and S5 use — this file holds the shared context and the row-by-row state; each row names the issue that carries its work.
**Why this file arrived late:** S1–S5 each opened with a plan directory. S6 started without one, and the slice ran on `plans/03` §S6's ten scope bullets alone. Writing this file found four defects in those bullets, and the branch review of 2026-09-15 found two more. They are §5.
**Governed by:** `plans/00` **D2** (scale posture — design for growth, validate by measured spike) and **D9** (multi-Gantt sync), `plans/01` §11 (invariants I1–I14), `plans/04` §5 (the gate).
**Builds on:** S1.5's `ScrollModel`/`TimeScaleModel` and its two-Gantt fixture, S1.7's windowed frame, S4's row-height index seam, S5's plugin runtime and its disposal contract.

> **What this slice is not.** No `Dependency`, no `schedule()`, no link geometry — S7, and the graph and SVG-link cost measurements wait for it, because links do not exist yet. No worker seam for `schedule()`: measure that after S7 if the plugin's own numbers demand it (D2). No new public feature, with **one stated exception**: R3 is an acceptance row of this slice and cannot be ticked without a per-axis `scroll` surface (**D-S6-1**, §5.3). That surface is in scope; #401, #402, #404 and #408 are the ones held out, and §4 Q3 decides where they land. S6 proves the core at scale and makes the package shippable.

---

## 1. The five acceptance rows

`plans/03` §S6's list, with what each one actually needs and who carries it.

| # | Acceptance row | State | Carried by |
|---|---|---|---|
| **R1** | All §12-style budgets defined numerically from the spike and enforced in CI | Not started. The spike has not run, and no budget is defined. `pnpm measure:scale` now captures the browser half of it on demand (#403's branch) — a measurement, never a gate, per #95. See §5.1. | #95 (profile the harness), #342 (bundle number) |
| **R2** | 10k-entry fixture: smooth scroll, sub-frame hover, bulk edit in one transaction without jank | Harness seeds **5,000** and the row says 10,000. Ruled 2026-09-15: **the fixture goes to 10k.** See §5.2. | **#406** (fixture), #95 (measurement) |
| **R3** | Linked-scroll demo works with both axes shared, and with x shared while y stays private | **Not a tick.** `[S1-A4]` proves both-axis sharing. The second shape is a build, and the shape is settled: one **scroll axis** becomes the shared unit, so a caller shares x, y, both or neither — **D-S6-1**, §5.3. Shared y alone is representable and unadvertised. | **#405** |
| **R4** | 100 mount/destroy cycles leak no nodes, listeners or observables | **Done, 2026-09-15.** Counted in `test/dom/leak-cycles.test.ts` (100 cycles, three shapes, plus the shared-model binding check) and in `e2e/mount-destroy.spec.ts` (Chromium nodes, listeners and heap). `GanttShell.destroy()` is one `disposeAll()`. | **#403** |
| **R5** | `npm pack` output audited: internals unreachable, types complete, bundle within budget | Not started, and now blocking. A `github:` install lands with no `dist/` at all. | **#400** |

### R1 — budgets from a measured spike

D2 says the posture is validated by measurement, not assumed. The spike measures five things:

1. 10k entries / 5k rows scroll p95 frame time.
2. Pack-heavy rows layout cost.
3. Prefix-sum versus log-time height index crossover — the interface is already in place, so the swap is a decision, not a rewrite.
4. Reconciler cost on a 20k-bar sync and a 200-bar commit.
5. Zone arithmetic cost per tick.

Then act on it: swap the height index if the crossover says so, and fix what the reconciler numbers expose. The budgets that come out go into CI on reference hardware, and a regression fails the build.

`pnpm measure:scale` (added with R4, 2026-09-15) covers the first of the five: it drives `large-dataset.html`, reports scroll frame time as p50/p95/max plus a dropped-frame count, reports script cost per frame, and writes a Chromium trace for the Performance panel. It runs the scroll twice more — once unthrottled, once at 4x CPU slowdown, which is #95 step 5. It asserts nothing and `verify` does not call it.

**First reading, 2026-09-15, this developer machine, headless, at the fixture's present 5,000 entries.** Unthrottled the scroll drops no frames and costs 3.1 ms of script per frame. At 4x slowdown p95 is 49.5 ms and **53 of 240 frames run over 32 ms**. That is a number to act on, not a budget: the fixture is not yet 10,000 (#406), and this machine is not reference hardware. The other four measurements — pack-heavy layout cost, the height-index crossover, reconciler cost, zone arithmetic per tick — are not covered and still need their own runs.

### R2 — the 10k fixture

`harness/large-dataset.ts` seeds `seededEntryInputs({ count: 5000 })`. `e2e/large-dataset.spec.ts` drives it. `[S1-A1]` already proves only windowed rows exist in the DOM at 5,000 — and that box was ticked with a deliberate note: *not* "smoothly", because throughput is D2's measured spike and belongs here.

So R2 is the timing half of a fixture that already exists. It needs the count raised (§5.2) and three measurements: scroll, hover, and a bulk edit in one transaction.

### R3 — the linked-Gantt demo

`harness/scroll-sync.html` mounts two Gantts on one `ScrollModel` and one `TimeScaleModel`, with a short dataset under a tall one so the clamp case is observable. `e2e/scroll-sync.spec.ts` covers the echo case (D-S1.5-6), the short-chart pin and resume (U3), and `[S1-A4]` for x and y together.

What is left is per-axis sharing: the shared unit becomes one scroll axis, so x, y, both and neither are all the caller's. See §5.3, **D-S6-1**.

### R4 — the leak check → **#403** (done, 2026-09-15)

The work and its acceptance are in the issue. The short version: three counts (nodes, listeners, observables) must return to baseline over 100 cycles, and the same must hold for two Gantts sharing one `ScrollModel` and one `TimeScaleModel`, in three destroy orders.

**What landed, and the two things it taught.**

`GanttShell.destroy()` was a hand-written list of twenty-two teardown calls. A resource added in a later slice could miss that list with nothing to catch it. Each resource now registers its own release on the line that builds it, and `destroy()` is one `disposeAll()`.

The counts live in two places, because one place cannot answer both halves. `test/dom/leak-cycles.test.ts` counts listeners, observers, animation frames and nodes over 100 cycles, and asserts a shared model holds no binding once its Gantts are gone — `ScrollModel.state.max` is the fan-in over live bindings, so a dead one keeps claiming room there. `e2e/mount-destroy.spec.ts` counts nodes, listeners and heap in Chromium, driving `harness/mount-destroy.html`.

1. **A leak census has to be proved red.** A first draft patched `globalThis.EventTarget.prototype` and read clean through a deliberately leaked document listener, because happy-dom's nodes inherit from its own `EventTarget` class and not from that global. Every count here was then checked by injecting a real leak: a missed `removeEventListener`, a missed `disconnect()`, and a missed `unbind()` each turn it red.
2. **Heap is a question only a real browser answers.** happy-dom retains about 0.2 MB per rendered entry per mount whatever `destroy()` does, and two forced collections do not return it. The same page in Chromium grows 1.4 KB per mount over 150 mounts, with node and listener counts exactly flat. So the fake-DOM tests assert counts and never memory, and they use small fixtures.

The first consumer is a Livewire single-page app that mounts and destroys a linked pair on every visit. A leak there shows up as a slow tab after forty minutes of a dispatcher's work.

### R5 — the pack audit → **#400**

Written as hygiene. It is now the blocker: `version` is `0.0.0`, `dist/` is gitignored, and `prepare` sets the git hooks path instead of building, so a git dependency installs a package whose `exports` point at nothing.

---

## 2. Scope in S6 that is not in the acceptance list

`plans/03` §S6 names these in its scope bullets. None has an acceptance box, so none of them gates the slice, and each one still has to land or be explicitly deferred.

| Item | State |
|---|---|
| Error-path audit — typed errors everywhere | `BuiltInThrownCode` and `BuiltInReportCode` are both large and complete-looking. The audit is a read, not a build. |
| `exports` map seals internals | The map is sealed. #400's acceptance proves it from outside the repository, which is the only proof that counts. |
| Semver and API-report tooling, I11 automated | `pnpm api-report` runs in `verify`. "Automated" means a version bump refuses an unreported surface change. |
| Bundle-size budget in CI | `size-limit` runs in `verify`. The number is parked — #342. |
| Release plumbing: versioned docs, CHANGELOG, publishing pipeline | #400 covers the publishing pipeline. Versioned docs and CHANGELOG are untouched. |
| **#112 Seam B** — `render/null` is unreachable from `view/` | Known gap, recorded in `plans/03` §S6 itself. `PaneLayout` mounts real `HTMLElement`s whichever backend paints them. Only needed if this slice's measurement work wants a DOM-free `view/`+`layout/` harness. Plan: `plans/issues/open/112-di-seams.md`. |

---

## 3. Issues open against this slice

| Issue | Row | Note |
|---|---|---|
| **#400** | R5 | Blocking. The first consumer cannot install the library. |
| **#403** | R4 | The shared-model case is the one that matters. |
| **#405** | R3 | Per-axis sharing. **The design is settled — D-S6-1, §5.3**, which answers D-S1.5-3's two rejections rather than repeating them. `needs grill` is discharged; the issue is a build. |
| **#406** | R2 | Raise the fixture to 10,000. Mechanical, and it gates every R2 measurement. |
| #95 | R1, R2 | Profile the large-dataset harness in DevTools. The spike's first half. |
| #342 | R1 | The bundle number. #400 does not wait for it. |
| #317 | — | e2e has only ever run Chromium. A scale slice that measures on one engine measures one engine. |
| #92 | — | Tree-shaking. `[S5-A6]` ticked it for features; the package-level check is #400's tarball. |
| **#407** | — | The consumer brief's §1 maps nine of its concepts onto shipped API and closes "It works." One row was already wrong and cost #405. Nobody has checked the other eight. `quickie`. |

Three issues raised by the same consumer brief are **not** S6: #401 (per-tick value rows), #402 (`Segment` props), #404 (`shading()`). They are new public surface. Where they land is an open call — see §4 Q3. **#401 is the consumer's blocking ask**, and its own brief calls it "the one real gap in the model".

**#408** (a gesture that creates a Segment) is new public surface too, raised here rather than by the brief. It joins the same open call.

---

## 4. Scope calls — open

| # | Question | Why it blocks |
|---|---|---|
| **Q1** | What does "§12-style budgets" mean, now that no §12 exists? | R1 cannot be written down, let alone enforced. See §5.1. |
| ~~**Q2**~~ | ~~Does R3 mean "both axes move" or "three sharing modes"?~~ | **Answered 2026-09-15 (author), in two steps.** First: only x needs to sync, so R3 is a build. Then: the shared unit becomes one **scroll axis**, so x, y, both and neither are all the caller's and the library ships no modes — **D-S6-1**, §5.3. |
| **Q3** | Do #401, #402, #404 and #408 land inside S6, after it, or in a new slice? | They are public surface, and S6's whole posture is "no new public feature". A consumer is waiting on the first three, and **#401 is its blocking ask**. Until this is answered, three of the brief's five asks have no slice and no date, and the consumer learns that by waiting. This is **step 0** of §6. |
| ~~**Q4**~~ | ~~Does the 10k number stay 10k?~~ | **Answered 2026-09-15 (author): yes, do 10k.** The row stands and the fixture rises — #406. See §5.2. |
| **Q5** | Does #112 Seam B land here or defer to S7? | Only S6's own measurement work can say whether it needs a DOM-free harness. |

---

## 5. Six defects this file found in `plans/03` §S6

These are in the spec, not in the code. The first four make a row unbuildable as written. §5.5 and §5.6 were added on 2026-09-15 after the branch review; §5.5 is a defect this section first claimed to be complete without. **§5.3 also carries a decision, `D-S6-1`** — the defect it found could not be closed without one.

### 5.1 R1 cites a section that does not exist, and it is not the only citation

> All **§12-style** budgets defined numerically from the spike and enforced in CI.

`plans/01` ends at **§11** (Invariants). There is no §12.

Two documents cite one anyway, and they cite it for two different subjects:

| Citation | Cited for | Probable referent |
|---|---|---|
| `plans/03` §S6, R1 | "§12-style budgets" | A performance or budgets section. Never written, or renumbered away. |
| `docs/adr/0018` line 200 (mirrored in `website/docs/adr/0018`) | "a sibling must not depend on load order (`plans/01` §12)" | §10, `extensions/` — the plugin contract. |

So one dangling section number is being read two ways by two readers, and neither can check the claim it is meant to support.

Both need fixing, and only R1's blocks this slice. **Q1** settles what R1 meant, and the row gets rewritten to name a real section. ADR 0018's citation is a separate one-line correction — an ADR records why a decision was taken, and a reader who cannot follow the reference cannot weigh it.

**Do not renumber `plans/01` to create a §12.** Two stale citations are cheaper to fix than every citation of §1–§11.

### 5.2 The fixture is 5,000 entries and the row says 10,000

`harness/large-dataset.ts` seeds 5,000, and line 13 of that file is the **only** line in the repository that chooses the large-dataset fixture's size. R2 says 10,000. D2 says "targets ~10k entries smoothly".

`fixtures/seeded-dataset.test.ts` does **not** pin this fixture, and an earlier draft of this section said it did. That test exercises the generator at counts of 0, 200, 500 and 5,000; the 5,000 cases prove `count` is honoured and give the determinism checks a sample size. It needs no edit. Eight further sites name 5,000 in a gate label, a comment, a test title or page copy — #406 lists them. Corrected 2026-09-15.

A measurement at 5k does not discharge a row that says 10k, and quietly reading the row as 5k is how a budget ships against the wrong number. **Q4** decides: raise the fixture, or correct the row and say why 5k is the honest target.

**Answered 2026-09-15 (author): do 10k.** The row stands as written, D2's target is the target, and the fixture rises to meet it — **#406**. That lands before any number measured on that page ticks R2.

### 5.3 R3 is a build, and the shared unit becomes one scroll axis

R3 read _"Linked-scroll demo works in **x, y, and both modes** with zero Gantt-side special-casing"_ until 2026-09-15. That phrasing named three modes, and the row was rewritten twice that day. The settled reading is below, and D-S6-1 is the decision behind it.

D9 read: _"Sharing a `ScrollModel` links both axes (S1.5, D-S1.5-3) — **partial (x-only/y-only) sharing is deferred** until a caller actually needs it."_

**A caller now needs it.** The first consumer's page is two panes over one time axis: labor requests on top, workers below. The brief's §1 says it plainly — _"one shared time axis, one shared **horizontal** scroll."_ Its own mapping table then writes "shared `ScrollModel` + `TimeScaleModel`", but that is the consumer naming a mechanism, not a requirement. A shared `ScrollModel` links **both** axes, and the two panes hold different row sets, so a shared y means scrolling the worker list also scrolls the request list.

**Who asked for which half.** The consumer asked for a shared horizontal scroll, and that is all its brief states. **Private vertical is the author's ruling of 2026-09-15**, taken because the two panes hold different row sets. Both halves are well founded; only the first is the consumer's, and #405 must source them that way.

---

#### D-S6-1 — the shared unit is one scroll axis, not a whole `ScrollModel`

**Ruled 2026-09-15 by the author, after `xOnly()` was examined a second time and withdrawn.**

`ScrollModel` fuses the two directions into one object. It owns one `#position: Point` and one `BoundValue` whose resolved value is `{position, max}` — four numbers, compared as a unit by `sameScrollState`. Two Gantts sharing it bind into the **same** `BoundValue`, so both directions travel together. **That is the object's shape, not a policy**, which is why no configuration can take half of it.

**The unit becomes one axis.** A scroll axis owns `{ position, max }` for one direction: one binding set, one `resolve`, one `equals`, **one lifetime**. A Gantt holds two of them — an x source and a y source — and a caller aims each one independently.

The consequence is that **the library ships no sharing modes.** Share x, share y, share both, share neither: all four are the caller pointing two references, not four code paths.

**This answers D-S1.5-3's two rejections rather than repeating them.**

- _"x in the model and y per-binding is two lifetimes in one object."_ That objection describes **splitting a fused object**. Nothing is split here. There are two objects, one lifetime each, and each is simpler than the fused one it replaces.
- _"an `axes` array, axis-tagged notification, and a `ScrollSource` interface whose `xOnly()` returns something that can be `yOnly()`'d into an object with no axes."_ **An axis has no axes to filter.** There is no array, no tag and no view type, so there is nothing that can be filtered twice into nothing.

**`yOnly` is not banned, and that is a saving rather than a concession.** Shared y is what two Gantts aiming their y references at one object *means*. Forbidding it would cost code; allowing it costs none. It gets no advertised surface, no doc example and no new acceptance row. The behaviour behind it is already built and already proven: `[S1-A4]`, the U3 pin-and-resume test in `e2e/scroll-sync.spec.ts`, the local clamp (D-S1.7-2) and the echo rule (D-S1.5-6). **`plans/s1.5` and `plans/s1.11` both recorded `yOnly()` as "still deferred" earlier on 2026-09-15; this decision supersedes those two rows, and both files now say so.**

**The surgery is small, and the shipped code already says so.** Measured against `main` @ `d07b628`:

- **13 `panTo` write sites in `src/`** (tests excluded). **Nine are already x-only.** Four touch y: `view/scroll-attachment.ts` (element → model), `view/gantt-shell.ts` (the pan gesture), and `layout/viewport/viewport.ts` twice (the content-width re-clamp, and `reveal`).
- `panTo(to: Partial<ScrollPosition>)` already clamps each direction independently — it is already a per-axis write.
- `Viewport.visible` already computes `maxX` and `maxY` as two separate clamps.
- **Nothing memoizes on `scroll.state` object identity.** All twelve reads in `src/` are field reads, so assembling `state` from two axis sources is safe.

**`ScrollModel` retires with this decision, and that is the point rather than a side effect.** Demoting it to a shorthand for "share both" would leave the trap standing. The first consumer's brief wrote _"two panes scrolling as one → shared `ScrollModel` + `TimeScaleModel`"_ and meant a shared **horizontal** scroll. **The name told them it would work.** A container whose name hides which directions it couples is the defect this issue exists to remove, so it goes rather than being kept beside the fix. Ruled 2026-09-15, after a first pass had kept it.

**The surface, settled 2026-09-15.** The type is **`ScrollAxis`**. S1.5 rejected a `ScrollAxis` *tag* inside a filtered-view design; this is an axis *model*, and the name was free because no type ever used it. Bare "axis" meaning the time scale was tightened to "time axis" wherever it could now be read two ways — #7's rule is to retire the ambiguous word, not to pick a synonym.

```ts
/** One direction's scroll position and its bound — the unit two Gantt instances share. */
export declare class ScrollAxis {
  constructor(position?: number);
  /** Resolved + clamped, frozen. `position` may exceed `max` after a shrink (D-S1.5-2);
   *  `max` is the loosest bound any bound Gantt needs (D-S1.5-1). */
  get state(): ScrollAxisState;
  /** Move this direction. Clamps to `[0, max]` at write time. */
  panTo(position: number): void;
  batch(run: () => void): void;
}

export interface ScrollAxisState {
  readonly position: number;
  readonly max: number;
}

/** What `GanttOptions.scroll` takes. Omit a direction to keep it private. */
export interface ScrollAxes {
  readonly x?: ScrollAxis;
  readonly y?: ScrollAxis;
}
```

One spelling covers all four cases:

```ts
new Gantt({ container: '#plan', dataset });                          // share nothing

const x = new ScrollAxis();
const y = new ScrollAxis();
new Gantt({ container: '#top',    dataset: a, scroll: { x, y } });   // share both
new Gantt({ container: '#bottom', dataset: b, scroll: { x, y } });

new Gantt({ container: '#requests', dataset: r, scale, scroll: { x } }); // share x, private y
new Gantt({ container: '#workers',  dataset: w, scale, scroll: { x } });
```

`scroll` stays **one** config key — one config tree per job. **Omitting a direction is what keeps it private**, so there is no mode to name, no shorthand-versus-long-form to document, and no illegal pair to represent.

**What this costs, stated plainly.** Sharing both directions now takes two objects where it took one, and `gantt.scroll` reads back as `{ x, y }` rather than a model — `gantt.scroll.x.state.position` in place of `gantt.scroll.state.position.x`. `harness/scroll-sync.ts` and `[S1-A4]` need their construction updated; the e2e assertions themselves do not change. `ScrollState` retires with the class. Twelve `scroll.state` read sites in `src/` move, and most already read one direction only. Against that, one concept replaces two and the misleading name is gone.

**Unchanged by all of this:** `gantt.reveal()`, `panToDate()`, `panToToday()`, `Viewport.visible` (what rendering actually reads), the local clamp, the echo rule, and every acceptance assertion behind `[S1-A4]`.

**Settled during the build, not here.**

1. Whether `Viewport` holds two `ScrollAxis` references directly or one small `ScrollAxes` record.
2. Where the two-direction batch lives, so a `panTo` touching both fires one reaction. `Viewport` already coalesces scale and scroll into one notification, so that layer is the candidate.

**This is not a defect in D-S1.5-3.** That decision defined the both-axis fallback, documented it and tested it — the consumer can ship on that behaviour today. It is defined, not broken. It is simply not what this page wants, and its own return condition has now fired.

---

**Two earlier drafts of this section were wrong, and both are recorded here rather than overwritten.**

1. The first said the consumer shares both axes and had asked for no partial mode, and read that as evidence for keeping the deferral. It came from the brief's mapping table instead of its §1. Corrected 2026-09-15.
2. The second carried `xOnly()` as the shape to build, with `yOnly()` still deferred. **D-S6-1 supersedes it:** once the axis is the unit, neither half is a feature to grant or withhold, and a design that shipped only "x-only" would need extra code to forbid the other half.

### 5.4 `pnpm gate` has no S6 checklist

```
$ pnpm gate
gate: no automated checklist defined yet for slice S6.
```

`scripts/slice-gate.mjs` stops at `S5 → S6`. So the slice in flight is the one slice whose gate reports nothing, and a reviewer running the documented command gets a line that looks like a pass and is not one. That is the `[S1-A2]` lesson again: an id that was never written must fail loudly, not pass because nothing matched.

Every other slice's acceptance rows carry a bracketed id (`[S1-A4]`, `[S5-A6]`) that the gate greps for in a test title. **S6's five rows carry no ids.** Minting them is the first build step of this slice, because nothing else can be proved until the gate can name what it is proving.

Proposed ids: `[S6-A1]` budgets, `[S6-A2]` the 10k fixture, `[S6-A3]` the linked demo, `[S6-A4]` the leak check, `[S6-A5]` the pack audit.

### 5.5 S1.11 sends R2's throughput measurement to S7

`plans/s1.11-close-the-gate/README.md` §9 held the row _"Throughput measurement for the 5,000-entry page ('smoothly') | S7"_. This file's R2 and `plans/03` §S6 both put that measurement in S6, carried by #95. Two plan documents sent one job to two slices, so a builder who opened S1.11 first would defer it and tick nothing.

S6 is right: `plans/03` §S6 and D2 both put the budgets here. The S1.11 cell now reads S6 with a dated note, and D-S1.11-5's reason is unchanged — it rules out a CI timing assertion, not the slice. Corrected 2026-09-15.

**This section claimed four defects and listed four.** It was wrong by one, and this was the missing one. Treat §5 as the defects found so far, not as a closed list.

### 5.6 `plans/00` §4's S6 → S7 gate row does not name the leak check

`plans/03` §S6's acceptance list carries R4, the 100 mount/destroy cycles. The `plans/00` §4 gate row does not mention it. #403 spotted this and ruled it correctly: **a gate row does not replace the slice's own acceptance list**, so R4 is live whether or not the gate names it.

The ruling stands and nothing needs to change in `plans/00`. It is recorded here because it is the same shape as §5.1 — two lists, two readers, and no sentence reconciling them. A reader who checks only the gate row under-counts S6 by one row.

---

## 6. Order of work

**Read this first: three of the consumer's five asks have no slice.** S6's posture is "no new public feature" (§3), so #401 (per-tick value rows), #402 (`Segment` props) and #404 (`shading()`) sit outside it. #401 is the consumer's **blocking** ask and its own brief calls it "the one real gap in the model". The list below does not schedule any of the three.

0. **Answer Q3** (§4) — where #401, #402 and #404 land. Until that answer exists, the consumer's top blocker has no slice and no date, and nobody outside this file knows it.

1. **#400** — packaging. It blocks a consumer, it costs about a day, and it discharges R5.
2. **Mint `[S6-A1]`–`[S6-A5]` and add the S6 → S7 entry to `scripts/slice-gate.mjs`** (§5.4). Nothing after this is provable without it.
3. **#406** — raise the fixture to 10,000. Small and mechanical, and R2 cannot be measured until it lands.
4. **Answer Q1** (§5.1). Q2 and Q4 are answered; Q3 is step 0.
5. **#403** — the leak check. It has a waiting consumer and it needs no spike.
6. **#405** — x-only scroll sync. A waiting consumer, and a design pass first (`needs grill`).
7. **#95** — the spike, then the budgets it produces. R1 and R2 together.
8. **#407** — walk the brief's mapping table and reply row by row. It is an hour, it needs no spike, and it is the cheapest way to stop the next #405. Do it any time; it blocks nothing and nothing blocks it.
9. Re-read §2's unticked scope and either land each item or defer it in writing.

**Tick as you go.** When a row lands, tick it in `plans/03` §S6 in the same change as the code. Do not wait for a close-out step.
