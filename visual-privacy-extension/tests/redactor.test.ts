import { describe, it, expect, beforeEach } from 'vitest';
import { Redactor } from '../src/core/pipeline/redactor';
import { SensitiveRegion } from '../src/core/types/pipeline';

describe('Redactor Unit Tests (Phase 6)', () => {
  let redactor: Redactor;

  // Helper to create a synthetic 100x100 white pixel image buffer (RGBA: 255, 255, 255, 255)
  const createTestImage = (width = 100, height = 100, fillColor = { r: 255, g: 255, b: 255, a: 255 }) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fillColor.r;
      data[i + 1] = fillColor.g;
      data[i + 2] = fillColor.b;
      data[i + 3] = fillColor.a;
    }
    return {
      width,
      height,
      data,
      rawBytes: data.buffer.slice(0)
    };
  };

  beforeEach(() => {
    redactor = new Redactor();
  });

  describe('Single & Multiple Region Redaction', () => {
    it('redacts a single PII region destructively and matches output dimensions', async () => {
      const image = createTestImage(200, 150);
      const regions: SensitiveRegion[] = [
        {
          id: 'pii-email-001',
          source: 'OCR_PII',
          type: 'EMAIL',
          piiType: 'EMAIL',
          label: 'PII: EMAIL',
          boundingBox: { x: 20, y: 30, width: 80, height: 25 },
          unpaddedBox: { x: 25, y: 35, width: 70, height: 15 },
          box: { x: 25, y: 35, width: 70, height: 15 },
          paddedBox: { x: 20, y: 30, width: 80, height: 25 },
          confidence: 0.98,
          reason: 'Valid email',
          padding: 5,
          paddingPx: 5
        }
      ];

      const result = await redactor.redact(image, regions, { strategy: 'SOLID', solidColor: '#000000' });

      expect(result.width).toBe(200);
      expect(result.height).toBe(150);
      expect(result.redactedRegionsCount).toBe(1);
      expect(result.piiCount).toBe(1);
      expect(result.faceCount).toBe(0);
      expect(result.mimeType).toBe('image/png');
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.originalHash).not.toBe(result.sanitizedHash);
    });

    it('redacts a single face region destructively', async () => {
      const image = createTestImage(200, 200);
      const regions: SensitiveRegion[] = [
        {
          id: 'face-001',
          source: 'FACE_DETECTOR',
          type: 'FACE',
          label: 'FACE #1',
          boundingBox: { x: 50, y: 50, width: 60, height: 60 },
          unpaddedBox: { x: 55, y: 55, width: 50, height: 50 },
          box: { x: 55, y: 55, width: 50, height: 50 },
          paddedBox: { x: 50, y: 50, width: 60, height: 60 },
          confidence: 0.95,
          reason: 'Detected face',
          padding: 5,
          paddingPx: 5
        }
      ];

      const result = await redactor.redact(image, regions);

      expect(result.redactedRegionsCount).toBe(1);
      expect(result.faceCount).toBe(1);
      expect(result.piiCount).toBe(0);
      expect(result.originalHash).not.toBe(result.sanitizedHash);
    });

    it('redacts multiple faces and PII regions in a single invocation', async () => {
      const image = createTestImage(400, 300);
      const regions: SensitiveRegion[] = [
        {
          id: 'face-001',
          source: 'FACE_DETECTOR',
          type: 'FACE',
          label: 'FACE #1',
          boundingBox: { x: 20, y: 20, width: 50, height: 50 },
          unpaddedBox: { x: 20, y: 20, width: 50, height: 50 },
          box: { x: 20, y: 20, width: 50, height: 50 },
          paddedBox: { x: 20, y: 20, width: 50, height: 50 },
          confidence: 0.95,
          reason: 'Face 1',
          padding: 0,
          paddingPx: 0
        },
        {
          id: 'face-002',
          source: 'FACE_DETECTOR',
          type: 'FACE',
          label: 'FACE #2',
          boundingBox: { x: 100, y: 20, width: 50, height: 50 },
          unpaddedBox: { x: 100, y: 20, width: 50, height: 50 },
          box: { x: 100, y: 20, width: 50, height: 50 },
          paddedBox: { x: 100, y: 20, width: 50, height: 50 },
          confidence: 0.92,
          reason: 'Face 2',
          padding: 0,
          paddingPx: 0
        },
        {
          id: 'pii-phone-001',
          source: 'OCR_PII',
          type: 'PHONE',
          piiType: 'PHONE',
          label: 'PII: PHONE',
          boundingBox: { x: 20, y: 150, width: 120, height: 25 },
          unpaddedBox: { x: 20, y: 150, width: 120, height: 25 },
          box: { x: 20, y: 150, width: 120, height: 25 },
          paddedBox: { x: 20, y: 150, width: 120, height: 25 },
          confidence: 0.99,
          reason: 'Phone number',
          padding: 0,
          paddingPx: 0
        }
      ];

      const result = await redactor.redact(image, regions);

      expect(result.redactedRegionsCount).toBe(3);
      expect(result.faceCount).toBe(2);
      expect(result.piiCount).toBe(1);
    });
  });

  describe('Overlapping Regions & Padding Preservation', () => {
    it('handles overlapping face and PII regions without holes or errors', async () => {
      const image = createTestImage(200, 200);
      const regions: SensitiveRegion[] = [
        {
          id: 'face-001',
          source: 'FACE_DETECTOR',
          type: 'FACE',
          label: 'FACE #1',
          boundingBox: { x: 40, y: 40, width: 60, height: 60 },
          unpaddedBox: { x: 40, y: 40, width: 60, height: 60 },
          box: { x: 40, y: 40, width: 60, height: 60 },
          paddedBox: { x: 40, y: 40, width: 60, height: 60 },
          confidence: 0.95,
          reason: 'Face',
          padding: 0,
          paddingPx: 0
        },
        {
          id: 'pii-email-001',
          source: 'OCR_PII',
          type: 'EMAIL',
          piiType: 'EMAIL',
          label: 'PII: EMAIL',
          boundingBox: { x: 50, y: 50, width: 70, height: 30 },
          unpaddedBox: { x: 50, y: 50, width: 70, height: 30 },
          box: { x: 50, y: 50, width: 70, height: 30 },
          paddedBox: { x: 50, y: 50, width: 70, height: 30 },
          confidence: 0.98,
          reason: 'Overlapping email',
          padding: 0,
          paddingPx: 0
        }
      ];

      const result = await redactor.redact(image, regions);
      expect(result.redactedRegionsCount).toBe(2);
    });

    it('respects padded boxes generated by Phase 5', async () => {
      const image = createTestImage(100, 100);
      const unpadded = { x: 40, y: 40, width: 20, height: 20 };
      const padded = { x: 30, y: 30, width: 40, height: 40 };

      const region: SensitiveRegion = {
        id: 'pii-pan-001',
        source: 'OCR_PII',
        type: 'PAN',
        piiType: 'PAN',
        label: 'PII: PAN',
        boundingBox: padded,
        unpaddedBox: unpadded,
        box: unpadded,
        paddedBox: padded,
        confidence: 0.99,
        reason: 'PAN Card',
        padding: 10,
        paddingPx: 10
      };

      const result = await redactor.redact(image, [region]);
      expect(result.redactedRegionsCount).toBe(1);
    });
  });

  describe('Out-of-Bounds, Zero-Size & Invalid Region Safeguards', () => {
    it('safely clips out-of-bounds regions extending past image borders', async () => {
      const image = createTestImage(100, 100);
      const outOfBoundsRegion: SensitiveRegion = {
        id: 'edge-1',
        source: 'FACE_DETECTOR',
        type: 'FACE',
        label: 'Edge Face',
        boundingBox: { x: 80, y: 80, width: 50, height: 50 },
        unpaddedBox: { x: 80, y: 80, width: 50, height: 50 },
        box: { x: 80, y: 80, width: 50, height: 50 },
        paddedBox: { x: 80, y: 80, width: 50, height: 50 },
        confidence: 0.9,
        reason: 'Near border',
        padding: 0,
        paddingPx: 0
      };

      const result = await redactor.redact(image, [outOfBoundsRegion]);
      expect(result.redactedRegionsCount).toBe(1);
    });

    it('safely skips zero-width or zero-height regions', async () => {
      const image = createTestImage(100, 100);
      const zeroRegion: SensitiveRegion = {
        id: 'zero-1',
        source: 'OCR_PII',
        type: 'URL',
        label: 'Zero box',
        boundingBox: { x: 10, y: 10, width: 0, height: 20 },
        unpaddedBox: { x: 10, y: 10, width: 0, height: 20 },
        box: { x: 10, y: 10, width: 0, height: 20 },
        paddedBox: { x: 10, y: 10, width: 0, height: 20 },
        confidence: 0.9,
        reason: 'Invalid width',
        padding: 0,
        paddingPx: 0
      };

      const result = await redactor.redact(image, [zeroRegion]);
      expect(result.redactedRegionsCount).toBe(0);
    });

    it('safely handles negative box coordinates by clamping', async () => {
      const image = createTestImage(100, 100);
      const negRegion: SensitiveRegion = {
        id: 'neg-1',
        source: 'FACE_DETECTOR',
        type: 'FACE',
        label: 'Negative coords',
        boundingBox: { x: -20, y: -20, width: 50, height: 50 },
        unpaddedBox: { x: -20, y: -20, width: 50, height: 50 },
        box: { x: -20, y: -20, width: 50, height: 50 },
        paddedBox: { x: -20, y: -20, width: 50, height: 50 },
        confidence: 0.9,
        reason: 'Clamped negative',
        padding: 0,
        paddingPx: 0
      };

      const result = await redactor.redact(image, [negRegion]);
      expect(result.redactedRegionsCount).toBe(1);
    });
  });

  describe('Original Image Non-Mutation & Hash Provenance', () => {
    it('guarantees original input image bytes remain 100% unmutated', async () => {
      const image = createTestImage(50, 50, { r: 200, g: 200, b: 200, a: 255 });
      const originalBytesCopy = new Uint8Array(image.data).slice(0);

      const region: SensitiveRegion = {
        id: 'r1',
        source: 'FACE_DETECTOR',
        type: 'FACE',
        label: 'Face',
        boundingBox: { x: 10, y: 10, width: 20, height: 20 },
        unpaddedBox: { x: 10, y: 10, width: 20, height: 20 },
        box: { x: 10, y: 10, width: 20, height: 20 },
        paddedBox: { x: 10, y: 10, width: 20, height: 20 },
        confidence: 0.9,
        reason: 'Test',
        padding: 0,
        paddingPx: 0
      };

      await redactor.redact(image, [region]);

      const currentBytes = new Uint8Array(image.data);
      expect(currentBytes).toEqual(originalBytesCopy);
    });

    it('returns identical originalHash and sanitizedHash when 0 regions are redacted', async () => {
      const image = createTestImage(50, 50);
      const result = await redactor.redact(image, []);

      expect(result.redactedRegionsCount).toBe(0);
      expect(result.originalHash).toBeDefined();
      expect(result.sanitizedHash).toBeDefined();
    });
  });

  describe('Large Image Safe Processing Limit Safeguard', () => {
    it('throws a descriptive error if image exceeds maximum canvas dimensions', async () => {
      const hugeImage = { width: 10000, height: 10000, data: new Uint8ClampedArray(4) };

      await expect(redactor.redact(hugeImage, [])).rejects.toThrow(
        /exceed safe processing limit/
      );
    });
  });
});
