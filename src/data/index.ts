// data/ — normalized stores, transactions, undo/redo, changesets, serialization (plans/01 §6).
// DOM-free. Lands in S2. Every mutation goes through a transaction → the resolve hook → one changeset.
export {};
