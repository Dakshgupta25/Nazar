import { describe, expect, it } from 'vitest';
import { ImageLoader } from '../src/core/image/imageLoader';
import { GeometryUtils } from '../src/core/geometry/geometryUtils';
import { RegionMapper } from '../src/core/pipeline/regionMapper';

describe('Malformed Input & Geometry Attack Security Audit (Phase 9)', () => {

  describe('1. Image Input Validation Security', () => {
    it('rejects invalid file MIME types safely', () => {
      const pdfFile = new File(['%PDF-1.4...'], 'document.pdf', { type: 'application/pdf' });
      const err = ImageLoader.validateFile(pdfFile);
      expect(err).not.toBeNull();
      expect(err?.code).toBe('INVALID_TYPE');

      const htmlFile = new File(['<html></html>'], 'malicious.html', { type: 'text/html' });
      const htmlErr = ImageLoader.validateFile(htmlFile);
      expect(htmlErr?.code).toBe('INVALID_TYPE');
    });

    it('rejects 0-byte empty files safely', () => {
      const emptyFile = new File([], 'empty.png', { type: 'image/png' });
      const err = ImageLoader.validateFile(emptyFile);
      expect(err).not.toBeNull();
      expect(err?.code).toBe('EMPTY_FILE');
    });

    it('rejects oversized files exceeding 10MB limit', () => {
      const hugeBuffer = new ArrayBuffer(10 * 1024 * 1024 + 100);
      const hugeFile = new File([hugeBuffer], 'huge.png', { type: 'image/png' });
      const err = ImageLoader.validateFile(hugeFile);
      expect(err).not.toBeNull();
      expect(err?.code).toBe('OVERSIZED_FILE');
    });
  });

  describe('2. Bounding Box Geometry Attack Security', () => {
    it('safely clamps negative coordinates to 0', () => {
      const attackBox = { x: -10, y: -10, width: 40, height: 40 };
      const clamped = GeometryUtils.clampBox(attackBox, 200, 200);

      expect(clamped).not.toBeNull();
      expect(clamped!.x).toBe(0);
      expect(clamped!.y).toBe(0);
      expect(clamped!.width).toBe(30);
      expect(clamped!.height).toBe(30);
    });

    it('handles NaN and Infinity geometry inputs without crashing', () => {
      const nanBox = { x: NaN, y: Infinity, width: -10, height: Number.NEGATIVE_INFINITY };
      const clamped = GeometryUtils.clampBox(nanBox, 200, 200);

      expect(clamped).toBeNull();
    });

    it('safely clamps bounding boxes exceeding image dimensions', () => {
      const hugeBox = { x: 150, y: 150, width: 500, height: 500 };
      const clamped = GeometryUtils.clampBox(hugeBox, 200, 200);

      expect(clamped).not.toBeNull();
      expect(clamped!.x + clamped!.width).toBeLessThanOrEqual(200);
      expect(clamped!.y + clamped!.height).toBeLessThanOrEqual(200);
    });

    it('maps overlapping and nested regions safely without array corruption', () => {
      const mapper = new RegionMapper();

      const face = { id: 'f1', box: { x: 10, y: 10, width: 50, height: 50 }, confidence: 0.9 };
      const pii = {
        id: 'p1',
        piiType: 'EMAIL',
        ocrId: 'o1',
        ocrConfidence: 0.9,
        confidence: 0.95,
        originalText: 'nested@test.com',
        maskedText: 'n***d@test.com',
        box: { x: 15, y: 15, width: 40, height: 20 }, // Nested inside face!
        reason: 'Email'
      };

      const result = mapper.mapRegions([face] as any, [pii] as any, 200, 200, { paddingPx: 8, clipToImage: true });

      expect(result.regions).toHaveLength(2);
      expect(result.summary.totalCount).toBe(2);
      expect(result.summary.faceCount).toBe(1);
      expect(result.summary.piiCount).toBe(1);

      // Verify bounds are inside [0, 200]
      result.regions.forEach((r) => {
        expect(r.paddedBox.x).toBeGreaterThanOrEqual(0);
        expect(r.paddedBox.y).toBeGreaterThanOrEqual(0);
        expect(r.paddedBox.x + r.paddedBox.width).toBeLessThanOrEqual(200);
        expect(r.paddedBox.y + r.paddedBox.height).toBeLessThanOrEqual(200);
      });
    });
  });
});
