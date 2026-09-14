# Interface: ZonedTime

Defined in: time/zoned-time.ts:16

Zone-aware date math with the dataset's own zone already bound — no caller passes it, and no
caller can pass the wrong one (D-S5-16). A plugin cannot import `time/` directly (the `exports`
map seals it), so this is the one way a plugin author reaches zone-correct day arithmetic.

Call: `dataset.time.eachDay(span).filter((day) => dataset.time.dayOfWeek(day) >= 6)`.

## Properties

### zone

> `readonly` **zone**: `string`

Defined in: time/zoned-time.ts:17

## Methods

### addDays()

> **addDays**(`at`, `days`): [`Instant`](../type-aliases/Instant.md)

Defined in: time/zoned-time.ts:20

#### Parameters

##### at

[`Instant`](../type-aliases/Instant.md)

##### days

`number`

#### Returns

[`Instant`](../type-aliases/Instant.md)

***

### dayOfWeek()

> **dayOfWeek**(`at`): `number`

Defined in: time/zoned-time.ts:23

1 = Monday … 7 = Sunday (ISO).

#### Parameters

##### at

[`Instant`](../type-aliases/Instant.md)

#### Returns

`number`

***

### diffDays()

> **diffDays**(`a`, `b`): `number`

Defined in: time/zoned-time.ts:21

#### Parameters

##### a

[`Instant`](../type-aliases/Instant.md)

##### b

[`Instant`](../type-aliases/Instant.md)

#### Returns

`number`

***

### eachDay()

> **eachDay**(`span`): readonly [`Instant`](../type-aliases/Instant.md)[]

Defined in: time/zoned-time.ts:25

Each day boundary in `[span.start, span.end)`, ascending.

#### Parameters

##### span

[`TimeSpan`](TimeSpan.md)

#### Returns

readonly [`Instant`](../type-aliases/Instant.md)[]

***

### fromPlain()

> **fromPlain**(`plain`): [`Instant`](../type-aliases/Instant.md)

Defined in: time/zoned-time.ts:27

#### Parameters

##### plain

[`PlainParts`](PlainParts.md)

#### Returns

[`Instant`](../type-aliases/Instant.md)

***

### startOf()

> **startOf**(`at`, `unit`): [`Instant`](../type-aliases/Instant.md)

Defined in: time/zoned-time.ts:19

#### Parameters

##### at

[`Instant`](../type-aliases/Instant.md)

##### unit

[`TimeUnit`](../type-aliases/TimeUnit.md)

#### Returns

[`Instant`](../type-aliases/Instant.md)

***

### startOfDay()

> **startOfDay**(`at`): [`Instant`](../type-aliases/Instant.md)

Defined in: time/zoned-time.ts:18

#### Parameters

##### at

[`Instant`](../type-aliases/Instant.md)

#### Returns

[`Instant`](../type-aliases/Instant.md)

***

### toPlain()

> **toPlain**(`at`): [`PlainParts`](PlainParts.md)

Defined in: time/zoned-time.ts:26

#### Parameters

##### at

[`Instant`](../type-aliases/Instant.md)

#### Returns

[`PlainParts`](PlainParts.md)
