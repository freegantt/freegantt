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

### `TimeScaleModel` (S1)

```ts
import { TimeScaleModel } from 'freegantt';

const scale = new TimeScaleModel({
  zone: 'America/Chicago', // IANA zone; all civil (day/week) stepping resolves through it
  range: { start, end }, // Instant, Instant — half-open [start, end)
  pxPerMs: 1 / (1000 * 60 * 60), // linear scale for now; non-linear scales are a future TimeScale impl
});
```

The standalone, shareable object a `Gantt` binds to for time↔pixel mapping (`plans/01` §8.2, D9).
Pass the **same instance** to two `Gantt`s and their x-axis stays in sync by construction — no
event plumbing, no link manager. Omit `scale` on `Gantt` and it builds a private default sized to
the project's task range — single-chart usage never has to meet this concept.

Preset switching, zoom, and named presets (`'weekAndMonth'` etc.) land later in S1; today
`TimeScaleModel` only takes an explicit `zone`/`range`/`pxPerMs`.

### `Gantt`

```ts
import { Gantt } from 'freegantt';

const gantt = new Gantt({
  host: element, // HTMLElement
  project, // Project
  scale, // optional TimeScaleModel — omit for a private default
  rowHeight: 32, // optional, defaults to 32
});

gantt.destroy();
```

Mounts a chart into `host` and renders `project.tasks` as positioned bars, one row per task
(flat list; hierarchy/grouping land in S5). Two `Gantt` instances on one page are fully
independent (no shared module state — I2); two given the same `scale` x-sync (D9, proven in
`src/api/gantt.test.ts`).

## Internal building blocks (not yet public, documented here as they're built)

### `time/TimeScale`

Pure, DOM-free mapping between `Instant` (epoch ms) and pixels, plus tick generation for a
`ViewPreset`. Lives in `src/time/scale.ts`; `TimeScaleModel` (above) is the public wrapper around
it. Arithmetic on an `Instant` is only legal inside `time/` (I10) — `TimeScale.xForInstant` /
`instantForX` / `widthForDuration` are the only sanctioned way to convert time to pixels elsewhere
(I12).

Supported step units today: `ms`, `m`, `h`, `d`, `w` (month/year presets land once `time/` grows
civil month arithmetic). A `ViewPreset` is plain config (`tickUnit`, `tickIncrement`, `headers`,
`tickWidthPx`, `snap`) — never a switch statement in the library; custom presets are just objects.

`TimeScaleModel` itself lives in `src/layout/time-scale-model.ts`, not `time/` — it's the only
DOM-free layer both allowed to import `time/` and reachable from `view/`→`api/` through the
layer-boundary rules (I1), so that's where the public wrapper is defined and re-exported through.

Next up in S1: header band + rendered `ViewPreset` ticks in the harness, `ScrollModel` +
virtualization, the grid pane, and anchored zoom — see `plans/03-slices.md` S1.

## Development

```
pnpm install
pnpm dev        # harness at http://localhost:5173
pnpm verify     # format/typecheck/lint/boundaries/guards/unit tests/vendor-names/disables
pnpm test:e2e   # Playwright smoke test against the harness
```

The dev harness (`harness/`) is a living page: every slice adds to it, and it's the place to
visually confirm a slice's acceptance criteria (see `plans/03-slices.md`).
