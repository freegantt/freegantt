# #129 — Default Dataset timeZone to the browser zone when omitted

**Reported:** 2026-09-01. **Closed:** 2026-09-01, shipped.

## Resolution

Step 0's two questions were brought to the maintainer and answered:
1. **Node/headless fallback**: resolve via
   `Intl.DateTimeFormat().resolvedOptions().timeZone` at construction time;
   fall back to `'UTC'` when that reports nothing (bare Node). No `'local'`
   token is ever stored — the resolved IANA string is what `dataset.timeZone`
   and the serialized Document both carry, always.
2. **Cross-viewer consistency vs. ergonomics**: accepted. Omission means
   "author in the viewer's local calendar"; an explicit `timeZone` stays
   fully portable, as documented in `plans/02-public-api.md` §2.1.

Implementation: `src/time/zone.ts` gained `resolveDefaultTimeZone()` (the one
new `Intl` touch point, per I10), exported from `src/time/index.ts`.
`DatasetOptions.timeZone` (`src/api/dataset.ts`) is now optional; the `Dataset`
constructor resolves the default and passes a concrete string down to
`DatasetState`, which keeps its required-string invariant unchanged.
Serialization (`DatasetDocument.timeZone`) needed no change — it already
persisted whatever concrete string the Dataset held. Docs: `plans/02-public-api.md`
§2/§2.1, `CONTEXT.md`'s Dataset glossary entry. Tests: `time/zone.test.ts`
("resolveDefaultTimeZone (#129)"), `api/dataset.test.ts` ("Dataset timeZone
omission (#129)"). Harness fixtures keep their explicit `timeZone: 'UTC'` —
that pins e2e determinism across CI runners, it does not restate a library
default.

## Original plan

The issue listed open questions that blocked implementation — Step 0 below,
now resolved above.

## Current shape (researched)

- `src/api/dataset.ts`: `DatasetOptions.timeZone: string` is required
  (lines 31-34, doc comment cites D6/`plans/02` §2). Constructor (70-72)
  forwards straight to `DatasetState` with no default applied.
- `src/data/dataset-state.ts`: `DatasetStateOptions.timeZone: string`
  required (line 54); `this.timeZone = options.timeZone;` direct
  assignment, no fallback (line 118).
- `src/time/`: no `resolveDefaultTimeZone` or equivalent exists (confirmed
  by search). `src/time/instant.ts:25-26` has the pattern to follow —
  `now()` wraps `Date.now()` as the one sanctioned environment touch. A new
  resolver belongs in `src/time/zone.ts` (currently only `toPlain`/
  `toZoned`/`fromZoned`), per I10 ("time/ is the only place allowed to use
  `new Date()`/`Date.now()`... or arithmetic on `Instant`").
- `Gantt.locale` (`src/api/gantt.ts:57`) is optional and just passed through
  to `Intl` constructors, which resolve their own default — that's a
  *different, simpler* pattern than what `timeZone` needs, since `timeZone`
  feeds `time/` arithmetic (plain-date parsing, day boundaries), not just
  display formatting. Don't copy the locale pattern directly.
- `DatasetDocument` (`src/model/document.ts:33-39`) and both serialization
  read/write paths (`src/data/serialization/`) treat `timeZone` as
  required and part of the ordered key contract. No optional/undefined
  handling exists there today.
- `plans/02-public-api.md` §2 already has a comment anticipating this:
  `timeZone: 'America/Chicago', // explicit; 'local' is opt-in` — i.e. a
  `'local'` sentinel was already contemplated as the opt-in mechanism,
  distinct from simply omitting the field. §2.1: plain date strings without
  `Z`/offset resolve through the dataset's `timeZone` zone so one entry
  list renders identically for every viewer — this is the invariant the
  browser-default proposal is in tension with (see Step 0).

## Plan

### Step 0 — Decision needed (blocks everything else)
The issue lists these explicitly; they need an answer before code:
1. **Node/headless fallback**: UTC when `Intl` reports nothing, vs. require
   explicit `timeZone` in Node, vs. a `'local'` sentinel resolved at
   construction time and then stored as the resolved IANA string. The
   `plans/02` comment already leaning toward `'local'` as opt-in is a
   useful precedent — recommend that direction unless there's a reason to
   diverge.
2. **Cross-viewer consistency vs. ergonomics**: confirm the issue's own
   proposed resolution — omission means "author in the viewer's local
   calendar" (ergonomics), explicit `timeZone` means "portable,
   viewer-independent" (today's §2.1 story) — is acceptable, since it's a
   real behavior split that needs to be documented, not just implemented
   silently.

Bring these two to the user/maintainer for a decision before Step 1.

### Step 1 — Add the resolver in `time/`
`src/time/zone.ts`: add `resolveDefaultTimeZone(): string`, using
`Intl.DateTimeFormat().resolvedOptions().timeZone`, with the Node fallback
chosen in Step 0. This is the only file allowed to touch `Intl`/environment
clock resolution for this purpose (I10).

### Step 2 — Make `timeZone` optional at the API boundary
- `DatasetOptions.timeZone?: string` (`src/api/dataset.ts`).
- `DatasetStateOptions.timeZone?: string` (`src/data/dataset-state.ts`), or
  resolve the default at the `Dataset` constructor boundary and always pass
  a concrete string down to `DatasetState` — pick whichever keeps
  `DatasetState`'s required-string invariant intact (prefer resolving in
  `api/`, keep `data/` receiving a concrete value, consistent with
  "internals stay complete after ingest").
- `dataset.timeZone` getter stays `string` (always concrete) — no change to
  its return type.

### Step 3 — Serialization
- `DatasetDocument.timeZone` stays required and in its ordered position —
  persist the **resolved** IANA id, never a magic token (unless Step 0
  picked the `'local'` sentinel *and* decided it should round-trip as
  `'local'` rather than resolved — get this explicit in the decision, not
  assumed).
- `fromJSON` needs no change if the document always carries a concrete
  zone string already (it does today).

### Step 4 — Update docs
- `plans/02-public-api.md` §2: remove or rewrite the
  `// explicit; 'local' is opt-in` comment to match whatever Step 0
  actually decided.
- `CONTEXT.md`: the dataset-zone glossary entry currently says the zone is
  a Dataset property, not the runtime environment — add the omission
  behavior without contradicting that (the zone is still resolved *once*
  and stored on the Dataset; it's just resolved from the environment when
  not given).
- Harness examples: decide whether `harness/main.ts` should demonstrate the
  omitted-`timeZone` path (ties into the CLAUDE.md rule that harness code
  restating a library default, like `rowHeight: 32` did, is itself an API
  gap worth catching).

### Step 5 — Tests
- Browser default: happy-dom or a stubbed `Intl.DateTimeFormat` resolves
  the expected zone.
- Explicit `timeZone` still overrides the default.
- Node/test-environment fallback behaves per the Step 0 decision.
- Serialization round-trip preserves the resolved zone.
- Plain-date ingest, snapping, week-start, and `referenceDate`
  initialization (ties to #112 Seam A) all use the resolved zone — no
  second code path.

## Acceptance (from the issue, unchanged)
- `new Dataset({ entries })` works in the browser without `timeZone`.
- `dataset.timeZone` is a concrete IANA string after construction.
- Explicit `timeZone` overrides the default.
- Node/test environments have a documented, deterministic fallback.
- `toJSON`/`fromJSON` round-trip preserves the resolved zone.
- Docs state when to omit vs. set `timeZone` explicitly.
