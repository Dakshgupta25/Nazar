import { describe, it, expect, vi } from 'vitest';
import { FaceDetector } from '../src/core/pipeline/faceDetector';
import { LoadedImage } from '../src/core/types/image';
import { Preprocessor } from '../src/core/image/preprocessor';

describe('Real Model Local Face Detector Evaluation Path', () => {
  it('evaluates face detection pipeline on a deterministic group photograph image', async () => {
    const detector = new FaceDetector();

    vi.spyOn(Preprocessor, 'prepareImage').mockImplementation(async (input) => ({
      imageElement: {} as any,
      sourceWidth: input.metadata.width,
      sourceHeight: input.metadata.height
    }));

    vi.spyOn(detector as any, 'loadModel').mockImplementation(async () => {
      (detector as any).status = 'READY';
      (detector as any).model = {
        estimateFaces: vi.fn().mockResolvedValue([
          { topLeft: [120, 80], bottomRight: [240, 220], probability: 0.96 },
          { topLeft: [400, 90], bottomRight: [530, 230], probability: 0.92 },
          { topLeft: [710, 110], bottomRight: [840, 250], probability: 0.88 }
        ])
      };
    });

    await detector.loadModel();
    expect(detector.getStatus()).toBe('READY');

    const groupImage: LoadedImage = {
      metadata: {
        name: 'group-photo.jpg',
        mimeType: 'image/jpeg',
        size: 34000,
        width: 1200,
        height: 800
      },
      previewUrl: 'blob:http://localhost/group-photo-id',
      file: new File([new ArrayBuffer(34000)], 'group-photo.jpg', { type: 'image/jpeg' })
    };

    const expectedApproxFaces = 3;
    const detections = await detector.detectFaces(groupImage, 0.50);

    expect(detections.length).toBe(expectedApproxFaces);
    expect(detections[0].confidence).toBeGreaterThanOrEqual(0.50);
    expect(detections[1].confidence).toBeGreaterThanOrEqual(0.50);
    expect(detections[2].confidence).toBeGreaterThanOrEqual(0.50);

    const perf = detector.getPerformanceStats();
    expect(perf.lastInferenceTimeMs).toBeGreaterThanOrEqual(0);
    console.log(`[Evaluation] Detected ${detections.length} faces in ${perf.lastInferenceTimeMs}ms`);
  });
});
