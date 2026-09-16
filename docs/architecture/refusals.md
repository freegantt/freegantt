# How a refusal reaches the caller

<style>
      .skill-paper {
        background: #f5f5f5;
      }
      .skill-paper svg {
        min-width: 800px;
        max-width: none;
      }
    </style>

A `beforeChange` handler says no. Core writes nothing. It raises one Error report. It throws
`MutationCancelledError` back to the call that started the write.

## The Dataset door

This is the path a programmatic write takes when a `beforeChange` handler refuses it. The caller
is `dataset.entries.update`, or any other mutator that ends in `commitChangeSet`. Undo and redo
use the same tail.

*Derived from `data/transaction.ts`, `data/error-reporting.ts`, `data/event-bus.ts`,
`model/error-report.ts`, `model/errors.ts`, `api/watch-all-errors.ts`,
`api/attempt-mutation.ts`.*

<div class="fg-architecture-doc">
<figure>
<div class="scroller skill-paper">
<svg
viewBox="0 0 960 600"
xmlns="http://www.w3.org/2000/svg"
role="img"
aria-labelledby="refusal-flow-title refusal-flow-desc"
>
<title id="refusal-flow-title">A beforeChange refusal, caller to output</title>
<desc id="refusal-flow-desc">
Sequence diagram of a Dataset write that a beforeChange handler refuses: the update
call, the veto, the Error report, and the thrown MutationCancelledError.
</desc>
<defs>
<marker id="refusal-flow-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
<polygon points="0 0, 8 3, 0 6" fill="#4f5d75" />
</marker>
<marker
id="refusal-flow-arrow-accent"
markerWidth="8"
markerHeight="6"
refX="7"
refY="3"
orient="auto"
>
<polygon points="0 0, 8 3, 0 6" fill="#eb6c36" />
</marker>
<marker
id="refusal-flow-arrow-link"
markerWidth="8"
markerHeight="6"
refX="7"
refY="3"
orient="auto"
>
<polygon points="0 0, 8 3, 0 6" fill="#2e5aa8" />
</marker>
<marker
id="refusal-flow-arrow-open"
markerWidth="8"
markerHeight="6"
refX="7"
refY="3"
orient="auto"
>
<polyline points="0 0, 8 3, 0 6" fill="none" stroke="#4f5d75" stroke-width="1.2" />
</marker>
</defs>
<rect width="100%" height="100%" fill="#f5f5f5" />
<line
x1="120"
y1="96"
x2="120"
y2="488"
stroke="rgba(45,49,66,0.20)"
stroke-width="1"
stroke-dasharray="3,3"
/>
<line
x1="360"
y1="96"
x2="360"
y2="488"
stroke="rgba(45,49,66,0.20)"
stroke-width="1"
stroke-dasharray="3,3"
/>
<line
x1="600"
y1="96"
x2="600"
y2="488"
stroke="rgba(45,49,66,0.20)"
stroke-width="1"
stroke-dasharray="3,3"
/>
<line
x1="840"
y1="96"
x2="840"
y2="488"
stroke="rgba(45,49,66,0.20)"
stroke-width="1"
stroke-dasharray="3,3"
/>
<rect
x="116"
y="156"
width="8"
height="304"
fill="rgba(45,49,66,0.06)"
stroke="#4f5d75"
stroke-width="0.8"
/>
<rect
x="356"
y="156"
width="8"
height="304"
fill="rgba(45,49,66,0.06)"
stroke="#4f5d75"
stroke-width="0.8"
/>
<rect
x="596"
y="196"
width="8"
height="112"
fill="rgba(45,49,66,0.06)"
stroke="#4f5d75"
stroke-width="0.8"
/>
<rect
x="836"
y="408"
width="8"
height="24"
fill="rgba(45,49,66,0.06)"
stroke="#4f5d75"
stroke-width="0.8"
/>
<line
x1="120"
y1="160"
x2="360"
y2="160"
stroke="#4f5d75"
stroke-width="1.2"
marker-end="url(#refusal-flow-arrow)"
/>
<line
x1="360"
y1="200"
x2="600"
y2="200"
stroke="#4f5d75"
stroke-width="1.2"
marker-end="url(#refusal-flow-arrow)"
/>
<path
d="M 604 240 L 640 240 L 640 272 L 604 272"
fill="none"
stroke="#eb6c36"
stroke-width="1.4"
marker-end="url(#refusal-flow-arrow-accent)"
/>
<line
x1="600"
y1="304"
x2="364"
y2="304"
stroke="#4f5d75"
stroke-width="1.2"
stroke-dasharray="5,4"
marker-end="url(#refusal-flow-arrow)"
/>
<path
d="M 364 344 L 400 344 L 400 376 L 364 376"
fill="none"
stroke="#4f5d75"
stroke-width="1.2"
marker-end="url(#refusal-flow-arrow)"
/>
<line
x1="360"
y1="416"
x2="840"
y2="416"
stroke="#4f5d75"
stroke-width="1.2"
stroke-dasharray="5,4"
marker-end="url(#refusal-flow-arrow-open)"
/>
<line
x1="360"
y1="456"
x2="124"
y2="456"
stroke="#4f5d75"
stroke-width="1.2"
stroke-dasharray="5,4"
marker-end="url(#refusal-flow-arrow)"
/>
<rect x="192" y="140" width="96" height="12" rx="2" fill="#f5f5f5" />
<text
x="240"
y="149"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.06em"
>
ENTRIES.UPDATE
</text>
<rect x="436" y="180" width="88" height="12" rx="2" fill="#f5f5f5" />
<text
x="480"
y="189"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.06em"
>
BEFORECHANGE
</text>
<rect x="648" y="248" width="96" height="12" rx="2" fill="#f5f5f5" />
<text
x="696"
y="257"
fill="#eb6c36"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.06em"
>
REFUSE(REASON)
</text>
<rect x="436" y="284" width="88" height="12" rx="2" fill="#f5f5f5" />
<text
x="480"
y="293"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.06em"
>
RETURN FALSE
</text>
<rect x="412" y="352" width="88" height="12" rx="2" fill="#f5f5f5" />
<text
x="456"
y="361"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.06em"
>
BUILD REPORT
</text>
<rect x="680" y="396" width="80" height="12" rx="2" fill="#f5f5f5" />
<text
x="720"
y="405"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.06em"
>
EMIT ERROR
</text>
<rect x="196" y="436" width="88" height="12" rx="2" fill="#f5f5f5" />
<text
x="240"
y="445"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.06em"
>
THROW CANCEL
</text>
<rect x="40" y="40" width="160" height="56" rx="6" fill="#f5f5f5" />
<rect
x="40"
y="40"
width="160"
height="56"
rx="6"
fill="rgba(79,93,117,0.10)"
stroke="#7a8399"
stroke-width="1"
/>
<rect
x="48"
y="46"
width="28"
height="12"
rx="2"
fill="transparent"
stroke="rgba(122,131,153,0.40)"
stroke-width="0.8"
/>
<text
x="62"
y="55"
fill="#7a8399"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.08em"
>
APP
</text>
<text
x="120"
y="70"
fill="#2d3142"
font-size="12"
font-weight="600"
font-family="'Geist', system-ui, sans-serif"
text-anchor="middle"
>
Caller
</text>
<text
x="120"
y="86"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
>
entries.update
</text>
<rect x="280" y="40" width="160" height="56" rx="6" fill="#f5f5f5" />
<rect
x="280"
y="40"
width="160"
height="56"
rx="6"
fill="#ffffff"
stroke="#2d3142"
stroke-width="1"
/>
<rect
x="288"
y="46"
width="32"
height="12"
rx="2"
fill="transparent"
stroke="rgba(45,49,66,0.40)"
stroke-width="0.8"
/>
<text
x="304"
y="55"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.08em"
>
DATA
</text>
<text
x="360"
y="70"
fill="#2d3142"
font-size="12"
font-weight="600"
font-family="'Geist', system-ui, sans-serif"
text-anchor="middle"
>
Dataset
</text>
<text
x="360"
y="86"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
>
commitChangeSet
</text>
<rect x="520" y="40" width="160" height="56" rx="6" fill="#f5f5f5" />
<rect
x="520"
y="40"
width="160"
height="56"
rx="6"
fill="rgba(235,108,54,0.08)"
stroke="#eb6c36"
stroke-width="1"
/>
<rect
x="528"
y="46"
width="28"
height="12"
rx="2"
fill="transparent"
stroke="rgba(235,108,54,0.50)"
stroke-width="0.8"
/>
<text
x="542"
y="55"
fill="#eb6c36"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.08em"
>
EVT
</text>
<text
x="600"
y="70"
fill="#2d3142"
font-size="12"
font-weight="600"
font-family="'Geist', system-ui, sans-serif"
text-anchor="middle"
>
Handler
</text>
<text
x="600"
y="86"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
>
beforeChange
</text>
<rect x="760" y="40" width="160" height="56" rx="6" fill="#f5f5f5" />
<rect
x="760"
y="40"
width="160"
height="56"
rx="6"
fill="rgba(45,49,66,0.05)"
stroke="#4f5d75"
stroke-width="1"
/>
<rect
x="768"
y="46"
width="28"
height="12"
rx="2"
fill="transparent"
stroke="rgba(79,93,117,0.40)"
stroke-width="0.8"
/>
<text
x="782"
y="55"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
letter-spacing="0.08em"
>
OUT
</text>
<text
x="840"
y="70"
fill="#2d3142"
font-size="12"
font-weight="600"
font-family="'Geist', system-ui, sans-serif"
text-anchor="middle"
>
Subscriber
</text>
<text
x="840"
y="86"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
text-anchor="middle"
>
error event
</text>
<line
x1="40"
y1="504"
x2="920"
y2="504"
stroke="rgba(45,49,66,0.10)"
stroke-width="0.8"
/>
<text
x="40"
y="520"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
letter-spacing="0.14em"
>
LEGEND
</text>
<rect
x="40"
y="540"
width="14"
height="10"
rx="2"
fill="rgba(235,108,54,0.08)"
stroke="#eb6c36"
stroke-width="1"
/>
<text
x="60"
y="548"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
>
handler · refuse
</text>
<line
x1="200"
y1="545"
x2="232"
y2="545"
stroke="#4f5d75"
stroke-width="1.2"
marker-end="url(#refusal-flow-arrow)"
/>
<text
x="240"
y="548"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
>
call
</text>
<line
x1="292"
y1="545"
x2="324"
y2="545"
stroke="#4f5d75"
stroke-width="1.2"
stroke-dasharray="5,4"
marker-end="url(#refusal-flow-arrow)"
/>
<text
x="332"
y="548"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
>
return
</text>
<line
x1="400"
y1="545"
x2="432"
y2="545"
stroke="#4f5d75"
stroke-width="1.2"
stroke-dasharray="5,4"
marker-end="url(#refusal-flow-arrow-open)"
/>
<text
x="440"
y="548"
fill="#4f5d75"
font-size="8"
font-family="'Geist Mono', ui-monospace, monospace"
>
notify
</text>
</svg>
</div>
<figcaption>
A <code>beforeChange</code> veto inside <code>commitChangeSet</code>. Coral is the
<code>refuse()</code> call. The open dashed arrow is the <code>error</code> event. The filled
dashed arrow back to the caller is the throw.
</figcaption>
</figure>
</div>

