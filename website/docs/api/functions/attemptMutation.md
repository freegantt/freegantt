# Function: attemptMutation()

> **attemptMutation**(`body`): `boolean`

Defined in: api/attempt-mutation.ts:7

Call: `attemptMutation(() => dataset.undo())`. Runs `body`. Returns `true`. A refused
 `beforeChange` returns `false` instead of throwing. Any other error still throws.

## Parameters

### body

() => `void`

## Returns

`boolean`
