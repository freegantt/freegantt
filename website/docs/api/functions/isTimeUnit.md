# Function: isTimeUnit()

> **isTimeUnit**(`value`): `value is TimeUnit`

Defined in: time/zone.ts:165

Call: `isTimeUnit(value)` — true when `value` names a unit `time/` can step by. The public,
 narrowing form of `SUPPORTED_TIME_UNITS`, for a consumer validating a raw string (a `<select>`'s
 value, a saved preference) before it reaches `gantt.snap` or a `ViewPreset` (#201).

## Parameters

### value

`string`

## Returns

`value is TimeUnit`
