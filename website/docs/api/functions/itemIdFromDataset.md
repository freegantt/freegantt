# Function: itemIdFromDataset()

> **itemIdFromDataset**(`value`): [`ItemId`](../type-aliases/ItemId.md) \| `undefined`

Defined in: model/ids.ts:46

Call: `itemIdFromDataset(bar.dataset['itemId'])` — the DOM→brand trust boundary for a `.fg-bar`
 node's `data-item-id` attribute (`render/dom/index.ts` is what writes it). `undefined` in,
 `undefined` out, so a caller keeps its own "no bar hit" branch instead of taking one here.

## Parameters

### value

`string` \| `undefined`

## Returns

[`ItemId`](../type-aliases/ItemId.md) \| `undefined`
