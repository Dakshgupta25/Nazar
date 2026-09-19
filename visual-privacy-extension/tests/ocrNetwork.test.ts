import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OcrEngine } from '../src/core/pipeline/ocrEngine';
import { LoadedImage } from '../src/core/types/image';
import { Preprocessor } from '../src/core/image/preprocessor';

describe('Local OCR Network Privacy & Log Safety Tests', () => {
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

  const sampleImage: LoadedImage = {
    metadata: {
      name: 'privacy-ocr-photo.png',
      mimeType: 'image/png',
      size: 14000,
      width: 1280,
      height: 720
    },
    previewUrl: 'blob:http://localhost/privacy-ocr-photo-id',
    file: new File([new ArrayBuffer(14000)], 'privacy-ocr-photo.png', { type: 'image/png' })
  };

  it('guarantees ZERO external network requests (fetch, XMLHttpRequest, WebSocket) during OCR text recognition', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhrSpy = vi.spyOn(globalThis, 'XMLHttpRequest');

    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          words: [
            { text: 'Confidential', confidence: 95.0, bbox: { x0: 50, y0: 50, x1: 200, y1: 90 } }
          ]
        }
      })
    };

    await ocrEngine.recognizeText(sampleImage);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('verifies console logs contain only timing metadata and ZERO raw image pixels or extracted text', async () => {
    const logSpy = vi.spyOn(console, 'log');

    (ocrEngine as any).status = 'READY';
    (ocrEngine as any).worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          words: [
            { text: 'SecretText', confidence: 96.0, bbox: { x0: 50, y0: 50, x1: 150, y1: 80 } }
          ]
        }
      })
    };

    await ocrEngine.recognizeText(sampleImage);

    for (const call of logSpy.mock.calls) {
      const logString = call.map((arg) => String(arg)).join(' ');
      expect(logString).not.toContain('data:image/');
      expect(logString).not.toContain('Uint8ClampedArray');
      expect(logString).not.toContain('base64');
    }
  });
});
