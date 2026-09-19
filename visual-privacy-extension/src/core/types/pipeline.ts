import { LoadedImage } from './image';

/**
 * Bounding box representation for detected items (faces, text, PII, etc.)
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  id: string;
  box: BoundingBox;
  confidence: number;
}

export interface OcrResult {
  id: string;
  text: string;
  box: BoundingBox;
  confidence: number;
}

export type PiiType =
  | 'EMAIL'
  | 'PHONE'
  | 'PAN'
  | 'AADHAAR'
  | 'CREDIT_CARD'
  | 'BANK_ACCOUNT'
  | 'URL'
  | 'ADDRESS'
  | 'OTHER_SENSITIVE';

export interface PiiFinding {
  id: string;
  piiType: PiiType;
  ocrId: string;
  ocrConfidence: number;
  confidence: number; // PII Classifier confidence (0.0 - 1.0)
  originalText: string;
  maskedText: string;
  box: BoundingBox; // Preserved directly from OCR result
  reason: string; // Explainable rule/validation description
}

export interface PiiClassificationResult {
  piiFindings: PiiFinding[];
  nonSensitiveResults: OcrResult[];
  classificationTimeMs: number;
}

export type RegionSource = 'FACE_DETECTOR' | 'OCR_PII' | 'FACE' | 'PII';

export type SensitiveRegionType =
  | 'FACE'
  | 'EMAIL'
  | 'PHONE'
  | 'PAN'
  | 'AADHAAR'
  | 'CREDIT_CARD'
  | 'BANK_ACCOUNT'
  | 'URL'
  | 'ADDRESS'
  | 'OTHER';

export interface SensitiveRegion {
  id: string;
  source: RegionSource;
  sourceId?: string;
  type: SensitiveRegionType;
  piiType?: PiiType;
  label: string;
  boundingBox: BoundingBox; // Padded source image pixel coordinates
  unpaddedBox: BoundingBox; // Original unpadded bounding box for tracing
  box: BoundingBox;         // Original unpadded box alias
  paddedBox: BoundingBox;   // Padded box alias
  confidence: number;
  reason: string;
  padding: number;
  paddingPx: number;        // Alias for padding
}

export interface RegionMappingOptions {
  padding?: number;   // Configurable padding in pixels (default: 8)
  paddingPx?: number; // Alias for padding
  clipToImage?: boolean;
}

export interface RegionMappingSummary {
  totalCount: number;
  faceCount: number;
  piiCount: number;
}

export interface RegionMappingResult {
  regions: SensitiveRegion[];
  mappingTimeMs: number;
  inputFaceCount: number;
  inputPiiCount: number;
  outputRegionCount: number;
  summary: RegionMappingSummary;
  imageDimensions?: { width: number; height: number };
}

export type RedactionStrategy = 'SOLID' | 'BLUR' | 'PIXELATE';

export interface RedactionOptions {
  strategy?: RedactionStrategy; // Default: 'SOLID'
  solidColor?: string;          // Default: '#000000' (solid opaque black)
  mimeType?: string;            // Default: 'image/png'
  quality?: number;             // Quality for lossy formats (0-1.0)
}

export interface RedactionTiming {
  canvasInitMs: number;
  drawingMs: number;
  redactionMs: number;
  exportMs: number;
  hashMs: number;
  totalMs: number;
}

export interface RedactedImageResult {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  mimeType: string;
  redactedRegionsCount: number;
  faceCount: number;
  piiCount: number;
  strategy: RedactionStrategy;
  originalHash: string;
  sanitizedHash: string;
  timing: RedactionTiming;
}

export interface RedactionResult {
  sanitizedImageUrl: string;
  regionsRedactedCount: number;
}

export type VerificationStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface VerificationFaceDetails {
  detected: number;
  residualFacesCount: number;
  passed: boolean;
  details?: string;
  instrumentationLogs?: any[];
}

export interface VerificationOcrDetails {
  detected: number;
  sensitiveResiduals: number;
  passed: boolean;
  residualTexts?: string[];
}

export interface VerificationPiiDetails {
  detected: number;
  piiResidualsCount: number;
  passed: boolean;
  residualTypes?: PiiType[];
}

export interface VerificationRegionIntegrity {
  checked: number;
  passedCount: number;
  failedCount: number;
  passed: boolean;
  details?: string;
}

export interface VerificationOutputIntegrity {
  passed: boolean;
  details?: string;
}

export interface VerificationTiming {
  faceScanMs: number;
  ocrScanMs: number;
  piiScanMs: number;
  regionIntegrityMs: number;
  outputIntegrityMs: number;
  totalMs: number;
}

export interface SanitizerVerificationResult {
  passed: boolean; // true ONLY if status === 'PASS'
  status: VerificationStatus;
  faceResiduals: VerificationFaceDetails;
  ocrResiduals: VerificationOcrDetails;
  piiResiduals: VerificationPiiDetails;
  regionIntegrity: VerificationRegionIntegrity;
  outputIntegrity: VerificationOutputIntegrity;
  timing: VerificationTiming;
  reasons: string[];
}

export interface VerifierOptions {
  faceConfidenceThreshold?: number; // default: 0.40
  ocrConfidenceThreshold?: number;  // default: 30
  solidColorHex?: string;           // default: '#000000'
  colorTolerance?: number;          // max RGB distance, default: 15
}

export interface VerifierInput {
  originalImage: LoadedImage | HTMLImageElement | ImageBitmap | ImageData | any;
  sanitizedImage: LoadedImage | HTMLImageElement | ImageBitmap | ImageData | Blob | string | any;
  originalFaces?: DetectedFace[];
  originalOcrResults?: OcrResult[];
  originalPiiFindings?: PiiFinding[];
  originalRegions?: SensitiveRegion[];
  redactionResult?: RedactedImageResult;
  options?: VerifierOptions;
  faceDetector?: any;
  ocrEngine?: any;
  piiClassifier?: any;
}

export interface VerificationResult {
  isVerifiedSanitized: boolean;
  remainingRiskScore: number;
}

export type PipelineStageState =
  | 'IDLE'
  | 'LOADING_IMAGE'
  | 'DETECTING_FACES'
  | 'RUNNING_OCR'
  | 'CLASSIFYING_PII'
  | 'MAPPING_REGIONS'
  | 'REDACTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'INCONCLUSIVE'
  | 'CANCELLED';

export type PipelineOverallStatus =
  | 'VERIFIED'
  | 'FAILED_VERIFICATION'
  | 'INCONCLUSIVE'
  | 'ERROR'
  | 'CANCELLED';

export interface PipelineTimingBreakdown {
  imageLoading: number;
  faceDetection: number;
  ocr: number;
  piiClassification: number;
  regionMapping: number;
  redaction: number;
  verification: number;
  total: number;
}

export interface PrivacyPipelineResult {
  status: PipelineOverallStatus;
  passed: boolean;
  input: {
    width: number;
    height: number;
    mimeType: string;
    fileName: string;
    fileSizeBytes: number;
    originalHash: string;
  };
  detections: {
    faces: DetectedFace[];
    ocrRegions: OcrResult[];
  };
  classification: {
    piiFindings: PiiFinding[];
    nonSensitiveCount: number;
  };
  regions: {
    sensitiveRegions: SensitiveRegion[];
    summary: RegionMappingSummary;
  };
  redaction: {
    strategy: RedactionStrategy;
    redactedRegionCount: number;
    sanitizedHash: string;
    previewUrl: string;
    blob: Blob;
  };
  verification: SanitizerVerificationResult;
  timing: PipelineTimingBreakdown;
  error?: string;
}

export interface PrivacyPipelineProgressEvent {
  stage: PipelineStageState;
  progressPercent: number; // 0 - 100
  message: string;
  faceCount?: number;
  ocrCount?: number;
  piiCount?: number;
  regionCount?: number;
}

export type PipelineProgressCallback = (event: PrivacyPipelineProgressEvent) => void;

export interface PrivacyPipelineOptions {
  faceConfidenceThreshold?: number;
  paddingPx?: number;
  redactionStrategy?: RedactionStrategy;
  solidColorHex?: string;
  onProgress?: PipelineProgressCallback;
}

/**
 * High-level pipeline stage contract.
 */
export interface PipelineStage<TInput, TOutput> {
  name: string;
  process(input: TInput): Promise<TOutput>;
}
