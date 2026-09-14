# Class: MutationDuringExtensionHookError

Defined in: model/errors.ts:598

`code: 'mutation-during-extension-hook'` — a mutator called while the extension hook
(`EditExtender`) runs (#323). A nested write does not join the hook's own transaction. It opens a
new outermost transaction, and that calls the hook again. The recursion overflows the stack, or —
behind a hand-rolled depth cap — lands as separate changesets. Separate changesets split one undo
step into many, which breaks I7. The write set is discarded; the hook call in progress is not
affected.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new MutationDuringExtensionHookError**(`operation`): `MutationDuringExtensionHookError`

Defined in: model/errors.ts:601

#### Parameters

##### operation

`string`

#### Returns

`MutationDuringExtensionHookError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:599
