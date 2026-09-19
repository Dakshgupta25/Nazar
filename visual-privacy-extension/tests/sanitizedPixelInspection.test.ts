import { describe, it, expect } from 'vitest';
import { Redactor } from '../src/core/pipeline/redactor';
import { ImageDecoder } from '../src/core/image/imageDecoder';
import { SensitiveRegion } from '../src/core/types/pipeline';

describe('Sanitized Pixel Inspection & Decoding', () => {
  it('destructively redacts face region and exports a valid decodable PNG blob with black pixels', async () => {
    const redactor = new Redactor();
    const width = 1200;
    const height = 1200;

    // Create synthetic original image buffer (white pixels: 255, 255, 255, 255)
    const rawPixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < rawPixels.length; i += 4) {
      rawPixels[i] = 255;
      rawPixels[i + 1] = 255;
      rawPixels[i + 2] = 255;
      rawPixels[i + 3] = 255;
    }

    const testInput = {
      width,
      height,
      data: rawPixels,
      mimeType: 'image/png'
    };

    const faceRegion: SensitiveRegion = {
      id: 'face-001',
      type: 'FACE',
      label: 'FACE #1',
      box: { x: 100, y: 100, width: 200, height: 200 },
      boundingBox: { x: 100, y: 100, width: 200, height: 200 },
      unpaddedBox: { x: 100, y: 100, width: 200, height: 200 },
      paddedBox: { x: 92, y: 92, width: 216, height: 216 },
      confidence: 0.95,
      source: 'FACE',
      reason: 'Face detected',
      padding: 8,
      paddingPx: 8
    };

    // 1. Redact image
    const redactionResult = await redactor.redact(testInput, [faceRegion], {
      strategy: 'SOLID',
      solidColor: '#000000',
      mimeType: 'image/png'
    });

    expect(redactionResult.width).toBe(1200);
    expect(redactionResult.height).toBe(1200);
    expect(redactionResult.redactedRegionsCount).toBe(1);
    expect(redactionResult.blob).toBeDefined();

    // 2. Decode exported sanitized Blob using ImageDecoder
    const decoded = await ImageDecoder.decodeImage(redactionResult.blob, { width, height });

    expect(decoded.width).toBe(1200);
    expect(decoded.height).toBe(1200);
    expect(decoded.pixels).toBeDefined();
    expect(decoded.pixels.length).toBe(1200 * 1200 * 4);

    // 3. Inspect pixels inside redacted region box (paddedBox: 92, 92 -> 308, 308)
    let blackCount = 0;
    let totalRegionPixels = 0;

    for (let py = 92; py < 308; py++) {
      for (let px = 92; px < 308; px++) {
        const idx = (py * width + px) * 4;
        const r = decoded.pixels[idx];
        const g = decoded.pixels[idx + 1];
        const b = decoded.pixels[idx + 2];
        const a = decoded.pixels[idx + 3];
        totalRegionPixels++;

        if (r <= 35 && g <= 35 && b <= 35 && a >= 200) {
          blackCount++;
        }
      }
    }

    const blackPercentage = (blackCount / totalRegionPixels) * 100;
    expect(blackPercentage).toBeGreaterThanOrEqual(95.0);

    // 4. Inspect pixels OUTSIDE redacted region (e.g. 50, 50) -> should remain white (255, 255, 255)
    const outsideIdx = (50 * width + 50) * 4;
    expect(decoded.pixels[outsideIdx]).toBe(255);
    expect(decoded.pixels[outsideIdx + 1]).toBe(255);
    expect(decoded.pixels[outsideIdx + 2]).toBe(255);
  });
});
