# Type Alias: RegisterKeyHandler

> **RegisterKeyHandler** = (`chord`, `handler`, `options?`) => () => `void`

Defined in: extensions/keymap.ts:100

The one method `KeyHandlerRegistrar` exposes, named on its own — `createPopup` takes this
 directly, so a caller with a bound method (`ctx.interaction.registerKeyHandler`) passes it
 bare, instead of wrapping it in a one-field object.

 Declared here and referenced by `KeyHandlerRegistrar`, not read back out of it: this alias is
 public and the interface is not, so an indexed access would name an internal type in the public
 report. One shape still keeps one name.

## Parameters

### chord

`string`

### handler

(`event`) => `void`

### options?

#### captureInEditable?

`boolean`

## Returns

() => `void`
