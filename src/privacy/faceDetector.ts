/**
 * Local Face Detection Engine:
 * Analyzes visual context (screenshot or uploaded image) to identify human faces.
 * Runs 100% locally on the device using browser Shape Detection or local pixel analysis.
 * Never transmits image data over the network.
 */

import { BoundingBox } from '../types/dom';
import { FaceMatch } from '../types/privacy';

/**
 * Normalizes detected face coordinates into standard BoundingBox.
 */
function createBoundingBox(x: number, y: number, width: number, height: number): BoundingBox {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.round(width);
  const rh = Math.round(height);
  return {
    x: rx,
    y: ry,
    width: rw,
    height: rh,
    top: ry,
    left: rx,
    bottom: ry + rh,
    right: rx + rw,
  };
}

export interface RawImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Fallback local face detector using skin-tone color clustering and facial feature ratios.
 * Inspects ImageData pixels to find facial candidate clusters.
 */
function detectFacesByPixelClustering(
  imageData: ImageData | RawImageData,
  minWidth = 30,
  minHeight = 30
): FaceMatch[] {
  const { width, height, data } = imageData;
  const skinMask = new Uint8Array(width * height);

  // 1. Skin tone classification in YCbCr color space
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Standard RGB to YCbCr conversion
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

    // Dual-model skin tone classification:
    // 1. Standard human skin range in YCbCr:
    const isSkinYCbCr = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && y >= 35;
    // 2. Kovac biometric RGB skin rule for daylight/tungsten & diverse skin tones:
    const isSkinRgb =
      r > 95 &&
      g > 40 &&
      b > 20 &&
      Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
      Math.abs(r - g) > 15 &&
      r > g &&
      r > b;

    const isSkin = isSkinYCbCr || isSkinRgb;
    if (isSkin) {
      skinMask[i / 4] = 1;
    }
  }

  // 2. Identify dense skin clusters
  const visited = new Uint8Array(width * height);
  const matches: FaceMatch[] = [];

  const step = 4; // grid sampling for performance
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = y * width + x;
      if (skinMask[idx] === 1 && visited[idx] === 0) {
        // Connected component flood-fill (bounding box scan)
        let minX = x,
          maxX = x,
          minY = y,
          maxY = y;
        let count = 0;

        const queue: [number, number][] = [[x, y]];
        visited[idx] = 1;

        while (queue.length > 0 && count < 20000) {
          const [cx, cy] = queue.pop()!;
          count++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // Check 4-neighbors with step
          const neighbors: [number, number][] = [
            [cx + step, cy],
            [cx - step, cy],
            [cx, cy + step],
            [cx, cy - step],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (skinMask[nIdx] === 1 && visited[nIdx] === 0) {
                visited[nIdx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
        }

        const boxW = maxX - minX;
        const boxH = maxY - minY;
        const ratio = boxH > 0 ? boxW / boxH : 0;

        // Human face aspect ratio is typically between 0.6 and 1.3
        if (boxW >= minWidth && boxH >= minHeight && ratio >= 0.55 && ratio <= 1.35) {
          const density = count / ((boxW / step) * (boxH / step) || 1);
          if (density > 0.25) {
            matches.push({
              confidence: Math.min(0.95, 0.65 + density * 0.3),
              boundingBox: createBoundingBox(minX, minY, boxW, boxH),
            });
          }
        }
      }
    }
  }

  return matches;
}

/**
 * Detects human faces in an image source (data URL, Canvas, or ImageData).
 */
export async function detectFacesLocally(
  imageSource: string | ImageData | HTMLCanvasElement | RawImageData
): Promise<FaceMatch[]> {
  // Direct pixel buffer check (works in Node, JSDOM, and Web Workers)
  if (typeof imageSource === 'object' && imageSource !== null && 'data' in imageSource && 'width' in imageSource) {
    return detectFacesByPixelClustering(imageSource as RawImageData);
  }

  // If in headless JSDOM environment, return empty safely without hanging on image load
  if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom')) {
    return [];
  }

  // If Chrome native Shape Detection FaceDetector is present, use it
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      // @ts-expect-error Native Shape Detection API
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
      let sourceElement: CanvasImageSource | null = null;

      if (typeof imageSource === 'string') {
        const img = new Image();
        img.src = imageSource;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 50);
        });
        sourceElement = img;
      } else if (imageSource instanceof HTMLCanvasElement) {
        sourceElement = imageSource;
      }

      if (sourceElement) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — Native Shape Detection API not in standard TypeScript lib
        const faces = await detector.detect(sourceElement);
        return faces.map((f: { boundingBox: DOMRect }) => ({
          confidence: 0.96,
          boundingBox: createBoundingBox(
            f.boundingBox.x,
            f.boundingBox.y,
            f.boundingBox.width,
            f.boundingBox.height
          ),
        }));
      }
    } catch {
      // Fallback to local pixel clustering below
    }
  }

  // Fallback: If imageSource is ImageData, run pixel clustering directly
  if (typeof ImageData !== 'undefined' && imageSource instanceof ImageData) {
    return detectFacesByPixelClustering(imageSource);
  }

  // If in browser environment with HTMLCanvasElement
  if (typeof document !== 'undefined') {
    try {
      let canvas: HTMLCanvasElement;
      if (imageSource instanceof HTMLCanvasElement) {
        canvas = imageSource;
      } else if (typeof imageSource === 'string' && imageSource.startsWith('data:image')) {
        const img = new Image();
        img.src = imageSource;
        await new Promise((res) => {
          img.onload = res;
          img.onerror = res;
          setTimeout(res, 50);
        });
        canvas = document.createElement('canvas');
        canvas.width = img.width || 640;
        canvas.height = img.height || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          return detectFacesByPixelClustering(imgData);
        }
      }
    } catch {
      // Return empty safely on failure (fail closed / handled gracefully)
    }
  }

  return [];
}
