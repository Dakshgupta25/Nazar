/**
 * NAZAR Secure Egress Gate (Phase 5):
 * Cryptographically boundaries and strict state machine to guarantee
 * raw/unsanitized private data cannot be sent to online AI services.
 *
 * Implements FAIL CLOSED logic.
 */

import { EgressSession, EgressState, EgressPayload, ValidatedEgressRequest } from '../types/security';
import { SanitizedArtifact } from '../types/preview';
import { generateLocalChecksum } from '../preview/previewState';

export class EgressGate {
  private session: EgressSession | null = null;

  public initializeSession(): string {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.session = {
      sessionId,
      currentState: 'RAW',
      sanitizedArtifact: null,
      lastTransitionTimestamp: Date.now(),
      approvedChecksum: null,
      egressToken: null,
    };
    return sessionId;
  }

  public getSession(): EgressSession | null {
    return this.session ? { ...this.session } : null;
  }

  private transitionTo(newState: EgressState) {
    if (!this.session) throw new Error("No active session");
    this.session.currentState = newState;
    this.session.lastTransitionTimestamp = Date.now();
  }

  public recordScanComplete() {
    if (!this.session) throw new Error("No active session");
    if (this.session.currentState !== 'RAW') {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Invalid state transition: Scan must start from RAW");
    }
    this.transitionTo('SCANNED');
  }

  public recordSanitizationComplete() {
    if (!this.session) throw new Error("No active session");
    if (this.session.currentState !== 'SCANNED') {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Invalid state transition: Sanitization must follow SCANNED");
    }
    this.transitionTo('SANITIZED');
  }

  public approveArtifact(artifact: SanitizedArtifact) {
    if (!this.session) throw new Error("No active session");
    if (this.session.currentState !== 'SANITIZED') {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Invalid state transition: Approval must follow SANITIZED");
    }
    if (!artifact.isUserApproved || !artifact.residualScanPassed) {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Cannot approve artifact that failed residual scan or lacks user approval");
    }

    // Store a deep copy to prevent external mutations
    this.session.sanitizedArtifact = JSON.parse(JSON.stringify(artifact));
    this.session.approvedChecksum = artifact.securityChecksum;
    this.transitionTo('USER_APPROVED');
  }

  public cancelSession() {
    if (!this.session) return;
    this.session.sanitizedArtifact = null;
    this.session.approvedChecksum = null;
    this.session.egressToken = null;
    this.transitionTo('CANCELLED');
  }

  public authorizeEgress(): string {
    if (!this.session) throw new Error("No active session");
    if (this.session.currentState !== 'USER_APPROVED') {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Invalid state transition: Egress requires USER_APPROVED state");
    }
    if (!this.session.sanitizedArtifact || !this.session.approvedChecksum) {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Missing approved artifact");
    }

    const currentChecksum = this.session.sanitizedArtifact.securityChecksum;
    if (currentChecksum !== this.session.approvedChecksum) {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Artifact checksum mismatch - tampering detected");
    }

    this.session.egressToken = `egress_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    this.transitionTo('EGRESS_ALLOWED');
    return this.session.egressToken;
  }

  public constructEgressPayload(prompt: string, token: string): ValidatedEgressRequest {
    if (!this.session) throw new Error("No active session");
    if (this.session.currentState !== 'EGRESS_ALLOWED') {
      throw new Error("Egress is not allowed");
    }
    if (this.session.egressToken !== token) {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Invalid egress token");
    }

    // Verify artifact integrity again
    const artifact = this.session.sanitizedArtifact!;
    const expectedChecksum = generateLocalChecksum(
      `${artifact.artifactId}:${artifact.contextUrl}:${artifact.redactionsApplied.length}:${artifact.approvalTimestamp}`
    );
    
    if (expectedChecksum !== artifact.securityChecksum) {
      this.transitionTo('PRIVACY_FAILED');
      throw new Error("Artifact integrity compromised before egress");
    }

    const payload: EgressPayload = {
      prompt,
      contextUrl: artifact.contextUrl,
      contextTitle: artifact.contextTitle,
      sanitizedImage: artifact.sanitizedImage,
      sanitizedDom: artifact.sanitizedDom,
    };

    return {
      payload,
      egressToken: token,
      timestamp: Date.now()
    };
  }
}
