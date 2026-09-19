import { ImageLoader } from '../image/imageLoader';
import { LoadedImage } from '../types/image';
import {
  DetectedFace,
  OcrResult,
  PipelineStage,
  PipelineStageState,
  PiiFinding,
  PrivacyPipelineOptions,
  PrivacyPipelineResult,
  RedactedImageResult,
  RegionMappingResult,
  SanitizerVerificationResult
} from '../types/pipeline';
import { FaceDetector } from './faceDetector';
import { OcrEngine } from './ocrEngine';
import { PiiClassifier } from './piiClassifier';
import { Redactor } from './redactor';
import { RegionMapper } from './regionMapper';
import { SanitizerVerifier } from './verifier';

export class PrivacyPipeline implements PipelineStage<{ imageInput: File | LoadedImage | any; options?: PrivacyPipelineOptions }, PrivacyPipelineResult> {
  readonly name = 'PrivacyPipeline';

  private faceDetector: FaceDetector;
  private ocrEngine: OcrEngine;
  private piiClassifier: PiiClassifier;
  private regionMapper: RegionMapper;
  private redactor: Redactor;
  private verifier: SanitizerVerifier;

  private currentStage: PipelineStageState = 'IDLE';
  private isCancelledFlag = false;

  constructor(
    faceDetector?: FaceDetector,
    ocrEngine?: OcrEngine,
    piiClassifier?: PiiClassifier,
    regionMapper?: RegionMapper,
    redactor?: Redactor,
    verifier?: SanitizerVerifier
  ) {
    this.faceDetector = faceDetector || new FaceDetector();
    this.ocrEngine = ocrEngine || new OcrEngine();
    this.piiClassifier = piiClassifier || new PiiClassifier();
    this.regionMapper = regionMapper || new RegionMapper();
    this.redactor = redactor || new Redactor();
    this.verifier = verifier || new SanitizerVerifier();
  }

  public getStage(): PipelineStageState {
    return this.currentStage;
  }

  public isCancelled(): boolean {
    return this.isCancelledFlag;
  }

  public cancel(): void {
    this.isCancelledFlag = true;
    this.currentStage = 'CANCELLED';
  }

  public async process(input: {
    imageInput: File | LoadedImage | any;
    options?: PrivacyPipelineOptions;
  }): Promise<PrivacyPipelineResult> {
    return this.protectImage(input.imageInput, input.options);
  }

