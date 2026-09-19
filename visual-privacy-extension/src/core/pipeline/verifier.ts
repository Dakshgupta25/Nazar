import {
  DetectedFace,
  OcrResult,
  PipelineStage,
  PiiFinding,
  PiiType,
  SanitizerVerificationResult,
  SensitiveRegion,
  VerificationFaceDetails,
  VerificationOcrDetails,
  VerificationOutputIntegrity,
  VerificationPiiDetails,
  VerificationRegionIntegrity,
  VerificationStatus,
  VerificationTiming,
  VerifierInput,
  VerifierOptions
} from '../types/pipeline';
import { GeometryUtils } from '../geometry/geometryUtils';
import { LoadedImage } from '../types/image';
import { ImageDecoder, DecodedImage } from '../image/imageDecoder';
import { FaceDetector } from './faceDetector';
import { OcrEngine } from './ocrEngine';
import { PiiClassifier } from './piiClassifier';

export class SanitizerVerifier implements PipelineStage<VerifierInput, SanitizerVerificationResult> {
  readonly name = 'SanitizerVerifier';

  public async process(input: VerifierInput): Promise<SanitizerVerificationResult> {
    return this.verify(input);
  }

  /**
   * Independently verifies that a sanitized image contains zero detectable face residuals,
   * zero detectable OCR/PII residuals, and satisfies region and output integrity checks.
   */
  public async verify(input: VerifierInput): Promise<SanitizerVerificationResult> {
    const totalStart = performance.now();
    const reasons: string[] = [];
    const options: VerifierOptions = input.options || {};

    let isFail = false;
    let isInconclusive = false;

    // 1. Output Integrity Scan
    const tOutputStart = performance.now();
    const outputIntegrity = await this.checkOutputIntegrity(input, reasons);
    const outputIntegrityMs = Math.round(performance.now() - tOutputStart);

    if (!outputIntegrity.passed) {
      if (outputIntegrity.details?.includes('INCONCLUSIVE')) {
        isInconclusive = true;
      } else {
        isFail = true;
      }
    }

    // Resolve images to drawable/pixel contexts
    let origRes: { width: number; height: number; pixels: Uint8ClampedArray } | null = null;
    let saniRes: { width: number; height: number; pixels: Uint8ClampedArray } | null = null;
    let saniDecoded: DecodedImage | null = null;

    try {
      origRes = await this.extractPixelData(input.originalImage);
      const fallbackDim = origRes
        ? { width: origRes.width, height: origRes.height }
        : input.redactionResult
        ? { width: input.redactionResult.width, height: input.redactionResult.height }
        : undefined;

      const saniExtract = await this.extractPixelData(input.sanitizedImage, fallbackDim);
      if (saniExtract) {
        saniRes = { width: saniExtract.width, height: saniExtract.height, pixels: saniExtract.pixels };
        saniDecoded = saniExtract.decoded || null;
      }
    } catch (err: any) {
      isInconclusive = true;
      reasons.push(`Image pixel data extraction failed: ${err.message || err}`);
    }

    // 2. Residual Face Scan
    const tFaceStart = performance.now();
    const faceResiduals = await this.checkResidualFaces(input, options, reasons, saniRes, saniDecoded);
    const faceScanMs = Math.round(performance.now() - tFaceStart);

    if (!faceResiduals.passed) {
      if (faceResiduals.details?.includes('INCONCLUSIVE')) {
        isInconclusive = true;
      } else {
        isFail = true;
      }
    }

    // 3. Residual OCR Scan
    const tOcrStart = performance.now();
    const { ocrResiduals, piiResiduals, ocrScanMs, piiScanMs } = await this.checkResidualOcrAndPii(
      input,
      options,
      reasons,
      tOcrStart,
      saniDecoded
    );

    if (!ocrResiduals.passed) {
      isFail = true;
    }
    if (!piiResiduals.passed) {
      isFail = true;
    }

    // 4. Region Integrity Scan (Pixel-Level Inspection)
    const tRegionStart = performance.now();
    const regionIntegrity = this.checkRegionIntegrity(
      input.originalRegions || [],
      origRes,
      saniRes,
      options,
      reasons
    );
    const regionIntegrityMs = Math.round(performance.now() - tRegionStart);

    if (!regionIntegrity.passed) {
      if (regionIntegrity.details?.includes('INCONCLUSIVE')) {
        isInconclusive = true;
      } else {
        isFail = true;
      }
    }

    // Clean up temporary decoded resources if created
    if (saniDecoded && typeof saniDecoded.dispose === 'function') {
      try {
        saniDecoded.dispose();
      } catch {
        // Ignore
      }
    }

    // Check if document indicators are present in OCR text but 0 PII regions were classified
    const origOcrText = (input.originalOcrResults || []).map((o) => o.text).join(' ');
    const origPiiCount = (input.originalPiiFindings || []).length;
    const origPiiRegionsCount = (input.originalRegions || []).filter((r) => r.type !== 'FACE').length;

    const hasDocIndicators = /\b(?:identity|student|university|college|govt|aadhaar|registration|reg\.?\s*no|roll\s*no|batch|address|permanent|residential|mob|mobile|contact|phone|dob)\b/i.test(origOcrText);

    if (hasDocIndicators && origPiiCount === 0 && origPiiRegionsCount === 0) {
      isInconclusive = true;
      reasons.push('Verification INCONCLUSIVE: Identity document terminology detected in OCR output, but 0 sensitive PII regions were classified.');
    }

    // 5. Final Status & Fail-Closed Enforcement
    const totalMs = Math.round(performance.now() - totalStart);
    let status: VerificationStatus = 'PASS';

    if (isFail) {
      status = 'FAIL';
    } else if (isInconclusive) {
      status = 'INCONCLUSIVE';
    }

    const passed = status === 'PASS'; // Strictly true ONLY when status === 'PASS'

    const timing: VerificationTiming = {
      faceScanMs,
      ocrScanMs,
      piiScanMs,
      regionIntegrityMs,
      outputIntegrityMs,
      totalMs
    };

    return {
      passed,
      status,
      faceResiduals,
      ocrResiduals,
      piiResiduals,
      regionIntegrity,
      outputIntegrity,
      timing,
      reasons
    };
  }

