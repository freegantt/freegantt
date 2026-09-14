# Interface: DatasetEditHook

Defined in: api/dataset-plugin.ts:66

The extension hook, as a plugin claims it (D-S5-23). Installing composes: the wrapper receives the
 current occupant, so a second plugin adds to the first's cascade instead of evicting it. Merge the
 two results with `mergeEntryEdits`, never with a spread (#197).

## Methods

### setExtender()

> **setExtender**(`wrap`): `void`

Defined in: api/dataset-plugin.ts:67

#### Parameters

##### wrap

[`ExtenderWrapper`](../type-aliases/ExtenderWrapper.md)

#### Returns

`void`
