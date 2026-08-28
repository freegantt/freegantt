# FreeGantt

Framework-free TypeScript Gantt/timeline library. Library-first: the API, docs, and packaging are
designed for external consumers from day one. See `plans/00-overview.md` for the full spec and
`plans/03-slices.md` for the delivery roadmap; this file documents the public surface as it lands,
slice by slice.

**Status:** pre-release, slice `S1` in progress (`.slice`). Nothing here is published yet. The
public API below is a work in progress and will change — names, options, and defaults are not
stable across slices until S1 closes (`plans/03-slices.md`).

## Quick start

Minimal example: put a small, fixed set of entries into a `Gantt`.

```ts
import { Gantt, Dataset } from 'freegantt';

const dataset = new Dataset({
  timeZone: 'America/Chicago', // IANA zone; required — every date below is read through it (D6)
  entries: [
    { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-07' },
    { id: 't2', name: 'Build', start: '2026-09-08', end: '2026-09-21' },
    { id: 't3', name: 'QA', start: '2026-09-22', end: '2026-09-28' },
  ],
});

const gantt = new Gantt({
  container: document.getElementById('gantt')!, // an HTMLElement or a CSS selector
  dataset,
});
```

Ids are plain strings and dates are plain strings; nothing has to be constructed first. Wrap the
entries in a `Dataset` with the IANA `timeZone` they are written in, mount a `Gantt` on a container
element, and `gantt.destroy()` tears it down.

Editing after mount is a plain call on `dataset.entries` — no second render path, no re-mount. Every
call auto-wraps in its own transaction (D-S2-8), so a bound `Gantt` moves the bar on the next frame:

```ts
dataset.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.update('t2', { name: 'Framing — north wing' });
dataset.entries.remove('t9'); // and every descendant, in the same changeset

dataset.transaction(() => {
  dataset.entries.update('t1', { start: '2026-10-05' });
  dataset.entries.update('t2', { start: '2026-10-12' });
}); // one changeset, one render

dataset.undo(); // reverts the transaction above in one call
dataset.redo();
```

`undo()`/`redo()` return nothing — like every other commit, what they did arrives on
`dataset.on('change')`, tagged `origin: 'undo'`/`'redo'`. `canUndo`/`canRedo` say whether there is
anything to undo/redo. Dependencies land in a later slice — see `plans/03-slices.md`.

## Dates and ids a consumer can write

`Dataset` reads what a consumer writes (`EntryInput`) into what the library stores (`Entry`) once, at
construction. Two things get looser at that boundary, and only there.

**Ids** are plain `string`s. Internally an id is a branded `EntryId` so it cannot be mixed with an
ordinary string, but the brand is applied on the way in — a consumer never calls `entryId()`. (It is
still exported for a consumer that wants to hold branded ids of its own.)

**Dates** are any `InstantInput`: a string, a `Date`, epoch milliseconds, or an already-branded
`Instant`. Every form below is legal in the same entry list:

```ts
import { Dataset, instant } from 'freegantt';

const dataset = new Dataset({
  timeZone: 'America/Chicago', // CDT (UTC-5) on the dates below
  entries: [
    // A bare calendar date — that day's start, in the dataset's timeZone.
    { id: 'a', name: 'Date only', start: '2026-09-08', end: '2026-09-10' },
    //                                    -> 2026-09-08T05:00:00Z

    // A wall-clock time with no zone — read in the dataset's timeZone.
    { id: 'b', name: 'With a time', start: '2026-09-08T14:30', end: '2026-09-10' },
    //                                     -> 2026-09-08T19:30:00Z
    // Seconds and a fractional second are optional, and a space works instead of the `T`.
    { id: 'c', name: 'To the ms', start: '2026-09-08 14:30:45.250', end: '2026-09-10' },
    //                                   -> 2026-09-08T19:30:45.250Z

    // A zone of its own — the offset wins and timeZone is not consulted.
    { id: 'd', name: 'UTC', start: '2026-09-08T14:30:00Z', end: '2026-09-10' },
    //                            -> 2026-09-08T14:30:00Z
    { id: 'e', name: 'Offset', start: '2026-09-08T14:30:00+02:00', end: '2026-09-10' },
    //                               -> 2026-09-08T12:30:00Z

    // A Date object — absolute, as written. Its own timezone handling already happened.
    { id: 'f', name: 'Date object', start: new Date('2026-09-08T14:30:00Z'), end: '2026-09-10' },
    //                                    -> 2026-09-08T14:30:00Z

    // Epoch milliseconds, and an Instant a consumer built with instant() — both pass straight through.
    { id: 'g', name: 'Epoch ms', start: 1788000000000, end: '2026-09-10' },
    { id: 'h', name: 'Instant', start: instant('2026-09-08T14:30:00Z'), end: '2026-09-10' },
  ],
});
```

