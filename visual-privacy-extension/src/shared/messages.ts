/**
 * Discriminated union of typed messages for background service worker communication.
 */
export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'PONG'; timestamp: number }
  | { type: 'GET_STATUS' }
  | { type: 'STATUS_RESPONSE'; version: string; isReady: boolean };

export type MessageResponse<T extends ExtensionMessage> = T extends { type: 'PING' }
  ? { type: 'PONG'; timestamp: number }
  : T extends { type: 'GET_STATUS' }
  ? { type: 'STATUS_RESPONSE'; version: string; isReady: boolean }
  : void;
