# Type Alias: HierarchySourceWrapper\<TProps\>

> **HierarchySourceWrapper**\<`TProps`\> = (`next`) => [`HierarchySource`](HierarchySource.md)\<`TProps`\>

Defined in: model/hierarchy-source.ts:41

How a plugin claims the seam. It receives the current occupant and may call it, the same way an
`ExtenderWrapper` composes:

```ts
ctx.hierarchy.setSource<PlannerProps>((next) => (entry) => entry.props.phaseId ?? next(entry));
```

That reads: the phase id when there is one, otherwise whatever the next source says.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Parameters

### next

[`HierarchySource`](HierarchySource.md)\<`TProps`\>

## Returns

[`HierarchySource`](HierarchySource.md)\<`TProps`\>
