import { describe, expect, it } from 'vitest';
import { Redactor } from '../src/core/pipeline/redactor';
import { LoadedImage } from '../src/core/types/image';
import { SensitiveRegion } from '../src/core/types/pipeline';

describe('Redactor Browser Input Format Compatibility Suite', () => {
  const redactor = new Redactor();

  function createTestPixels(w: number, h: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;     // R
      data[i + 1] = 255; // G
      data[i + 2] = 255; // B
      data[i + 3] = 255; // A
    }
    return data;
  }

  it('1. handles canonical LoadedImage from ImageLoader directly (without pre-attached element)', async () => {
    const pixels = createTestPixels(1200, 1200);
    const loadedImage: LoadedImage = {
      metadata: {
        name: 'test_1200x1200.png',
        mimeType: 'image/png',
        size: 59800,
        width: 1200,
        height: 1200
      },
      previewUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      file: new File([new Uint8Array(pixels)], 'test_1200x1200.png', { type: 'image/png' })
    };

    const region: SensitiveRegion = {
      id: 'r1',
      type: 'FACE',
      label: 'Face',
      box: { x: 96, y: 96, width: 208, height: 208 },
      boundingBox: { x: 100, y: 100, width: 200, height: 200 },
      unpaddedBox: { x: 100, y: 100, width: 200, height: 200 },
      paddedBox: { x: 96, y: 96, width: 208, height: 208 },
      confidence: 0.95,
      source: 'FACE',
      reason: 'Face detected',
      padding: 8,
      paddingPx: 8
    };

    const result = await redactor.redact(loadedImage, [region], { strategy: 'SOLID', solidColor: '#000000' });

    expect(result).toBeDefined();
    expect(result.width).toBe(1200);
    expect(result.height).toBe(1200);
    expect(result.redactedRegionsCount).toBe(1);
    expect(result.blob).toBeDefined();
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.previewUrl).toBeDefined();
    expect(result.originalHash).toBeDefined();
    expect(result.sanitizedHash).toBeDefined();
  });

  it('2. handles PNG, JPEG, and WEBP LoadedImage formats with exact resolution preservation', async () => {
    const formats = [
      { name: 'test.png', mime: 'image/png' },
      { name: 'test.jpg', mime: 'image/jpeg' },
      { name: 'test.webp', mime: 'image/webp' }
    ];

    for (const fmt of formats) {
      const pixels = createTestPixels(800, 600);
      const testImage: any = {
        width: 800,
        height: 600,
        data: pixels,
        metadata: {
          name: fmt.name,
          mimeType: fmt.mime,
          size: 40000,
          width: 800,
          height: 600
        }
      };

      const result = await redactor.redact(testImage, [], { mimeType: fmt.mime });
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.mimeType).toBe(fmt.mime);
      expect(result.blob.size).toBeGreaterThan(0);
    }
  });

  it('3. applies destructive pixel redaction to sensitive region without mutating original pixels', async () => {
    const pixels = createTestPixels(400, 400);
    const originalPixelsCopy = new Uint8ClampedArray(pixels);

    const testImage: any = {
      width: 400,
      height: 400,
      data: pixels,
      rawBytes: pixels.buffer.slice(0)
    };

    const region: SensitiveRegion = {
      id: 'r-pii',
      type: 'EMAIL',
      label: 'Email',
      box: { x: 45, y: 45, width: 110, height: 40 },
      boundingBox: { x: 50, y: 50, width: 100, height: 30 },
      unpaddedBox: { x: 50, y: 50, width: 100, height: 30 },
      paddedBox: { x: 45, y: 45, width: 110, height: 40 },
      confidence: 0.99,
      source: 'OCR_PII',
      reason: 'Sensitive email PII',
      padding: 8,
      paddingPx: 8
    };

    const result = await redactor.redact(testImage, [region]);

    expect(result.redactedRegionsCount).toBe(1);

    // Verify original pixels remain 100% unmutated
    expect(Array.from(pixels)).toEqual(Array.from(originalPixelsCopy));
  });

  it('4. resolves custom image data and canvas source inputs directly to redacted result', async () => {
    const pixels = createTestPixels(200, 200);
    const customInput: any = {
      width: 200,
      height: 200,
      data: pixels,
      rawBytes: pixels.buffer.slice(0)
    };

    const result = await redactor.redact(customInput, []);
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    expect(result.blob).toBeDefined();
  });
});
