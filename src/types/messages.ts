/**
 * NAZAR Message Protocol & Type Definitions
 * Strict types for cross-component message passing (Popup <-> ContentScript <-> Background)
 */

import { ExtractedDomContext } from './dom';

export type NazarMessageType =
  | 'PING'
  | 'PONG'
  | 'GET_STATUS'
  | 'CAPTURE_CONTEXT'
  | 'EXTRACT_DOM'
  | 'CAPTURE_VISIBLE_TAB'
  | 'RUN_PRIVACY_SCAN';

export interface BaseMessage {
  id: string;
  type: NazarMessageType;
  timestamp: number;
}

export interface PingMessage extends BaseMessage {
  type: 'PING';
}

export interface GetStatusMessage extends BaseMessage {
  type: 'GET_STATUS';
}

export interface ExtractDomMessage extends BaseMessage {
  type: 'EXTRACT_DOM';
  options?: {
    includeHidden?: boolean;
    maxDepth?: number;
  };
}

export interface CaptureVisibleTabMessage extends BaseMessage {
  type: 'CAPTURE_VISIBLE_TAB';
  format?: 'png' | 'jpeg';
}

export interface CaptureContextMessage extends BaseMessage {
  type: 'CAPTURE_CONTEXT';
  userInstruction?: string;
}

export interface RunPrivacyScanMessage extends BaseMessage {
  type: 'RUN_PRIVACY_SCAN';
  context: CapturedContextPayload;
}

export type NazarMessage =
  | PingMessage
  | GetStatusMessage
  | ExtractDomMessage
  | CaptureVisibleTabMessage
  | CaptureContextMessage
  | RunPrivacyScanMessage;

export interface MessageResponse<T = unknown> {
  success: boolean;
  requestId: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface CapturedContextPayload {
  tabId: number;
  url: string;
  title: string;
  timestamp: number;
  screenshotDataUrl: string; // in-memory only base64
  dom: ExtractedDomContext;
}

export interface ExtensionStatusPayload {
  ready: boolean;
  version: string;
  activeTabAccessible: boolean;
  tabId?: number;
  url?: string;
}

/**
 * Validates whether an untrusted object conforms to the NazarMessage schema.
 * Rejects malformed or unrecognized structures (fail-closed).
 */
export function isValidNazarMessage(msg: unknown): msg is NazarMessage {
  if (!msg || typeof msg !== 'object') {
    return false;
  }

  const candidate = msg as Partial<BaseMessage>;

  if (
    typeof candidate.id !== 'string' ||
    candidate.id.trim().length === 0 ||
    typeof candidate.timestamp !== 'number' ||
    typeof candidate.type !== 'string'
  ) {
    return false;
  }

  const validTypes: NazarMessageType[] = [
    'PING',
    'PONG',
    'GET_STATUS',
    'CAPTURE_CONTEXT',
    'EXTRACT_DOM',
    'CAPTURE_VISIBLE_TAB',
    'RUN_PRIVACY_SCAN',
  ];

  return validTypes.includes(candidate.type as NazarMessageType);
}

/**
 * Helper to generate a unique random message ID.
 */
export function createMessageId(): string {
  return 'msg_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
}