As a table:

| Written                                                    | Read as                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `'2026-09-08'`                                             | that day's start, in the dataset's `timeZone`           |
| `'2026-09-08T14:30'` · `'2026-09-08 14:30'` · `'…:45.250'` | that wall-clock time, in the dataset's `timeZone`       |
| `'2026-09-08T14:30:00Z'` · `'…+02:00'`                     | absolute — the offset wins, `timeZone` is not consulted |
| `new Date(…)` · `1788000000000` · `instant(…)`             | absolute, as written                                    |

### Which zone applies, and when

A string with **no** offset is a _Plain_ time — a wall-clock reading that names no instant until a
zone resolves it. The dataset's `timeZone` is that zone. This is why `timeZone` is required: it
makes one entry list render identically for every viewer, rather than shifting with whatever machine
opens the page.

If you want an entry pinned to an absolute moment regardless of the dataset's zone, write the zone
into the string (`'…Z'` or `'…+02:00'`) or pass a `Date`. Those never consult `timeZone`.

```ts
const entries = [{ id: 't1', name: 'Design', start: '2026-09-08', end: '2026-09-10' }];

// One bare date, three zones, three different instants:
new Dataset({ timeZone: 'America/Chicago', entries }); // start -> 2026-09-08T05:00:00Z
new Dataset({ timeZone: 'Asia/Tokyo', entries }); //      start -> 2026-09-07T15:00:00Z
new Dataset({ timeZone: 'UTC', entries }); //             start -> 2026-09-08T00:00:00Z

// Write the zone into the string instead, and all three agree:
const pinned = [{ id: 't1', name: 'Design', start: '2026-09-08T00:00:00Z', end: '2026-09-10' }];
new Dataset({ timeZone: 'Asia/Tokyo', entries: pinned }); // start -> 2026-09-08T00:00:00Z
```

DST is resolved explicitly rather than left to chance: a Plain time inside a spring-forward gap
shifts forward by the gap, and an ambiguous fall-back time takes the earlier offset.

A value that names no instant — `'next tuesday'`, or a date the calendar does not have such as
`'2026-02-31'` — throws `InvalidInstantError` rather than sliding to a nearby date.

### `dateOnlyEnd` — what a bare date on `end` means

Storage is half-open `[start, end)`, so `end` is the boundary _after_ the entry, not its last
moment. A consumer writing a bare date on `end` normally means the last day it wants included, so that
is the default reading:

```ts
new Dataset({
  timeZone: 'America/Chicago',
  dateOnlyEnd: 'inclusive', // the default
  entries: [{ id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-07' }],
});
// covers Sept 1 through Sept 7 — the stored end is the start of Sept 8
```

Set `dateOnlyEnd: 'exclusive'` to read a bare date literally instead, matching stored geometry
exactly:

```ts
new Dataset({
  timeZone: 'America/Chicago',
  dateOnlyEnd: 'exclusive',
  entries: [{ id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' }],
});
// covers Sept 1 through Sept 7 — the stored end is the start of Sept 8
```

The rule applies **only to a date-only string on an `end` field** (entry ends and segment ends). An
`end` that already carries a time of day, a `Date`, epoch milliseconds, or an `Instant` is a
boundary already and is read literally under either setting. `start` is never adjusted.

## Public API

Everything importable by a consumer lives under `src/api/` and `src/model/` (types only). Internal
layers (`time/`, `data/`, `scheduling/`, `layout/`, `render/`, `view/`) are not part of the public
surface.

### `Dataset`

```ts
import { Dataset } from 'freegantt';

const dataset = new Dataset({
  entries, // readonly EntryInput[] — see "Dates and ids a consumer can write"
  timeZone, // IANA zone, required (D6)
  dateOnlyEnd, // optional, 'inclusive' (default) | 'exclusive'
});

dataset.entries.all; // readonly Entry[] — ids branded, dates resolved to Instant

dataset.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });
dataset.entries.update('t2', { name: 'Framing — north wing' });
dataset.entries.remove('t9');

dataset.transaction(() => {
  /* several entries.add/update/remove calls, one changeset */
});

dataset.on('change', ({ changeSet }) => {
  /* changeSet.added / .removed / .updated — a bound Gantt reacts to this itself */
});

dataset.undo(); // origin: 'undo' on the change event it emits
dataset.redo(); // origin: 'redo'
dataset.canUndo; // false once the stack (default capacity 100) is exhausted
dataset.canRedo;

// The write path undo()/redo() are built on, published for a consumer's own History:
dataset.replay(invertChangeSet(recordedChangeSet)); // origin must be 'undo' or 'redo'
```

