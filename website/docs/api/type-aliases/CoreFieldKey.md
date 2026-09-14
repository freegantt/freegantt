# Type Alias: CoreFieldKey

> **CoreFieldKey** = keyof `Omit`\<[`StoredEntry`](../interfaces/StoredEntry.md), `"id"` \| `"props"`\>

Defined in: model/field-key.ts:14

The shipped subset — keys of `Entry` except `id` and `props`. The comparator exhaustiveness check
 stays over this set (ADR 0005 §28). `props` omits alongside this, or neither does (ADR 0011):
 change one and not the other, and `read(id, 'props')` types as the whole bag while the registry
 refuses the key at runtime.
