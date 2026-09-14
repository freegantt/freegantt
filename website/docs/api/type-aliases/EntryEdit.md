# Type Alias: EntryEdit\<TProps\>

> **EntryEdit**\<`TProps`\> = \{ \[K in keyof EntryEnvelope\<TProps\>\]?: K extends RemovableEntryKey ? EntryEnvelope\<TProps\>\[K\] \| undefined : Exclude\<EntryEnvelope\<TProps\>\[K\], undefined\> \} & `{ [K in keyof TProps]?: TProps[K] }` & `object`

Defined in: model/stored-entry.ts:153

What a consumer may change. Input-shaped, so dates stay loose the way `EntryInput`'s are: the store
reads them through `time/`'s `toInstant`/`toEndInstant` in the dataset's zone, exactly as
construction does. `id` is not editable — an id is identity.

A Field key is the whole address (ADR 0011): `update(id, { start, cost })` writes one date and one
declared consumer value, flat — there is no `props` key here, and naming one throws
(`props?: never` below is what makes `{ props: { owner: 'Sam' } }` fail to compile, the same brand
that keeps a `ProposedEdit` from masquerading as this type).

An edit may remove exactly what a stored Entry may lack: `name` and `segments` are required on
`Entry`, so `{ name: undefined }` does not compile, while `{ parentId: undefined }` and (after ADR
0012) `{ start: undefined }` do. Every declared consumer key is removable without exception, because
`props` is `Partial<TProps>` everywhere already.

## Type Declaration

### props?

> `readonly` `optional` **props?**: `never`

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>
