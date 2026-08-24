// scheduling/ — first-party default scheduling plugin: pure propagation engine + policy seam
// (plans/01 §7, ADR 0002). DOM-free, but not mandatory core — occupies data/'s resolve hook
// only when installed. Lands in S3. schedule() is pure and deterministic; propagation is a
// worklist loop — no recursion, ever.
export {};
