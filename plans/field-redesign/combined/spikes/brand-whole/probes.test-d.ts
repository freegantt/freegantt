import type { EntryEdit } from './brand.js';
import type { EntryEdit as InnerEntryEdit } from './brand-inner.js';

const base: EntryEdit = { props: { owner: 'a' } };

// Whole ProposedEdit brand refuses spread onto EntryEdit
const whole = { __brand: 'ProposedEdit' as const, props: { owner: 'b' }, proposedKeys: new Set(['owner']) };
// @ts-expect-error ProposedEdit is not EntryEdit
const _wholeSpread: EntryEdit = { ...base, ...whole };

const innerPatch = { owner: 'b' } as InnerEntryEdit['props'];
const _innerSpread: InnerEntryEdit = { ...base, props: innerPatch };
