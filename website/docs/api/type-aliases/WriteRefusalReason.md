# Type Alias: WriteRefusalReason

> **WriteRefusalReason** = `FieldWriteRefusalReason`

Defined in: view/capability.ts:28

Why a write is refused, when the refusal is worth words. A refusal that carries no reason is
 already visible: no handle paints, and no editor opens. The cell editor stays silent for it
 (`s5.8-inline-editing.md` §1, "Which refusals speak"). `data/write-rule.ts` owns the type — the
 resolver moved there in ADR 0011 — and this is the name the app-author surface publishes it
 under.
