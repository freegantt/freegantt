# Interface: DatasetHierarchy

Defined in: api/dataset-plugin.ts:76

The tree, as a plugin claims it (ADR 0020). Installing composes: the wrapper receives the current
 occupant, so a second plugin answers over the first's tree instead of evicting it. Core's own
 occupant is `(entry) => entry.parentId` and has no special claim on the seam (D-S5-23).

 **This is an expert door.** An app author never meets it: they write `parentId` on the Entry, and
 core's own source answers it.

## Methods

### setSource()

> **setSource**\<`TProps`\>(`wrap`): `void`

Defined in: api/dataset-plugin.ts:88

Call: `ctx.hierarchy.setSource((next) => (entry) => entry.props.phaseId ?? next(entry))` —
 "set the hierarchy source: the phase id when there is one, otherwise whatever the next source
 says."

 Core owns everything downstream of the answer — the child index, `depth`, `descendants()` and
 the Rollup all follow it, so a plugin that changes the tree has changed the Rollup and the two
 can never disagree. Name the `props` shape to read a consumer key with no cast:
 `ctx.hierarchy.setSource<PlannerProps>(…)`.

 Legal while `data()` runs and not after — a later call throws `RegistrationClosedError`, because
 the construction Rollup has already walked the tree by then (D-S5-4).

#### Type Parameters

##### TProps

`TProps` = `Record`\<`string`, `unknown`\>

#### Parameters

##### wrap

[`HierarchySourceWrapper`](../type-aliases/HierarchySourceWrapper.md)\<`TProps`\>

#### Returns

`void`
