# Function: createPopup()

> **createPopup**(`view`, `registerKeyHandler`): [`Popup`](../interfaces/Popup.md)

Defined in: extensions/popup.ts:265

`Popup`'s one implementation (D-S5-8). `view` and `registerKeyHandler` are the only things this
 reaches past plain DOM APIs. Escape folds into `registerKeyHandler` (C3,
 `plans/reviews/2026-09-02-s5-start-fixes.md`) instead of a bespoke document-capture listener +
 per-layer `WeakMap` LIFO stack: `Keymap` already resolves newest-registration-first (D-S5-7), so
 a popup registering its Escape handler on `open()` and unregistering it on `close()` gets
 "innermost open thing wins" (D-S5-9) for free, and the shared `isEditableTarget` gate (S5.2,
 issue #137 F7) restores the IME-composition rule this primitive was missing — a lone document
 listener with no gate closed a popup mid-IME-cancel too.

## Parameters

### view

[`PopupSurface`](../interfaces/PopupSurface.md)

### registerKeyHandler

[`RegisterKeyHandler`](../type-aliases/RegisterKeyHandler.md)

## Returns

[`Popup`](../interfaces/Popup.md)
