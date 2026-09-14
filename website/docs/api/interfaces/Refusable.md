# Interface: Refusable

Defined in: model/error-report.ts:116

The one call a `before*` handler makes to say **why** it refuses (#210).

 ```ts
 gantt.on('beforeEntryMove', (move) =>
   move.start < mobilization ? move.refuse('The drop is before mobilization.') : undefined,
 );
 ```

 `refuse` returns `false`, so a handler states its reason and vetoes in one line, and `false` keeps
 meaning exactly what it meant before — the words ride beside the boolean rather than replacing it.
 A handler that returns a bare `false` still refuses, with no reason, exactly as it always did.

 Core puts this on the `before*` payload of the three vetoes it reports (`beforeChange`,
 `beforeEntryMove`, `beforeEntryResize`) and reads the words back onto `ErrorReport.reason` and the
 report's `message`. The other `before*` events raise no report, so they take no reason: an event
 that cannot carry the words anywhere must not ask for them.

 A reason is prose a consumer wrote for their own user. Core quotes it into `message` verbatim and
 never rewords it.

## Properties

### refuse

> `readonly` **refuse**: (`reason`) => `false`

Defined in: model/error-report.ts:118

A property, not a method: core binds it, so `({ refuse }) => refuse('…')` destructures safely.

#### Parameters

##### reason

`string`

#### Returns

`false`