```
dataset.on('beforeChange', ({ refuse }) => refuse('t1 is locked.'));
dataset.entries.update('t1', { name: 'Framing' });
// throws MutationCancelledError
// Dataset 'error' fires when something is subscribed
```

## Each step

Time runs down the diagram. The store never applies the changeset. The two outputs are the throw
and, when a listener exists, the Error report.

*Derived from `data/transaction.ts`, `data/error-reporting.ts`, `data/event-bus.ts`,
`model/errors.ts`.*

| Step | What runs | What it does |
| --- | --- | --- |
| `ENTRIES.UPDATE` | `entries.update → runTransaction → commitChangeSet` | The body stages the edit. The extension hook and the Rollup run. Core builds one changeset, then asks `beforeChange`. |
| `BEFORECHANGE` | `bus.emit('beforeChange', { changeSet, refuse })` | Core makes one `RefusalNote` per emit and puts `refuse` on the payload. Every handler runs. A veto from one handler does not skip the rest. |
| `REFUSE(REASON)` | `refuse('t1 is locked.')` | The call writes the words onto the note and returns `false`. The first reason wins. Two handlers never join their sentences. A bare `false` still refuses, with no reason. |
| `RETURN FALSE` | `emit → false` | Core discards the write set. Nothing is stored. No `change` event fires. |
| `BUILD REPORT` | `buildRefusalReport + MutationCancelledError` | One builder, in `data/error-reporting.ts`. For this door the message is the thrown error's own wording. Severity is `info`. `by` is `consumer`. |
| `EMIT ERROR` | `raiseErrorOn(dataset.bus, report)` | The report reaches a listener on the Dataset `error` event. If nobody listens, this step does nothing. This site has no console fallback. A Gantt does not forward Dataset reports — two Gantts on one Dataset would each hear the same report twice. Call `watchAllErrors([dataset, gantt], …)` to hear both buses. |
| `THROW CANCEL` | `throw MutationCancelledError` | This output always happens. The error carries the refused changeset and the reason. `attemptMutation(() => …)` catches it and returns `false`, so a button does not need its own `try`/`catch`. Any other error still throws. |

