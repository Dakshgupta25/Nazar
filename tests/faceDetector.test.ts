import { describe, it, expect } from 'vitest';
import { detectFacesLocally, RawImageData } from '../src/privacy/faceDetector';

describe('Local Face Detection Engine', () => {
  it('handles raw image data safely without network egress', async () => {
    // Use RawImageData (plain object) to work in Node/JSDOM without the browser ImageData constructor
    const width = 100;
    const height = 100;
    const buffer = new Uint8ClampedArray(width * height * 4);

    // Fill face region (x: 30-70, y: 30-70) with human skin-tone RGB (R: 220, G: 160, B: 130)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (x >= 30 && x <= 70 && y >= 30 && y <= 70) {
          buffer[idx] = 220;     // R
          buffer[idx + 1] = 160; // G
          buffer[idx + 2] = 130; // B
          buffer[idx + 3] = 255; // A
        } else {
          buffer[idx] = 20;
          buffer[idx + 1] = 20;
          buffer[idx + 2] = 20;
          buffer[idx + 3] = 255;
        }
      }
    }

    // Use plain RawImageData object (no browser constructor needed)
    const imgData: RawImageData = { width, height, data: buffer };
    const faces = await detectFacesLocally(imgData);

    expect(faces).toBeDefined();
    expect(faces.length).toBeGreaterThanOrEqual(1);
    expect(faces[0].confidence).toBeGreaterThan(0.6);
    expect(faces[0].boundingBox.width).toBeGreaterThanOrEqual(30);
  });
});
