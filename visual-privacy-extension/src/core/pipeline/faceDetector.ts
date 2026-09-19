import * as blazeface from '@tensorflow-models/blazeface';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

import { DetectedFace, PipelineStage } from '../types/pipeline';
import { LoadedImage } from '../types/image';
import { Preprocessor } from '../image/preprocessor';
import { GeometryUtils } from '../geometry/geometryUtils';

export type ModelLifecycleStatus = 'UNLOADED' | 'LOADING' | 'READY' | 'INFERENCE' | 'ERROR';

export interface FaceDetectorPerformance {
  modelLoadTimeMs: number;
  lastInferenceTimeMs: number;
  coldInferenceTimeMs: number | null;
  warmInferenceTimeMs: number | null;
  executionProvider: string;
}

export class FaceDetector implements PipelineStage<LoadedImage, DetectedFace[]> {
  readonly name = 'FaceDetector';
  public static readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.50;

  private status: ModelLifecycleStatus = 'UNLOADED';
  private model: blazeface.BlazeFaceModel | null = null;
  private errorMessage: string | null = null;
  private executionProvider = 'webgl';

  private performanceStats: FaceDetectorPerformance = {
    modelLoadTimeMs: 0,
    lastInferenceTimeMs: 0,
    coldInferenceTimeMs: null,
    warmInferenceTimeMs: null,
    executionProvider: 'webgl'
  };

