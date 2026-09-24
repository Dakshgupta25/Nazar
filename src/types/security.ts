/**
 * NAZAR Security Types (Phase 5)
 */

import { SanitizedArtifact } from './preview';

export type EgressState = 
  | 'RAW' 
  | 'SCANNED' 
  | 'SANITIZED' 
  | 'USER_APPROVED' 
  | 'EGRESS_ALLOWED' 
  | 'CANCELLED' 
  | 'PRIVACY_FAILED';

export interface EgressSession {
  sessionId: string;
  currentState: EgressState;
  sanitizedArtifact: SanitizedArtifact | null;
  lastTransitionTimestamp: number;
  approvedChecksum: string | null;
  egressToken: string | null;
}

export interface EgressPayload {
  prompt: string;
  contextUrl: string;
  contextTitle: string;
  sanitizedImage?: { width: number; height: number; dataUrl?: string; data: Uint8ClampedArray };
  sanitizedDom?: any;
}

export interface ValidatedEgressRequest {
  payload: EgressPayload;
  egressToken: string;
  timestamp: number;
}