`Dataset` is a headless, DOM-free wrapper around an entry list. It reads each `EntryInput` into an
`Entry` once, at construction, and never mutates what the consumer handed it. Every mutator
auto-wraps in a transaction (D-S2-8); `dataset.transaction(() => { ... })` batches several into one
changeset. A `Gantt` bound to the dataset subscribes to `change` itself — editing after mount renders
on the next frame with no extra call. `beforeChange` can veto a changeset (returning `false` throws
`MutationCancelledError` from the mutator that triggered it); `undo()`/`redo()` revert or replay a
committed changeset exactly, cascades included, without re-running the extension hook. `replay` and
`invertChangeSet` are that same write path, published — a consumer can write their own History against
`on('change')`, `invertChangeSet`, and `replay` alone, with no internal import. Dependencies land in a
later slice — see `plans/03-slices.md`.

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
the dataset's entry range — single-Gantt usage never has to meet this concept.

Preset switching, zoom, and named presets (`'weekAndMonth'` etc.) land later in S1; today
`TimeScaleModel` only takes an explicit `zone`/`range`/`pxPerMs`.

### `Gantt`

```ts
import { Gantt } from 'freegantt';

const gantt = new Gantt({
  container: element, // HTMLElement
  dataset, // Dataset
  scale, // optional TimeScaleModel — omit for a private default
  preset, // optional ViewPreset — omit for dayPreset (see below)
  rowHeight: 32, // optional, defaults to 32
});

gantt.destroy();
```

Mounts a Gantt into `container` and renders `dataset.entries` as positioned bars under a header band of
time ticks, one row per entry (flat list; hierarchy/grouping land in S5). Two `Gantt` instances on
one page are fully independent (no shared module state — I2); two given the same `scale` x-sync
(D9, proven in `src/api/gantt.test.ts`).

### `dayPreset` (S1)

```ts
import { dayPreset } from 'freegantt';
```

The shipped default `ViewPreset`: one header tick per civil day, labeled `YYYY-MM-DD` in the
scale's zone. Presets are plain config objects, never a switch statement (`plans/01` §5.1) — more
shipped presets (hour→year) and preset switching land later in S1.

## Styling and theming

`Gantt` injects its own default stylesheet once per `document` (`<style data-freegantt-styles>`),
so nothing renders unstyled. A consumer never edits that stylesheet — instead, override the CSS custom
properties it defines, in the consumer app's own `.css`:

```css
/* consumer app's own stylesheet — no build step, no TypeScript */
:root {
  --fg-bar-fill: #2563eb;
  --fg-header-bg: #ffffff;
}
```

The full set of overridable tokens (`--fg-pane-bg`, `--fg-header-bg`, `--fg-bar-fill`,
`--fg-warn`, and so on) is listed in `src/view/styles.ts`. Any selector the library renders
(`.fg-bar`, `.fg-row`, `.fg-header`, …) can also be targeted directly for changes a token doesn't
cover.

### Light and dark mode

The base stylesheet ships both a light token set (on `:root`) and a dark token set, applied two
ways:

- **Automatic:** a `prefers-color-scheme: dark` media query supplies the dark tokens whenever the
  consumer page hasn't set `data-fg-theme`, so a `Gantt` follows the OS/browser preference with no
  extra wiring.
- **Explicit:** setting `data-fg-theme="dark"` (or `"light"`) on an ancestor element — typically
  `<html>` or the `Gantt`'s `container` — pins the theme regardless of `prefers-color-scheme`.

To customize dark mode instead of just light mode, scope the override to the dark selector(s):

```css
:root {
  --fg-bar-fill: #2563eb; /* light mode */
}
[data-fg-theme='dark'] {
  --fg-bar-fill: #60a5fa; /* explicit dark mode */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-fg-theme]) {
    --fg-bar-fill: #60a5fa; /* OS-preference dark mode */
  }
}
```

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

Next up in S1: `ScrollModel` + virtualization, the grid pane with shared row geometry (I9), and
anchored zoom/preset switching — see `plans/03-slices.md` S1.

## Development

```
pnpm install
pnpm dev        # harness at http://localhost:5173
pnpm verify     # format/typecheck/lint/boundaries/guards/unit tests/vendor-names/disables
pnpm test:e2e   # Playwright smoke test against the harness
```

The dev harness (`harness/`) is a living page: every slice adds to it, and it's the place to
visually confirm a slice's acceptance criteria (see `plans/03-slices.md`).
