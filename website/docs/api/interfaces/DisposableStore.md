# Interface: DisposableStore

Defined in: extensions/disposables.ts:11

Add-only from a plugin's point of view; `disposeAll()` is the runtime's own call, never the
 plugin's (a plugin frees its resources by returning from `setup()`, not by disposing itself
 mid-flight). Reverse-order and idempotent, the same two guarantees `PluginRuntime` gives the
 plugin list itself.

## Methods

### add()

> **add**(`dispose`): `void`

Defined in: extensions/disposables.ts:15

#### Parameters

##### dispose

[`Disposer`](../type-aliases/Disposer.md)

#### Returns

`void`

***

### disposeAll()

> **disposeAll**(): `void`

Defined in: extensions/disposables.ts:25

Runs every added disposer in reverse order, then again is a no-op — a second `destroy()`
 call, or a store a plugin never added anything to, both cost nothing.

#### Returns

`void`
