# Core raises an Error report; the consumer retains it

A refusal is a throw, a CSS state, or a `console` line, and then it is gone. Twenty-odd
`attemptMutation(...)` call sites in `harness/` keep a boolean and discard the
`MutationCancelledError` that explains it. Seven `console.error`/`console.warn` sites in `src/`
reach devtools and no further. A vetoed gesture records nothing at all, by design
(`plans/02` §3). So a consumer who wants to show the user what went wrong has nothing to read.

**Core raises. The consumer retains.** `error` fires on both the Dataset and the Gantt, carrying an
`ErrorReport`. There is no `gantt.errors` array and no ring buffer. Only core can *observe* a
refusal — `transaction.ts` throws `MutationCancelledError` after `emit('beforeChange')` returns
false, and a plugin's own handler ran beside the vetoing one and never learns the outcome — so the
channel cannot live in a plugin. But retention is *policy*: the cap, the overflow rule, the dedupe,
the ordering, and what clears it are all consumer decisions core would guess wrong, and a buffer
hanging off `Gantt` never tree-shakes away for a consumer who does not want one. The consumer's own
version is three lines over the event, with their retention rule.

`severity` is `'error' | 'warning' | 'info'`, not `'refusal' | 'fault'`. A Refusal is the library
working correctly and reports at `'info'`; the four existing `console.error` sites are `'error'` and
the three `console.warn` sites are `'warning'`, so no site's severity is re-litigated. This keeps
`CONTEXT.md`'s standing rule that a Refusal is not an Error — the distinction moved from the event's
name into the payload, where a consumer can act on it.

The seven `console.*` sites keep their output as a **fallback that fires only when nothing is
subscribed to `error`**, the way an unhandled `EventEmitter` `'error'` is treated as unhandled. A
consumer who subscribes gets silence and control; one who does not keeps the output they have today.

It is deliberately **not** guarded by `isDevMode()`. That helper reads `import.meta.env.DEV`, which
Vite resolves when *this repo* builds `dist/` — not when a consumer builds their app. It bakes to
`false` and the branch is dead-code-eliminated: the one site already behind it appears zero times in
the shipped bundle. `isDevMode()` is a library-development flag, true only for our own harness
running from source, so it would have removed these lines from every consumer's build in dev and
production alike.

The event is named `error` although a Refusal travelling on it is not an error. Familiarity won:
every consumer knows what `on('error')` will give them, and `severity` carries the honesty the name
gives up.

`watchAllErrors([dataset, gantt], handler)` — an `api/` helper beside `attemptMutation` — subscribes
one handler to several emitters, de-duplicated by emitter identity, and returns one disposer. Two
emitters is the honest model of where reports originate; one subscription is what a consumer wants.

## Considered options

- **A bounded log on the `Gantt` (`gantt.problems`), as issue #159 first proposed.** Rejected: it
  puts a retention policy in core, cannot record what a Dataset raises before any Gantt exists, and
  is permanent weight for a consumer who never reads it. No comparable product ships one — each
  ships a channel plus an *optional* presenter, and the one that does retain, retains into the
  console and documents that you should turn it off in production.
- **An error-reporting plugin that owns both the recording and the surface.** Rejected on
  observability, not on taste: `DatasetPluginContext.events` is `beforeChange`/`change` only, and no
  event reports that a veto happened. A plugin also cannot see the Rollup's `AggregatorFailedError`,
  a renderer throwing in `render/dom`, or a disposer throwing. It can never be the recorder.
- **The Gantt forwards the Dataset's reports, so `gantt.on('error')` is the single feed.** Rejected:
  two Gantts on one Dataset deliver every Dataset report twice, reports raised during
  `new Dataset(...)` are missed, and it makes the Gantt claim authorship of what it did not observe.
- **Ship a first-party toast/notification plugin.** Deferred, not rejected. A generic toast is not
  Gantt domain knowledge, and shipping one means owning its stacking, timing, theming and
  announcement. `harness/editing.html` demonstrates the wiring; promote it only if every consumer
  would copy that code verbatim.
- **A build-time switch for the console fallback.** Rejected: one `dist/` serves every consumer and
  their production mode is invisible when we build it. `process.env.NODE_ENV` left unresolved for
  their bundler costs raw-ESM consumption; dual builds behind `exports` conditions double S5.13's
  tree-shaking budget; a runtime config key is permanent bundle weight. The subscription check is
  the off switch, and it needs none of them.
- **`severity: 'refusal' | 'fault'`.** Rejected: those are two different things, not two levels, so
  the field name would have covered two concepts with one generic word.
