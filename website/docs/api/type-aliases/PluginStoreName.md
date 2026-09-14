# Type Alias: PluginStoreName

> **PluginStoreName** = `` `plugin:${PluginId}` ``

Defined in: model/change-set.ts:16

One plugin's own store, namespaced by that plugin's id (D-S5-24). `reserve()` and `read()` both
 key off this, so a reader finds exactly the store its owner made.
