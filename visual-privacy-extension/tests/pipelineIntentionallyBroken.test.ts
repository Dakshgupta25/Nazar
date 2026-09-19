import { describe, expect, it } from 'vitest';
import { FaceDetector } from '../src/core/pipeline/faceDetector';
import { OcrEngine } from '../src/core/pipeline/ocrEngine';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';
import { Redactor } from '../src/core/pipeline/redactor';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { RedactedImageResult } from '../src/core/types/pipeline';

describe('Intentionally Broken Pipeline Verification Test (Phase 8)', () => {
  function createSyntheticOriginalImage(width = 200, height = 200) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 220;   // Original light grey background
      data[i + 1] = 220;
      data[i + 2] = 220;
      data[i + 3] = 255;
    }
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'broken_test_input.png', size: data.length }
    };
  }

  it('proves orchestration respects verifier and flags status as FAILED_VERIFICATION when redaction is incomplete', async () => {
    const faceDetector = new FaceDetector();
    const ocrEngine = new OcrEngine();
    const piiClassifier = new PiiClassifier();
    const regionMapper = new RegionMapper();
    const redactor = new Redactor();
    const verifier = new SanitizerVerifier();

    const pipeline = new PrivacyPipeline(
      faceDetector,
      ocrEngine,
      piiClassifier,
      regionMapper,
      redactor,
      verifier
    );

    // Mock OCR text recognition to return sensitive email
    ocrEngine.recognizeText = async () => [
      { id: 'ocr-email-1', text: 'secret@bank.com', box: { x: 30, y: 30, width: 80, height: 20 }, confidence: 0.95 }
    ];

    faceDetector.detectFaces = async () => [];

    // Intentionally mock redactor to return unredacted / under-redacted preview
    redactor.redact = async (imageInput: any): Promise<RedactedImageResult> => {
      return {
        blob: new Blob([]),
        previewUrl: imageInput.previewUrl || 'blob:unredacted-preview-url',
        width: 200,
        height: 200,
        mimeType: 'image/png',
        strategy: 'SOLID',
        redactedRegionsCount: 1,
        faceCount: 0,
        piiCount: 1,
        originalHash: 'original_hash_123',
        sanitizedHash: 'original_hash_123', // Hash identical / unredacted!
        timing: { canvasInitMs: 1, drawingMs: 1, redactionMs: 1, exportMs: 1, hashMs: 1, totalMs: 3 }
      };
    };

    // Override verifier scan step to simulate residual detection
    verifier.verify = async (_params: any) => {
      return {
        status: 'FAIL',
        passed: false,
        faceResiduals: { detected: 0, residualFacesCount: 0, passed: true },
        ocrResiduals: { detected: 1, sensitiveResiduals: 1, passed: false },
        piiResiduals: { detected: 1, piiResidualsCount: 1, passed: false },
        regionIntegrity: { checked: 1, passedCount: 0, failedCount: 1, passed: false },
        outputIntegrity: { passed: true, details: 'Decodable image' },
        timing: { faceScanMs: 1, ocrScanMs: 2, piiScanMs: 1, regionIntegrityMs: 2, outputIntegrityMs: 1, totalMs: 7 },
        reasons: ['Residual PII detected: secret@bank.com', 'Region integrity check failed']
      };
    };

    const inputImage = createSyntheticOriginalImage();
    const result = await pipeline.protectImage(inputImage);

    // CRITICAL: Status MUST NOT be VERIFIED
    expect(result.status).toBe('FAILED_VERIFICATION');
    expect(result.passed).toBe(false);
    expect(result.verification.status).toBe('FAIL');
    expect(result.verification.reasons.length).toBeGreaterThan(0);
    expect(result.verification.reasons[0]).toContain('Residual PII detected');
  });
});
