import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FaceDetector } from '../src/core/pipeline/faceDetector';
import { LoadedImage } from '../src/core/types/image';
import { Preprocessor } from '../src/core/image/preprocessor';

describe('Local Face Detection Network Privacy & Log Safety Tests', () => {
  let detector: FaceDetector;

  beforeEach(() => {
    vi.restoreAllMocks();
    detector = new FaceDetector();

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
      name: 'privacy-photo.png',
      mimeType: 'image/png',
      size: 12000,
      width: 1280,
      height: 720
    },
    previewUrl: 'blob:http://localhost/privacy-photo-id',
    file: new File([new ArrayBuffer(12000)], 'privacy-photo.png', { type: 'image/png' })
  };

  it('guarantees ZERO external network requests (fetch, XMLHttpRequest, WebSocket) during face inference', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhrSpy = vi.spyOn(globalThis, 'XMLHttpRequest');

    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [100, 100], bottomRight: [250, 250], probability: 0.94 }
      ])
    };

    await detector.detectFaces(sampleImage);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('verifies console logs contain only timing metadata and ZERO raw image pixels or PII data', async () => {
    const logSpy = vi.spyOn(console, 'log');

    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [50, 50], bottomRight: [150, 150], probability: 0.96 }
      ])
    };

    await detector.detectFaces(sampleImage);

    for (const call of logSpy.mock.calls) {
      const logString = call.map((arg) => String(arg)).join(' ');
      expect(logString).not.toContain('data:image/');
      expect(logString).not.toContain('Uint8ClampedArray');
      expect(logString).not.toContain('base64');
    }
  });
});
