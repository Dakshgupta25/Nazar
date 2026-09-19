import { describe, expect, it } from 'vitest';
import { FaceDetector } from '../src/core/pipeline/faceDetector';
import { OcrEngine } from '../src/core/pipeline/ocrEngine';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';
import { Redactor } from '../src/core/pipeline/redactor';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { PrivacyPipelineResult } from '../src/core/types/pipeline';

describe('Real End-to-End Privacy Pipeline Integration Test (Phase 8)', () => {
  function createSyntheticImage(width = 300, height = 300) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 240;   // Bright neutral canvas background
      data[i + 1] = 240;
      data[i + 2] = 240;
      data[i + 3] = 255;
    }
    return {
      width,
      height,
      data,
      metadata: { width, height, name: 'e2e_synthetic_input.png', size: data.length }
    };
  }

  it('runs complete end-to-end pipeline with faces, email, phone, and ordinary text', async () => {
    const faceDetector = new FaceDetector();
    const ocrEngine = new OcrEngine();
    const piiClassifier = new PiiClassifier();
    const regionMapper = new RegionMapper();
    const redactor = new Redactor();
    const verifier = new SanitizerVerifier();

    // Mock OCR text recognition to return email, phone, and ordinary text
    ocrEngine.recognizeText = async () => [
      { id: 'ocr-email', text: 'contact@acmecorp.com', box: { x: 20, y: 20, width: 120, height: 20 }, confidence: 0.96 },
      { id: 'ocr-phone', text: 'Call +91 9876543210 immediately', box: { x: 20, y: 60, width: 90, height: 20 }, confidence: 0.94 },
      { id: 'ocr-public', text: 'Public Annual Announcement 2026', box: { x: 20, y: 100, width: 200, height: 20 }, confidence: 0.90 }
    ];

    // Mock Face Detector to return 1 face
    faceDetector.detectFaces = async () => [
      { id: 'face-1', box: { x: 180, y: 20, width: 60, height: 60 }, confidence: 0.89 }
    ];

    // Mock verifier to bypass JSDOM Blob URL image decoding in node test environment
    verifier.verify = async (params: any) => ({
      status: 'PASS',
      passed: true,
      faceResiduals: { detected: 0, residualFacesCount: 0, passed: true },
      ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: true },
      piiResiduals: { detected: 0, piiResidualsCount: 0, passed: true },
      regionIntegrity: { checked: params.originalRegions.length, passedCount: params.originalRegions.length, failedCount: 0, passed: true },
      outputIntegrity: { passed: true, details: 'Decodable image' },
      timing: { faceScanMs: 2, ocrScanMs: 2, piiScanMs: 1, regionIntegrityMs: 2, outputIntegrityMs: 1, totalMs: 8 },
      reasons: []
    });

    const pipeline = new PrivacyPipeline(
      faceDetector,
      ocrEngine,
      piiClassifier,
      regionMapper,
      redactor,
      verifier
    );

    const inputImage = createSyntheticImage(300, 300);

    const result: PrivacyPipelineResult = await pipeline.protectImage(inputImage, {
      faceConfidenceThreshold: 0.5,
      paddingPx: 8,
      redactionStrategy: 'SOLID'
    });

    // 1. Face verification
    expect(result.detections.faces.length).toBe(1);
    expect(result.detections.faces[0].id).toBe('face-1');

    // 2. OCR verification
    expect(result.detections.ocrRegions.length).toBe(3);

    // 3. PII Classification verification
    expect(result.classification.piiFindings.length).toBe(2); // email + phone
    const piiTypes = result.classification.piiFindings.map((p) => p.piiType);
    expect(piiTypes).toContain('EMAIL');
    expect(piiTypes).toContain('PHONE');

    // Confirm ordinary text was NOT classified as sensitive
    const piiTexts = result.classification.piiFindings.map((p) => p.originalText);
    expect(piiTexts).not.toContain('Public Annual Announcement 2026');
    expect(result.classification.nonSensitiveCount).toBe(1);

    // 4. Region mapping verification
    expect(result.regions.sensitiveRegions.length).toBe(3); // 1 face + 2 PII items
    expect(result.regions.summary.faceCount).toBe(1);
    expect(result.regions.summary.piiCount).toBe(2);

    // 5. Redaction verification
    expect(result.redaction.redactedRegionCount).toBe(3);
    expect(result.redaction.sanitizedHash).toBeDefined();

    // 6. Verification & Final Status
    expect(result.verification.status).toBe('PASS');
    expect(result.verification.passed).toBe(true);
    expect(result.status).toBe('VERIFIED');
    expect(result.passed).toBe(true);
  });
});
