import React, { useState, useRef, ChangeEvent, DragEvent, useEffect } from 'react';
import {
  Shield,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileImage,
  HardDrive,
  ScanFace,
  FileText,
  Loader2,
  Clock,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Scissors,
  Download,
  FileCheck,
  XCircle,
  AlertTriangle,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { ImageLoader } from '../core/image/imageLoader';
import { LoadedImage } from '../core/types/image';
import { FaceDetector, ModelLifecycleStatus as FaceStatus, FaceDetectorPerformance } from '../core/pipeline/faceDetector';
import { OcrEngine, OcrLifecycleStatus as OcrStatus, OcrEnginePerformance } from '../core/pipeline/ocrEngine';
import { PiiClassifier } from '../core/pipeline/piiClassifier';
import { RegionMapper } from '../core/pipeline/regionMapper';
import { Redactor } from '../core/pipeline/redactor';
import { SanitizerVerifier } from '../core/pipeline/verifier';
import { PrivacyPipeline } from '../core/pipeline/privacyPipeline';
import {
  DetectedFace,
  OcrResult,
  PiiClassificationResult,
  PiiFinding,
  RegionMappingResult,
  RedactedImageResult,
  SanitizerVerificationResult,
  PrivacyPipelineResult,
  PrivacyPipelineProgressEvent
} from '../core/types/pipeline';
import { FaceOverlay } from './FaceOverlay';
import { TextOverlay } from './TextOverlay';
import { RegionOverlay } from './RegionOverlay';

const faceDetectorInstance = new FaceDetector();
const ocrEngineInstance = new OcrEngine();
const piiClassifierInstance = new PiiClassifier();
const regionMapperInstance = new RegionMapper();
const redactorInstance = new Redactor();
const sanitizerVerifierInstance = new SanitizerVerifier();
const privacyPipelineInstance = new PrivacyPipeline(
  faceDetectorInstance,
  ocrEngineInstance,
  piiClassifierInstance,
  regionMapperInstance,
  redactorInstance,
  sanitizerVerifierInstance
);

export const Popup: React.FC = () => {
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Phase 8: Pipeline Orchestration State
  const [isPipelineRunning, setIsPipelineRunning] = useState<boolean>(false);
  const [pipelineProgress, setPipelineProgress] = useState<PrivacyPipelineProgressEvent | null>(null);
  const [pipelineResult, setPipelineResult] = useState<PrivacyPipelineResult | null>(null);
  const [showTechnicalControls, setShowTechnicalControls] = useState<boolean>(false);
  const [showPipelineTiming, setShowPipelineTiming] = useState<boolean>(false);

  // Face Detection State
  const [faceStatus, setFaceStatus] = useState<FaceStatus>(faceDetectorInstance.getStatus());
  const [faceDetections, setFaceDetections] = useState<DetectedFace[] | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(FaceDetector.DEFAULT_CONFIDENCE_THRESHOLD);
  const [facePerfStats, setFacePerfStats] = useState<FaceDetectorPerformance | null>(null);

  // OCR State
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>(ocrEngineInstance.getStatus());
  const [ocrResults, setOcrResults] = useState<OcrResult[] | null>(null);
  const [ocrPerfStats, setOcrPerfStats] = useState<OcrEnginePerformance | null>(null);

  // PII Classification State
  const [piiResult, setPiiResult] = useState<PiiClassificationResult | null>(null);
  const [isClassifyingPii, setIsClassifyingPii] = useState<boolean>(false);
  const [showMaskedText, setShowMaskedText] = useState<boolean>(true);

  // Sensitive Region Mapping State
  const [regionResult, setRegionResult] = useState<RegionMappingResult | null>(null);
  const [paddingPx, setPaddingPx] = useState<number>(8);
  const [showPaddingOverlay, setShowPaddingOverlay] = useState<boolean>(true);

  // Redaction State
  const [redactedResult, setRedactedResult] = useState<RedactedImageResult | null>(null);
  const [isRedacting, setIsRedacting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'ORIGINAL' | 'SANITIZED'>('ORIGINAL');

  // Verification State
  const [verificationResult, setVerificationResult] = useState<SanitizerVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // UI Panel Toggles
  const [showFaceMetrics, setShowFaceMetrics] = useState<boolean>(false);
  const [showOcrMetrics, setShowOcrMetrics] = useState<boolean>(false);

  const [containerBounds, setContainerBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!previewRef.current) return;

    const updateBounds = () => {
      if (previewRef.current) {
        setContainerBounds({
          width: previewRef.current.clientWidth,
          height: previewRef.current.clientHeight
        });
      }
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(previewRef.current);

    return () => observer.disconnect();
  }, [loadedImage]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const cleanupRedactedPreview = (res: RedactedImageResult | null) => {
    if (res && res.previewUrl) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(res.previewUrl);
        } catch {
          // Ignore URL revoke errors
        }
      }
    }
  };

  const resetAllOutputs = () => {
    setError(null);
    setFaceDetections(null);
    setOcrResults(null);
    setPiiResult(null);
    setRegionResult(null);
    cleanupRedactedPreview(redactedResult);
    setRedactedResult(null);
    setVerificationResult(null);
    setPipelineResult(null);
    setPipelineProgress(null);
    setActiveTab('ORIGINAL');
  };

  const processSelectedFile = async (file: File) => {
    resetAllOutputs();

    try {
      const validationError = ImageLoader.validateFile(file);
      if (validationError) {
        setError(validationError.message);
        return;
      }

      if (loadedImage) {
        ImageLoader.revokePreviewUrl(loadedImage.previewUrl);
      }

      const imageResult = await ImageLoader.loadImage(file);
      setLoadedImage(imageResult);
    } catch (err: any) {
      setError(err?.message || 'Failed to process selected image file.');
      setLoadedImage(null);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleClear = () => {
    if (loadedImage) {
      ImageLoader.revokePreviewUrl(loadedImage.previewUrl);
    }
    resetAllOutputs();
    setLoadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Phase 8 Primary Workflow: Protect Image
  const handleProtectImage = async () => {
    if (!loadedImage) return;

    resetAllOutputs();
    setIsPipelineRunning(true);

    try {
      const result = await privacyPipelineInstance.protectImage(loadedImage, {
        faceConfidenceThreshold: confidenceThreshold,
        paddingPx,
        redactionStrategy: 'SOLID',
        onProgress: (event) => {
          setPipelineProgress(event);
        }
      });

      setPipelineResult(result);

      // Populate stage UI details from pipeline result
      setFaceDetections(result.detections.faces);
      setOcrResults(result.detections.ocrRegions);
      setPiiResult({
        piiFindings: result.classification.piiFindings,
        nonSensitiveResults: [],
        classificationTimeMs: result.timing.piiClassification
      });
      setRegionResult({
        regions: result.regions.sensitiveRegions,
        summary: result.regions.summary,
        inputFaceCount: result.detections.faces.length,
        inputPiiCount: result.classification.piiFindings.length,
        outputRegionCount: result.regions.sensitiveRegions.length,
        mappingTimeMs: result.timing.regionMapping
      });
      setRedactedResult({
        blob: result.redaction.blob,
        previewUrl: result.redaction.previewUrl,
        width: loadedImage.metadata.width,
        height: loadedImage.metadata.height,
        mimeType: loadedImage.metadata.mimeType,
        strategy: result.redaction.strategy,
        redactedRegionsCount: result.redaction.redactedRegionCount,
        faceCount: result.regions.summary.faceCount,
        piiCount: result.regions.summary.piiCount,
        originalHash: result.input.originalHash,
        sanitizedHash: result.redaction.sanitizedHash,
        timing: {
          canvasInitMs: 0,
          drawingMs: 0,
          redactionMs: result.timing.redaction,
          exportMs: 0,
          hashMs: 0,
          totalMs: result.timing.redaction
        }
      });
      setVerificationResult(result.verification);

      if (result.redaction.previewUrl) {
        setActiveTab('SANITIZED');
      }
    } catch (err: any) {
      setError(err?.message || 'Pipeline execution failed.');
    } finally {
      setIsPipelineRunning(false);
    }
  };

  const handleCancelPipeline = () => {
    privacyPipelineInstance.cancel();
  };

  const handleMapRegions = (overridePadding?: number) => {
    if (!loadedImage) return;

    setError(null);
    const activePadding = overridePadding !== undefined ? overridePadding : paddingPx;

    try {
      const result = regionMapperInstance.mapRegions(
        faceDetections,
        piiResult?.piiFindings,
        loadedImage.metadata.width,
        loadedImage.metadata.height,
        { paddingPx: activePadding, clipToImage: true }
      );
      setRegionResult(result);
      if (redactedResult) {
        cleanupRedactedPreview(redactedResult);
        setRedactedResult(null);
        setVerificationResult(null);
        setActiveTab('ORIGINAL');
      }
    } catch (err: any) {
      setError(err?.message || 'Sensitive region mapping failed.');
    }
  };

  const handleRedactImage = async () => {
    if (!loadedImage) return;

    setError(null);
    setIsRedacting(true);
    setVerificationResult(null);

    try {
      let currentResult = regionResult;
      if (!currentResult) {
        currentResult = regionMapperInstance.mapRegions(
          faceDetections,
          piiResult?.piiFindings,
          loadedImage.metadata.width,
          loadedImage.metadata.height,
          { paddingPx, clipToImage: true }
        );
        setRegionResult(currentResult);
      }

      cleanupRedactedPreview(redactedResult);

      const res = await redactorInstance.redact(
        loadedImage,
        currentResult.regions,
        { strategy: 'SOLID', solidColor: '#000000', mimeType: 'image/png' }
      );

      setRedactedResult(res);
      setActiveTab('SANITIZED');
    } catch (err: any) {
      setError(err?.message || 'Destructive pixel redaction failed.');
    } finally {
      setIsRedacting(false);
    }
  };

  const handleVerifySanitizedImage = async () => {
    if (!loadedImage || !redactedResult) return;

    setError(null);
    setIsVerifying(true);

    try {
      const res = await sanitizerVerifierInstance.verify({
        originalImage: loadedImage,
        sanitizedImage: redactedResult.previewUrl || redactedResult.blob,
        originalFaces: faceDetections || [],
        originalOcrResults: ocrResults || [],
        originalPiiFindings: piiResult?.piiFindings || [],
        originalRegions: regionResult?.regions || [],
        redactionResult: redactedResult,
        faceDetector: faceDetectorInstance,
        ocrEngine: ocrEngineInstance,
        piiClassifier: piiClassifierInstance
      });

      setVerificationResult(res);
    } catch (err: any) {
      setError(err?.message || 'Sanitization verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportSanitizedImage = () => {
    const previewUrlToUse = pipelineResult?.redaction?.previewUrl || redactedResult?.previewUrl;
    if (!previewUrlToUse) return;

    const baseName = loadedImage?.metadata?.name || 'image.png';
    const cleanName = baseName.replace(/\.[^/.]+$/, '');
    const downloadFilename = `sanitized_${cleanName}.png`;

    const link = document.createElement('a');
    link.href = previewUrlToUse;
    link.download = downloadFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDetectFaces = async () => {
    if (!loadedImage) return;

    setError(null);
    setFaceStatus('INFERENCE');

    try {
      const results = await faceDetectorInstance.detectFaces(loadedImage, confidenceThreshold);
      setFaceDetections(results);
      setFaceStatus(faceDetectorInstance.getStatus());
      setFacePerfStats(faceDetectorInstance.getPerformanceStats());
    } catch (err: any) {
      setError(err?.message || 'Face detection failed.');
      setFaceStatus('ERROR');
    }
  };

  const handleDetectText = async () => {
    if (!loadedImage) return;

    setError(null);
    setOcrStatus('RECOGNIZING');
    setPiiResult(null);

    try {
      const results = await ocrEngineInstance.recognizeText(loadedImage);
      setOcrResults(results);
      setOcrStatus(ocrEngineInstance.getStatus());
      setOcrPerfStats(ocrEngineInstance.getPerformanceStats());
    } catch (err: any) {
      setError(err?.message || 'OCR text recognition failed.');
      setOcrStatus('ERROR');
    }
  };

  const handleClassifyPii = async () => {
    if (!loadedImage) return;

    setError(null);
    setIsClassifyingPii(true);

    try {
      let currentOcr = ocrResults;
      if (!currentOcr) {
        setOcrStatus('RECOGNIZING');
        currentOcr = await ocrEngineInstance.recognizeText(loadedImage);
        setOcrResults(currentOcr);
        setOcrStatus(ocrEngineInstance.getStatus());
        setOcrPerfStats(ocrEngineInstance.getPerformanceStats());
      }

      const classification = piiClassifierInstance.classify(currentOcr);
      setPiiResult(classification);
    } catch (err: any) {
      setError(err?.message || 'PII classification failed.');
    } finally {
      setIsClassifyingPii(false);
    }
  };

  const handleThresholdChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setConfidenceThreshold(val);
  };

  // Helper for checking if export is allowed under strict fail-closed policy
  const isExportAllowed = (): boolean => {
    if (pipelineResult) {
      return pipelineResult.status === 'VERIFIED' && pipelineResult.verification?.passed === true;
    }
    if (verificationResult) {
      return verificationResult.status === 'PASS' && verificationResult.passed === true;
    }
    return false;
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="header-title">
          <Shield className="shield-icon" size={24} />
          <h1>VISUAL PRIVACY</h1>
        </div>
        <p className="header-subtitle">
          Protect sensitive information before it reaches AI.
        </p>
      </header>

      {/* Main Body */}
      <main className="popup-body">
        {error && (
          <div className="error-banner" data-testid="error-banner">
            <AlertCircle size={18} className="error-icon" />
            <span>{error}</span>
          </div>
        )}

        {!loadedImage ? (
          /* Upload State */
          <div
            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid="upload-zone"
          >
            <UploadCloud className="upload-icon" size={42} />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/webp"
              style={{ display: 'none' }}
              id="image-input"
              data-testid="file-input"
            />
            <label htmlFor="image-input" className="upload-button" data-testid="upload-button">
              Upload Image
            </label>
            <span className="drag-label">or Drag &amp; Drop Image</span>
            <span className="supported-types">Supported: PNG, JPG, WEBP (Max 10MB)</span>
          </div>
        ) : (
          /* Loaded Image Details & Pipeline Action Controls */
          <div className="image-details-card" data-testid="image-details-card">
            <div className="card-section-header">
              <div className="preview-tabs">
                <button
                  className={`tab-btn ${activeTab === 'ORIGINAL' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ORIGINAL')}
                  data-testid="tab-original"
                >
                  ORIGINAL IMAGE
                </button>
                {(redactedResult || pipelineResult?.redaction?.previewUrl) && (
                  <button
                    className={`tab-btn ${activeTab === 'SANITIZED' ? 'active' : ''}`}
                    onClick={() => setActiveTab('SANITIZED')}
                    data-testid="tab-sanitized"
                  >
                    SANITIZED IMAGE
                  </button>
                )}
              </div>
              <button
                className="clear-button"
                onClick={handleClear}
                title="Remove image"
                data-testid="clear-button"
              >
                <Trash2 size={16} />
                <span>Clear</span>
              </button>
            </div>

            {/* Preview Container with Canvas Overlays or Sanitized Image */}
            <div className="preview-container" ref={previewRef}>
              {activeTab === 'SANITIZED' && (redactedResult || pipelineResult?.redaction?.previewUrl) ? (
                <div className="sanitized-preview-container" data-testid="sanitized-preview-container">
                  <img
                    src={pipelineResult?.redaction?.previewUrl || redactedResult?.previewUrl}
                    alt="Sanitized Redacted Result"
                    className="image-preview"
                    data-testid="sanitized-image-preview"
                  />
                </div>
              ) : (
                <>
                  <img
                    src={loadedImage.previewUrl}
                    alt={loadedImage.metadata.name}
                    className="image-preview"
                    data-testid="image-preview"
                  />

                  {faceDetections !== null && (
                    <FaceOverlay
                      detections={faceDetections}
                      sourceWidth={loadedImage.metadata.width}
                      sourceHeight={loadedImage.metadata.height}
                      containerWidth={containerBounds.width}
                      containerHeight={containerBounds.height}
                    />
                  )}

                  {ocrResults !== null && (
                    <TextOverlay
                      ocrResults={ocrResults}
                      piiFindings={piiResult?.piiFindings}
                      sourceWidth={loadedImage.metadata.width}
                      sourceHeight={loadedImage.metadata.height}
                      containerWidth={containerBounds.width}
                      containerHeight={containerBounds.height}
                    />
                  )}

                  {regionResult !== null && (
                    <RegionOverlay
                      regions={regionResult.regions}
                      sourceWidth={loadedImage.metadata.width}
                      sourceHeight={loadedImage.metadata.height}
                      containerWidth={containerBounds.width}
                      containerHeight={containerBounds.height}
                      showPadding={showPaddingOverlay}
                    />
                  )}
                </>
              )}
            </div>

            {/* Metadata Info */}
            <div className="metadata-list">
              <div className="metadata-row">
                <span className="meta-label">
                  <FileImage size={14} /> File:
                </span>
                <span className="meta-value filename" title={loadedImage.metadata.name}>
                  {loadedImage.metadata.name}
                </span>
              </div>

              <div className="metadata-row">
                <span className="meta-label">Resolution:</span>
                <span className="meta-value">
                  {loadedImage.metadata.width} × {loadedImage.metadata.height}
                </span>
              </div>

              <div className="metadata-row">
                <span className="meta-label">
                  <HardDrive size={14} /> Size:
                </span>
                <span className="meta-value">{formatFileSize(loadedImage.metadata.size)}</span>
              </div>
            </div>

            {/* PRIMARY PHASE 8 ACTION: PROTECT IMAGE */}
            <div className="primary-action-section" data-testid="primary-action-section">
              <button
                className={`protect-image-btn ${isPipelineRunning ? 'running' : ''}`}
                onClick={handleProtectImage}
                disabled={isPipelineRunning}
                data-testid="protect-image-button"
              >
                {isPipelineRunning ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>PROTECTING IMAGE...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>PROTECT IMAGE</span>
                  </>
                )}
              </button>
            </div>

            {/* Real-time Progress Card when Pipeline is Running */}
            {isPipelineRunning && pipelineProgress && (
              <div className="pipeline-progress-card" data-testid="pipeline-progress-card">
                <div className="progress-header">
                  <div className="progress-title">
                    <Loader2 size={16} className="animate-spin text-accent" />
                    <span>PROTECTING IMAGE</span>
                  </div>
                  <button
                    className="cancel-btn"
                    onClick={handleCancelPipeline}
                    data-testid="cancel-pipeline-button"
                  >
                    <XCircle size={14} />
                    <span>Cancel</span>
                  </button>
                </div>

                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${pipelineProgress.progressPercent}%` }}
                    data-testid="progress-bar-fill"
                  />
                </div>

                <div className="progress-stage-message">
                  <span>{pipelineProgress.message}</span>
                </div>

                {/* Real-time Stage Checklist */}
                <div className="stage-checklist" data-testid="stage-checklist">
                  <div className="stage-check-item pass">
                    <span className="check-mark">✓</span>
                    <span>Image loaded</span>
                  </div>

                  <div className={`stage-check-item ${['DETECTING_FACES', 'RUNNING_OCR', 'CLASSIFYING_PII', 'MAPPING_REGIONS', 'REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? 'pass' : 'pending'}`}>
                    <span className="check-mark">
                      {['RUNNING_OCR', 'CLASSIFYING_PII', 'MAPPING_REGIONS', 'REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? '✓' : '⏳'}
                    </span>
                    <span>
                      Faces detected {pipelineProgress.faceCount !== undefined ? `— ${pipelineProgress.faceCount}` : ''}
                    </span>
                  </div>

                  <div className={`stage-check-item ${['RUNNING_OCR', 'CLASSIFYING_PII', 'MAPPING_REGIONS', 'REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? 'pass' : 'pending'}`}>
                    <span className="check-mark">
                      {['CLASSIFYING_PII', 'MAPPING_REGIONS', 'REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? '✓' : '⏳'}
                    </span>
                    <span>
                      Text extracted {pipelineProgress.ocrCount !== undefined ? `— ${pipelineProgress.ocrCount} regions` : ''}
                    </span>
                  </div>

                  <div className={`stage-check-item ${['CLASSIFYING_PII', 'MAPPING_REGIONS', 'REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? 'pass' : 'pending'}`}>
                    <span className="check-mark">
                      {['MAPPING_REGIONS', 'REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? '✓' : '⏳'}
                    </span>
                    <span>
                      PII classified {pipelineProgress.piiCount !== undefined ? `— ${pipelineProgress.piiCount} sensitive regions` : ''}
                    </span>
                  </div>

                  <div className={`stage-check-item ${['MAPPING_REGIONS', 'REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? 'pass' : 'pending'}`}>
                    <span className="check-mark">
                      {['REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? '✓' : '⏳'}
                    </span>
                    <span>
                      Regions mapped {pipelineProgress.regionCount !== undefined ? `— ${pipelineProgress.regionCount}` : ''}
                    </span>
                  </div>

                  <div className={`stage-check-item ${['REDACTING', 'VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? 'pass' : 'pending'}`}>
                    <span className="check-mark">
                      {['VERIFYING', 'COMPLETED'].includes(pipelineProgress.stage) ? '✓' : '⏳'}
                    </span>
                    <span>Pixels redacted</span>
                  </div>

                  <div className={`stage-check-item ${pipelineProgress.stage === 'VERIFYING' ? 'active' : pipelineProgress.stage === 'COMPLETED' ? 'pass' : 'pending'}`}>
                    <span className="check-mark">
                      {pipelineProgress.stage === 'COMPLETED' ? '✓' : '⏳'}
                    </span>
                    <span>Verifying sanitized output...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pipeline Result Summary Card */}
            {pipelineResult && (
              <div
                className={`pipeline-result-card ${
                  pipelineResult.status === 'VERIFIED'
                    ? 'result-verified'
                    : pipelineResult.status === 'FAILED_VERIFICATION'
                    ? 'result-failed'
                    : 'result-inconclusive'
                }`}
                data-testid="pipeline-result-card"
              >
                <div className="result-banner" data-testid="result-banner">
                  {pipelineResult.status === 'VERIFIED' ? (
                    <>
                      <ShieldCheck size={20} className="status-icon" />
                      <div className="banner-text">
                        <span className="status-title">VERIFICATION PASSED</span>
                        <span className="status-subtitle">Sanitized image independently verified</span>
                      </div>
                    </>
                  ) : pipelineResult.status === 'FAILED_VERIFICATION' ? (
                    <>
                      <AlertCircle size={20} className="status-icon" />
                      <div className="banner-text">
                        <span className="status-title">VERIFICATION FAILED</span>
                        <span className="status-subtitle">Sanitized image did not pass all privacy verification checks</span>
                      </div>
                    </>
                  ) : pipelineResult.status === 'INCONCLUSIVE' ? (
                    <>
                      <AlertTriangle size={20} className="status-icon" />
                      <div className="banner-text">
                        <span className="status-title">VERIFICATION INCONCLUSIVE</span>
                        <span className="status-subtitle">Could not confidently establish that all privacy checks passed</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle size={20} className="status-icon" />
                      <div className="banner-text">
                        <span className="status-title">PIPELINE {pipelineResult.status}</span>
                        <span className="status-subtitle">{pipelineResult.error || 'Pipeline operation failed'}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Result Highlights */}
                <div className="result-stats-row">
                  <div className="stat-pill">
                    <span className="stat-num">{pipelineResult.regions.summary.faceCount}</span>
                    <span className="stat-lbl">faces protected</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-num">{pipelineResult.regions.summary.piiCount}</span>
                    <span className="stat-lbl">PII regions protected</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-num">{pipelineResult.timing.total}ms</span>
                    <span className="stat-lbl">total processing</span>
                  </div>
                </div>

                <div className="result-dimensions-box">
                  <span>
                    Original: {pipelineResult.input.width > 0 ? `${pipelineResult.input.width} × ${pipelineResult.input.height}` : loadedImage ? `${loadedImage.metadata.width} × ${loadedImage.metadata.height}` : '0 × 0'}
                  </span>
                  <span>
                    Sanitized: {(pipelineResult.status === 'VERIFIED' || pipelineResult.status === 'FAILED_VERIFICATION') && pipelineResult.redaction?.previewUrl
                      ? `${pipelineResult.input.width || loadedImage?.metadata.width} × ${pipelineResult.input.height || loadedImage?.metadata.height}`
                      : 'Not generated'}
                  </span>
                </div>

                {/* Main User-Facing Export Action */}
                <div className="export-action-section">
                  <button
                    className={`export-verified-btn ${isExportAllowed() ? 'enabled' : 'disabled'}`}
                    onClick={handleExportSanitizedImage}
                    disabled={!isExportAllowed()}
                    data-testid="export-sanitized-button"
                  >
                    <Download size={16} />
                    <span>{isExportAllowed() ? 'Export Verified Image' : 'Export Disabled (Unverified)'}</span>
                  </button>

                  {!isExportAllowed() && (
                    <span className="export-disabled-note" data-testid="export-disabled-note">
                      🔒 Fail-Closed Protection: Only independently verified sanitized images can be exported.
                    </span>
                  )}
                </div>

                {/* Independent Verification Audit Breakdown */}
                {pipelineResult.verification && (
                  <div className="verification-audit-breakdown" style={{ marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={14} /> Verification Check Breakdown
                    </div>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Residual Face Scan:</span>
                        <span style={{ fontWeight: 600, color: pipelineResult.verification.faceResiduals?.passed ? '#4ade80' : '#f87171' }}>
                          {pipelineResult.verification.faceResiduals?.passed ? '✓ PASS' : `✕ FAIL (${pipelineResult.verification.faceResiduals?.residualFacesCount || 0} residual)`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Residual OCR Scan:</span>
                        <span style={{ fontWeight: 600, color: pipelineResult.verification.ocrResiduals?.passed ? '#4ade80' : '#f87171' }}>
                          {pipelineResult.verification.ocrResiduals?.passed ? '✓ PASS' : `✕ FAIL (${pipelineResult.verification.ocrResiduals?.sensitiveResiduals || 0} residual)`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Residual PII Scan:</span>
                        <span style={{ fontWeight: 600, color: pipelineResult.verification.piiResiduals?.passed ? '#4ade80' : '#f87171' }}>
                          {pipelineResult.verification.piiResiduals?.passed ? '✓ PASS' : `✕ FAIL (${pipelineResult.verification.piiResiduals?.piiResidualsCount || 0} residual)`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Region Integrity:</span>
                        <span style={{ fontWeight: 600, color: pipelineResult.verification.regionIntegrity?.passed ? '#4ade80' : '#f87171' }}>
                          {pipelineResult.verification.regionIntegrity?.passed ? '✓ PASS' : '✕ FAIL'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Output Integrity:</span>
                        <span style={{ fontWeight: 600, color: pipelineResult.verification.outputIntegrity?.passed ? '#4ade80' : '#f87171' }}>
                          {pipelineResult.verification.outputIntegrity?.passed ? '✓ PASS' : '✕ FAIL'}
                        </span>
                      </div>
                    </div>

                    {pipelineResult.verification.reasons && pipelineResult.verification.reasons.length > 0 && (
                      <div style={{ marginTop: '8px', color: '#f87171', fontSize: '0.75rem', borderTop: '1px solid rgba(248,113,113,0.2)', paddingTop: '6px' }}>
                        {pipelineResult.verification.reasons.map((reason, idx) => (
                          <div key={idx}>• {reason}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Timing Breakdown Toggle */}
                <div className="metrics-section">
                  <button
                    className="metrics-toggle"
                    onClick={() => setShowPipelineTiming(!showPipelineTiming)}
                  >
                    <span className="metrics-label">
                      <Clock size={12} /> Pipeline Stage Performance Breakdown
                    </span>
                    {showPipelineTiming ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showPipelineTiming && (
                    <div className="metrics-details">
                      <div className="metric-row">
                        <span>Image Loading:</span>
                        <span>{pipelineResult.timing.imageLoading} ms</span>
                      </div>
                      <div className="metric-row">
                        <span>Face Detection:</span>
                        <span>{pipelineResult.timing.faceDetection} ms</span>
                      </div>
                      <div className="metric-row">
                        <span>OCR Text Extraction:</span>
                        <span>{pipelineResult.timing.ocr} ms</span>
                      </div>
                      <div className="metric-row">
                        <span>PII Classification:</span>
                        <span>{pipelineResult.timing.piiClassification} ms</span>
                      </div>
                      <div className="metric-row">
                        <span>Region Mapping:</span>
                        <span>{pipelineResult.timing.regionMapping} ms</span>
                      </div>
                      <div className="metric-row">
                        <span>Destructive Redaction:</span>
                        <span>{pipelineResult.timing.redaction} ms</span>
                      </div>
                      <div className="metric-row">
                        <span>Verification Scan:</span>
                        <span>{pipelineResult.timing.verification} ms</span>
                      </div>
                      <div className="metric-row total-row">
                        <span>Total End-to-End:</span>
                        <span>{pipelineResult.timing.total} ms</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Collapsible Technical / Debugging Controls */}
            <div className="technical-controls-section">
              <button
                className="technical-toggle-btn"
                onClick={() => setShowTechnicalControls(!showTechnicalControls)}
                data-testid="technical-controls-toggle"
              >
                <span>Technical &amp; Individual Debugging Controls</span>
                {showTechnicalControls ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showTechnicalControls && (
                <div className="detection-controls technical-controls-body">
                  <div className="threshold-selector">
                    <div className="threshold-header">
                      <span className="meta-label">
                        <SlidersHorizontal size={13} /> Face Threshold:
                      </span>
                      <span className="meta-value">{Math.round(confidenceThreshold * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.95"
                      step="0.05"
                      value={confidenceThreshold}
                      onChange={handleThresholdChange}
                      className="threshold-slider"
                      data-testid="confidence-slider"
                    />
                  </div>

                  <div className="threshold-selector">
                    <div className="threshold-header">
                      <span className="meta-label">
                        <Maximize2 size={13} /> Region Padding:
                      </span>
                      <span className="meta-value">+{paddingPx}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="32"
                      step="2"
                      value={paddingPx}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setPaddingPx(val);
                        if (regionResult !== null) {
                          handleMapRegions(val);
                        }
                      }}
                      className="threshold-slider"
                      data-testid="padding-slider"
                    />
                  </div>

                  <div className="action-buttons-row">
                    <button
                      className={`action-btn face-btn ${faceStatus === 'INFERENCE' || faceStatus === 'LOADING' ? 'loading' : ''}`}
                      onClick={handleDetectFaces}
                      disabled={faceStatus === 'INFERENCE' || faceStatus === 'LOADING'}
                      data-testid="detect-faces-button"
                    >
                      {faceStatus === 'INFERENCE' ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Detecting...</span>
                        </>
                      ) : (
                        <>
                          <ScanFace size={15} />
                          <span>Detect Faces</span>
                        </>
                      )}
                    </button>

                    <button
                      className={`action-btn ocr-btn ${ocrStatus === 'RECOGNIZING' || ocrStatus === 'LOADING' ? 'loading' : ''}`}
                      onClick={handleDetectText}
                      disabled={ocrStatus === 'RECOGNIZING' || ocrStatus === 'LOADING'}
                      data-testid="detect-text-button"
                    >
                      {ocrStatus === 'RECOGNIZING' ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>OCR...</span>
                        </>
                      ) : (
                        <>
                          <FileText size={15} />
                          <span>Detect Text</span>
                        </>
                      )}
                    </button>

                    <button
                      className={`action-btn pii-btn ${isClassifyingPii ? 'loading' : ''}`}
                      onClick={handleClassifyPii}
                      disabled={isClassifyingPii}
                      data-testid="classify-pii-button"
                    >
                      {isClassifyingPii ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Classifying...</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert size={15} />
                          <span>Classify PII</span>
                        </>
                      )}
                    </button>

                    <button
                      className="action-btn region-btn"
                      onClick={() => handleMapRegions()}
                      data-testid="map-regions-button"
                    >
                      <Layers size={15} />
                      <span>Map Regions</span>
                    </button>

                    <button
                      className={`action-btn redact-btn ${isRedacting ? 'loading' : ''}`}
                      onClick={handleRedactImage}
                      disabled={isRedacting}
                      data-testid="redact-image-button"
                    >
                      {isRedacting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Redacting...</span>
                        </>
                      ) : (
                        <>
                          <Scissors size={15} />
                          <span>Redact Image</span>
                        </>
                      )}
                    </button>

                    {redactedResult !== null && (
                      <button
                        className={`action-btn verify-btn ${isVerifying ? 'loading' : ''}`}
                        onClick={handleVerifySanitizedImage}
                        disabled={isVerifying}
                        data-testid="verify-sanitized-button"
                      >
                        {isVerifying ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <FileCheck size={15} />
                            <span>Verify Output</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Face Detections Panel */}
            {faceDetections !== null && (
              <div className="detection-results-panel face-panel" data-testid="face-results-panel">
                <div className="results-header">
                  <span className="results-title">
                    Faces detected: <strong>{faceDetections.length}</strong>
                  </span>
                  {faceDetections.length === 0 && (
                    <span className="no-items-note">No faces crossed threshold</span>
                  )}
                </div>

                {faceDetections.length > 0 && (
                  <div className="detections-list">
                    {faceDetections.map((face, idx) => (
                      <div className="detection-item" key={face.id}>
                        <span className="item-tag face-tag">Face #{idx + 1}</span>
                        <span className="confidence-score">Confidence: {Math.round(face.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {facePerfStats && (
                  <div className="metrics-section">
                    <button
                      className="metrics-toggle"
                      onClick={() => setShowFaceMetrics(!showFaceMetrics)}
                    >
                      <span className="metrics-label">
                        <Clock size={12} /> Face Timing Stats
                      </span>
                      {showFaceMetrics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showFaceMetrics && (
                      <div className="metrics-details">
                        <div className="metric-row">
                          <span>Load Time:</span>
                          <span>{facePerfStats.modelLoadTimeMs} ms</span>
                        </div>
                        <div className="metric-row">
                          <span>Inference Time:</span>
                          <span>{facePerfStats.lastInferenceTimeMs} ms</span>
                        </div>
                        <div className="metric-row">
                          <span>Backend:</span>
                          <span>{facePerfStats.executionProvider}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* OCR Results Inspection Panel */}
            {ocrResults !== null && (
              <div className="detection-results-panel ocr-panel" data-testid="ocr-results-panel">
                <div className="results-header">
                  <span className="results-title">
                    Text regions detected: <strong>{ocrResults.length}</strong>
                  </span>
                  {ocrResults.length === 0 && (
                    <span className="no-items-note">No text detected</span>
                  )}
                </div>

                {ocrResults.length > 0 && (
                  <div className="detections-list">
                    {ocrResults.map((ocrItem, idx) => (
                      <div className="detection-item ocr-item" key={ocrItem.id}>
                        <div className="ocr-item-header">
                          <span className="item-tag ocr-tag">#{idx + 1}</span>
                          <span className="ocr-text-snippet" title={ocrItem.text}>{ocrItem.text}</span>
                        </div>
                        <div className="ocr-item-coords">
                          <span>Conf: {Math.round(ocrItem.confidence * 100)}%</span>
                          <span>Box: x={ocrItem.box.x} y={ocrItem.box.y} w={ocrItem.box.width} h={ocrItem.box.height}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ocrPerfStats && (
                  <div className="metrics-section">
                    <button
                      className="metrics-toggle"
                      onClick={() => setShowOcrMetrics(!showOcrMetrics)}
                    >
                      <span className="metrics-label">
                        <Clock size={12} /> OCR Timing Stats
                      </span>
                      {showOcrMetrics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showOcrMetrics && (
                      <div className="metrics-details">
                        <div className="metric-row">
                          <span>Init Time:</span>
                          <span>{ocrPerfStats.initTimeMs} ms</span>
                        </div>
                        <div className="metric-row">
                          <span>Recognition Time:</span>
                          <span>{ocrPerfStats.lastRecognitionTimeMs} ms</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Phase 4: PII Classification Findings Panel */}
            {piiResult !== null && (
              <div className="detection-results-panel pii-panel" data-testid="pii-results-panel">
                <div className="results-header">
                  <span className="results-title pii-title">
                    <ShieldAlert size={14} /> Sensitive PII: <strong>{piiResult.piiFindings.length}</strong>
                  </span>
                  {piiResult.piiFindings.length > 0 && (
                    <button
                      className="toggle-mask-btn"
                      onClick={() => setShowMaskedText(!showMaskedText)}
                      title={showMaskedText ? 'Show Raw Original Text' : 'Mask Sensitive PII Text'}
                      data-testid="toggle-mask-button"
                    >
                      {showMaskedText ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{showMaskedText ? 'Masked' : 'Raw'}</span>
                    </button>
                  )}
                </div>

                {piiResult.piiFindings.length === 0 ? (
                  <div className="no-pii-banner" data-testid="no-pii-banner">
                    <CheckCircle2 size={16} className="no-pii-icon" />
                    <span>No sensitive PII detected in extracted text</span>
                  </div>
                ) : (
                  <div className="detections-list pii-list" data-testid="pii-findings-list">
                    {piiResult.piiFindings.map((finding: PiiFinding, idx: number) => (
                      <div className="detection-item pii-item" key={finding.id} data-testid={`pii-item-${idx}`}>
                        <div className="pii-item-header">
                          <span className={`item-tag pii-tag pii-${finding.piiType.toLowerCase()}`}>
                            {finding.piiType}
                          </span>
                          <span className="pii-text-display" title={finding.originalText}>
                            {showMaskedText ? finding.maskedText : finding.originalText}
                          </span>
                        </div>
                        <div className="pii-reason">
                          <span>💡 {finding.reason}</span>
                        </div>
                        <div className="pii-item-coords">
                          <span>PII Conf: {Math.round(finding.confidence * 100)}% | OCR Conf: {Math.round(finding.ocrConfidence * 100)}%</span>
                          <span>Box: x={finding.box.x} y={finding.box.y} w={finding.box.width} h={finding.box.height}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Phase 5: Sensitive Region Mapping Panel */}
            {regionResult !== null && (
              <div className="detection-results-panel region-panel" data-testid="region-mapping-panel">
                <div className="results-header">
                  <span className="results-title region-title">
                    <Layers size={14} /> Mapped Regions: <strong>{regionResult.summary.totalCount}</strong>
                  </span>
                  <div className="region-header-controls">
                    <button
                      className="toggle-mask-btn"
                      onClick={() => setShowPaddingOverlay(!showPaddingOverlay)}
                      title={showPaddingOverlay ? 'Showing Padded Boxes' : 'Showing Unpadded Boxes'}
                      data-testid="toggle-padding-button"
                    >
                      <span>{showPaddingOverlay ? 'Padded Box' : 'Raw Box'}</span>
                    </button>
                  </div>
                </div>

                <div className="region-counts-summary">
                  <span className="region-count-badge face-badge">
                    Faces: <strong>{regionResult.summary.faceCount}</strong>
                  </span>
                  <span className="region-count-badge pii-badge">
                    PII: <strong>{regionResult.summary.piiCount}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Verification Details Panel when verification manually triggered */}
            {verificationResult !== null && !pipelineResult && (
              <div className="detection-results-panel verification-panel" data-testid="verification-results-panel">
                <div className="results-header">
                  <span className="results-title verification-title">
                    <FileCheck size={14} /> Sanitization Verification
                  </span>
                </div>

                <div
                  className={`verification-status-badge ${
                    verificationResult.status === 'PASS'
                      ? 'status-pass'
                      : verificationResult.status === 'FAIL'
                      ? 'status-fail'
                      : 'status-inconclusive'
                  }`}
                  data-testid="verification-status-badge"
                >
                  {verificationResult.status === 'PASS' ? (
                    <>
                      <CheckCircle2 size={18} />
                      <span>VERIFICATION PASSED</span>
                    </>
                  ) : verificationResult.status === 'FAIL' ? (
                    <>
                      <AlertCircle size={18} />
                      <span>VERIFICATION FAILED</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={18} />
                      <span>VERIFICATION INCONCLUSIVE</span>
                    </>
                  )}
                </div>

                {/* Reasons List */}
                {verificationResult.reasons.length > 0 && (
                  <div className="verification-reasons-box" data-testid="verification-reasons-box">
                    <span className="meta-label">Findings &amp; Failure Reasons:</span>
                    <ul className="reasons-list">
                      {verificationResult.reasons.map((reason, idx) => (
                        <li key={idx} className="reason-item">{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="status-badge success" data-testid="status-badge">
              <CheckCircle2 size={16} />
              <span>Image loaded locally</span>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="popup-footer">
        <span className="security-note">🔒 Local execution context — 0 network egress</span>
      </footer>
    </div>
  );
};

export default Popup;
