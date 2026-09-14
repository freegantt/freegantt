# Interface: SelectionChange

Defined in: view/event-bus.ts:52

S3, D-S3-10/D-S3-22; ADR 0010, #212. Fires on the Gantt, never the Dataset — selection is Gantt
 state, so two Gantt instances bound to one Dataset can hold different selections. It carries
 Segment ids, because the Selection holds Segments.

## Properties

### from

> `readonly` **from**: readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: view/event-bus.ts:53

***

### to

> `readonly` **to**: readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: view/event-bus.ts:54
