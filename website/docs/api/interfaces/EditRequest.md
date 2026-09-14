# Interface: EditRequest

Defined in: model/stored-entry.ts:211

What the extension hook reads (D4, D-S2-6). It carries the same three members on a preview call
 and on the real commit call, which is why an extender can never refuse a write — see D-S5-24's
 refusal note: a lock plugin vetoes in `beforeChange`, never here.

## Properties

### addedEntryIds

> `readonly` **addedEntryIds**: `ReadonlySet`\<[`EntryId`](../type-aliases/EntryId.md)\>

Defined in: model/stored-entry.ts:232

The Entries this transaction adds, by id — empty on a drag preview, and empty whenever the
 transaction adds none. Read one with `entryAfterEdits(id)`: an added Entry is not in `entries`
 above, which stays the pre-transaction snapshot (D-S5-45). Net effect, not a call log: an Entry
 added and removed in the same transaction is in neither set (#235).

***

### entries

> **entries**: `ReadonlyMap`\<[`EntryId`](../type-aliases/EntryId.md), [`StoredEntry`](StoredEntry.md)\<`Record`\<`string`, `unknown`\>\>\>

Defined in: model/stored-entry.ts:215

Current store snapshot, before this transaction's edits — what a cascade reads to compute a
 delta (what moved, and by how much). Unlike `entryAfterEdits` below, this never reflects this
 transaction's own body edits (D-S5-45).

***

### proposed

> **proposed**: [`ProposedEdits`](../type-aliases/ProposedEdits.md)

Defined in: model/stored-entry.ts:219

What the caller asked to change — storage-shaped and complete, the same as `entries` above
 (`plans/02`, "core fills zone math"): a cascade compares it against `entries` with no
 normalizing step of its own.

***

### removedEntryIds

> `readonly` **removedEntryIds**: `ReadonlySet`\<[`EntryId`](../type-aliases/EntryId.md)\>

Defined in: model/stored-entry.ts:236

The Entries this transaction removes, by id — descendants included, because `entries.remove`
 removes the whole subtree and core fills the descendant walk. Read one off `entries` above,
 which still holds it: `entryAfterEdits(id)` answers `undefined` for every id in here (#235).

## Methods

### entryAfterEdits()

> **entryAfterEdits**(`id`): [`StoredEntry`](StoredEntry.md)\<`Record`\<`string`, `unknown`\>\> \| `undefined`

Defined in: model/stored-entry.ts:227

`id` as this transaction's own body edits leave it: committed state overlaid with `proposed`
 (and, at commit, this transaction's own adds). `undefined` when `id` names no entry there either.
 `entries.get(id)` is the wrong read for judging an in-flight edit against current shape — it
 still shows an Entry's Segments as they were before this transaction rewrote them, so a cascade
 reasoning from it can propose a write core then refuses against the shape it actually has
 (D-S5-45). A per-id lookup, not a second map on this object: the drag preview calls this every
 rAF frame and must not copy the dataset to answer it (I5).

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

[`StoredEntry`](StoredEntry.md)\<`Record`\<`string`, `unknown`\>\> \| `undefined`
