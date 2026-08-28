# S2.4 mid-step handoff — live binding

**Branch:** `s2-s2`. This session's work is committed and pushed (`35647ba`). Working tree clean at
handoff time.

**Verified green:** `pnpm verify` (format:check, typecheck, lint, boundaries, guards, test:node,
test:dom, vendor-names, disables, build) and `pnpm test:e2e` (15/15) — both ran to completion via the
`pre-push` hook on the push itself.

---

## What this session shipped

Read `plans/s2-data-core/s2.4-live-binding.md` in full — this handoff assumes it. The step lands in
two halves; this session did the mechanism half and left the demonstration half open.

- **`src/view/dataset-change-subscription.ts`** (§1, D-S2-20) — the whole of the view's dependency on
  data change: `subscribeToDatasetChanges(dataset, onChange)` subscribes to `dataset.on('change')` and
  calls back with the committed `ChangeSet`. Uses nothing a consumer could not use. One importer,
  `view/gantt-shell.ts`, enforced by `.dependency-cruiser.cjs`'s new
  `dataset-change-subscription-is-removable` (the test file is the only other allowed importer).
  `src/view/dataset-change-subscription.test.ts` covers: forwards the changeset, `unsubscribe()` stops
  forwarding.
- **`src/view/frame-scheduler.ts`** (§2, D-S2-15) — `FrameScheduler`, the single rAF owner: `request()`
  coalesces N calls into one render on the next animation frame, `flush()` runs synchronously and
  cancels any pending frame, `cancel()` drops a pending frame with no render. Header note states the
  "not a second batcher" distinction from `BatchedNotifier` per the step file. `GanttShell` now holds
  one (`#frames`), routes every post-construction render request through it (the viewport's `onChange`,
  the dataset-change subscription), calls `flush()` for its own synchronous first render, and `cancel()`
  in `destroy()`.
- **`ViewportHandle.setEntries`** / **`ScaleBindingHandle.setEntries`** (§1) — `layout/viewport/viewport.ts`
  and `layout/viewport/time-scale-model.ts`. `GanttShell`'s subscription callback pushes
  `dataset.entries.all` through `setEntries` on every `change`; `TimeScaleModel`'s `'fitDataset'`
  re-resolves through its existing D-S1.5-4 equality check, so an edit inside the current span is a
  no-op and one outside it re-fits.
- **`FrameLayout.heightIndexRevision`** (§3, D-S2-16) — bumped in `#heightsFor` whenever a fresh
  `PrefixSumHeightIndex` is built. Not yet asserted by a test — see below.
- **`model/dataset.ts`'s `Dataset` contract gains `on`/`off`** — needed so `view/` (which may import
  `model/` but not `api/`) can call `dataset.on('change', ...)` against the public contract type
  rather than the concrete `api/Dataset` class or `data/DatasetState`. Both already implement these
  methods; this only adds them to the interface all three already satisfy.
- **`CONTEXT.md`** gains the **Subscription** entry (Mutation section, after **Veto**) — written before
  the code per the step file's own instruction.
- Test migration (§2.1): the dom tests this makes asynchronous — three in `gantt-shell.test.ts`
  (a second-Gantt bind notification, a resize-driven recull, the content-sizer resize) and two in
  `api/gantt.test.ts` (a preset switch, `zoomBy` observed on a second shared Gantt) — each gained one
  flush (`shell.render()` where a `GanttShell` reference is in scope, an awaited real animation frame
  tick where only the public `Gantt` façade is). No assertion changed.

## What is still open for S2.4

Everything else in the step file's own TODO (§6):

- **`[S2-A3]`** (§4) — `src/view/gantt-shell.test.ts`, dom project. Over a 500-entry dataset, inside one
  transaction, update one field on every entry. Assert one `change` event, one `computeFrame` call (spy
  through the `FrameLayout` the shell owns — needs a seam to reach it, since it's a private field
  today), one `backend.sync` call (swap in the null backend to count), `heightIndexRevision` unchanged.
  This needs a *real* `DatasetState`/`Dataset` wired to a `GanttShell` (not the bare `fakeDataset()`
  stub `gantt-shell.test.ts` uses elsewhere, which never actually commits a transaction) — likely a
  small dedicated test using `api/Dataset` and `view/GanttShell` together, or a new constructor-time
  hook for the test to observe `computeFrame`/`sync` counts.
- **`src/layout/viewport/viewport.test.ts`** — `setEntries` re-resolves `fitDataset`; an edit inside the
  existing span does not churn the scale. The plumbing is in place (`ScaleBindingHandle.setEntries`,
  `time-scale-model.test.ts`'s existing equality-check pattern for `setPaneWidth` is the template) —
  just the test itself is unwritten.
- **`harness/data.html` + `harness/data.ts`** (§5, D-S2-17) — add/rename/move ±1 day/remove buttons, a
  changeset log panel (`store · id · field · from → to` per row, built from the changeset, never a
  re-read), and the "lock the first entry" checkbox exercising `beforeChange`/`MutationCancelledError`
  (D-S2-25). Not started.
- **`vite.config.ts`** — register `data.html` as the fifth input alongside `index`, `scroll-sync`,
  `zoom`, `large-dataset`. Trivial once the harness page exists.
- **Harness review** (CLAUDE.md's standing rule) — re-read `harness/main.ts` and the new `data.ts`
  once written: no restated library defaults, no hand-built stand-ins, public API only.
- **Root `README.md`** — the mutation example is still the pre-S2.3 "lands in later slices" wording
  (Quick start section, and the `Dataset` subsection under Public API). Needs a real
  `dataset.entries.add/update/remove` example plus a sentence that edits now render live, matching
  `plans/s2-data-core/README.md`'s own doc-touch note ("the mutation example from `plans/02` §2, now
  real").
- **`plans/s2-data-core/s2.4-live-binding.md`'s own TODO checklist** — none of it is ticked yet; tick as
  each item above lands.
- **#33** — close with the fix named, once the above is done.
- Re-run `pnpm verify` and `pnpm test:e2e` once the harness page and remaining tests land — both were
  green at this handoff, but neither exercises the still-open work above.

## Note on scope

This session stopped partway through S2.4 at the user's request ("stop when you finish 2.3" — S2.3
was already closed at session start; read as "commit this increment and hand off" for S2.4). The
mechanism (subscription + scheduler + setEntries + heightIndexRevision) is the harder, more
foundational half and is done and green; the remaining work is mostly a test, a harness page, and doc
touch-ups — no further design decisions expected, but read the step file's §4/§5 before starting since
the `[S2-A3]` test needs a small design call on how the test reaches `FrameLayout`/`RenderBackend`
counts through `GanttShell`'s private fields.
