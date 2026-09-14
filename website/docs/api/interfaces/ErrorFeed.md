# Interface: ErrorFeed

Defined in: api/watch-all-errors.ts:15

What `watchAllErrors` subscribes to. `Dataset` and `Gantt` both satisfy it; so does a test double
 with nothing but `on`/`off`. Structural, so this file imports neither class and closes no cycle.

## Methods

### off()

> **off**(`name`, `handler`): `void`

Defined in: api/watch-all-errors.ts:17

#### Parameters

##### name

`"error"`

##### handler

(`report`) => `void`

#### Returns

`void`

***

### on()

> **on**(`name`, `handler`): `void`

Defined in: api/watch-all-errors.ts:16

#### Parameters

##### name

`"error"`

##### handler

(`report`) => `void`

#### Returns

`void`