## The other doors

Three vetoes share `buildRefusalReport`. The cell editor raises its own report. A silent
`canWrite` refusal is not this flow: no handle paints, and no report fires.

*Derived from `view/gesture-pipeline.ts`, `view/live-region.ts`, `view/capability.ts`,
`extensions/features/inline-editing.ts`, `api/gantt.ts`.*

| Door | Who says no | Throw | Report bus | Live region |
| --- | --- | --- | --- | --- |
| `beforeChange` | a Dataset handler | `MutationCancelledError` | Dataset `error` | no — subscribe with `watchAllErrors` |
| `beforeEntryMove` / `beforeEntryResize` | a Gantt handler | none — the pipeline restores the preview | Gantt `error`, codes `entry-move-cancelled` / `entry-resize-cancelled` | yes — `LiveRegion` is already subscribed |
| cell editor | the `inlineEditing()` plugin | none — the editor stays open, or a notice sits on the cell | Gantt `error`, plugin codes such as `derived-value` | yes — same Gantt bus |

:::note A refused gesture commit is one record, not two
The pipeline reports a silent `beforeEntryMove` / `beforeEntryResize` veto. When the gesture
passes that gate and then `beforeChange` refuses the write, `data/transaction.ts` already raised
the Dataset report. `commitEntryEdits` returns `false`, and the pipeline does not raise a second
one.
:::

