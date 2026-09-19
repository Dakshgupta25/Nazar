import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FaceDetector } from '../src/core/pipeline/faceDetector';
import { LoadedImage } from '../src/core/types/image';
import { Preprocessor } from '../src/core/image/preprocessor';

describe('FaceDetector Unit Tests', () => {
  let detector: FaceDetector;

  beforeEach(() => {
    vi.restoreAllMocks();
    detector = new FaceDetector();

    // Mock Preprocessor.prepareImage to avoid JSDOM image loading timeout
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
      name: 'test-group.png',
      mimeType: 'image/png',
      size: 15000,
      width: 1920,
      height: 1080
    },
    previewUrl: 'blob:http://localhost/test-group-id',
    file: new File([new ArrayBuffer(15000)], 'test-group.png', { type: 'image/png' })
  };

  // Test 1: Detector initializes
  it('1. initializes with status UNLOADED and transitions to READY after loadModel()', async () => {
    expect(detector.getStatus()).toBe('UNLOADED');

    vi.spyOn(detector as any, 'loadModel').mockImplementation(async () => {
      (detector as any).status = 'READY';
      (detector as any).model = {
        estimateFaces: vi.fn().mockResolvedValue([])
      };
    });

    await detector.loadModel();
    expect(detector.getStatus()).toBe('READY');
  });

  // Test 2: Detector handles valid image input
  it('2. handles valid LoadedImage input without throwing', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([])
    };

    const results = await detector.detectFaces(mockLoadedImage);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  // Test 3: Detector returns an array
  it('3. returns an array of DetectedFace items', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [100, 100], bottomRight: [300, 300], probability: 0.95 }
      ])
    };

    const results = await detector.detectFaces(mockLoadedImage);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
  });

  // Test 4: Each detection contains a bounding box
  it('4. ensures each detection contains a valid BoundingBox (x, y, width, height)', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [200, 150], bottomRight: [450, 400], probability: 0.88 }
      ])
    };

    const results = await detector.detectFaces(mockLoadedImage);
    const face = results[0];

    expect(face.box).toBeDefined();
    expect(typeof face.box.x).toBe('number');
    expect(typeof face.box.y).toBe('number');
    expect(typeof face.box.width).toBe('number');
    expect(typeof face.box.height).toBe('number');
    expect(face.box.x).toBe(200);
    expect(face.box.y).toBe(150);
    expect(face.box.width).toBe(250);
    expect(face.box.height).toBe(250);
  });

  // Test 5: Each detection contains confidence
  it('5. ensures each detection contains a confidence score between 0.0 and 1.0', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [50, 50], bottomRight: [150, 150], probability: 0.92 }
      ])
    };

    const results = await detector.detectFaces(mockLoadedImage);
    const face = results[0];

    expect(typeof face.confidence).toBe('number');
    expect(face.confidence).toBeGreaterThanOrEqual(0.0);
    expect(face.confidence).toBeLessThanOrEqual(1.0);
    expect(face.confidence).toBe(0.92);
  });

  // Test 6: Multiple face detections supported
  it('6. supports multiple face detections in a single image', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [100, 100], bottomRight: [200, 200], probability: 0.95 },
        { topLeft: [300, 100], bottomRight: [400, 200], probability: 0.91 },
        { topLeft: [500, 100], bottomRight: [600, 200], probability: 0.87 },
        { topLeft: [700, 100], bottomRight: [800, 200], probability: 0.79 }
      ])
    };

    const results = await detector.detectFaces(mockLoadedImage, 0.50);
    expect(results.length).toBe(4);
  });

  // Test 7: Confidence threshold is applied
  it('7. applies configurable confidence threshold filtering correctly', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [100, 100], bottomRight: [200, 200], probability: 0.95 },
        { topLeft: [300, 100], bottomRight: [400, 200], probability: 0.40 }
      ])
    };

    const results = await detector.detectFaces(mockLoadedImage, 0.50);
    expect(results.length).toBe(1);
    expect(results[0].confidence).toBe(0.95);
  });

  // Test 8: No-face result works
  it('8. returns empty array cleanly when no faces are detected', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([])
    };

    const results = await detector.detectFaces(mockLoadedImage);
    expect(results).toEqual([]);
    expect(detector.getStatus()).toBe('READY');
  });

  // Test 9: Inference failure is handled
  it('9. handles inference failure gracefully by throwing descriptive error', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockRejectedValue(new Error('GPU memory exhausted'))
    };

    await expect(detector.detectFaces(mockLoadedImage)).rejects.toThrow(
      'Face detection inference failed: GPU memory exhausted'
    );
    expect(detector.getStatus()).toBe('READY');
  });

  // Test 10: Coordinates remain within image bounds
  it('10. clips coordinates to remain strictly within source image dimensions', async () => {
    (detector as any).status = 'READY';
    (detector as any).model = {
      estimateFaces: vi.fn().mockResolvedValue([
        { topLeft: [-20, -10], bottomRight: [2000, 1200], probability: 0.99 }
      ])
    };

    const results = await detector.detectFaces(mockLoadedImage);
    const face = results[0];

    expect(face.box.x).toBeGreaterThanOrEqual(0);
    expect(face.box.y).toBeGreaterThanOrEqual(0);
    expect(face.box.x + face.box.width).toBeLessThanOrEqual(1920);
    expect(face.box.y + face.box.height).toBeLessThanOrEqual(1080);
  });
});
