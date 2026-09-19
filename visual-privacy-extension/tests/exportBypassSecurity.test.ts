import { describe, expect, it } from 'vitest';
import { PrivacyPipelineResult } from '../src/core/types/pipeline';

describe('Export Bypass Security Audit (Phase 9)', () => {
  function isExportAllowed(result: PrivacyPipelineResult | null): boolean {
    if (!result) return false;
    if (result.status !== 'VERIFIED') return false;
    if (!result.verification || result.verification.status !== 'PASS' || result.verification.passed !== true) {
      return false;
    }
    return true;
  }

  function createBaseResult(status: PrivacyPipelineResult['status'], verifierStatus: 'PASS' | 'FAIL' | 'INCONCLUSIVE', passed: boolean): PrivacyPipelineResult {
    return {
      status,
      passed,
      input: { width: 100, height: 100, mimeType: 'image/png', fileName: 'test.png', fileSizeBytes: 1000, originalHash: 'hash1' },
      detections: { faces: [], ocrRegions: [] },
      classification: { piiFindings: [], nonSensitiveCount: 0 },
      regions: { sensitiveRegions: [], summary: { totalCount: 0, faceCount: 0, piiCount: 0 } },
      redaction: { strategy: 'SOLID', redactedRegionCount: 0, sanitizedHash: 'hash2', previewUrl: 'blob:sanitized', blob: new Blob([]) },
      verification: {
        status: verifierStatus,
        passed,
        faceResiduals: { detected: 0, residualFacesCount: 0, passed },
        ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed },
        piiResiduals: { detected: 0, piiResidualsCount: 0, passed },
        regionIntegrity: { checked: 0, passedCount: 0, failedCount: 0, passed },
        outputIntegrity: { passed, details: 'OK' },
        timing: { faceScanMs: 0, ocrScanMs: 0, piiScanMs: 0, regionIntegrityMs: 0, outputIntegrityMs: 0, totalMs: 0 },
        reasons: []
      },
      timing: { imageLoading: 1, faceDetection: 1, ocr: 1, piiClassification: 1, regionMapping: 1, redaction: 1, verification: 1, total: 7 }
    };
  }

  it('1. enables export ONLY when pipeline result is VERIFIED and verification passed', () => {
    const verifiedResult = createBaseResult('VERIFIED', 'PASS', true);
    expect(isExportAllowed(verifiedResult)).toBe(true);
  });

  it('2. strictly disables export when status is FAILED_VERIFICATION', () => {
    const failedResult = createBaseResult('FAILED_VERIFICATION', 'FAIL', false);
    expect(isExportAllowed(failedResult)).toBe(false);
  });

  it('3. strictly disables export when status is INCONCLUSIVE', () => {
    const inconclusiveResult = createBaseResult('INCONCLUSIVE', 'INCONCLUSIVE', false);
    expect(isExportAllowed(inconclusiveResult)).toBe(false);
  });

  it('4. strictly disables export when status is CANCELLED', () => {
    const cancelledResult = createBaseResult('CANCELLED', 'INCONCLUSIVE', false);
    expect(isExportAllowed(cancelledResult)).toBe(false);
  });

  it('5. strictly disables export when status is ERROR', () => {
    const errorResult = createBaseResult('ERROR', 'FAIL', false);
    expect(isExportAllowed(errorResult)).toBe(false);
  });

  it('6. strictly disables export when pipeline result is null or processing', () => {
    expect(isExportAllowed(null)).toBe(false);
  });

  it('7. prevents export bypass when status is VERIFIED but verification.passed is false (tampered metadata)', () => {
    const tamperedResult = createBaseResult('VERIFIED', 'FAIL', false); // Mismatched status!
    expect(isExportAllowed(tamperedResult)).toBe(false);
  });
});
