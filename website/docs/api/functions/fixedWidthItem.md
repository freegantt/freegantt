# Function: fixedWidthItem()

> **fixedWidthItem**(`px`, `anchor?`): [`ItemProducer`](../type-aliases/ItemProducer.md)

Defined in: layout/items/item.ts:149

Call: `diamond({ items: fixedWidthItem(13) })`. Answers an `ItemProducer` that draws one
 whole-entry Item — the same span `wholeEntryItem` draws — with `box` set, so `barSpan` paints it
 at `px` wide at every zoom instead of sizing it from the entry's span.

 Omit `anchor` and it is `'center'` — the spelling already on the surface (`panToDate`'s `align`).
 A variant that wants a flag's left-aligned pole passes `'start'`; core picks for nobody.

 `box` is built once, here, at registration time — not once per Item inside the returned producer
 (F16). One frozen `FixedBarBox` is safe to share across every Item this producer ever returns,
 because `box` is `readonly` on `Item` and nothing downstream writes through it (`Item.box`'s own
 doc). Freezing it turns an accidental write into a loud failure in strict mode, rather than a
 silent one that would otherwise reach every other Item sharing the same box.

 **A narrow `px` starves the move zone, when resize is on.** Each resize handle is 8px wide and
 sits 4px outside its own edge, so the two handles eat `px` from both sides. A `px` under about
 9 leaves no gap between them for a pointer to grab the bar itself and move it — the handles meet
 or overlap first. This only matters when the variant's `can.resize` allows a resize at all;
 `diamond()`'s own default turns resize off, so its 13px box is unaffected.

## Parameters

### px

`number`

### anchor?

[`BarAnchor`](../type-aliases/BarAnchor.md) = `'center'`

## Returns

[`ItemProducer`](../type-aliases/ItemProducer.md)
