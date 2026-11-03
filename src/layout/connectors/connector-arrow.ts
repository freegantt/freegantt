// layout/ — whether core draws an arrowhead on a connector.

/** Where a connector wears an arrowhead. `'end'` draws one at the arrival end, pointing into the
 *  target bar's edge. `'none'` draws none. */
export type ConnectorArrow = 'end' | 'none';

export const DEFAULT_CONNECTOR_ARROW: ConnectorArrow = 'end';
