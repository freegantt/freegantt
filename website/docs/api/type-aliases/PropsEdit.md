# Type Alias: PropsEdit\<TProps\>

> **PropsEdit**\<`TProps`\> = `{ [K in keyof TProps]?: TProps[K] }`

Defined in: model/stored-entry.ts:135

A patch of `props`: every key optional, and every key removable by an explicit `undefined`. There
 is no protected key, because `props` is `Partial<TProps>` at every storage door — a key `TProps`
 marks required is still a key the stored record may not hold. `Partial<TProps>` cannot be this
 type: under `exactOptionalPropertyTypes` a `Partial` property accepts an absent key and refuses an
 explicit `undefined` (`TS2375`), which deletes the remove verb.

## Type Parameters

### TProps

`TProps`
