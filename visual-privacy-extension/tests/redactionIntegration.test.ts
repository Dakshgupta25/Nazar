import { describe, it, expect } from 'vitest';
import { Redactor } from '../src/core/pipeline/redactor';
import { SensitiveRegion } from '../src/core/types/pipeline';

describe('Redaction End-to-End Integration Tests (Phase 6)', () => {
  it('executes full pipeline flow: Image + SensitiveRegions -> Redactor -> Sanitized Image PNG', async () => {
    // 1. Create synthetic original image (300 x 200)
    const width = 300;
    const height = 200;
    const pixelData = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < pixelData.length; i += 4) {
      pixelData[i] = 255;     // Red
      pixelData[i + 1] = 255; // Green
      pixelData[i + 2] = 255; // Blue
      pixelData[i + 3] = 255; // Alpha
    }

    const testImage = {
      width,
      height,
      data: pixelData,
      rawBytes: pixelData.buffer.slice(0)
    };

    const originalPixelsCopy = new Uint8Array(pixelData).slice(0);

    // 2. Define known sensitive regions (1 Face, 2 PII)
    const sensitiveRegions: SensitiveRegion[] = [
      {
        id: 'face-001',
        source: 'FACE_DETECTOR',
        type: 'FACE',
        label: 'FACE #1',
        boundingBox: { x: 20, y: 20, width: 60, height: 60 },
        unpaddedBox: { x: 25, y: 25, width: 50, height: 50 },
        box: { x: 25, y: 25, width: 50, height: 50 },
        paddedBox: { x: 20, y: 20, width: 60, height: 60 },
        confidence: 0.96,
        reason: 'Detected face',
        padding: 5,
        paddingPx: 5
      },
      {
        id: 'pii-email-001',
        source: 'OCR_PII',
        type: 'EMAIL',
        piiType: 'EMAIL',
        label: 'PII: EMAIL',
        boundingBox: { x: 100, y: 20, width: 150, height: 30 },
        unpaddedBox: { x: 105, y: 25, width: 140, height: 20 },
        box: { x: 105, y: 25, width: 140, height: 20 },
        paddedBox: { x: 100, y: 20, width: 150, height: 30 },
        confidence: 0.99,
        reason: 'Email matched',
        padding: 5,
        paddingPx: 5
      },
      {
        id: 'pii-aadhaar-001',
        source: 'OCR_PII',
        type: 'AADHAAR',
        piiType: 'AADHAAR',
        label: 'PII: AADHAAR',
        boundingBox: { x: 20, y: 120, width: 180, height: 40 },
        unpaddedBox: { x: 25, y: 125, width: 170, height: 30 },
        box: { x: 25, y: 125, width: 170, height: 30 },
        paddedBox: { x: 20, y: 120, width: 180, height: 40 },
        confidence: 0.97,
        reason: 'Verhoeff checksum passed',
        padding: 5,
        paddingPx: 5
      }
    ];

    // 3. Execute Redactor Engine
    const redactor = new Redactor();
    const result = await redactor.redact(testImage, sensitiveRegions, {
      strategy: 'SOLID',
      solidColor: '#000000',
      mimeType: 'image/png'
    });

    // 4. Verify Output Results
    expect(result).toBeDefined();
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    expect(result.redactedRegionsCount).toBe(3);
    expect(result.faceCount).toBe(1);
    expect(result.piiCount).toBe(2);
    expect(result.strategy).toBe('SOLID');
    expect(result.mimeType).toBe('image/png');
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);

    // 5. Verify Hash Provenance
    expect(typeof result.originalHash).toBe('string');
    expect(typeof result.sanitizedHash).toBe('string');
    expect(result.originalHash.length).toBeGreaterThan(0);
    expect(result.sanitizedHash.length).toBeGreaterThan(0);
    expect(result.originalHash).not.toBe(result.sanitizedHash);

    // 6. Verify Timing Metrics
    expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.redactionMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.exportMs).toBeGreaterThanOrEqual(0);

    // 7. Verify Original Image Pixel Unmutated Integrity
    const currentPixels = new Uint8Array(pixelData);
    expect(currentPixels).toEqual(originalPixelsCopy);
  });
});
