# Interface: PluginIdentity

Defined in: api/plugin.ts:25

The two members every plugin declares, whichever halves it fills.

 #178: a plugin that page scope has to call back into publishes those calls **on itself**, beside
 `id` and its halves. Declare an interface extending `ChromePluginOf` or `DataPluginOf`, return it
 from the factory, and hold what the half built in a variable inside that factory call. The page
 then keeps the plugin object it installed and calls it. That is the supported way to reach a
 plugin's own state. It is also why no `Gantt` method hands a `PluginContext` back. One factory
 call is one install's worth of state, so two Gantts on one page share none of it (I2). A
 module-level stash shares all of it.

## Extended by

- [`ChromePluginOf`](ChromePluginOf.md)
- [`DataPluginOf`](DataPluginOf.md)

## Properties

### id

> **id**: `string`

Defined in: api/plugin.ts:26

***

### requires?

> `optional` **requires?**: readonly `string`[]

Defined in: api/plugin.ts:31

Plugin ids that must also be installed. Does not imply an order in the array: installation
 resolves setup order from `requires` alone, so `[a, b]` and `[b, a]` install identically
 (D-S5-31). A required id nobody installs throws `MissingPluginError`. One list covers both
 halves (ADR 0019).