  public getStatus(): ModelLifecycleStatus {
    return this.status;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public getPerformanceStats(): FaceDetectorPerformance {
    return { ...this.performanceStats };
  }

  /**
   * Initializes local face detection model safely.
   */
  public async loadModel(): Promise<void> {
    if (this.status === 'READY') return;
    if (this.status === 'LOADING') return;

    this.status = 'LOADING';
    this.errorMessage = null;

    const startLoad = performance.now();

    try {
      // Set backend to webgl with cpu fallback
      try {
        await tf.setBackend('webgl');
        this.executionProvider = 'webgl';
      } catch {
        await tf.setBackend('cpu');
        this.executionProvider = 'cpu';
      }
      await tf.ready();

      // Resolve local model URL inside extension bundle
      const localModelUrl =
        typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
          ? chrome.runtime.getURL('models/blazeface/model.json')
          : './models/blazeface/model.json';

      // Load local packaged blazeface model (0 remote network egress)
      this.model = await blazeface.load({
        modelUrl: localModelUrl,
        maxFaces: 10,
        scoreThreshold: 0.1
      });

      const endLoad = performance.now();
      this.performanceStats.modelLoadTimeMs = Math.round(endLoad - startLoad);
      this.performanceStats.executionProvider = this.executionProvider;

      this.status = 'READY';
      console.log(`[FaceDetector] Model loaded successfully (${this.performanceStats.modelLoadTimeMs}ms, backend: ${this.executionProvider})`);
    } catch (err: any) {
      this.status = 'ERROR';
      this.errorMessage = err?.message || 'Failed to initialize local face detection model.';
      console.error('[FaceDetector] Loading error:', this.errorMessage);
      throw new Error(this.errorMessage || 'Failed to initialize local face detection model.');
    }
  }

  public async process(input: LoadedImage): Promise<DetectedFace[]> {
    return this.detectFaces(input);
  }

  /**
   * Runs local face detection on the provided LoadedImage.
   */
  public async detectFaces(
    loadedImage: LoadedImage,
    confidenceThreshold: number = FaceDetector.DEFAULT_CONFIDENCE_THRESHOLD
  ): Promise<DetectedFace[]> {
    if (this.status !== 'READY') {
      if (this.status === 'UNLOADED') {
        await this.loadModel();
      } else if (this.status === 'LOADING') {
        throw new Error('Face detector model is currently loading. Please wait.');
      } else if (this.status === 'ERROR') {
        throw new Error(`Face detector model error: ${this.errorMessage}`);
      }
    }

    if (!this.model) {
      throw new Error('Face detector model is not initialized.');
    }

    this.status = 'INFERENCE';
    const startInference = performance.now();

    try {
      const processedData = await Preprocessor.prepareImage(loadedImage);

      // Execute BlazeFace estimation
      const predictions = await this.model.estimateFaces(
        processedData.imageElement,
        false
      );

      const endInference = performance.now();
      const durationMs = Math.round(endInference - startInference);
      this.performanceStats.lastInferenceTimeMs = durationMs;

      if (this.performanceStats.coldInferenceTimeMs === null) {
        this.performanceStats.coldInferenceTimeMs = durationMs;
      } else {
        this.performanceStats.warmInferenceTimeMs = durationMs;
      }

      const results: DetectedFace[] = [];

      for (let i = 0; i < predictions.length; i++) {
        const pred = predictions[i];

        let score = 1.0;
        if (typeof pred.probability === 'number') {
          score = pred.probability;
        } else if (Array.isArray(pred.probability) && pred.probability.length > 0) {
          score = pred.probability[0];
        } else if (pred.probability && typeof (pred.probability as any).dataSync === 'function') {
          score = (pred.probability as any).dataSync()[0];
        }

        // Apply confidence threshold filter
        if (score < confidenceThreshold) {
          continue;
        }

        const topLeft = pred.topLeft as [number, number];
        const bottomRight = pred.bottomRight as [number, number];

        const x = Math.max(0, Math.round(topLeft[0]));
        const y = Math.max(0, Math.round(topLeft[1]));
        const width = Math.min(
          processedData.sourceWidth - x,
          Math.round(bottomRight[0] - topLeft[0])
        );
        const height = Math.min(
          processedData.sourceHeight - y,
          Math.round(bottomRight[1] - topLeft[1])
        );

        results.push({
          id: `face-${i + 1}-${Math.random().toString(36).substring(2, 7)}`,
          box: { x, y, width, height },
          confidence: Math.round(score * 100) / 100
        });
      }

      const deduplicatedResults = this.suppressDuplicateFaceDetections(results);

      this.status = 'READY';
      return deduplicatedResults;
    } catch (err: any) {
      this.status = 'READY';
      throw new Error(`Face detection inference failed: ${err?.message || err}`);
    }
  }

  /**
   * Applies deterministic Non-Maximum Suppression (NMS) and duplicate merging on face detections.
   * Merges heavily overlapping predictions (IoU >= 0.35 or overlap fraction >= 0.45) into canonical face regions.
   */
  public suppressDuplicateFaceDetections(candidates: DetectedFace[]): DetectedFace[] {
    if (candidates.length <= 1) return candidates;

    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const deduplicated: DetectedFace[] = [];
    const visited = new Set<number>();

    for (let i = 0; i < sorted.length; i++) {
      if (visited.has(i)) continue;
      visited.add(i);

      let canonical = { ...sorted[i] };
      let mergedBox = { ...canonical.box };

      for (let j = i + 1; j < sorted.length; j++) {
        if (visited.has(j)) continue;

        const other = sorted[j];
        const inter = GeometryUtils.intersection(mergedBox, other.box);
        if (inter && inter.width > 0 && inter.height > 0) {
          const interArea = inter.width * inter.height;
          const box1Area = mergedBox.width * mergedBox.height;
          const box2Area = other.box.width * other.box.height;
          const unionArea = box1Area + box2Area - interArea;
          const iou = unionArea > 0 ? interArea / unionArea : 0;
          const overlapMinRatio = interArea / Math.min(box1Area, box2Area);

          // If IoU >= 0.35 or overlap ratio of smaller box >= 0.45, merge as duplicate prediction of same face
          if (iou >= 0.35 || overlapMinRatio >= 0.45) {
            visited.add(j);
            mergedBox = GeometryUtils.union(mergedBox, other.box);
            canonical.confidence = Math.max(canonical.confidence, other.confidence);
          }
        }
      }

      canonical.box = mergedBox;
      deduplicated.push(canonical);
    }

    return deduplicated;
  }
}