A drag that a `beforeEntryMove` handler refuses uses the same `refuse(reason)` call. Core builds
the sentence itself, because that door has no thrown error to quote:

```
gantt.on('beforeEntryMove', (move) =>
  move.start < mobilization ? move.refuse('The drop is before mobilization.') : undefined,
);
```

The report message is `Nothing was saved. A beforeEntryMove handler refused this move and said:
"…".` A bare `false` drops the `and said` clause.

## What the report carries

An Error report is the record a consumer subscribes to. A `FreeGanttError` is the class a
consumer catches. They are two different things. Core raises reports and keeps none.

*Derived from `model/error-report.ts`, `data/error-reporting.ts`, `view/live-region.ts`,
`api/watch-all-errors.ts`, `harness/main.ts`, `harness/editing.ts`, `harness/data.ts`.*

| Field | On a beforeChange refusal |
| --- | --- |
| `at` | stamped by the raiser from `time/`'s `now()` |
| `code` | `mutation-cancelled` |
| `message` | the thrown error's sentence, including the handler's words when they called `refuse` |
| `severity` | `info` — the library said no on purpose |
| `by` | `consumer` — the bus saw a handler return `false` |
| `reason` | the handler's own words, or absent after a bare `false` |
| `cause` | the `MutationCancelledError`, which still holds the changeset |

`LiveRegion` reads the Gantt `error` event and copies `report.message` into a polite live region
for `info` and `error`. It stays silent on `warning`. A Dataset refusal never reaches that node on
its own.

The harness demos call `watchAllErrors([dataset, gantt], …)` and log each report. That is how a
Dataset refusal becomes a line in the demo log.
