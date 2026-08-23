# FreeGantt

Framework-free TypeScript Gantt/timeline library. Library-first: the API, docs, and packaging are
designed for external consumers from day one. See `plans/00-overview.md` for the full spec and
`plans/03-slices.md` for the delivery roadmap; this file documents the public surface as it lands,
slice by slice.

**Status:** pre-release, slice `S1` in progress (`.slice`). Nothing here is published yet.

## Public API

Everything importable by a consumer lives under `src/api/` and `src/model/` (types only). Internal
layers (`time/`, `data/`, `scheduling/`, `layout/`, `render/`, `view/`) are not part of the public
surface.

### `Project`

```ts
import { Project } from 'freegantt';

const project = new Project({ tasks: [...] }); // readonly Task[], S0/S1 scope
```

`Project` is a headless, DOM-free wrapper around a task list. Transactions, undo/redo, and
mutation (`project.tasks.add/update/remove`) land in S2 — see `plans/03-slices.md`.

### `Gantt`

```ts
import { Gantt } from 'freegantt';

const gantt = new Gantt({
  host: element,      // HTMLElement
  project,             // Project
  rowHeight: 32,        // optional, defaults to 32
});

gantt.destroy();
```

Mounts a chart into `host` and renders `project.tasks` as positioned bars, one row per task
(flat list; hierarchy/grouping land in S5). Two `Gantt` instances on one page are fully
independent (no shared module state — I2).

`pxPerMs`/manual scale options are being replaced by a real time scale as S1 lands (see below);
don't depend on them.

## Internal building blocks (not yet public, documented here as they're built)

### `time/TimeScale` (S1, step 1)

Pure, DOM-free mapping between `Instant` (epoch ms) and pixels, plus tick generation for a
`ViewPreset`. Lives in `src/time/scale.ts`. This is the seam that makes multi-chart x-sync (D9)
possible later — nothing outside `time/` is allowed to do arithmetic on an `Instant` (I10).

```ts
import { createTimeScale } from '../time/index.js';

const scale = createTimeScale({
  zone: 'America/Chicago',           // IANA zone; all civil (day/week) stepping resolves through it
  range: { start, end },             // Instant, Instant — half-open [start, end)
  pxPerMs: 1 / (1000 * 60 * 60),     // linear scale for now; non-linear scales are a future TimeScale impl
});

scale.xForInstant(i);                // Instant -> px, relative to range.start
scale.instantForX(x);                // px -> Instant
scale.widthForDuration(duration, at); // px width of a Duration anchored at an Instant (zone-aware)
scale.ticks(preset);                  // readonly Tick[] for a ViewPreset
```

Supported step units today: `ms`, `m`, `h`, `d`, `w` (month/year presets land once `time/` grows
civil month arithmetic). A `ViewPreset` is plain config (`tickUnit`, `tickIncrement`, `headers`,
`tickWidthPx`, `snap`) — never a switch statement in the library; custom presets are just objects.

`TimeScaleModel` (the bindable, shareable wrapper a `Chart`/`Gantt` binds to — `plans/02` §5) and
its integration into `Gantt`/`Chart` land next (S1, step 2); that step also retires the S0-era
inline pixel-scale placeholder in `api/gantt.ts`.

## Development

```
pnpm install
pnpm dev        # harness at http://localhost:5173
pnpm verify     # format/typecheck/lint/boundaries/guards/unit tests/vendor-names/disables
pnpm test:e2e   # Playwright smoke test against the harness
```

The dev harness (`harness/`) is a living page: every slice adds to it, and it's the place to
visually confirm a slice's acceptance criteria (see `plans/03-slices.md`).
