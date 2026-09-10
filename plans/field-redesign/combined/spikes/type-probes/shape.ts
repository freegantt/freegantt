export type PlannerProps = { cost?: number };

/** #267 gap: accepts keys the registry will refuse at runtime. */
export type PropsEdit<T extends PlannerProps = PlannerProps> = Partial<T> & {
  [key: string]: unknown;
};

export type Write = PropsEdit<PlannerProps> & {
  start?: number | undefined;
  end?: number | undefined;
  strat?: number;
};
