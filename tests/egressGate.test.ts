import { describe, it, expect, beforeEach } from 'vitest';
import { EgressGate } from '../src/security/egressGate';
import { SanitizedArtifact } from '../src/types/preview';
import { generateLocalChecksum } from '../src/preview/previewState';

describe('NAZAR Phase 5 — Secure Egress Gate', () => {
  let gate: EgressGate;

  beforeEach(() => {
    gate = new EgressGate();
  });

  const createValidArtifact = (): SanitizedArtifact => {
    const timestamp = Date.now();
    const id = 'art_123';
    const url = 'https://example.com';
    const checksum = generateLocalChecksum(`${id}:${url}:0:${timestamp}`);
    return {
      artifactId: id,
      approvalTimestamp: timestamp,
      isUserApproved: true,
      contextUrl: url,
      contextTitle: 'Title',
      redactionsCount: 0,
      redactionsApplied: [],
      residualScanPassed: true,
      securityChecksum: checksum,
    };
  };

  it('follows the valid state machine and produces an egress payload', () => {
    gate.initializeSession();
    expect(gate.getSession()?.currentState).toBe('RAW');

    gate.recordScanComplete();
    expect(gate.getSession()?.currentState).toBe('SCANNED');

    gate.recordSanitizationComplete();
    expect(gate.getSession()?.currentState).toBe('SANITIZED');

    const artifact = createValidArtifact();
    gate.approveArtifact(artifact);
    expect(gate.getSession()?.currentState).toBe('USER_APPROVED');

    const token = gate.authorizeEgress();
    expect(gate.getSession()?.currentState).toBe('EGRESS_ALLOWED');
    expect(token).toBeDefined();

    const request = gate.constructEgressPayload('do something', token);
    expect(request.payload.prompt).toBe('do something');
    expect(request.payload.contextUrl).toBe(artifact.contextUrl);
  });

  it('fails safely if attempting to bypass approval (RAW -> EGRESS_ALLOWED)', () => {
    gate.initializeSession();
    expect(() => gate.authorizeEgress()).toThrow(/Invalid state transition/);
    expect(gate.getSession()?.currentState).toBe('PRIVACY_FAILED');
  });

  it('fails safely if attempting to approve before sanitization', () => {
    gate.initializeSession();
    gate.recordScanComplete();
    expect(() => gate.approveArtifact(createValidArtifact())).toThrow(/Invalid state transition/);
    expect(gate.getSession()?.currentState).toBe('PRIVACY_FAILED');
  });

  it('rejects an artifact if it failed residual scan', () => {
    gate.initializeSession();
    gate.recordScanComplete();
    gate.recordSanitizationComplete();

    const artifact = createValidArtifact();
    artifact.residualScanPassed = false;

    expect(() => gate.approveArtifact(artifact)).toThrow(/failed residual scan/);
    expect(gate.getSession()?.currentState).toBe('PRIVACY_FAILED');
  });

  it('rejects an artifact if it is not user approved', () => {
    gate.initializeSession();
    gate.recordScanComplete();
    gate.recordSanitizationComplete();

    const artifact = createValidArtifact();
    (artifact as any).isUserApproved = false;

    expect(() => gate.approveArtifact(artifact)).toThrow(/lacks user approval/);
    expect(gate.getSession()?.currentState).toBe('PRIVACY_FAILED');
  });

  it('blocks request if token is invalid or stale', () => {
    gate.initializeSession();
    gate.recordScanComplete();
    gate.recordSanitizationComplete();
    gate.approveArtifact(createValidArtifact());
    gate.authorizeEgress();

    expect(() => gate.constructEgressPayload('prompt', 'invalid_token')).toThrow(/Invalid egress token/);
    expect(gate.getSession()?.currentState).toBe('PRIVACY_FAILED');
  });

  it('blocks request if session is cancelled', () => {
    gate.initializeSession();
    gate.recordScanComplete();
    gate.recordSanitizationComplete();
    gate.approveArtifact(createValidArtifact());
    gate.cancelSession();

    expect(gate.getSession()?.currentState).toBe('CANCELLED');
    expect(() => gate.authorizeEgress()).toThrow(/Invalid state transition/);
  });

  it('detects tampering with the artifact in memory before egress', () => {
    gate.initializeSession();
    gate.recordScanComplete();
    gate.recordSanitizationComplete();
    const artifact = createValidArtifact();
    gate.approveArtifact(artifact);
    const token = gate.authorizeEgress();

    // Malicious tampering: reach into the session and alter the artifact
    // We simulate this by mutating the internal state (which TypeScript usually prevents, but JS allows)
    const session = (gate as any).session;
    session.sanitizedArtifact.contextUrl = 'https://malicious.com';

    // The constructEgressPayload should recalculate the checksum and fail
    expect(() => gate.constructEgressPayload('prompt', token)).toThrow(/Artifact integrity compromised/);
    expect(gate.getSession()?.currentState).toBe('PRIVACY_FAILED');
  });
});
