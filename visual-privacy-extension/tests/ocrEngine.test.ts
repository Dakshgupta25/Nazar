import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OcrEngine } from '../src/core/pipeline/ocrEngine';
import { LoadedImage } from '../src/core/types/image';
import { Preprocessor } from '../src/core/image/preprocessor';

describe('OcrEngine Unit Tests', () => {
  let ocrEngine: OcrEngine;

  beforeEach(() => {
    vi.restoreAllMocks();
    ocrEngine = new OcrEngine();

    vi.spyOn(Preprocessor, 'prepareImage').mockImplementation(async (input) => ({
      imageElement: {} as any,
      sourceWidth: input.metadata.width,
      sourceHeight: input.metadata.height
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockLoadedImage: LoadedImage = {
    metadata: {
      name: 'document.png',
      mimeType: 'image/png',
      size: 18000,
      width: 1920,
      height: 1080
    },
    previewUrl: 'blob:http://localhost/document-id',
    file: new File([new ArrayBuffer(18000)], 'document.png', { type: 'image/png' })
  };

  // Test 1: OCR engine initializes
  it('1. initializes with status UNLOADED and transitions to READY', async () => {
    expect(ocrEngine.getStatus()).toBe('UNLOADED');

    vi.spyOn(ocrEngine as any, 'loadEngine').mockImplementation(async () => {
      (ocrEngine as any).status = 'READY';
      (ocrEngine as any).worker = {
        recognize: vi.fn().mockResolvedValue({ data: { words: [] } })
      };
    });

    await ocrEngine.loadEngine();
    expect(ocrEngine.getStatus()).toBe('READY');
  });

  // Test 2: Valid image input accepted
  it('2. accepts valid LoadedImage input without throwing', async () => {
    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({ data: { words: [] } })
    };

    const results = await ocrEngine.recognizeText(mockLoadedImage);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  // Test 3: Returns array of OcrResult
  it('3. returns an array of OcrResult items', async () => {
    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          words: [
            { text: 'PRIVACY', confidence: 95.5, bbox: { x0: 100, y0: 50, x1: 300, y1: 90 } }
          ]
        }
      })
    };

    const results = await ocrEngine.recognizeText(mockLoadedImage);
    expect(results.length).toBe(1);
    expect(results[0].text).toBe('PRIVACY');
  });

  // Test 4: OcrResult schema (text, confidence, box)
  it('4. ensures each result contains text, confidence, and spatial BoundingBox', async () => {
    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          words: [
            { text: 'test@example.com', confidence: 98.0, bbox: { x0: 840, y0: 410, x1: 1190, y1: 458 } }
          ]
        }
      })
    };

    const results = await ocrEngine.recognizeText(mockLoadedImage);
    const item = results[0];

    expect(item.text).toBe('test@example.com');
    expect(item.confidence).toBe(0.98);
    expect(item.box.x).toBe(840);
    expect(item.box.y).toBe(410);
    expect(item.box.width).toBe(350);
    expect(item.box.height).toBe(48);
  });

  // Test 5: Multiple text regions supported
  it('5. supports multiple spatial text regions in a single image', async () => {
    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          words: [
            { text: 'Email:', confidence: 95.0, bbox: { x0: 100, y0: 100, x1: 200, y1: 130 } },
            { text: 'user@domain.com', confidence: 97.0, bbox: { x0: 210, y0: 100, x1: 500, y1: 130 } },
            { text: 'Phone:', confidence: 92.0, bbox: { x0: 100, y0: 150, x1: 200, y1: 180 } },
            { text: '9876543210', confidence: 96.0, bbox: { x0: 210, y0: 150, x1: 400, y1: 180 } }
          ]
        }
      })
    };

    const results = await ocrEngine.recognizeText(mockLoadedImage);
    expect(results.length).toBe(4);
  });

  // Test 6: Empty text / no detection handled safely
  it('6. returns empty array cleanly when no text is recognized', async () => {
    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({ data: { words: [] } })
    };

    const results = await ocrEngine.recognizeText(mockLoadedImage);
    expect(results).toEqual([]);
    expect(ocrEngine.getStatus()).toBe('READY');
  });

  // Test 7: Handles recognition failure cleanly
  it('7. handles recognition failure gracefully with descriptive error', async () => {
    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockRejectedValue(new Error('WASM memory allocation failed'))
    };

    await expect(ocrEngine.recognizeText(mockLoadedImage)).rejects.toThrow(
      'OCR text recognition failed: WASM memory allocation failed'
    );
    expect(ocrEngine.getStatus()).toBe('READY');
  });

  // Test 8: Coordinates clipped within bounds
  it('8. clips spatial coordinates strictly within source image dimensions', async () => {
    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          words: [
            { text: 'HEADER', confidence: 99.0, bbox: { x0: -10, y0: -5, x1: 2000, y1: 1100 } }
          ]
        }
      })
    };

    const results = await ocrEngine.recognizeText(mockLoadedImage);
    const item = results[0];

    expect(item.box.x).toBeGreaterThanOrEqual(0);
    expect(item.box.y).toBeGreaterThanOrEqual(0);
    expect(item.box.x + item.box.width).toBeLessThanOrEqual(1920);
    expect(item.box.y + item.box.height).toBeLessThanOrEqual(1080);
  });
});