  /**
   * Primary Action: Executes full end-to-end privacy pipeline orchestration.
   */
  public async protectImage(
    imageInput: File | LoadedImage | any,
    options?: PrivacyPipelineOptions
  ): Promise<PrivacyPipelineResult> {
    const totalStart = performance.now();
    this.isCancelledFlag = false;
    this.currentStage = 'IDLE';

    const onProgress = options?.onProgress;
    const reportProgress = (
      stage: PipelineStageState,
      percent: number,
      message: string,
      counts?: { faceCount?: number; ocrCount?: number; piiCount?: number; regionCount?: number }
    ) => {
      this.currentStage = stage;
      if (onProgress) {
        onProgress({
          stage,
          progressPercent: percent,
          message,
          ...counts
        });
      }
    };

    let imageLoadingTimeMs = 0;
    let faceDetectionTimeMs = 0;
    let ocrTimeMs = 0;
    let piiClassificationTimeMs = 0;
    let regionMappingTimeMs = 0;
    let redactionTimeMs = 0;
    let verificationTimeMs = 0;

    let loadedImage: LoadedImage | undefined = undefined;

    try {
      // 1. LOADING_IMAGE Stage
      const tLoadStart = performance.now();
      reportProgress('LOADING_IMAGE', 5, 'Validating and loading image...');

      if (this.isCancelledFlag) return this.buildCancelledResult(totalStart);

      if (typeof File !== 'undefined' && imageInput instanceof File) {
        const validationErr = ImageLoader.validateFile(imageInput);
        if (validationErr) {
          throw new Error(`Image validation failed: ${validationErr.message}`);
        }
        loadedImage = await ImageLoader.loadImage(imageInput);
      } else if (imageInput && imageInput.metadata) {
        loadedImage = imageInput;
      } else {
        loadedImage = await this.wrapRawAsLoadedImage(imageInput);
      }

      if (!loadedImage) {
        throw new Error('Failed to load image input.');
      }

      imageLoadingTimeMs = Math.round(performance.now() - tLoadStart);
      reportProgress('LOADING_IMAGE', 10, 'Image loaded successfully');

      if (this.isCancelledFlag) return this.buildCancelledResult(totalStart);

      // 2. DETECTING_FACES Stage
      const tFaceStart = performance.now();
      reportProgress('DETECTING_FACES', 15, 'Running local face detector...');

      const faceThreshold = options?.faceConfidenceThreshold !== undefined ? options.faceConfidenceThreshold : 0.50;
      const detectedFaces: DetectedFace[] = await this.faceDetector.detectFaces(loadedImage, faceThreshold);

      faceDetectionTimeMs = Math.round(performance.now() - tFaceStart);
      reportProgress('DETECTING_FACES', 25, `Detected ${detectedFaces.length} face(s)`, { faceCount: detectedFaces.length });

      if (this.isCancelledFlag) return this.buildCancelledResult(totalStart);

      // 3. RUNNING_OCR Stage
      const tOcrStart = performance.now();
      reportProgress('RUNNING_OCR', 30, 'Running local spatial OCR...');

      const ocrResults: OcrResult[] = await this.ocrEngine.recognizeText(loadedImage);

      ocrTimeMs = Math.round(performance.now() - tOcrStart);
      reportProgress('RUNNING_OCR', 45, `Extracted ${ocrResults.length} text region(s)`, {
        faceCount: detectedFaces.length,
        ocrCount: ocrResults.length
      });

      if (this.isCancelledFlag) return this.buildCancelledResult(totalStart);

      // 4. CLASSIFYING_PII Stage
      const tPiiStart = performance.now();
      reportProgress('CLASSIFYING_PII', 50, 'Classifying sensitive PII...');

      const piiClassification = this.piiClassifier.classify(ocrResults);
      const piiFindings: PiiFinding[] = piiClassification.piiFindings || [];

      // DEBUG PIPELINE METRICS
      const phoneFindingsCount = piiFindings.filter((f) => f.piiType === 'PHONE').length;
      const addressFindingsCount = piiFindings.filter((f) => f.piiType === 'ADDRESS').length;
      console.log('[DEBUG PIPELINE COUNTERS]', {
        'OCR words/tokens': ocrResults.length,
        'PHONE findings': phoneFindingsCount,
        'ADDRESS findings': addressFindingsCount,
        'Total PII findings': piiFindings.length
      });

      piiClassificationTimeMs = Math.round(performance.now() - tPiiStart);
      reportProgress('CLASSIFYING_PII', 55, `Classified ${piiFindings.length} sensitive PII item(s)`, {
        faceCount: detectedFaces.length,
        ocrCount: ocrResults.length,
        piiCount: piiFindings.length
      });

      if (this.isCancelledFlag) return this.buildCancelledResult(totalStart);

      // 5. MAPPING_REGIONS Stage
      const tRegionStart = performance.now();
      reportProgress('MAPPING_REGIONS', 60, 'Mapping canonical sensitive regions...');

      const paddingPx = options?.paddingPx !== undefined ? options.paddingPx : 8;
      const regionResult: RegionMappingResult = this.regionMapper.mapRegions(
        detectedFaces,
        piiFindings,
        loadedImage.metadata.width,
        loadedImage.metadata.height,
        { paddingPx, clipToImage: true }
      );

      console.log('[DEBUG PIPELINE COUNTERS]', {
        'SensitiveRegions before mapping': detectedFaces.length + piiFindings.length,
        'SensitiveRegions after mapping': regionResult.regions.length,
        'Regions sent to Redactor': regionResult.regions.length
      });

      regionMappingTimeMs = Math.round(performance.now() - tRegionStart);
      reportProgress('MAPPING_REGIONS', 65, `Mapped ${regionResult.regions.length} sensitive region(s)`, {
        faceCount: detectedFaces.length,
        ocrCount: ocrResults.length,
        piiCount: piiFindings.length,
        regionCount: regionResult.regions.length
      });

      if (this.isCancelledFlag) return this.buildCancelledResult(totalStart);

      // 6. REDACTING Stage
      const tRedactStart = performance.now();
      reportProgress('REDACTING', 70, 'Performing real destructive pixel redaction...');

      const strategy = options?.redactionStrategy || 'SOLID';
      const solidColor = options?.solidColorHex || '#000000';

      const redactedResult: RedactedImageResult = await this.redactor.redact(
        loadedImage,
        regionResult.regions,
        { strategy, solidColor, mimeType: 'image/png' }
      );

      redactionTimeMs = Math.round(performance.now() - tRedactStart);
      reportProgress('REDACTING', 80, 'Destructive pixel redaction complete');

      if (this.isCancelledFlag) return this.buildCancelledResult(totalStart);

      // 7. VERIFYING Stage
      const tVerifyStart = performance.now();
      reportProgress('VERIFYING', 85, 'Running independent sanitization verification...');

      const verificationResult: SanitizerVerificationResult = await this.verifier.verify({
        originalImage: loadedImage,
        sanitizedImage: redactedResult.previewUrl || redactedResult.blob,
        originalFaces: detectedFaces,
        originalOcrResults: ocrResults,
        originalPiiFindings: piiFindings,
        originalRegions: regionResult.regions,
        redactionResult: redactedResult,
        faceDetector: this.faceDetector,
        ocrEngine: this.ocrEngine,
        piiClassifier: this.piiClassifier
      });

      verificationTimeMs = Math.round(performance.now() - tVerifyStart);

      // 8. Determine Final Status under Strict Fail-Closed Policy
      let finalStatus: PrivacyPipelineResult['status'] = 'VERIFIED';
      let overallPassed = false;

      if (verificationResult.status === 'PASS' && verificationResult.passed) {
        finalStatus = 'VERIFIED';
        overallPassed = true;
        this.currentStage = 'COMPLETED';
        reportProgress('COMPLETED', 100, 'Verification passed — Image Verified');
      } else if (verificationResult.status === 'FAIL') {
        finalStatus = 'FAILED_VERIFICATION';
        overallPassed = false;
        this.currentStage = 'FAILED';
        reportProgress('FAILED', 100, 'Verification failed — Residual sensitive data detected');
      } else {
        finalStatus = 'INCONCLUSIVE';
        overallPassed = false;
        this.currentStage = 'INCONCLUSIVE';
        reportProgress('INCONCLUSIVE', 100, 'Verification inconclusive');
      }

      const totalMs = Math.round(performance.now() - totalStart);

      return {
        status: finalStatus,
        passed: overallPassed,
        input: {
          width: loadedImage.metadata.width,
          height: loadedImage.metadata.height,
          mimeType: loadedImage.metadata.mimeType,
          fileName: (loadedImage.metadata as any).fileName || loadedImage.metadata.name || 'image.png',
          fileSizeBytes: (loadedImage.metadata as any).fileSizeBytes || loadedImage.metadata.size || 0,
          originalHash: redactedResult.originalHash
        },
        detections: {
          faces: detectedFaces,
          ocrRegions: ocrResults
        },
        classification: {
          piiFindings,
          nonSensitiveCount: piiClassification.nonSensitiveResults.length
        },
        regions: {
          sensitiveRegions: regionResult.regions,
          summary: regionResult.summary
        },
        redaction: {
          strategy: redactedResult.strategy,
          redactedRegionCount: redactedResult.redactedRegionsCount,
          sanitizedHash: redactedResult.sanitizedHash,
          previewUrl: redactedResult.previewUrl,
          blob: redactedResult.blob
        },
        verification: verificationResult,
        timing: {
          imageLoading: imageLoadingTimeMs,
          faceDetection: faceDetectionTimeMs,
          ocr: ocrTimeMs,
          piiClassification: piiClassificationTimeMs,
          regionMapping: regionMappingTimeMs,
          redaction: redactionTimeMs,
          verification: verificationTimeMs,
          total: totalMs
        }
      };

    } catch (err: any) {
      this.currentStage = 'FAILED';
      const totalMs = Math.round(performance.now() - totalStart);
      const errMsg = err?.message || 'Pipeline execution failed';

      reportProgress('FAILED', 100, `Pipeline failed: ${errMsg}`);

      const inputWidth = loadedImage?.metadata?.width || 0;
      const inputHeight = loadedImage?.metadata?.height || 0;
      const inputMime = loadedImage?.metadata?.mimeType || 'unknown';
      const inputName = loadedImage ? ((loadedImage.metadata as any).fileName || loadedImage.metadata.name || 'image.png') : 'unknown';
      const inputSize = loadedImage ? ((loadedImage.metadata as any).fileSizeBytes || loadedImage.metadata.size || 0) : 0;

      return {
        status: 'ERROR',
        passed: false,
        input: {
          width: inputWidth,
          height: inputHeight,
          mimeType: inputMime,
          fileName: inputName,
          fileSizeBytes: inputSize,
          originalHash: ''
        },
        detections: { faces: [], ocrRegions: [] },
        classification: { piiFindings: [], nonSensitiveCount: 0 },
        regions: { sensitiveRegions: [], summary: { totalCount: 0, faceCount: 0, piiCount: 0 } },
        redaction: {
          strategy: 'SOLID',
          redactedRegionCount: 0,
          sanitizedHash: '',
          previewUrl: '',
          blob: new Blob([])
        },
        verification: {
          passed: false,
          status: 'FAIL',
          faceResiduals: { detected: 0, residualFacesCount: 0, passed: false },
          ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: false },
          piiResiduals: { detected: 0, piiResidualsCount: 0, passed: false },
          regionIntegrity: { checked: 0, passedCount: 0, failedCount: 0, passed: false },
          outputIntegrity: { passed: false, details: errMsg },
          timing: { faceScanMs: 0, ocrScanMs: 0, piiScanMs: 0, regionIntegrityMs: 0, outputIntegrityMs: 0, totalMs: 0 },
          reasons: [errMsg]
        },
        timing: {
          imageLoading: imageLoadingTimeMs,
          faceDetection: faceDetectionTimeMs,
          ocr: ocrTimeMs,
          piiClassification: piiClassificationTimeMs,
          regionMapping: regionMappingTimeMs,
          redaction: redactionTimeMs,
          verification: verificationTimeMs,
          total: totalMs
        },
        error: errMsg
      };
    }
  }

  private buildCancelledResult(startTimeMs: number): PrivacyPipelineResult {
    const totalMs = Math.round(performance.now() - startTimeMs);
    this.currentStage = 'CANCELLED';

    return {
      status: 'CANCELLED',
      passed: false,
      input: {
        width: 0,
        height: 0,
        mimeType: 'unknown',
        fileName: 'cancelled.png',
        fileSizeBytes: 0,
        originalHash: ''
      },
      detections: { faces: [], ocrRegions: [] },
      classification: { piiFindings: [], nonSensitiveCount: 0 },
      regions: { sensitiveRegions: [], summary: { totalCount: 0, faceCount: 0, piiCount: 0 } },
      redaction: {
        strategy: 'SOLID',
        redactedRegionCount: 0,
        sanitizedHash: '',
        previewUrl: '',
        blob: new Blob([])
      },
      verification: {
        passed: false,
        status: 'INCONCLUSIVE',
        faceResiduals: { detected: 0, residualFacesCount: 0, passed: false },
        ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: false },
        piiResiduals: { detected: 0, piiResidualsCount: 0, passed: false },
        regionIntegrity: { checked: 0, passedCount: 0, failedCount: 0, passed: false },
        outputIntegrity: { passed: false, details: 'Pipeline cancelled by user' },
        timing: { faceScanMs: 0, ocrScanMs: 0, piiScanMs: 0, regionIntegrityMs: 0, outputIntegrityMs: 0, totalMs: 0 },
        reasons: ['Pipeline cancelled by user']
      },
      timing: {
        imageLoading: 0,
        faceDetection: 0,
        ocr: 0,
        piiClassification: 0,
        regionMapping: 0,
        redaction: 0,
        verification: 0,
        total: totalMs
      },
      error: 'Pipeline cancelled by user'
    };
  }

  private async wrapRawAsLoadedImage(input: any): Promise<LoadedImage> {
    const width = input.width || input.metadata?.width || 200;
    const height = input.height || input.metadata?.height || 200;
    return {
      previewUrl: input.previewUrl || input.src || '',
      file: input.file || new File([], input.name || 'image.png', { type: input.mimeType || 'image/png' }),
      metadata: {
        name: input.name || 'image.png',
        size: input.size || 1000,
        mimeType: input.mimeType || 'image/png',
        width,
        height
      }
    };
  }
}
