# Interface: ViewportGestureFlags

Defined in: view/viewport-gestures.ts:7

Per-gesture pins. An omitted key stays on — same "default on" reading `interactions: {}` uses
 for data gestures, without a per-entry predicate because there is no entry.

## Properties

### keyboardPan?

> `optional` **keyboardPan?**: `boolean`

Defined in: view/viewport-gestures.ts:13

Page/Home/End, and arrows when nothing is selected. Default on.

***

### wheelPan?

> `optional` **wheelPan?**: `boolean`

Defined in: view/viewport-gestures.ts:11

shift+wheel horizontal pan. Default on.

***

### wheelZoom?

> `optional` **wheelZoom?**: `boolean`

Defined in: view/viewport-gestures.ts:9

ctrl/⌘+wheel anchored zoom. Default on.
