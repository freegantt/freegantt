# Type Alias: CommandId

> **CommandId** = [`BuiltInCommandId`](BuiltInCommandId.md) \| `string` & `object`

Defined in: api/command.ts:58

Any command id: one the library ships, or one a plugin registers. The `string & {}` half keeps a
 consumer's own id legal and still lets an editor suggest the built-in ones — the same open shape
 `FieldKey` keeps over `CoreFieldKey`.
