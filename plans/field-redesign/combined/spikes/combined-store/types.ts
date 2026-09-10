/** Shared spike types. Instant is epoch-ms. No src/ imports. */

export type Instant = number;

export type Kind = 'span' | 'group';

export type Segment = { start: Instant; end: Instant };

export type PlannerProps = {
  cost?: number;
  owner?: string;
};

export type PluginEntryProps = {
  'scheduling:progress'?: number;
};

export type EntryProps = PlannerProps & PluginEntryProps;

export type Entry = {
  id: string;
  name: string;
  parentId?: string | undefined;
  kind: Kind;
  /** Core opt-out. Default true when absent. Not a props key — improvement J. */
  followChildren?: boolean | undefined;
  start?: Instant | undefined;
  end?: Instant | undefined;
  segments?: readonly Segment[] | undefined;
  props: EntryProps;
};

export type FieldRollUp = 'sum' | 'min' | 'max';

export type FieldDecl =
  | { key: 'start' | 'end'; editable?: boolean }
  | { key: string; rollUp?: FieldRollUp; editable?: boolean; compute?: boolean };

export type PropsEdit<T extends EntryProps = EntryProps> = Partial<T>;

/** Declared-key shorthand at update. `props` stays on add and Document. */
export type Write = {
  id?: string;
  name?: string;
  parentId?: string | undefined;
  kind?: Kind | undefined;
  start?: Instant | undefined;
  end?: Instant | undefined;
  segments?: readonly Segment[] | undefined;
  props?: PropsEdit | undefined;
  cost?: number | undefined;
  owner?: string | undefined;
  followChildren?: boolean | undefined;
  'scheduling:progress'?: number | undefined;
};

export type Doc = {
  schema?: number;
  rollUpKinds?: readonly string[];
  fields?: readonly FieldDecl[];
  entries: Entry[];
};

export const CORE_EDIT_KEYS = new Set([
  'id',
  'name',
  'parentId',
  'kind',
  'followChildren',
  'start',
  'end',
  'segments',
  'props',
]);

export const CORE_FIELD_KEYS = new Set([
  'id',
  'name',
  'parentId',
  'kind',
  'followChildren',
  'start',
  'end',
  'segments',
]);

export type Duration = { value: number };
