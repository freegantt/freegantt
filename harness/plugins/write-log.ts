// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

/** How a demo plugin writes one line into its own page's log panel. Each page owns its panel and
 *  its own way of writing to it, so a demo plugin takes the writer rather than finding one. */
export type WriteLog = (line: string) => void;