  /**
   * Output Integrity Check: verifies dimensions match, blob decodes, and hashes differ when redaction was performed.
   */
  private async checkOutputIntegrity(
    input: VerifierInput,
    reasons: string[]
  ): Promise<VerificationOutputIntegrity> {
    if (!input.sanitizedImage) {
      reasons.push('Sanitized image is missing or null.');
      return { passed: false, details: 'Missing sanitized image' };
    }

    try {
      const origDim = this.getImageDimensions(input.originalImage);
      const saniDim = this.getImageDimensions(input.sanitizedImage);

      if (origDim && saniDim) {
        if (origDim.width !== saniDim.width || origDim.height !== saniDim.height) {
          reasons.push(`Sanitized image dimensions (${saniDim.width}x${saniDim.height}) do not match original (${origDim.width}x${origDim.height}).`);
          return { passed: false, details: 'Dimension mismatch' };
        }
      }

      // Check redaction result metadata if provided
      if (input.redactionResult) {
        const { originalHash, sanitizedHash, redactedRegionsCount } = input.redactionResult;
        if (redactedRegionsCount > 0 && originalHash && sanitizedHash && originalHash === sanitizedHash) {
          reasons.push('Sanitized image hash matches original hash despite redacted regions count > 0.');
          return { passed: false, details: 'Hash identical despite redaction' };
        }
      }

      return { passed: true };
    } catch (err: any) {
      reasons.push(`Output integrity check failed: ${err.message || err}`);
      return { passed: false, details: 'INCONCLUSIVE: Output integrity error' };
    }
  }

