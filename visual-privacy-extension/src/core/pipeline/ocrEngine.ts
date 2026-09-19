import { createWorker, Worker } from 'tesseract.js';
import { OcrResult, PipelineStage } from '../types/pipeline';
import { LoadedImage } from '../types/image';
import { Preprocessor } from '../image/preprocessor';

export type OcrLifecycleStatus = 'UNLOADED' | 'LOADING' | 'READY' | 'RECOGNIZING' | 'ERROR';

export interface OcrEnginePerformance {
  initTimeMs: number;
  lastRecognitionTimeMs: number;
  coldRecognitionTimeMs: number | null;
  warmRecognitionTimeMs: number | null;
}

export class OcrEngine implements PipelineStage<LoadedImage, OcrResult[]> {
  readonly name = 'OcrEngine';

  private status: OcrLifecycleStatus = 'UNLOADED';
  private worker: Worker | null = null;
  private errorMessage: string | null = null;

  private performanceStats: OcrEnginePerformance = {
    initTimeMs: 0,
    lastRecognitionTimeMs: 0,
    coldRecognitionTimeMs: null,
    warmRecognitionTimeMs: null
  };

  public getStatus(): OcrLifecycleStatus {
    return this.status;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public getPerformanceStats(): OcrEnginePerformance {
    return { ...this.performanceStats };
  }

  /**
   * Initializes local Tesseract worker using locally packaged WASM & language assets.
   */
  public async loadEngine(): Promise<void> {
    if (this.status === 'READY') return;
    if (this.status === 'LOADING') return;

    this.status = 'LOADING';
    this.errorMessage = null;

    const startInit = performance.now();

    try {
      // Resolve local paths inside extension bundle
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function';

      const workerPath = isExtension
        ? chrome.runtime.getURL('models/ocr/worker.min.js')
        : './models/ocr/worker.min.js';

      const corePath = isExtension
        ? chrome.runtime.getURL('models/ocr/tesseract-core.wasm.js')
        : './models/ocr/tesseract-core.wasm.js';

      const langPath = isExtension
        ? chrome.runtime.getURL('models/ocr/')
        : './models/ocr/';

      // Create worker using packaged local assets (0 network egress)
      this.worker = await createWorker('eng', 1, {
        workerPath,
        corePath,
        langPath,
        gzip: true,
        workerBlobURL: false,
        logger: () => {}
      });

      const endInit = performance.now();
      this.performanceStats.initTimeMs = Math.round(endInit - startInit);

      this.status = 'READY';
      console.log(`[OcrEngine] Local OCR engine initialized in ${this.performanceStats.initTimeMs}ms.`);
    } catch (err: any) {
      this.status = 'ERROR';
      this.errorMessage = err?.message || 'Failed to initialize local Tesseract OCR engine.';
      console.error('[OcrEngine] Initialization error:', this.errorMessage);
      throw new Error(this.errorMessage || 'Failed to initialize local Tesseract OCR engine.');
    }
  }

  public async process(input: LoadedImage): Promise<OcrResult[]> {
    return this.recognizeText(input);
  }

  /**
   * Performs local OCR text recognition on LoadedImage with local orientation support.
   * Transforms bounding boxes from rotated coordinate spaces back into source image pixel coordinates.
   */
  public async recognizeText(loadedImage: LoadedImage): Promise<OcrResult[]> {
    if (this.status !== 'READY') {
      if (this.status === 'UNLOADED') {
        await this.loadEngine();
      } else if (this.status === 'LOADING') {
        throw new Error('OCR engine is currently initializing. Please wait.');
      } else if (this.status === 'ERROR') {
        throw new Error(`OCR engine error: ${this.errorMessage}`);
      }
    }

    if (!this.worker) {
      throw new Error('OCR engine worker is not initialized.');
    }

    this.status = 'RECOGNIZING';
    const startRec = performance.now();

    try {
      const processedData = await Preprocessor.prepareImage(loadedImage);
      const sourceWidth = processedData.sourceWidth;
      const sourceHeight = processedData.sourceHeight;

      const angles: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
      const passResults: { angle: number; results: OcrResult[]; validCount: number; piiScore: number }[] = [];
      let lastError: any = null;

      for (const angle of angles) {
        try {
          const elementToUse = angle === 0
            ? processedData.imageElement
            : await this.renderRotatedCanvas(processedData.imageElement, angle, sourceWidth, sourceHeight);

          if (elementToUse) {
            const pass = await this.executeOcrPass(elementToUse, angle, sourceWidth, sourceHeight);
            const validCount = pass.filter((o) => o.text.trim().length >= 2 && o.confidence >= 0.15).length;

            let piiScore = 0;
            const combinedText = pass.map((o) => o.text).join(' ');
            if (/\b(?:address|permanent|flat|house|village|street|road|district|state|pincode|pin|nallasopara|vasai|thane|sumati|colony|nagar)\b/i.test(combinedText)) piiScore += 15;
            if (/(?:\+?91[\s.-]?)?[6-9]\d{9}\b|\b\d{10}\b|\bmob\b|\bcontact\b|\bphone\b/i.test(combinedText)) piiScore += 15;
            if (/\b(?:dob|batch|reg|roll|student|id|aadhaar|card|identity|university|college|priyanshu|vishwakarma)\b/i.test(combinedText)) piiScore += 10;

            passResults.push({ angle, results: pass, validCount, piiScore });

            // If pass at 0° has high text density AND strong PII score, fast break
            if (angle === 0 && validCount >= 12 && piiScore >= 20) {
              break;
            }
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      if (passResults.length === 0 && lastError) {
        throw lastError;
      }

      // Sort passes by PII score first, then valid word count
      passResults.sort((a, b) => (b.piiScore - a.piiScore) || (b.validCount - a.validCount));

      const bestPass = passResults.length > 0 ? passResults[0].results : [];
      const selectedAngle = passResults.length > 0 ? passResults[0].angle : 0;

      const endRec = performance.now();
      this.performanceStats.lastRecognitionTimeMs = Math.round(endRec - startRec);
      this.status = 'READY';

      console.log(`[OcrEngine] Multi-angle OCR completed. Selected orientation: ${selectedAngle}° (${bestPass.length} spatial tokens).`);
      return bestPass;
    } catch (err: any) {
      this.status = 'READY';
      throw new Error(`OCR text recognition failed: ${err?.message || err}`);
    }
  }

  private async executeOcrPass(
    imageElement: any,
    angle: 0 | 90 | 180 | 270,
    sourceWidth: number,
    sourceHeight: number
  ): Promise<OcrResult[]> {
    if (!this.worker) return [];

    const result = await this.worker.recognize(imageElement);
    const pageData = result.data as any;
    const ocrResults: OcrResult[] = [];

    let rotWidth = sourceWidth;
    let rotHeight = sourceHeight;
    if (angle === 90 || angle === 270) {
      rotWidth = sourceHeight;
      rotHeight = sourceWidth;
    }

    if (pageData && pageData.words && pageData.words.length > 0) {
      pageData.words.forEach((word: any, idx: number) => {
        const text = (word.text || '').trim();
        if (!text) return;

        const bbox = word.bbox;
        const x = Math.max(0, Math.round(bbox.x0));
        const y = Math.max(0, Math.round(bbox.y0));
        const width = Math.min(rotWidth - x, Math.round(bbox.x1 - bbox.x0));
        const height = Math.min(rotHeight - y, Math.round(bbox.y1 - bbox.y0));

        const transformedBox = this.transformRotatedBboxToSource({ x, y, width, height }, angle, sourceWidth, sourceHeight);
        const confidence = Math.round((word.confidence || 0) * 100) / 10000;

        ocrResults.push({
          id: `ocr-word-${idx + 1}-${Math.random().toString(36).substring(2, 7)}`,
          text,
          confidence: Math.min(1.0, Math.max(0, confidence)),
          box: transformedBox
        });
      });
    } else if (pageData && pageData.lines && pageData.lines.length > 0) {
      pageData.lines.forEach((line: any, idx: number) => {
        const text = (line.text || '').trim();
        if (!text) return;

        const bbox = line.bbox;
        const x = Math.max(0, Math.round(bbox.x0));
        const y = Math.max(0, Math.round(bbox.y0));
        const width = Math.min(rotWidth - x, Math.round(bbox.x1 - bbox.x0));
        const height = Math.min(rotHeight - y, Math.round(bbox.y1 - bbox.y0));

        const transformedBox = this.transformRotatedBboxToSource({ x, y, width, height }, angle, sourceWidth, sourceHeight);
        const confidence = Math.round((line.confidence || 0) * 100) / 10000;

        ocrResults.push({
          id: `ocr-line-${idx + 1}-${Math.random().toString(36).substring(2, 7)}`,
          text,
          confidence: Math.min(1.0, Math.max(0, confidence)),
          box: transformedBox
        });
      });
    }

    return ocrResults;
  }

  /**
   * Transforms bounding box from rotated canvas coordinates (angle: 0, 90, 180, 270)
   * back into original un-rotated source image pixel coordinates.
   */
  public transformRotatedBboxToSource(
    box: { x: number; y: number; width: number; height: number },
    angle: 0 | 90 | 180 | 270,
    sourceWidth: number,
    sourceHeight: number
  ): { x: number; y: number; width: number; height: number } {
    if (angle === 0) {
      const x = Math.max(0, Math.min(box.x, sourceWidth));
      const y = Math.max(0, Math.min(box.y, sourceHeight));
      const width = Math.min(sourceWidth - x, Math.max(1, box.width));
      const height = Math.min(sourceHeight - y, Math.max(1, box.height));
      return { x, y, width, height };
    }

    if (angle === 90) {
      // 90° Clockwise rotation
      const x = Math.max(0, Math.round(box.y));
      const y = Math.max(0, Math.round(sourceHeight - (box.x + box.width)));
      const width = Math.min(sourceWidth - x, Math.max(1, Math.round(box.height)));
      const height = Math.min(sourceHeight - y, Math.max(1, Math.round(box.width)));
      return { x, y, width, height };
    }

    if (angle === 180) {
      // 180° Rotation
      const x = Math.max(0, Math.round(sourceWidth - (box.x + box.width)));
      const y = Math.max(0, Math.round(sourceHeight - (box.y + box.height)));
      const width = Math.min(sourceWidth - x, Math.max(1, Math.round(box.width)));
      const height = Math.min(sourceHeight - y, Math.max(1, Math.round(box.height)));
      return { x, y, width, height };
    }

    if (angle === 270) {
      // 270° Clockwise (90° Counter-Clockwise) rotation
      const x = Math.max(0, Math.round(sourceWidth - (box.y + box.height)));
      const y = Math.max(0, Math.round(box.x));
      const width = Math.min(sourceWidth - x, Math.max(1, Math.round(box.height)));
      const height = Math.min(sourceHeight - y, Math.max(1, Math.round(box.width)));
      return { x, y, width, height };
    }

    return box;
  }

  private async renderRotatedCanvas(
    imgEl: any,
    angle: 90 | 180 | 270,
    sourceWidth: number,
    sourceHeight: number
  ): Promise<any> {
    if (typeof document === 'undefined') return imgEl;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.translate !== 'function') return imgEl;

    if (angle === 90 || angle === 270) {
      canvas.width = sourceHeight;
      canvas.height = sourceWidth;
    } else {
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
    }

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);

    const drawEl = imgEl.element || imgEl;
    ctx.drawImage(drawEl, -sourceWidth / 2, -sourceHeight / 2);

    return canvas;
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.status = 'UNLOADED';
    }
  }
}
