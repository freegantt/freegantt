# Interface: DomEventOptions

Defined in: view/plugin-ports.ts:71

`capture: true` listens on the capture phase. Use it for an event that does not bubble
 (`scroll`). Use it also for a handler that must run before the page's own (`keydown`). The
 removal uses the same flag, which is the pairing every hand-written listener had to remember for
 itself.

## Properties

### capture?

> `optional` **capture?**: `boolean`

Defined in: view/plugin-ports.ts:72