  /**
   * Residual Face Scan: runs real face detector on sanitized image.
   */
  private async checkResidualFaces(
    input: VerifierInput,
    options: VerifierOptions,
    reasons: string[],
    saniRes?: { width: number; height: number; pixels: Uint8ClampedArray } | null,
    saniDecoded?: DecodedImage | null
  ): Promise<VerificationFaceDetails> {
    const origFaces = input.originalFaces || [];
    const origFaceRegions = (input.originalRegions || []).filter((r) => r.type === 'FACE');

    try {
      const detector = input.faceDetector || new FaceDetector();
      const threshold = options.faceConfidenceThreshold !== undefined ? options.faceConfidenceThreshold : 0.40;

      // Wrap sanitized image input into format expected by FaceDetector
      const loadedSanitized = await this.wrapAsLoadedImage(input.sanitizedImage, saniDecoded);
      const detectedFaces: DetectedFace[] = await detector.detectFaces(loadedSanitized, threshold);

      if (origFaces.length === 0 && origFaceRegions.length === 0) {
        let residualFacesCount = 0;
        for (const detFace of detectedFaces) {
          if (detFace.confidence >= threshold) {
            residualFacesCount++;
          }
        }
        if (residualFacesCount > 0) {
          reasons.push(`Residual face scan detected ${residualFacesCount} unredacted face(s) in sanitized image.`);
          return {
            detected: detectedFaces.length,
            residualFacesCount,
            passed: false,
            details: `Detected ${residualFacesCount} residual face(s)`
          };
        }
        return {
          detected: detectedFaces.length,
          residualFacesCount: 0,
          passed: true
        };
      }

      const targetColor = parseHexColor(options.solidColorHex || '#000000');
      const colorTolerance = options.colorTolerance !== undefined ? options.colorTolerance : 35;
      const instrumentationLogs: any[] = [];
      let residualFacesCount = 0;

      const saniWidth = saniRes?.width || loadedSanitized.metadata?.width || 0;
      const saniHeight = saniRes?.height || loadedSanitized.metadata?.height || 0;

      for (const detFace of detectedFaces) {
        if (detFace.confidence < threshold) continue;

        // 1. Candidate Bounding Box Metrics & Region Matching
        let bestMatchRegion: SensitiveRegion | null = null;
        let maxOverlapArea = 0;
        let maxCoverageRatio = 0;
        let maxOverlapRatio = 0;
        let maxIoU = 0;

        const allTargetBoxes: { id: string; box: any; region?: SensitiveRegion }[] = [];
        origFaceRegions.forEach((reg) => {
          const regBox = reg.paddedBox || reg.boundingBox || reg.box;
          if (regBox) allTargetBoxes.push({ id: reg.id, box: regBox, region: reg });
        });
        origFaces.forEach((of) => {
          if (of.box) allTargetBoxes.push({ id: of.id, box: of.box });
        });

        for (const target of allTargetBoxes) {
          const inter = GeometryUtils.intersection(detFace.box, target.box);
          if (inter && inter.width > 0 && inter.height > 0) {
            const overlapArea = inter.width * inter.height;
            const detArea = detFace.box.width * detFace.box.height;
            const regArea = target.box.width * target.box.height;
            const overlapRatio = overlapArea / detArea;
            const coverageRatio = overlapArea / regArea;
            const unionArea = detArea + regArea - overlapArea;
            const iou = unionArea > 0 ? overlapArea / unionArea : 0;

            if (overlapArea > maxOverlapArea) {
              maxOverlapArea = overlapArea;
              maxCoverageRatio = coverageRatio;
              maxOverlapRatio = overlapRatio;
              maxIoU = iou;
              if (target.region) bestMatchRegion = target.region;
            }
          }
        }

        const hasMatchingProtectedRegion = maxOverlapRatio > 0.05 || maxCoverageRatio > 0.05 || maxIoU > 0.05;

        // 2. Pixel Inspection in Candidate Box & Matched Protected Region
        let protectedCoveragePercentage = 0;
        let visiblePixelPercentage = 100;
        let redactedPixelRatioInProtected = 0;

        if (saniRes && saniRes.pixels && saniWidth > 0 && saniHeight > 0) {
          const clampedDet = GeometryUtils.clampBox(detFace.box, { width: saniWidth, height: saniHeight });
          if (clampedDet) {
            const totalDetPx = Math.floor(clampedDet.width * clampedDet.height);
            let redactedDetPx = 0;
            const startX = Math.floor(clampedDet.x);
            const startY = Math.floor(clampedDet.y);
            const endX = Math.min(saniWidth, Math.ceil(clampedDet.x + clampedDet.width));
            const endY = Math.min(saniHeight, Math.ceil(clampedDet.y + clampedDet.height));

            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const idx = (py * saniWidth + px) * 4;
                const r = saniRes.pixels[idx];
                const g = saniRes.pixels[idx + 1];
                const b = saniRes.pixels[idx + 2];
                const a = saniRes.pixels[idx + 3];

                const dist = Math.sqrt(
                  Math.pow(r - targetColor.r, 2) +
                  Math.pow(g - targetColor.g, 2) +
                  Math.pow(b - targetColor.b, 2)
                );
                if (dist <= colorTolerance && a >= 200) {
                  redactedDetPx++;
                }
              }
            }
            protectedCoveragePercentage = totalDetPx > 0 ? (redactedDetPx / totalDetPx) * 100 : 0;
            visiblePixelPercentage = 100 - protectedCoveragePercentage;
          }

          if (bestMatchRegion) {
            const regBox = bestMatchRegion.paddedBox || bestMatchRegion.boundingBox || bestMatchRegion.box;
            const clampedReg = GeometryUtils.clampBox(regBox, { width: saniWidth, height: saniHeight });
            if (clampedReg) {
              const totalRegPx = Math.floor(clampedReg.width * clampedReg.height);
              let redactedRegPx = 0;
              const startX = Math.floor(clampedReg.x);
              const startY = Math.floor(clampedReg.y);
              const endX = Math.min(saniWidth, Math.ceil(clampedReg.x + clampedReg.width));
              const endY = Math.min(saniHeight, Math.ceil(clampedReg.y + clampedReg.height));

              for (let py = startY; py < endY; py++) {
                for (let px = startX; px < endX; px++) {
                  const idx = (py * saniWidth + px) * 4;
                  const r = saniRes.pixels[idx];
                  const g = saniRes.pixels[idx + 1];
                  const b = saniRes.pixels[idx + 2];
                  const a = saniRes.pixels[idx + 3];

                  const dist = Math.sqrt(
                    Math.pow(r - targetColor.r, 2) +
                    Math.pow(g - targetColor.g, 2) +
                    Math.pow(b - targetColor.b, 2)
                  );
                  if (dist <= colorTolerance && a >= 200) {
                    redactedRegPx++;
                  }
                }
              }
              redactedPixelRatioInProtected = totalRegPx > 0 ? redactedRegPx / totalRegPx : 0;
            }
          }
        }

        // 3. Categorize Candidate & Decision Logic
        let decision: 'PASS_DETECTOR_ARTIFACT' | 'FAIL_TRUE_RESIDUAL' | 'FAIL_UNPROTECTED_CANDIDATE' = 'FAIL_TRUE_RESIDUAL';
        let decisionDetail = '';

        if (!hasMatchingProtectedRegion) {
          // CASE C: Candidate face appeared in an un-protected area of sanitized image
          decision = 'FAIL_UNPROTECTED_CANDIDATE';
          decisionDetail = `Unprotected candidate face detected at (${detFace.box.x}, ${detFace.box.y}) with confidence ${detFace.confidence}.`;
          residualFacesCount++;
        } else {
          // Candidate matches a protected region. Check if sensitive content was destructively redacted.
          const isProtectedFullyRedacted = redactedPixelRatioInProtected >= 0.85 || protectedCoveragePercentage >= 75;

          if (isProtectedFullyRedacted) {
            // CASE A: The protected region is verified destructively redacted. Candidate is a false-positive neural network edge artifact.
            decision = 'PASS_DETECTOR_ARTIFACT';
            decisionDetail = `Candidate overlaps verified redacted region (${(redactedPixelRatioInProtected * 100).toFixed(1)}% redacted ink). Candidate is a neural detector artifact.`;
          } else {
            // CASE B: Protected region was NOT fully redacted. Meaningful face pixels remain visible!
            decision = 'FAIL_TRUE_RESIDUAL';
            decisionDetail = `Protected face region is under-redacted (only ${(redactedPixelRatioInProtected * 100).toFixed(1)}% redacted ink). Candidate contains visible face pixels.`;
            residualFacesCount++;
          }
        }

        const logEntry = {
          candidateBox: detFace.box,
          confidence: detFace.confidence,
          originalImageDimensions: { width: saniWidth, height: saniHeight },
          sanitizedImageDimensions: { width: saniWidth, height: saniHeight },
          matchingProtectedRegions: bestMatchRegion ? [bestMatchRegion.id] : [],
          overlapArea: maxOverlapArea,
          IoU: Math.round(maxIoU * 100) / 100,
          protectedCoveragePercentage: Math.round(protectedCoveragePercentage * 10) / 10,
          visiblePixelPercentage: Math.round(visiblePixelPercentage * 10) / 10,
          decision,
          details: decisionDetail
        };

        instrumentationLogs.push(logEntry);
        console.log('[ResidualFaceScan Instrumentation]', JSON.stringify(logEntry));
      }

