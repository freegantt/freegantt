# Function: watchAllErrors()

> **watchAllErrors**(`feeds`, `handler`): [`Disposer`](../type-aliases/Disposer.md)

Defined in: api/watch-all-errors.ts:25

Call: `const stop = watchAllErrors([dataset, gantt], (report) => toast(report.message))`.

 Subscribes `handler` to every feed once — `[dataset, gantt1, gantt2]` sharing one Dataset
 subscribes that Dataset a single time, because de-duplication is by emitter identity — and returns
 one `Disposer` that unsubscribes all of them. Calling it twice is safe.

## Parameters

### feeds

readonly [`ErrorFeed`](../interfaces/ErrorFeed.md)[]

### handler

(`report`) => `void`

## Returns

[`Disposer`](../type-aliases/Disposer.md)
