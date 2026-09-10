/** Q12 — PropsEdit needs TProps & PluginEntryProps for plugin writes at update(). */

type PlannerProps = { cost?: number };
type PluginEntryProps = { 'scheduling:progress'?: number };

type PropsEdit<T> = Partial<T>;

type WriteProps = PropsEdit<PlannerProps>;
// @ts-expect-error progress is not on PlannerProps alone
const _nested: WriteProps = { 'scheduling:progress': 60 };

type WriteBoth = PropsEdit<PlannerProps & PluginEntryProps>;
const _ok: WriteBoth = { 'scheduling:progress': 60 };