      if (residualFacesCount > 0) {
        reasons.push(`Residual face scan detected ${residualFacesCount} unredacted face(s) in sanitized image.`);
        return {
          detected: detectedFaces.length,
          residualFacesCount,
          passed: false,
          details: `Detected ${residualFacesCount} residual face(s)`,
          instrumentationLogs
        };
      }

      return {
        detected: detectedFaces.length,
        residualFacesCount: 0,
        passed: true,
        instrumentationLogs
      };
    } catch (err: any) {
      reasons.push(`Residual face scan error: ${err.message || err}`);
      return {
        detected: 0,
        residualFacesCount: 0,
        passed: false,
        details: 'INCONCLUSIVE: Face detector execution failed'
      };
    }
  }

  /**
   * Residual OCR & PII Scan: runs real OCR and PII classifier on sanitized image, plus string normalization.
   */
  private async checkResidualOcrAndPii(
    input: VerifierInput,
    _options: VerifierOptions,
    reasons: string[],
    _scanStart: number,
    saniDecoded?: DecodedImage | null
  ): Promise<{
    ocrResiduals: VerificationOcrDetails;
    piiResiduals: VerificationPiiDetails;
    ocrScanMs: number;
    piiScanMs: number;
  }> {
    const origPii = input.originalPiiFindings || [];
    const origOcr = input.originalOcrResults || [];
    const origPiiRegions = (input.originalRegions || []).filter((r) => r.type !== 'FACE');

    if (origPii.length === 0 && origOcr.length === 0 && origPiiRegions.length === 0) {
      return {
        ocrResiduals: { detected: 0, sensitiveResiduals: 0, passed: true },
        piiResiduals: { detected: 0, piiResidualsCount: 0, passed: true },
        ocrScanMs: 0,
        piiScanMs: 0
      };
    }

    let ocrScanMs = 0;
    let piiScanMs = 0;

    try {
      const ocrEngine = input.ocrEngine || new OcrEngine();
      const piiClassifier = input.piiClassifier || new PiiClassifier();
      const loadedSanitized = await this.wrapAsLoadedImage(input.sanitizedImage, saniDecoded);

      const tOcrRun = performance.now();
      const residualOcrResults: OcrResult[] = await ocrEngine.extractText(loadedSanitized);
      ocrScanMs = Math.round(performance.now() - tOcrRun);

      const tPiiRun = performance.now();
      const piiResult = await piiClassifier.classify(residualOcrResults);
      piiScanMs = Math.round(performance.now() - tPiiRun);

      const residualPiiFindings: PiiFinding[] = piiResult.piiFindings || [];
      const residualTexts: string[] = [];
      const residualTypes: PiiType[] = [];

      let sensitiveResidualsCount = 0;

      // 1. Direct PII classification match on sanitized image
      if (residualPiiFindings.length > 0) {
        for (const rPii of residualPiiFindings) {
          sensitiveResidualsCount++;
          residualTexts.push(rPii.maskedText || rPii.originalText);
          residualTypes.push(rPii.piiType);
        }
      }

      // 2. Normalized text & bounding box matching against original sensitive data
      for (const resOcr of residualOcrResults) {
        if (!resOcr.text || resOcr.text.trim().length === 0) continue;

        const normRes = this.normalizeText(resOcr.text);
        if (normRes.length < 3) continue;

        let isMatch = false;

        // Check against original PII findings
        for (const oPii of origPii) {
          const normOrig = this.normalizeText(oPii.originalText);
          if (normOrig.length >= 3 && (normRes.includes(normOrig) || normOrig.includes(normRes))) {
            isMatch = true;
            residualTypes.push(oPii.piiType);
            break;
          }
        }

        // Check against original sensitive region bounding boxes
        if (!isMatch) {
          for (const reg of origPiiRegions) {
            const rawBox = reg.paddedBox || reg.boundingBox || reg.box;
            const inter = GeometryUtils.intersection(resOcr.box, rawBox);
            if (inter && inter.width > 0 && inter.height > 0) {
              const overlapArea = inter.width * inter.height;
              const ocrArea = resOcr.box.width * resOcr.box.height;
              if (overlapArea / ocrArea > 0.20) {
                isMatch = true;
                if (reg.piiType) residualTypes.push(reg.piiType);
                break;
              }
            }
          }
        }

        if (isMatch && !residualTexts.includes(resOcr.text)) {
          sensitiveResidualsCount++;
          residualTexts.push(resOcr.text);
        }
      }

      const piiPassed = residualPiiFindings.length === 0;
      const ocrPassed = sensitiveResidualsCount === 0;

      if (!piiPassed) {
        reasons.push(`Residual PII classifier detected ${residualPiiFindings.length} sensitive item(s) in sanitized image.`);
      }
      if (!ocrPassed && piiPassed) {
        reasons.push(`Residual OCR match detected ${sensitiveResidualsCount} sensitive text fragment(s) in sanitized image.`);
      }

      return {
        ocrResiduals: {
          detected: residualOcrResults.length,
          sensitiveResiduals: sensitiveResidualsCount,
          passed: ocrPassed,
          residualTexts
        },
        piiResiduals: {
          detected: residualPiiFindings.length,
          piiResidualsCount: residualPiiFindings.length,
          passed: piiPassed,
          residualTypes
        },
        ocrScanMs,
        piiScanMs
      };
    } catch (err: any) {
      reasons.push(`Residual OCR/PII scan error: ${err.message || err}`);
      return {
        ocrResiduals: {
          detected: 0,
          sensitiveResiduals: 0,
          passed: false,
          residualTexts: ['INCONCLUSIVE: OCR scan failed']
        },
        piiResiduals: {
          detected: 0,
          piiResidualsCount: 0,
          passed: false
        },
        ocrScanMs,
        piiScanMs
      };
    }
  }

  /**
   * Region Integrity Check: inspects pixels inside mapped region bounding boxes to verify opaque fill color.
   */
  private checkRegionIntegrity(
    regions: SensitiveRegion[],
    origRes: { width: number; height: number; pixels: Uint8ClampedArray } | null,
    saniRes: { width: number; height: number; pixels: Uint8ClampedArray } | null,
    options: VerifierOptions,
    reasons: string[]
  ): VerificationRegionIntegrity {
    if (regions.length === 0) {
      return { checked: 0, passedCount: 0, failedCount: 0, passed: true };
    }

    if (!saniRes || !saniRes.pixels || saniRes.pixels.length === 0) {
      reasons.push('Sanitized image pixel buffer unavailable for region integrity check.');
      return { checked: regions.length, passedCount: 0, failedCount: regions.length, passed: false, details: 'INCONCLUSIVE: Pixel buffer missing' };
    }

    const { width, height, pixels: saniPixels } = saniRes;
    const origPixels = origRes ? origRes.pixels : null;

    const targetColor = parseHexColor(options.solidColorHex || '#000000');
    const colorTolerance = options.colorTolerance !== undefined ? options.colorTolerance : 25;

    let passedCount = 0;
    let failedCount = 0;

    for (const reg of regions) {
      const box = reg.paddedBox || reg.boundingBox || reg.box;
      if (!box) continue;

      const clamped = GeometryUtils.clampBox(box, { width, height });
      if (!clamped || clamped.width <= 0 || clamped.height <= 0) continue;

      const startX = Math.floor(clamped.x);
      const startY = Math.floor(clamped.y);
      const endX = Math.min(width, Math.ceil(clamped.x + clamped.width));
      const endY = Math.min(height, Math.ceil(clamped.y + clamped.height));

      let totalPixelsChecked = 0;
      let matchingTargetColorPixels = 0;
      let modifiedFromOriginalPixels = 0;

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const idx = (py * width + px) * 4;
          const r = saniPixels[idx];
          const g = saniPixels[idx + 1];
          const b = saniPixels[idx + 2];
          const a = saniPixels[idx + 3];

          totalPixelsChecked++;

          // Check if pixel matches target opaque redaction color (e.g., #000000)
          const dist = Math.sqrt(
            Math.pow(r - targetColor.r, 2) +
            Math.pow(g - targetColor.g, 2) +
            Math.pow(b - targetColor.b, 2)
          );

          if (dist <= colorTolerance && a >= 230) {
            matchingTargetColorPixels++;
          }

          if (origPixels && origPixels.length === saniPixels.length) {
            const origR = origPixels[idx];
            const origG = origPixels[idx + 1];
            const origB = origPixels[idx + 2];
            if (Math.abs(r - origR) > 5 || Math.abs(g - origG) > 5 || Math.abs(b - origB) > 5) {
              modifiedFromOriginalPixels++;
            }
          }
        }
      }

      const matchRatio = totalPixelsChecked > 0 ? matchingTargetColorPixels / totalPixelsChecked : 0;
      const modifiedRatio = totalPixelsChecked > 0 ? modifiedFromOriginalPixels / totalPixelsChecked : 1.0;

      // Region passes if at least 90% of internal pixels match opaque fill color
      if (matchRatio >= 0.90 || (origPixels && modifiedRatio >= 0.85 && matchRatio >= 0.75)) {
        passedCount++;
      } else {
        failedCount++;
        reasons.push(`Region integrity failed for '${reg.id}' (${reg.label}): only ${(matchRatio * 100).toFixed(1)}% pixels match opaque fill.`);
      }
    }

    const passed = failedCount === 0;

    return {
      checked: regions.length,
      passedCount,
      failedCount,
      passed
    };
  }

  /**
   * Helper to extract raw pixel Uint8ClampedArray from various image input types.
   */
  private async extractPixelData(
    input: any,
    fallbackDim?: { width: number; height: number }
  ): Promise<{ width: number; height: number; pixels: Uint8ClampedArray; decoded?: DecodedImage } | null> {
    if (!input) return null;
    try {
      const decoded = await ImageDecoder.decodeImage(input, fallbackDim);
      return {
        width: decoded.width,
        height: decoded.height,
        pixels: decoded.pixels,
        decoded
      };
    } catch {
      return null;
    }
  }

  private getImageDimensions(input: any): { width: number; height: number } | null {
    if (!input) return null;
    if (input.metadata) return { width: input.metadata.width, height: input.metadata.height };
    if (input.naturalWidth) return { width: input.naturalWidth, height: input.naturalHeight };
    if (input.width && input.height) return { width: input.width, height: input.height };
    return null;
  }

  private async wrapAsLoadedImage(input: any, saniDecoded?: DecodedImage | null): Promise<LoadedImage | any> {
    if (input && input.element && input.metadata && input.previewUrl) return input;

    let decoded = saniDecoded;
    if (!decoded) {
      try {
        decoded = await ImageDecoder.decodeImage(input);
      } catch {
        // Fallback below
      }
    }

    const dim = decoded ? { width: decoded.width, height: decoded.height } : this.getImageDimensions(input);
    const width = dim?.width || 200;
    const height = dim?.height || 200;
    const previewUrl = decoded?.previewUrl || (typeof input === 'string' ? input : (input.previewUrl || ''));
    const drawable = decoded?.drawable || input.element || input;

    return {
      element: drawable,
      previewUrl,
      rawBytes: input.rawBytes || new ArrayBuffer(0),
      metadata: {
        fileName: 'sanitized_image.png',
        fileSizeBytes: decoded?.pixels?.byteLength || 1000,
        mimeType: decoded?.mimeType || 'image/png',
        width,
        height,
        loadedAtMs: Date.now()
      }
    };
  }

  private normalizeText(str: string): string {
    if (!str) return '';
    return str.toLowerCase().replace(/[\s\-\+\(\)\,\.]/g, '');
  }
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  return { r: 0, g: 0, b: 0 };
}
