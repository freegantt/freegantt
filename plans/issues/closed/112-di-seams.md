# #112 — DI seams: inject PaneLayout's host and DatasetState's reference date

**Reported:** 2026-08-30. Not stale. Two independent seams in one issue —
plan them and land them separately.

**Status (2026-09-01):** Seam A landed (`33b72c5`). Seam B is intentionally
deferred — it's S6-scoped prep work, now cross-referenced from
`plans/03-slices.md`'s S6 write-up (the "Known gap" bullet, which already
covered this from issue #91 §9-I, now also names #112). GitHub issue #112
is closed; Seam B is tracked as part of S6's scope, not as a standalone
open issue, since it has no independent acceptance criteria outside the
S6 harness work it feeds.

## Seam A — `DatasetState` reference date (small, do first) — ✅ done

### Current shape (researched)
- `src/data/dataset-state.ts`: `DatasetStateOptions` (52-81) has no field
  for it. Line 120: `this.referenceDate = now();` — always the real clock,
  documented at 87-90 as "the one `Date.now()` read this Dataset performs."
- Contrast, already-injectable pattern: `src/layout/date-line.ts`
  `ResolveDateLinesInput.now?: Instant` (33-34), used at line 60:
  `const at = todayLine === true ? (input.now ?? now()) : todayLine;`

### Plan
1. Add `referenceDate?: Instant` to `DatasetStateOptions`.
2. Change line 120 to `this.referenceDate = options.referenceDate ?? now();`
   — same optional-field-falls-back-to-real-clock shape as `date-line.ts`.
3. **Decision needed:** does this stay an internal/test-only seam on
   `DatasetStateOptions`, or does it need to surface on the public
   `DatasetOptions` (`src/api/dataset.ts`) too? The issue frames it as a
   testability gap ("tests cannot freeze it without patching `time/now`"),
   which argues for internal-only; expose publicly only if there's a real
   app-author use case for authoring a document with a frozen reference
   date.
4. Add a test that constructs `DatasetState` with a frozen `referenceDate`
   and confirms derived-span kinds resolve against it, without touching
   `time/now`.

## Seam B — inject what `PaneLayout` mounts into (larger, sequence with S6)

### Current shape (researched)
- `src/view/pane-layout.ts`: `PaneLayout`'s constructor calls
  `document.createElement(...)` directly for every node it builds (grid
  pane, spacer, row clip/layer, splitter, timeline pane — lines 71-104).
  `PaneLayoutOptions` (19-25) takes `container`, `gridWidth?`,
  `minGridWidth?` — no injection point, and no way to hand it a fake
  document. It also calls `readPixelProperty` from `render/dom/` directly.
- `src/view/gantt-shell.ts`: `PaneLayout` is constructed at lines 312-315,
  **before** `this.#backend = options.backend ?? createDomBackend()` at
  line 353 — so today `PaneLayout` can't be made headless-aware even by
  routing through the backend choice; it runs unconditionally against the
  real DOM.
- `src/render/null/index.ts`: `createNullBackend()` returns
  `RenderBackend<void>` (line 6) with a no-op `mount()` (line 14) —
  confirms the render side already has a working "swap the surface" seam.
  `PaneLayout` has no equivalent.
- The issue is explicit about scope: inject **what `PaneLayout` mounts
  into** (the host/surface), not `Viewport`, `FrameLayout`, or
  `PaneLayout` itself.

### Plan
1. **Design the seam's exact shape** before touching code — this is the
   one open design call in this issue. Two candidate directions:
   - Inject a `Document`-like factory (`ownerDocument`/`createElement`
     hook) that `PaneLayout` uses instead of the global `document`, so it
     can build against a minimal DOM shim in a headless test.
   - Inject the host elements themselves (mirroring how `RenderBackend`
     surfaces work) — `PaneLayout` receives pre-built mount points rather
     than building them.
   The issue's own framing ("inject what PaneLayout mounts into") leans
   toward the second, but confirm against how the S6 DOM-free harness
   actually wants to drive `view/` + `layout/` before committing — this is
   effectively S6 prep work, not a standalone bug fix. Check
   `plans/03-slices.md` / wherever S6 is scoped for the harness's expected
   shape and sequence this against it rather than in isolation.
2. Add the chosen option to `PaneLayoutOptions`, defaulting to today's
   behavior (`document`/real DOM) so no existing caller breaks.
3. Update `GanttShell`'s construction of `PaneLayout` (lines 312-315) to
   forward the new option when a caller supplies one.
4. Verify `readPixelProperty` (from `render/dom/`) also works against the
   injected host, or gets its own seam if it assumes real
   `getComputedStyle`.
5. Add a DOM-free test/harness case (S6-shaped) that drives `PaneLayout`
   without `happy-dom`/real `document`, proving the seam actually enables
   headless `view/` + `layout/` testing — that's the acceptance bar the
   issue sets, not just "the option exists."

## Out of scope (per issue)
- `FrameScheduler`/`requestAnimationFrame` — one production adapter,
  `flush()` covers tests.
- Moving `EventBus` out of `data/`.
- Injecting `History` or the span rollup.
- The static `createDomBackend` import as a bundle-size cut — that's #92.

## Acceptance
- Seam A: `DatasetState` can be constructed with a frozen `referenceDate`
  in tests without patching `time/now`; default behavior unchanged.
- Seam B: `PaneLayout` can be driven in a DOM-free harness the way
  `render/`'s null backend already allows for painting; default (real DOM)
  behavior unchanged for existing callers.
