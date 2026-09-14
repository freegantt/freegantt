# Type Alias: CapabilityRule

> **CapabilityRule** = `boolean` \| ((`entry`) => `boolean` \| `undefined`)

Defined in: model/interactions.ts:21

A boolean pins every entry the same way; a predicate varies the answer per entry
 (`interactions: { resize: (entry) => entry.read('locked') !== true }`).

 **`undefined` means "no opinion about this entry"** (ADR 0018, `J13`). The next answer down then
 decides — a variant's `can` falls to the library rule, and the consumer's own `interactions`
 falls to the variant's `can`. Without it, `can: { resize: (entry) => !entry.hasChildren }` would
 read "not on a parent" and also say **yes** to every other row, over the rule below it. That is
 the bug `WriteRule` already answers this way for (#256).
