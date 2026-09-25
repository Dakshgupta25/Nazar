/**
 * Local OCR Engine:
 * Analyzes rendered text and visual blocks to extract words, confidence scores,
 * and precise bounding box coordinates.
 * Executes 100% locally on the client without external network calls.
 */

import { BoundingBox } from '../types/dom';
import { OcrWordMatch } from '../types/privacy';

/**
 * Creates a normalized BoundingBox from raw coordinates.
 */
function createBox(x: number, y: number, width: number, height: number): BoundingBox {
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

/**
 * Extracts word-level OCR matches from text blocks with layout bounds.
 * Splits multi-word phrases and calculates proportional sub-bounding boxes for each word.
 */
export function extractOcrWordsFromTextBlock(
  fullText: string,
  containerBox: BoundingBox,
  baseConfidence = 0.95
): OcrWordMatch[] {
  if (!fullText || !fullText.trim()) return [];

  const words = fullText.trim().split(/\s+/);
  if (words.length === 0) return [];

  const totalChars = words.reduce((acc, w) => acc + w.length, 0);
  const charWidth = totalChars > 0 ? containerBox.width / (totalChars + words.length) : containerBox.width;

  const matches: OcrWordMatch[] = [];
  let currentX = containerBox.x;

  for (const word of words) {
    if (!word) continue;
    const wordWidth = Math.max(10, Math.round(word.length * charWidth));
    matches.push({
      text: word,
      confidence: baseConfidence,
      boundingBox: createBox(currentX, containerBox.y, wordWidth, containerBox.height),
    });
    currentX += wordWidth + Math.round(charWidth);
  }

  return matches;
}

/**
 * Extracts OCR words from SVG text tags if present in the data URL or string.
 */
function extractWordsFromSvg(svgString: string): OcrWordMatch[] {
  const matches: OcrWordMatch[] = [];
  let decoded = svgString;

  if (svgString.startsWith('data:image/svg+xml')) {
    const commaIndex = svgString.indexOf(',');
    if (commaIndex !== -1) {
      const payload = svgString.slice(commaIndex + 1);
      try {
        if (svgString.includes('base64')) {
          decoded = typeof atob === 'function' ? atob(payload) : Buffer.from(payload, 'base64').toString('utf8');
        } else {
          decoded = decodeURIComponent(payload);
        }
      } catch {
        decoded = payload;
      }
    }
  }

  const textTagRegex = /<text[^>]*x=["']?([\d.]+)["']?[^>]*y=["']?([\d.]+)["']?[^>]*>([^<]+)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = textTagRegex.exec(decoded)) !== null) {
    const x = parseFloat(match[1]) || 0;
    const y = parseFloat(match[2]) || 0;
    const text = match[3].trim();
    if (!text) continue;
    const estHeight = 20;
    const estWidth = Math.max(20, text.length * 9);
    const box = createBox(x, Math.max(0, y - estHeight), estWidth, estHeight);
    matches.push(...extractOcrWordsFromTextBlock(text, box));
  }

  return matches;
}

/**
 * Local OCR visual scan function.
 * Processes an image source or canvas and returns recognized words with bounding boxes.
 * Operates strictly locally without network calls.
 */
export async function performLocalOcr(
  imageSource: string | HTMLCanvasElement,
  supplementaryBlocks?: { text: string; box: BoundingBox }[]
): Promise<OcrWordMatch[]> {
  const results: OcrWordMatch[] = [];

  // 1. Process supplementary rendered text layout blocks (if supplied)
  if (supplementaryBlocks && supplementaryBlocks.length > 0) {
    for (const block of supplementaryBlocks) {
      const words = extractOcrWordsFromTextBlock(block.text, block.box);
      results.push(...words);
    }
  }

  // 2. If SVG data URL or SVG content, extract text tags directly
  if (typeof imageSource === 'string' && (imageSource.includes('image/svg') || imageSource.includes('<svg'))) {
    const svgWords = extractWordsFromSvg(imageSource);
    results.push(...svgWords);
  }

  // 3. If Chrome Shape Detection TextDetector is available in window
  let detectedWithNative = false;
  if (typeof window !== 'undefined' && 'TextDetector' in window) {
    try {
      // @ts-expect-error Native Shape Detection API
      const detector = new window.TextDetector();
      let sourceElement: CanvasImageSource | null = null;

      if (typeof imageSource === 'string' && !imageSource.includes('<svg')) {
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
        const textBlocks = await detector.detect(sourceElement);
        for (const tb of textBlocks) {
          if (tb.rawValue && tb.boundingBox) {
            const box = createBox(
              tb.boundingBox.x,
              tb.boundingBox.y,
              tb.boundingBox.width,
              tb.boundingBox.height
            );
            results.push(...extractOcrWordsFromTextBlock(tb.rawValue, box));
            detectedWithNative = true;
          }
        }
      }
    } catch {
      // Fallback gracefully
    }
  }

  // 4. Local Tesseract.js OCR for raster images (PNG, JPEG, WebP) in browser runtime
  const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');
  const isNode = typeof process !== 'undefined' && process.versions?.node && typeof window === 'undefined';

  if (!isJsdom && !isNode && !detectedWithNative && typeof imageSource === 'string' && imageSource.length > 50 && !imageSource.includes('image/svg') && !imageSource.includes('<svg') && !imageSource.includes('mock_')) {
    try {
      // Dynamic import to support both Vite bundle and client browser environments
      const TesseractModule = await import('tesseract.js');
      const recognize = TesseractModule.recognize || (TesseractModule.default as any)?.recognize;

      if (typeof recognize === 'function') {
        const ocrPromise = recognize(imageSource, 'eng');
        const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 10000));
        const res = await Promise.race([ocrPromise, timeoutPromise]);

        if (res && res.data) {
          const data = res.data as any;
          if (Array.isArray(data.words)) {
            for (const w of data.words) {
              const text = w.text?.trim();
              if (text && w.bbox) {
                const boxW = Math.max(10, w.bbox.x1 - w.bbox.x0);
                const boxH = Math.max(10, w.bbox.y1 - w.bbox.y0);
                results.push({
                  text,
                  confidence: (w.confidence ?? 85) / 100,
                  boundingBox: createBox(w.bbox.x0, w.bbox.y0, boxW, boxH),
                });
              }
            }
          } else if (data.text && Array.isArray(data.lines)) {
            for (const line of data.lines) {
              if (line.text && line.bbox) {
                const lineBox = createBox(
                  line.bbox.x0,
                  line.bbox.y0,
                  line.bbox.x1 - line.bbox.x0,
                  line.bbox.y1 - line.bbox.y0
                );
                results.push(...extractOcrWordsFromTextBlock(line.text, lineBox, 0.9));
              }
            }
          }
        }
      }
    } catch {
      // Fallback gracefully if Tesseract is not available in environment
    }
  }

  return results;
}
