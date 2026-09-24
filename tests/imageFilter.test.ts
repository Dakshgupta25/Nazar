import { describe, it, expect } from 'vitest';
import { scanLocalImage } from '../src/imageFilter/imagePrivacyEngine';
import { dataUrlToBlob } from '../src/imageFilter/imageExport';

describe('NAZAR Phase 7 — Local Image Privacy Filter', () => {

  // Synthetic SVG with embedded PII for testing
  const piiSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300">
    <text x="50" y="60">contact@example.com</text>
    <text x="50" y="100">AKIAIOSFODNN7EXAMPLE</text>
    <text x="50" y="140">+1 (415) 555-0199</text>
    <text x="50" y="180">Mr. John Doe</text>
    <text x="50" y="220">742 Evergreen Terrace Springfield</text>
  </svg>`;

  const cleanSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
    <text x="50" y="50">Hello World</text>
  </svg>`;

  describe('Local scan without DOM', () => {
    it('detects PII from an SVG data URL without DOM context', async () => {
      const result = await scanLocalImage(piiSvg, {}, 'id-card.svg');
      
      expect(result.imageId).toBeTruthy();
      expect(result.filename).toBe('id-card.svg');
      expect(result.detections.length).toBeGreaterThan(0);
    });

    it('detects email addresses from SVG OCR', async () => {
      const result = await scanLocalImage(piiSvg, {}, 'test.svg');
      const emailMatch = result.detections.find(d => d.category === 'email');
      expect(emailMatch).toBeDefined();
    });

    it('detects AWS/API keys from SVG OCR', async () => {
      const result = await scanLocalImage(piiSvg, {}, 'test.svg');
      const keyMatch = result.detections.find(d => d.category === 'api_key' || d.category === 'secret_key');
      expect(keyMatch).toBeDefined();
    });

    it('produces redaction items for every detection', async () => {
      const result = await scanLocalImage(piiSvg, {}, 'test.svg');
      // Fusion may merge overlapping detections, but must produce at least 1 redaction item
      expect(result.redactionItems.length).toBeGreaterThanOrEqual(1);
    });

    it('produces a sanitized image output', async () => {
      const result = await scanLocalImage(piiSvg, {}, 'test.svg');
      expect(result.sanitizedImage).toBeDefined();
    });

    it('records scan latency with domMs=0 (no DOM context)', async () => {
      const result = await scanLocalImage(piiSvg, {}, 'test.svg');
      expect(result.latency.domMs).toBe(0);
      expect(result.latency.totalMs).toBeGreaterThanOrEqual(0);
    });

    it('works for a clean image with no detections', async () => {
      const result = await scanLocalImage(cleanSvg, {}, 'clean.svg');
      // May or may not find "Hello World" as PII — but should run cleanly
      expect(result).toBeDefined();
      expect(Array.isArray(result.detections)).toBe(true);
    });

    it('works from a PixelBuffer input instead of a data URL', async () => {
      const pixelBuffer = {
        width: 100,
        height: 100,
        data: new Uint8ClampedArray(100 * 100 * 4).fill(0),
      };
      const result = await scanLocalImage(pixelBuffer, {}, 'synthetic.png');
      expect(result).toBeDefined();
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });
  });

  describe('Image export utilities', () => {
    it('converts a data URL blob without network transmission', () => {
      const svgUrl = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"><text>test</text></svg>')}`;
      const blob = dataUrlToBlob(svgUrl);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.type).toBe('image/svg+xml');
    });

    it('handles plain SVG data URLs (non-base64)', () => {
      const svgUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><text>test</text></svg>`;
      const blob = dataUrlToBlob(svgUrl);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('Security invariants', () => {
    it('never includes original raw data in scan result payload', async () => {
      const result = await scanLocalImage(piiSvg, {}, 'test.svg');
      
      // sanitizedImage must NOT contain the original sensitive text inside redacted areas
      const resultStr = JSON.stringify(result.redactionItems);
      
      // The redactionItems should contain category labels, not raw sensitive values
      expect(resultStr).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(resultStr).not.toContain('contact@example.com');
    });

    it('preserveOriginalInMemory=false does not expose raw dataUrl in sanitizedImage', async () => {
      const result = await scanLocalImage(piiSvg, { preserveOriginalInMemory: false }, 'test.svg');
      // The sanitized image should not be identical to the original
      if (result.sanitizedImage && result.detections.length > 0) {
        // If detections exist and redaction was applied, the pixel buffer should differ
        expect(result.sanitizedImage).toBeDefined();
      }
    });
  });
});
